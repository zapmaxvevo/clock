import { compareNames } from "@/lib/text";
import { db, type Transaction } from "@/server/db";
import { can, type Actor, type WorkspaceResource } from "@/server/permissions";
import {
  addDaysToKey,
  compareDayKeys,
  dayBuckets,
  dayKey,
  daysBetweenKeys,
  startOfDayKey,
  weekdayLabel,
  type DateFormat,
  type TimeBuckets,
  type TimeSettings,
} from "@/server/time";
import { displayNameOf } from "@/modules/profile/service";
import { paletteKeyOf } from "@/modules/project/palette";
import type { ProjectFilterCatalog } from "@/modules/project/schema";
import { getProjectFilterCatalog } from "@/modules/project/service";

import { reportPeriodOf } from "./period";
import {
  reportRepository,
  type EntryTotals,
  type ReportEntryFilter,
  type ReportLevelRead,
  type ReportSpan,
  type LevelGroupRow,
  type LevelTotalRow,
  type StoredProject,
} from "./repository";
import {
  DEFAULT_GROUP_BY,
  projectFilterCount,
  REPORT_MAX_DAYS,
  REPORT_MAX_FILTER_VALUES,
  REPORT_MAX_ROWS,
  type ReportDateGroup,
  type ReportFilters,
  type ReportGroup,
  type ReportGroupBy,
  type ReportRange,
  type ReportReadyState,
  type ReportState,
} from "./schema";

type ScopePeople =
  /** `timeEntry.others.view`: todas las personas del workspace, activas e inactivas (RP-02, RP-61). */
  | { readonly kind: "everyone" }
  /** Sin el permiso: solo quien mira (RP-01, P-01). */
  | { readonly kind: "self"; readonly userId: string };

/**
 * El alcance de las lecturas del reporte (ADR 0020, D-R2a-1). No se exporta:
 * el miembro privado la hace nominal, así que un literal con las mismas
 * propiedades no la cumple y solo este archivo la construye.
 */
class Scope {
  private readonly nominal = "report-scope";

  constructor(
    readonly workspaceId: string,
    readonly people: ScopePeople,
  ) {}
}

/** El alcance de las lecturas (D-R2a-1). Solo `scopeOf` lo construye. */
export type ReportScope = Scope;

export type ReportRequest = {
  /** El rango de la URL ya validado, o `null`: «Esta semana». */
  readonly range: ReportRange | null;
  /** La agrupación de la URL ya validada, o `null`: por persona. */
  readonly groupBy: ReportGroupBy | null;
  /** Los de `reportSubgroupParams`; vacío, un nivel (D-R3-5). */
  readonly subgroups: readonly ReportGroupBy[];
  /** Los de `reportFiltersOf`; `NO_REPORT_FILTERS` sin filtros. */
  readonly filters: ReportFilters;
};

function workspaceResource(actor: Actor): WorkspaceResource {
  return { kind: "workspace", workspaceId: actor.workspaceId };
}

/** Único constructor del alcance: `can()` decide si quien mira ve a todos (D-R2a-2). */
function scopeOf(actor: Actor): Scope {
  const people: ScopePeople = can(
    actor,
    "timeEntry.others.view",
    workspaceResource(actor),
  )
    ? { kind: "everyone" }
    : { kind: "self", userId: actor.userId };
  return new Scope(actor.workspaceId, people);
}

/** El proyecto con el color estrechado a la paleta, o `null`. */
function projectOf(stored: StoredProject | null) {
  if (stored === null) {
    return null;
  }
  return {
    id: stored.id,
    name: stored.name,
    color: paletteKeyOf(stored.color, stored.id),
  };
}

/** Cómo se rotula un día: los tramos de la lectura, hoy y el formato. */
type DateContext = {
  readonly buckets: TimeBuckets | null;
  readonly todayKey: string;
  readonly format: DateFormat;
};

/**
 * El grupo de un nivel, de lo que la fila dice de él. Un día se rotula con su
 * fecha y sin «Hoy» ni «Ayer» (D-R2b-6).
 */
function groupOf(row: LevelGroupRow, seconds: number, dates: DateContext): ReportGroup {
  switch (row.kind) {
    case "person":
      return {
        kind: "person",
        userId: row.userId,
        name: displayNameOf({ displayName: row.displayName }, row.accountName),
        inactive: row.status !== "active",
        seconds,
      };
    case "project":
      return {
        kind: "project",
        project: projectOf(row.project),
        client: row.client,
        seconds,
      };
    case "client":
      return { kind: "client", client: row.client, seconds };
    case "task":
      return { kind: "task", task: row.task, project: projectOf(row.project), seconds };
    case "tag":
      return { kind: "tag", tag: row.tag, seconds };
    case "date": {
      if (dates.buckets === null) {
        throw new Error("Una fila por fecha sin los tramos de la lectura.");
      }
      const day = dates.buckets.buckets[row.bucket].firstDay;
      return {
        kind: "date",
        dayKey: day,
        label: weekdayLabel(day, dates.todayKey, dates.format),
        seconds,
      };
    }
  }
}

/** Los grupos que se ordenan por duración y nombre: todos menos la fecha. */
type NamedGroup = Exclude<ReportGroup, ReportDateGroup>;

/** Lo que el orden compara de un grupo; `null` es «Sin proyecto», «Sin cliente», «Sin tarea» o «Sin etiqueta». */
function sortKeyOf(
  group: NamedGroup,
): { readonly id: string; readonly name: string } | null {
  switch (group.kind) {
    case "person":
      return { id: group.userId, name: group.name };
    case "project":
      return group.project;
    case "client":
      return group.client;
    case "task":
      return group.task;
    case "tag":
      return group.tag;
  }
}

/**
 * RP-12, D-R2a-3: duración descendente; con la misma, por nombre, y los «Sin
 * …» después de los que tienen nombre.
 */
function compareGroups(left: NamedGroup, right: NamedGroup): number {
  if (left.seconds !== right.seconds) {
    return right.seconds - left.seconds;
  }
  const leftKey = sortKeyOf(left);
  const rightKey = sortKeyOf(right);
  if (leftKey === null || rightKey === null) {
    return (leftKey === null ? 1 : 0) - (rightKey === null ? 1 : 0);
  }
  return compareNames(leftKey, rightKey);
}

/** D-R2b-6: en orden cronológico. */
function compareDays(left: ReportDateGroup, right: ReportDateGroup): number {
  return compareDayKeys(left.dayKey, right.dayKey);
}

/** Dos grupos del mismo nivel: los días por fecha, el resto por duración y nombre. */
function compareSiblings(left: ReportGroup, right: ReportGroup): number {
  if (left.kind === "date" && right.kind === "date") {
    return compareDays(left, right);
  }
  if (left.kind !== "date" && right.kind !== "date") {
    return compareGroups(left, right);
  }
  throw new Error("Un nivel con días y grupos de otra dimensión.");
}

/** Lo que se lee de un pedido, en una sola foto. */
type ReportRead = {
  /** Las filas de cada nivel que entró en el tope, desde el primero. */
  readonly levels: readonly (readonly LevelTotalRow[])[];
  readonly totals: EntryTotals;
  readonly catalog: ProjectFilterCatalog;
  /** Los filtros efectivos: los del pedido que están en el catálogo (D-R4-5). */
  readonly filters: ReportFilters;
};

/**
 * La invariante de los filtros: cada lista sin repetir y con hasta
 * `REPORT_MAX_FILTER_VALUES` valores, «Sin proyecto» contado como uno. La
 * página los recibe de `reportFiltersOf`, que ya lo garantiza; es para otro
 * llamador (R6), antes de leer.
 */
function checkFilters({ clients, projects, withoutProject }: ReportFilters): void {
  const lists = [
    { name: "cliente", values: clients, count: clients.length },
    {
      name: "proyecto",
      values: projects,
      count: projectFilterCount(projects, withoutProject),
    },
  ];
  for (const { name, values, count } of lists) {
    if (count > REPORT_MAX_FILTER_VALUES || new Set(values).size !== values.length) {
      throw new RangeError(
        `Filtro de ${name} con ${count} valores o con repetidos; el tope es ${REPORT_MAX_FILTER_VALUES}.`,
      );
    }
  }
}

/**
 * D-R4-5, RP-34: los filtros del pedido que están en el catálogo, en el orden
 * del catálogo y con sus ids, comparados tal cual. Lo que no está se ignora él
 * solo. «Sin proyecto» no está en ningún catálogo y pasa igual.
 */
function effectiveFiltersOf(
  filters: ReportFilters,
  catalog: ProjectFilterCatalog,
): ReportFilters {
  const clients = new Set(filters.clients);
  const projects = new Set(filters.projects);
  return {
    clients: catalog.clients.filter(({ id }) => clients.has(id)).map(({ id }) => id),
    projects: catalog.projects.filter(({ id }) => projects.has(id)).map(({ id }) => id),
    withoutProject: filters.withoutProject,
  };
}

/** Los filtros efectivos como los lee el repository. */
function entryFilterOf(filters: ReportFilters): ReportEntryFilter {
  return {
    projectIds: filters.projects,
    withoutProject: filters.withoutProject,
    clientIds: filters.clients,
  };
}

/**
 * D-R4-9: las opciones de los filtros, campo por campo: un campo que el
 * catálogo sume no llega a la pantalla sin un cambio acá.
 */
function toFilterOptions(
  catalog: ProjectFilterCatalog,
): ReportReadyState["filterOptions"] {
  return {
    clients: catalog.clients.map(({ id, name, archived }) => ({ id, name, archived })),
    projects: catalog.projects.map(({ id, name, color, client, archived }) => ({
      id,
      name,
      color,
      client: client === null ? null : { id: client.id, name: client.name },
      archived,
    })),
  };
}

/**
 * La clave de un grupo en el armado del árbol: la de su dimensión —el id,
 * `null` para «Sin …», el índice del tramo—. Nunca se compara con la de otra
 * dimensión, porque solo se comparan caminos del mismo largo y orden.
 */
function groupKeyOf(row: LevelGroupRow): string | number | null {
  switch (row.kind) {
    case "person":
      return row.userId;
    case "project":
      return row.project?.id ?? null;
    case "client":
      return row.client?.id ?? null;
    case "task":
      return row.task?.id ?? null;
    case "tag":
      return row.tag?.id ?? null;
    case "date":
      return row.bucket;
  }
}

/** El camino de un grupo: las claves de sus ancestros y la suya. */
function pathOf(groups: readonly LevelGroupRow[]): string {
  return JSON.stringify(groups.map(groupKeyOf));
}

/** Un grupo del árbol mientras se arma: sus hijos llegan con el nivel de abajo. */
type TreeNode = { readonly group: ReportGroup; readonly children: TreeNode[] };

/**
 * D-R3-7: el árbol de los niveles leídos. Cada fila del nivel `d` se cuelga
 * del grupo cuyo camino es el de sus `d − 1` primeras claves: el camino entero
 * y no solo la última. Los hermanos van en el orden de su dimensión, y un
 * grupo lleva `children` solo si el nivel de abajo se leyó y entró.
 */
function treeOf(
  levels: readonly (readonly LevelTotalRow[])[],
  dates: DateContext,
): ReportGroup[] {
  const roots: TreeNode[] = [];
  let parents = new Map<string, TreeNode>();
  for (const [depth, rows] of levels.entries()) {
    const nodes = new Map<string, TreeNode>();
    for (const row of rows) {
      const level = row.groups[depth];
      if (level === undefined || row.groups.length !== depth + 1) {
        throw new Error(
          `Una fila del nivel ${depth + 1} trae ${row.groups.length} grupos.`,
        );
      }
      const node: TreeNode = { group: groupOf(level, row.seconds, dates), children: [] };
      if (depth === 0) {
        roots.push(node);
      } else {
        // En una foto, todo grupo tiene a sus ancestros en los niveles de arriba.
        const parent = parents.get(pathOf(row.groups.slice(0, depth)));
        if (parent === undefined) {
          throw new Error(`Una fila del nivel ${depth + 1} sin su grupo de arriba.`);
        }
        parent.children.push(node);
      }
      nodes.set(pathOf(row.groups), node);
    }
    parents = nodes;
  }
  return groupsOf(roots, levels.length - 1);
}

/** Los grupos de un nivel, ordenados, con sus hijos hasta `below` niveles más abajo. */
function groupsOf(nodes: readonly TreeNode[], below: number): ReportGroup[] {
  return nodes
    .map(({ group, children }): ReportGroup => {
      if (below === 0) {
        return group;
      }
      // Toda entrada tiene una clave en cada dimensión, aunque sea «Sin …».
      if (children.length === 0) {
        throw new Error("Un grupo sin hijos en un nivel que se muestra.");
      }
      return { ...group, children: groupsOf(children, below - 1) };
    })
    .sort(compareSiblings);
}

/**
 * D-R3-6: los niveles que entran en el tope, desde el primero, que se lee
 * entero. Cada uno de abajo se pide con lo que queda del tope más uno: entra
 * entero o no entra, y entonces no se lee ninguno más abajo. Sin filas en el
 * primero no hay nada que colgar y no se lee ninguno de abajo.
 */
async function readLevelsWithinLimit(
  levelCount: number,
  readLevel: (depth: number, limit?: number) => Promise<readonly LevelTotalRow[]>,
): Promise<(readonly LevelTotalRow[])[]> {
  const first = await readLevel(1);
  if (first.length === 0) {
    return [first];
  }
  const shown = [first];
  let rowsRead = first.length;
  for (let depth = 2; depth <= levelCount; depth++) {
    const budget = REPORT_MAX_ROWS - rowsRead;
    if (budget <= 0) {
      break;
    }
    const rows = await readLevel(depth, budget + 1);
    if (rows.length > budget) {
      break;
    }
    shown.push(rows);
    rowsRead += rows.length;
  }
  return shown;
}

/** Lo que se lee de un pedido ya validado: sus niveles, el intervalo, los tramos y los filtros. */
type ReadPlan = {
  readonly levels: readonly ReportGroupBy[];
  readonly span: ReportSpan;
  /** Los cortes de `span` si la fecha es un nivel; si no, `null`. */
  readonly buckets: TimeBuckets | null;
  /** Los del pedido, sin cruzar con los catálogos. */
  readonly filters: ReportFilters;
};

/** La lectura de los `depth` primeros niveles, con los tramos solo si la fecha está entre ellos. */
function levelReadOf(
  plan: ReadPlan,
  depth: number,
  filter: ReportEntryFilter,
  limit?: number,
): ReportLevelRead {
  const dimensions = plan.levels.slice(0, depth);
  return {
    span: plan.span,
    filter,
    dimensions,
    buckets: dimensions.includes("date") ? plan.buckets : null,
    limit,
  };
}

/**
 * Todo lo que se lee de un pedido, con la transacción de solo lectura de
 * quien llama: primero los catálogos, que deciden los filtros efectivos
 * (D-R4-5), y después los niveles y el total con esos filtros.
 */
async function readReport(
  tx: Transaction,
  actor: Actor,
  scope: Scope,
  plan: ReadPlan,
): Promise<ReportRead> {
  const catalog = await getProjectFilterCatalog(tx, actor);
  const filters = effectiveFiltersOf(plan.filters, catalog);
  const filter = entryFilterOf(filters);
  const levels = await readLevelsWithinLimit(plan.levels.length, (depth, limit) =>
    reportRepository.totalsByLevels(scope, levelReadOf(plan, depth, filter, limit), tx),
  );
  const [first] = levels;
  // El total no pasa por la unión con las etiquetas; con el primer nivel sin
  // etiqueta, cada entrada filtrada está en un grupo y la suma es el total
  // (D-R2a-7).
  const totals =
    plan.levels[0] === "tag"
      ? await reportRepository.entryTotals(scope, { span: plan.span, filter }, tx)
      : {
          seconds: first.reduce((sum, row) => sum + row.seconds, 0),
          billableSeconds: first.reduce((sum, row) => sum + row.billableSeconds, 0),
        };
  return { levels, totals, catalog, filters };
}

/**
 * RP-10: el resumido de quien mira, armado en el servidor con su zona y su
 * primer día de la semana. `now` existe para que los tests fijen el día.
 */
export async function getReportState(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  now: Date = new Date(),
): Promise<ReportState> {
  // RP-07: sin permiso no se lee nada.
  if (!can(actor, "report.view", workspaceResource(actor))) {
    return { kind: "forbidden" };
  }
  const scope = scopeOf(actor);
  const timeZone = settings.timezone;
  const todayKey = dayKey(now, timeZone);
  const period = reportPeriodOf(todayKey, settings, request.range);
  const range = period.range;
  const groupBy = request.groupBy ?? DEFAULT_GROUP_BY;
  const levels = [groupBy, ...request.subgroups];
  // La página los recibe de `reportSubgroupParams`, que ya lo garantiza; acá
  // es una invariante, para otro llamador (R6), antes de leer.
  if (levels.length > 3 || new Set(levels).size !== levels.length) {
    throw new RangeError(
      `Niveles fuera de uno a tres sin repetir: ${levels.join(", ")}.`,
    );
  }
  const days = daysBetweenKeys(range.first, range.last) + 1;
  // El esquema de la URL ya lo valida; acá es una invariante, para que
  // ningún otro llamador (la exportación de R6) lea fuera del tope.
  if (days < 1 || days > REPORT_MAX_DAYS) {
    throw new RangeError(
      `Período fuera de 1 a ${REPORT_MAX_DAYS} días: ${range.first} a ${range.last}.`,
    );
  }
  checkFilters(request.filters);
  const span = {
    from: startOfDayKey(range.first, timeZone),
    to: startOfDayKey(addDaysToKey(range.last, 1), timeZone),
  };
  // Los cortes solo si la fecha es un nivel; el primero y el fin son los de `span`.
  const buckets = levels.includes("date")
    ? dayBuckets(range.first, range.last, timeZone)
    : null;
  // ADR 0021, D-R3-3: una sola foto, con los catálogos de los filtros
  // (D-R4-5). Se abre después de `report.view`, de `scopeOf` y de las
  // invariantes.
  const read = await db.transaction(
    (tx) =>
      readReport(tx, actor, scope, { levels, span, buckets, filters: request.filters }),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const dates = { buckets, todayKey, format: settings.formats.date };
  // Un período sin horas no se corta: muestra todos los niveles pedidos.
  const levelsShown = read.levels[0].length === 0 ? levels.length : read.levels.length;
  return {
    kind: "ready",
    todayKey,
    range,
    rangeLabel: period.rangeLabel,
    previous: period.previous,
    next: period.next,
    currentWeek: period.currentWeek,
    shortcuts: [...period.shortcuts],
    groupBy,
    subgroups: [...request.subgroups],
    levelsShown,
    scope: scope.people.kind,
    timeZone,
    totalSeconds: read.totals.seconds,
    billableSeconds: read.totals.billableSeconds,
    groups: treeOf(read.levels, dates),
    filters: read.filters,
    filterOptions: toFilterOptions(read.catalog),
  };
}

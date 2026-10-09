import { compareNames } from "@/lib/text";
import { db, type Transaction } from "@/server/db";
import { can, type Actor, type WorkspaceResource } from "@/server/permissions";
import {
  addDaysToKey,
  bucketDays,
  compareDayKeys,
  dayBuckets,
  dayKey,
  dayRangeLabel,
  daysBetweenKeys,
  earliestDayKey,
  monthBuckets,
  monthEndKey,
  monthLabel,
  monthStartKey,
  startOfDayKey,
  weekBuckets,
  weekdayLabel,
  weekStartKey,
  type DateFormat,
  type DayKeyRange,
  type TimeBuckets,
  type TimeSettings,
  type WeekStart,
} from "@/server/time";
import { displayNameOf } from "@/modules/profile/service";
import { paletteKeyOf } from "@/modules/project/palette";
import type { ProjectFilterCatalog } from "@/modules/project/schema";
import { getProjectFilterCatalog } from "@/modules/project/service";
import { listWorkspacePeople, type WorkspacePerson } from "@/modules/workspace/service";

import { reportPeriodOf } from "./period";
import {
  reportRepository,
  type EntryTotals,
  type ReportBuckets,
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
  REPORT_TIME_GROUP_BYS,
  type ReportFilters,
  type ReportGroup,
  type ReportGroupBy,
  type ReportRange,
  type ReportReadyState,
  type ReportState,
  type ReportTimeGroupBy,
} from "./schema";

type ScopePeople =
  /** `timeEntry.others.view`: todas las personas del workspace, activas e inactivas (RP-02, RP-61). */
  | { readonly kind: "everyone" }
  /** Con `timeEntry.others.view` y el filtro de personas: solo estas, del workspace (D-R4-4). */
  | { readonly kind: "chosen"; readonly userIds: readonly string[] }
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

/** El alcance de las lecturas (D-R2a-1). Solo `scopeOf` y `narrowedTo` lo construyen. */
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

/** Constructor del alcance de quien mira: `can()` decide si ve a todos (D-R2a-2). */
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

/**
 * D-R4-4: el alcance angostado a las personas elegidas. Solo sale de
 * `everyone`, que ya respondió `timeEntry.others.view`: nunca ensancha. Es,
 * con `scopeOf`, lo único que construye un `Scope`.
 */
function narrowedTo(scope: Scope, userIds: readonly string[]): Scope {
  if (scope.people.kind !== "everyone") {
    throw new Error(`El alcance ${scope.people.kind} no se angosta a personas elegidas.`);
  }
  if (userIds.length < 1 || userIds.length > REPORT_MAX_FILTER_VALUES) {
    throw new RangeError(
      `Personas elegidas fuera de 1 a ${REPORT_MAX_FILTER_VALUES}: ${userIds.length}.`,
    );
  }
  return new Scope(scope.workspaceId, { kind: "chosen", userIds });
}

/** Lo que dice la línea del alcance: lo que quien mira puede ver, no lo elegido (D-R4-4). */
function scopeLineOf(scope: Scope): ReportReadyState["scope"] {
  return scope.people.kind === "self" ? "self" : "everyone";
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

/**
 * Cómo se rotula un grupo de tiempo: los tramos del pedido, el último día del
 * período, el primer día de la semana de quien mira, hoy y el formato.
 */
type TimeContext = {
  readonly buckets: ReportBuckets;
  readonly last: string;
  readonly weekStart: WeekStart;
  readonly todayKey: string;
  readonly format: DateFormat;
};

/** Los de `Item` que son de una dimensión de tiempo: la fecha, la semana o el mes. */
type WithTimeKind<Item> = Extract<Item, { readonly kind: ReportTimeGroupBy }>;

/** Si una fila o un grupo es de una dimensión de tiempo. */
function hasTimeKind<Item extends { readonly kind: string }>(
  item: Item,
): item is WithTimeKind<Item> {
  return REPORT_TIME_GROUP_BYS.some((kind) => kind === item.kind);
}

/** Lo que una fila dice de un nivel de tiempo: la dimensión y la posición del tramo. */
type TimeRow = WithTimeKind<LevelGroupRow>;

/** Los días del tramo de una fila de tiempo, cortados por el período. */
function daysOf(row: TimeRow, time: TimeContext): DayKeyRange {
  const buckets: TimeBuckets | undefined = time.buckets[row.kind];
  if (buckets === undefined) {
    throw new Error(`Una fila por ${row.kind} sin los tramos de la lectura.`);
  }
  return bucketDays(buckets, row.bucket, time.last);
}

/**
 * D-R10-3: los días que cuenta un grupo, la intersección de los de cada grupo
 * de tiempo de su camino, a cualquier altura y no solo el padre: la fila suma
 * las entradas que caen en todos. Nunca vacía, porque la fila existe.
 */
function countedDays(path: readonly LevelGroupRow[], time: TimeContext): DayKeyRange {
  const ranges = path.filter(hasTimeKind).map((row) => daysOf(row, time));
  const [outermost, ...inner] = ranges;
  if (outermost === undefined) {
    throw new Error("Un camino sin grupos de tiempo no cuenta días.");
  }
  const counted = inner.reduce(
    (range, other) => ({
      first: compareDayKeys(other.first, range.first) > 0 ? other.first : range.first,
      last: earliestDayKey(range.last, other.last),
    }),
    outermost,
  );
  if (compareDayKeys(counted.first, counted.last) > 0) {
    throw new Error("Una fila de tiempo sin días en común con su camino.");
  }
  return counted;
}

/**
 * Lo que dice `partial` de una semana o un mes entero, `unit`: los días que
 * cuenta su camino si no son todos, o `null`.
 */
function partialOf(
  unit: DayKeyRange,
  path: readonly LevelGroupRow[],
  time: TimeContext,
): string | null {
  const counted = countedDays(path, time);
  if (counted.first === unit.first && counted.last === unit.last) {
    return null;
  }
  return dayRangeLabel(counted.first, counted.last, time.todayKey, time.format);
}

/**
 * El grupo de un nivel, de lo que la fila dice de él y de su camino, que lo
 * incluye al final. Un día se rotula con su fecha y sin «Hoy» ni «Ayer»
 * (D-R2b-6); una semana y un mes, con la unidad entera y sin «Esta semana», y
 * con los días que cuentan si no son todos (D-R10-3).
 */
function groupOf(
  row: LevelGroupRow,
  path: readonly LevelGroupRow[],
  seconds: number,
  time: TimeContext,
): ReportGroup {
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
      const day = daysOf(row, time).first;
      return {
        kind: "date",
        dayKey: day,
        label: weekdayLabel(day, time.todayKey, time.format),
        seconds,
      };
    }
    case "week": {
      const weekStart = weekStartKey(daysOf(row, time).first, time.weekStart);
      const week = { first: weekStart, last: addDaysToKey(weekStart, 6) };
      return {
        kind: "week",
        weekStart,
        label: dayRangeLabel(week.first, week.last, time.todayKey, time.format),
        partial: partialOf(week, path, time),
        seconds,
      };
    }
    case "month": {
      const first = daysOf(row, time).first;
      const month = { first: monthStartKey(first), last: monthEndKey(first) };
      return {
        kind: "month",
        monthStart: month.first,
        label: monthLabel(month.first, time.todayKey),
        partial: partialOf(month, path, time),
        seconds,
      };
    }
    case "description":
      return { kind: "description", description: row.description, seconds };
  }
}

/** Los grupos que se cortan en tramos de tiempo: la fecha, la semana y el mes. */
type TimeGroup = WithTimeKind<ReportGroup>;

/** Los grupos que se ordenan por duración y nombre: todos menos los de tiempo. */
type NamedGroup = Exclude<ReportGroup, TimeGroup>;

/**
 * Lo que el orden compara de un grupo; `null` es «Sin proyecto», «Sin
 * cliente», «Sin tarea», «Sin etiqueta» o «Sin descripción». Dos
 * descripciones con el mismo texto recortado se desempatan por el `id`.
 */
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
    case "description":
      return group.description === null
        ? null
        : { id: group.description.id, name: group.description.text };
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

/** El primer día de un grupo de tiempo: el día, el de la semana entera o el del mes. */
function firstDayOf(group: TimeGroup): string {
  switch (group.kind) {
    case "date":
      return group.dayKey;
    case "week":
      return group.weekStart;
    case "month":
      return group.monthStart;
  }
}

/**
 * Dos grupos del mismo nivel: los de tiempo en orden cronológico (D-R2b-6,
 * D-R10-5), el resto por duración y nombre.
 */
function compareSiblings(left: ReportGroup, right: ReportGroup): number {
  if (hasTimeKind(left) && hasTimeKind(right)) {
    return compareDayKeys(firstDayOf(left), firstDayOf(right));
  }
  if (!hasTimeKind(left) && !hasTimeKind(right)) {
    return compareGroups(left, right);
  }
  throw new Error("Un nivel con grupos de tiempo y de otra dimensión.");
}

/** Lo que se lee de un pedido, en una sola foto. */
type ReportRead = {
  /** Las filas de cada nivel que entró en el tope, desde el primero. */
  readonly levels: readonly (readonly LevelTotalRow[])[];
  readonly totals: EntryTotals;
  readonly catalog: ProjectFilterCatalog;
  /** Las opciones del filtro de personas; `null` sin `timeEntry.others.view`. */
  readonly people: PersonOptions | null;
  /** Los filtros efectivos: los del pedido que están en el catálogo (D-R4-5). */
  readonly filters: ReportFilters;
};

/**
 * La invariante de los filtros: cada lista sin repetir y con hasta
 * `REPORT_MAX_FILTER_VALUES` valores, «Sin proyecto» contado como uno. La
 * página los recibe de `reportFiltersOf`, que ya lo garantiza; es para otro
 * llamador (R6), antes de leer.
 */
function checkFilters({
  people,
  clients,
  projects,
  withoutProject,
}: ReportFilters): void {
  const lists = [
    { name: "persona", values: people, count: people.length },
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

type PersonOptions = NonNullable<ReportReadyState["filterOptions"]["people"]>;

/**
 * RP-62, D-R4-9: las opciones del filtro de personas, campo por campo, con el
 * nombre de `displayNameOf` (ADR 0021) y en el orden de `compareNames`. Un
 * campo que `WorkspacePerson` sume no llega a la pantalla sin un cambio acá.
 */
function toPersonOptions(people: readonly WorkspacePerson[]): PersonOptions {
  return people
    .map((person) => ({
      id: person.userId,
      name: displayNameOf({ displayName: person.displayName }, person.accountName),
      inactive: person.status === "inactive",
    }))
    .sort(compareNames);
}

/**
 * D-R4-5, RP-34: los filtros del pedido que están en el catálogo, en el orden
 * del catálogo y con sus ids, comparados tal cual, sin cambiar mayúsculas. Lo
 * que no está se ignora él solo. «Sin proyecto» no está en ningún catálogo y
 * pasa igual. Sin catálogo de personas, el filtro de personas no existe
 * (D-R4-4).
 */
function effectiveFiltersOf(
  filters: ReportFilters,
  catalog: ProjectFilterCatalog,
  people: PersonOptions | null,
): ReportFilters {
  const chosen = new Set(filters.people);
  const clients = new Set(filters.clients);
  const projects = new Set(filters.projects);
  return {
    people:
      people === null
        ? []
        : people.filter(({ id }) => chosen.has(id)).map(({ id }) => id),
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
  people: PersonOptions | null,
): ReportReadyState["filterOptions"] {
  return {
    people,
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
    case "week":
    case "month":
      return row.bucket;
    case "description":
      return row.description?.id ?? null;
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
  time: TimeContext,
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
      const node: TreeNode = {
        group: groupOf(level, row.groups, row.seconds, time),
        children: [],
      };
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
  /** Los cortes de `span` de cada dimensión de tiempo entre los niveles. */
  readonly buckets: ReportBuckets;
  /** Los del pedido, sin cruzar con los catálogos. */
  readonly filters: ReportFilters;
};

/**
 * Los tramos de una dimensión de tiempo en la zona de quien mira (ADR 0021);
 * la semana, con su primer día (RP-24), que `timeSettingsOf` toma del perfil.
 */
function timeBucketsOf(
  groupBy: ReportTimeGroupBy,
  range: ReportRange,
  settings: TimeSettings,
): TimeBuckets {
  switch (groupBy) {
    case "date":
      return dayBuckets(range.first, range.last, settings.timezone);
    case "week":
      return weekBuckets(range.first, range.last, settings.weekStart, settings.timezone);
    case "month":
      return monthBuckets(range.first, range.last, settings.timezone);
  }
}

/**
 * Los tramos de cada dimensión de tiempo de `dimensions`, y solo de esas, con
 * los que da `bucketOf`; sin ninguna, `{}`.
 */
function bucketsFor(
  dimensions: readonly ReportGroupBy[],
  bucketOf: (groupBy: ReportTimeGroupBy) => ReportBuckets[ReportTimeGroupBy],
): ReportBuckets {
  const buckets: {
    -readonly [Dimension in ReportTimeGroupBy]?: ReportBuckets[Dimension];
  } = {};
  for (const groupBy of REPORT_TIME_GROUP_BYS) {
    if (dimensions.includes(groupBy)) {
      buckets[groupBy] = bucketOf(groupBy);
    }
  }
  return buckets;
}

/** La lectura de los `depth` primeros niveles, con los tramos de sus dimensiones de tiempo. */
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
    buckets: bucketsFor(dimensions, (groupBy) => plan.buckets[groupBy]),
    limit,
  };
}

/**
 * Todo lo que se lee de un pedido, con la transacción de solo lectura de
 * quien llama: primero los catálogos, que deciden los filtros efectivos
 * (D-R4-5), y después los niveles y el total con esos filtros. El catálogo de
 * personas se lee solo con el alcance `everyone`: `listWorkspacePeople` pide
 * `team.view` y no `timeEntry.others.view`, que responde `scopeOf` (D-R4-4).
 */
async function readReport(
  tx: Transaction,
  actor: Actor,
  scope: Scope,
  plan: ReadPlan,
): Promise<ReportRead> {
  const catalog = await getProjectFilterCatalog(tx, actor);
  // D-R4-4: el catálogo de personas solo para quien ve a todos.
  const people =
    scope.people.kind === "everyone"
      ? toPersonOptions(await listWorkspacePeople(tx, actor))
      : null;
  const filters = effectiveFiltersOf(plan.filters, catalog, people);
  const filter = entryFilterOf(filters);
  // D-R4-4: las personas angostan el alcance; los otros filtros se suman a él.
  const readScope = filters.people.length > 0 ? narrowedTo(scope, filters.people) : scope;
  const levels = await readLevelsWithinLimit(plan.levels.length, (depth, limit) =>
    reportRepository.totalsByLevels(
      readScope,
      levelReadOf(plan, depth, filter, limit),
      tx,
    ),
  );
  const [first] = levels;
  // El total no pasa por la unión con las etiquetas; con el primer nivel sin
  // etiqueta, cada entrada filtrada está en un grupo y la suma es el total
  // (D-R2a-7).
  const totals =
    plan.levels[0] === "tag"
      ? await reportRepository.entryTotals(readScope, { span: plan.span, filter }, tx)
      : {
          seconds: first.reduce((sum, row) => sum + row.seconds, 0),
          billableSeconds: first.reduce((sum, row) => sum + row.billableSeconds, 0),
        };
  return { levels, totals, catalog, people, filters };
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
  if (levels.includes("description")) {
    throw new Error("La agrupación por descripción todavía no lee.");
  }
  const span = {
    from: startOfDayKey(range.first, timeZone),
    to: startOfDayKey(addDaysToKey(range.last, 1), timeZone),
  };
  // Los cortes de cada dimensión de tiempo entre los niveles, una vez; el
  // primero y el fin de cada una son los de `span`.
  const buckets = bucketsFor(levels, (groupBy) =>
    timeBucketsOf(groupBy, range, settings),
  );
  // ADR 0021, D-R3-3: una sola foto, con los catálogos de los filtros
  // (D-R4-5). Se abre después de `report.view`, de `scopeOf` y de las
  // invariantes.
  const read = await db.transaction(
    (tx) =>
      readReport(tx, actor, scope, { levels, span, buckets, filters: request.filters }),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const time: TimeContext = {
    buckets,
    last: range.last,
    weekStart: settings.weekStart,
    todayKey,
    format: settings.formats.date,
  };
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
    scope: scopeLineOf(scope),
    timeZone,
    totalSeconds: read.totals.seconds,
    billableSeconds: read.totals.billableSeconds,
    groups: treeOf(read.levels, time),
    filters: read.filters,
    filterOptions: toFilterOptions(read.catalog, read.people),
  };
}

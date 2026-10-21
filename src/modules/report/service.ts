import { isReleasedEmail } from "@/lib/email";
import { compareNames } from "@/lib/text";
import { db, type Transaction } from "@/server/db";
import { hasCode, QUERY_CANCELED } from "@/server/db/constraint-error";
import { DomainError } from "@/server/errors";
import {
  can,
  ForbiddenError,
  type Actor,
  type WorkspaceResource,
} from "@/server/permissions";
import {
  addDaysToKey,
  bucketDays,
  compareDayKeys,
  dayBuckets,
  dayKey,
  dayRangeLabel,
  daysBetweenKeys,
  earliestDayKey,
  formatClock,
  formatDayKey,
  monthBuckets,
  monthEndKey,
  monthLabel,
  monthShortLabel,
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

import { chartGranularityOf } from "./chart";
import { entriesMinBytes } from "./export/entry-size";
import { reportPeriodOf } from "./period";
import {
  reportRepository,
  type BucketTotalRow,
  type EntryListRow,
  type EntryListSize,
  type EntryTotals,
  type ReportBucketRead,
  type ReportBuckets,
  type ReportEntryFilter,
  type ReportEntryRead,
  type ReportLevelRead,
  type ReportSpan,
  type LevelGroupRow,
  type LevelTotalRow,
  type StoredProject,
} from "./repository";
import {
  DEFAULT_GROUP_BY,
  HOURS_SUMMARY_MAX_ROWS,
  projectFilterCount,
  REPORT_EXPORT_MAX_BYTES,
  REPORT_EXPORT_MAX_ENTRIES,
  REPORT_EXPORT_STATEMENT_TIMEOUT_MS,
  REPORT_MAX_DAYS,
  REPORT_MAX_FILTER_VALUES,
  REPORT_MAX_ROWS,
  REPORT_TIME_GROUP_BYS,
  reportLevelsOf,
  reportMessages,
  type HoursSummaryValues,
  type PeopleCatalog,
  type PeopleCatalogPerson,
  type ReportChart,
  type ReportEntryRow,
  type ReportErrorCode,
  type ReportExportEntries,
  type ReportFilters,
  type ReportGroup,
  type ReportGroupBy,
  type ReportPersonGroup,
  type ReportRange,
  type ReportReadyState,
  type ReportState,
  type ReportTimeGroupBy,
} from "./schema";

/** Error de dominio del reporte. La herramienta lo traduce con `failureOf`. */
export class ReportError extends DomainError<ReportErrorCode> {
  constructor(code: ReportErrorCode, message: string) {
    super(code, message);
    this.name = "ReportError";
  }
}

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
  /** El de `reportPeopleWithoutTimeParams`, sin decidir si aplica (D-R9-5). */
  readonly peopleWithoutTime: boolean;
};

/**
 * Cómo lee una puerta de entrada. `readReportState` lo recibe obligatorio y sin
 * valor por omisión: una llamada que no elige modo no compila.
 */
type ReadMode = {
  /**
   * D-MCPE-4: las dos reglas del modo del asistente. Sin
   * `timeEntry.others.view`, un id de persona ajeno corta con `forbidden` antes
   * de leer (`checkOwnPeople`); y un id de persona, proyecto o cliente fuera de
   * su catálogo corta con `not_found` en lugar de ignorarse como en la página
   * (D-R4-5, `checkStrictFilters`).
   */
  readonly strictFilters: boolean;
  /** D-R3-6, D-MCPE-5: el tope de filas de los niveles. */
  readonly maxRows: number;
  /** S3 de R6a, D-MCPE-6: `set local statement_timeout` en la transacción. */
  readonly statementTimeout: boolean;
  /** D-MCPE-6: si lee las barras; sin ellas, `chart: null`. */
  readonly chart: boolean;
};

const PAGE_READ: ReadMode = {
  strictFilters: false,
  maxRows: REPORT_MAX_ROWS,
  statementTimeout: false,
  chart: true,
};
const EXPORT_READ: ReadMode = { ...PAGE_READ, statementTimeout: true };
const ASSISTANT_READ: ReadMode = {
  strictFilters: true,
  maxRows: HOURS_SUMMARY_MAX_ROWS,
  statementTimeout: true,
  chart: false,
};

/** El recurso de `report.view` y de los permisos del workspace de quien mira. */
export function workspaceResource(actor: Actor): WorkspaceResource {
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
 * incluye al final. Los de tiempo los arma `timeGroupOf`.
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
    case "date":
    case "week":
    case "month":
      return timeGroupOf(row, path, seconds, time);
    case "description":
      return { kind: "description", description: row.description, seconds };
  }
}

/** Los grupos que se cortan en tramos de tiempo: la fecha, la semana y el mes. */
type TimeGroup = WithTimeKind<ReportGroup>;

/**
 * El grupo de una fila de tiempo, de la tabla o de una barra del gráfico, que
 * lo pide con un camino de un solo grupo (D-R5-5). Un día se rotula con su
 * fecha y sin «Hoy» ni «Ayer» (D-R2b-6); una semana y un mes, con la unidad
 * entera y sin «Esta semana», y con los días que cuentan si no son todos
 * (D-R10-3).
 */
function timeGroupOf(
  row: TimeRow,
  path: readonly LevelGroupRow[],
  seconds: number,
  time: TimeContext,
): TimeGroup {
  switch (row.kind) {
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
  }
}

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
  /** Las filas de cada nivel que entró en el tope, desde el primero; vacío si no entró ni el primero. */
  readonly levels: readonly (readonly LevelTotalRow[])[];
  readonly totals: EntryTotals;
  readonly catalog: ProjectFilterCatalog;
  /** Las opciones del filtro de personas; `null` sin `timeEntry.others.view`. */
  readonly people: PersonOptions | null;
  /** Los filtros efectivos: los del pedido que están en el catálogo (D-R4-5). */
  readonly filters: ReportFilters;
  /**
   * Los tramos del gráfico con horas, con el alcance y los filtros de los
   * niveles (D-R5-2); `null` si el plan no lo pide (D-MCPE-6).
   */
  readonly chart: readonly BucketTotalRow[] | null;
  /** D-R6-3: las entradas, o que no entran sin leerlas (S1); `null` si el plan no las pide. */
  readonly entries: EntryRead | null;
  /**
   * D-R9-3: las personas sin horas, después del primer nivel; vacío sin la
   * opción o si el primer nivel no entró.
   */
  readonly withoutTime: readonly ReportPersonGroup[];
};

/**
 * D-R9-2: quiénes pueden aparecer sin horas: las elegidas en el filtro de
 * personas, si hay, activas o inactivas; si no, las activas. En los dos casos,
 * con la membresía creada antes de `until`, el fin del período.
 */
function withoutTimeCandidates(
  people: readonly WorkspacePerson[],
  chosen: readonly string[],
  until: Date,
): readonly WorkspacePerson[] {
  const picked = new Set(chosen);
  return people.filter(
    (person) =>
      (chosen.length > 0 ? picked.has(person.userId) : person.status === "active") &&
      person.joinedAt.getTime() < until.getTime(),
  );
}

/**
 * D-R9-3, D-R9-7: las candidatas que no tienen fila en el primer nivel, como
 * grupos de persona en cero y sin hijos, en el orden de `compareNames` sobre
 * el nombre de `displayNameOf`. Lanza si una fila del primer nivel no es de
 * persona.
 */
function peopleWithoutTimeOf(
  firstLevel: readonly LevelTotalRow[],
  candidates: readonly WorkspacePerson[],
): ReportPersonGroup[] {
  const withTime = new Set(
    firstLevel.map(({ groups }) => {
      const [group] = groups;
      if (group?.kind !== "person" || groups.length !== 1) {
        throw new Error("Una fila del primer nivel que no es de persona.");
      }
      return group.userId;
    }),
  );
  return candidates
    .filter(({ userId }) => !withTime.has(userId))
    .map((person): ReportPersonGroup => ({
      kind: "person",
      userId: person.userId,
      name: displayNameOf({ displayName: person.displayName }, person.accountName),
      inactive: person.status === "inactive",
      seconds: 0,
    }))
    .sort((left, right) =>
      compareNames(
        { id: left.userId, name: left.name },
        { id: right.userId, name: right.name },
      ),
    );
}

/**
 * D-R6-3: hasta `REPORT_EXPORT_MAX_ENTRIES + 1` entradas, sin orden, o
 * `tooMany` si la lectura de agregados ya dijo que no entran (S1).
 */
type EntryRead =
  | { readonly kind: "read"; readonly rows: readonly EntryListRow[] }
  | { readonly kind: "tooMany" };

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
 * D-MCPE-4: en el modo estricto, un filtro efectivo más corto que el pedido es
 * un id fuera del catálogo, en este orden: personas —solo con el alcance
 * `everyone`, el único con catálogo de personas—, proyectos y clientes. Las
 * listas del pedido no repiten (`checkFilters`). «Sin proyecto» no está en
 * ningún catálogo y no se compara.
 */
function checkStrictFilters(
  requested: ReportFilters,
  effective: ReportFilters,
  scope: Scope,
): void {
  if (
    scope.people.kind === "everyone" &&
    effective.people.length < requested.people.length
  ) {
    throw new ReportError("not_found", reportMessages.peopleNotFound);
  }
  if (effective.projects.length < requested.projects.length) {
    throw new ReportError("not_found", reportMessages.projectsNotFound);
  }
  if (effective.clients.length < requested.clients.length) {
    throw new ReportError("not_found", reportMessages.clientsNotFound);
  }
}

/**
 * D-MCPE-4: sin `timeEntry.others.view`, un filtro de personas con otra que
 * no sea quien pide corta antes de abrir la transacción. Con solo la propia
 * sigue: el alcance `self` ya es eso, y `effectiveFiltersOf` lo descarta.
 */
function checkOwnPeople(actor: Actor, scope: Scope, filters: ReportFilters): void {
  if (
    scope.people.kind === "self" &&
    filters.people.some((userId) => userId !== actor.userId)
  ) {
    throw new ReportError("forbidden", reportMessages.othersForbidden);
  }
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
 * D-R3-6, D-R10-10: los niveles que entran en el tope, desde el primero, que
 * también entra entero o no entra. Cada uno se pide con lo que queda del tope
 * más uno; si no entra, no se lee ninguno más abajo, y si es el primero, la
 * lista vuelve vacía. Sin filas en el primero no hay nada que colgar y no se
 * lee ninguno de abajo. El primero cuenta además las filas que suma una vez
 * leído (D-R9-8), para entrar y para el presupuesto de los de abajo.
 */
async function readLevelsWithinLimit(
  levelCount: number,
  /** D-R3-6, D-MCPE-5: el tope del modo. */
  maxRows: number,
  readLevel: (depth: number, limit: number) => Promise<readonly LevelTotalRow[]>,
  /** D-R9-8: cuántas filas suma el primer nivel una vez leído; 0 sin la opción. */
  firstLevelExtra: (rows: readonly LevelTotalRow[]) => number,
): Promise<(readonly LevelTotalRow[])[]> {
  const shown: (readonly LevelTotalRow[])[] = [];
  let rowsRead = 0;
  for (let depth = 1; depth <= levelCount; depth++) {
    const budget = maxRows - rowsRead;
    if (budget <= 0) {
      break;
    }
    const rows = await readLevel(depth, budget + 1);
    const counted = rows.length + (depth === 1 ? firstLevelExtra(rows) : 0);
    if (counted > budget) {
      break;
    }
    shown.push(rows);
    rowsRead += counted;
    if (rows.length === 0) {
      break;
    }
  }
  return shown;
}

/**
 * Cuántos niveles muestra el estado: 0 si no entró ni el primero (D-R10-10);
 * todos los pedidos si el período no tiene horas, que no se corta; si no, los
 * que entraron.
 */
function levelsShownOf(
  levels: readonly (readonly LevelTotalRow[])[],
  requested: number,
): number {
  const [first] = levels;
  if (first === undefined) {
    return 0;
  }
  return first.length === 0 ? requested : levels.length;
}

/** Lo que se lee de un pedido ya validado: sus niveles, el intervalo, los tramos y los filtros. */
type ReadPlan = {
  readonly levels: readonly ReportGroupBy[];
  readonly span: ReportSpan;
  /** Los cortes de `span` de cada dimensión de tiempo entre los niveles. */
  readonly buckets: ReportBuckets;
  /** Los del pedido, sin cruzar con los catálogos. */
  readonly filters: ReportFilters;
  /** Los cortes de `span` del gráfico, en la granularidad del período (D-R5-4). */
  readonly chartPlan: ChartPlan;
  /** El de la puerta de entrada: los filtros estrictos, los topes y el gráfico. */
  readonly mode: ReadMode;
  /** D-R6-2: la exportación que las pide lee además las entradas; la página no. */
  readonly entries: boolean;
  /** D-R9-5: la opción efectiva, que solo llega con el alcance `everyone`. */
  readonly peopleWithoutTime: boolean;
};

/** El gráfico de un pedido: su granularidad y sus tramos, que cubren `span`. */
type ChartPlan = Pick<ReportBucketRead, "granularity" | "buckets">;

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
  limit: number,
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
 * (D-R4-5), y después los niveles, el total y el gráfico con esos filtros y
 * el mismo alcance (D-R5-2), también cuando el primer nivel no entra o es de
 * la misma dimensión que el gráfico; las entradas, si el plan las pide, con lo
 * mismo (D-R6-3). El catálogo de personas se lee solo con
 * el alcance `everyone`: `listWorkspacePeople` pide `team.view` y no
 * `timeEntry.others.view`, que responde `scopeOf` (D-R4-4). Las personas sin
 * horas salen de ese mismo catálogo, sin otra lectura (D-R9-6).
 */
async function readReport(
  tx: Transaction,
  actor: Actor,
  scope: Scope,
  plan: ReadPlan,
): Promise<ReportRead> {
  // S3, D-R7-3, D-MCPE-6: toda exportación y todo resumido del asistente
  // corren con tope de duración, lean o no las entradas.
  if (plan.mode.statementTimeout) {
    await reportRepository.limitStatementTime(REPORT_EXPORT_STATEMENT_TIMEOUT_MS, tx);
  }
  const catalog = await getProjectFilterCatalog(tx, actor);
  // D-R4-4: el catálogo de personas solo para quien ve a todos.
  const workspacePeople =
    scope.people.kind === "everyone" ? await listWorkspacePeople(tx, actor) : null;
  if (plan.peopleWithoutTime && workspacePeople === null) {
    throw new Error("Las personas sin horas sin el catálogo de personas.");
  }
  const people = workspacePeople === null ? null : toPersonOptions(workspacePeople);
  const filters = effectiveFiltersOf(plan.filters, catalog, people);
  // D-MCPE-4: la comprobación y la lectura son la misma foto.
  if (plan.mode.strictFilters) {
    checkStrictFilters(plan.filters, filters, scope);
  }
  const filter = entryFilterOf(filters);
  // D-R4-4: las personas angostan el alcance; los otros filtros se suman a él.
  const readScope = filters.people.length > 0 ? narrowedTo(scope, filters.people) : scope;
  // D-R9-2: las candidatas, de las personas efectivas del filtro.
  const candidates =
    plan.peopleWithoutTime && workspacePeople !== null
      ? withoutTimeCandidates(workspacePeople, filters.people, plan.span.to)
      : [];
  const levels = await readLevelsWithinLimit(
    plan.levels.length,
    plan.mode.maxRows,
    (depth, limit) =>
      reportRepository.totalsByLevels(
        readScope,
        levelReadOf(plan, depth, filter, limit),
        tx,
      ),
    // D-R9-8: las sin horas cuentan en el tope.
    plan.peopleWithoutTime
      ? (rows) => peopleWithoutTimeOf(rows, candidates).length
      : () => 0,
  );
  const [first] = levels;
  const withoutTime =
    plan.peopleWithoutTime && first !== undefined
      ? peopleWithoutTimeOf(first, candidates)
      : [];
  // El total no pasa por la unión con las etiquetas, y sin el primer nivel no
  // hay suma (D-R10-10); si no, cada entrada filtrada está en un grupo del
  // primero y la suma es el total (D-R2a-7).
  const totals =
    first === undefined || plan.levels[0] === "tag"
      ? await reportRepository.entryTotals(readScope, { span: plan.span, filter }, tx)
      : {
          seconds: first.reduce((sum, row) => sum + row.seconds, 0),
          billableSeconds: first.reduce((sum, row) => sum + row.billableSeconds, 0),
        };
  const chart = plan.mode.chart
    ? await reportRepository.totalsByBucket(
        readScope,
        { span: plan.span, filter, ...plan.chartPlan },
        tx,
      )
    : null;
  const entries = plan.entries
    ? await readEntries(tx, readScope, { span: plan.span, filter })
    : null;
  return { levels, totals, catalog, people, filters, chart, entries, withoutTime };
}

/**
 * S1, S2, B4: si las entradas no pueden entrar en el documento, no se leen,
 * en ningún formato. La cota de los bytes nunca pasa al CSV escrito
 * (`entriesMinBytes`), así que no deja afuera un CSV que habría entrado; la
 * guarda del peso escrito de cada formato queda como respaldo.
 */
function entriesFit(size: EntryListSize): boolean {
  return (
    size.entries <= REPORT_EXPORT_MAX_ENTRIES &&
    entriesMinBytes(size) <= REPORT_EXPORT_MAX_BYTES
  );
}

/** D-R6-3, S1: las entradas de la lectura con su tope, o `tooMany` sin listarlas. */
async function readEntries(
  tx: Transaction,
  scope: Scope,
  read: ReportEntryRead,
): Promise<EntryRead> {
  if (!entriesFit(await reportRepository.entryListSize(scope, read, tx))) {
    return { kind: "tooMany" };
  }
  // D-R6-3: una de más dice que no entran todas.
  const rows = await reportRepository.entryList(
    scope,
    { ...read, limit: REPORT_EXPORT_MAX_ENTRIES + 1 },
    tx,
  );
  return { kind: "read", rows };
}

/**
 * D-R5-5, D-R5-6: una barra por tramo del gráfico, en orden y también en cero,
 * con el rótulo y `partial` de `timeGroupOf`; `null` si la lectura no trajo
 * ninguna fila. La marca es el primer día que cuenta la barra, sin año, o el
 * mes abreviado.
 */
function chartOf(
  rows: readonly BucketTotalRow[],
  { granularity, buckets }: ChartPlan,
  time: TimeContext,
): ReportChart | null {
  if (rows.length === 0) {
    return null;
  }
  const secondsByBucket = new Map(rows.map(({ bucket, seconds }) => [bucket, seconds]));
  const chartTime: TimeContext = {
    ...time,
    buckets: bucketsFor([granularity], () => buckets),
  };
  return {
    granularity,
    bars: buckets.buckets.map(({ firstDay }, bucket) => {
      const row: TimeRow = { kind: granularity, bucket };
      const seconds = secondsByBucket.get(bucket) ?? 0;
      const group = timeGroupOf(row, [row], seconds, chartTime);
      return {
        firstDay,
        label: group.label,
        partial: group.kind === "date" ? null : group.partial,
        tick:
          granularity === "month"
            ? monthShortLabel(firstDay)
            : formatDayKey(firstDay, time.format, false),
        seconds,
      };
    }),
  };
}

/** Lo que lee `readReportState`: el estado de la página y, si se pidieron, las entradas. */
type ReportStateRead<Entries extends EntryRead | null> =
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "ready";
      readonly report: ReportReadyState;
      readonly entries: Entries;
    };

/**
 * El cuerpo de `getReportState`, de `getReportExport` (D-R6-2) y de
 * `getHoursSummary`: el mismo alcance, el mismo período, las mismas
 * invariantes y la misma foto. `null` es la página o el asistente; un
 * `ReportExportRead`, una exportación, con las entradas en la misma foto si
 * las pide (D-R7-3). `mode` decide los filtros estrictos, el tope de filas, el
 * de duración y el gráfico.
 */
async function readReportState(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  now: Date,
  read: null,
  mode: ReadMode,
): Promise<ReportStateRead<null>>;
async function readReportState(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  now: Date,
  read: ReportExportRead,
  mode: ReadMode,
): Promise<ReportStateRead<EntryRead | null>>;
async function readReportState(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  now: Date,
  read: ReportExportRead | null,
  mode: ReadMode,
): Promise<ReportStateRead<EntryRead | null>> {
  // RP-07: sin permiso no se lee nada.
  if (!can(actor, "report.view", workspaceResource(actor))) {
    return { kind: "forbidden" };
  }
  const scope = scopeOf(actor);
  // D-MCPE-4: horas ajenas sin el permiso cortan antes de leer.
  if (mode.strictFilters) {
    checkOwnPeople(actor, scope, request.filters);
  }
  const timeZone = settings.timezone;
  const todayKey = dayKey(now, timeZone);
  const period = reportPeriodOf(todayKey, settings, request.range);
  const range = period.range;
  const groupBy = request.groupBy ?? DEFAULT_GROUP_BY;
  const levels = reportLevelsOf({ groupBy, subgroups: request.subgroups });
  // D-R9-5: la opción aplica con la persona en el primer nivel efectivo y solo
  // para quien ve a todos, el único alcance que lee el catálogo de personas.
  const peopleWithoutTime =
    request.peopleWithoutTime && groupBy === "person" && scope.people.kind === "everyone";
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
  // Los cortes de cada dimensión de tiempo entre los niveles, una vez; el
  // primero y el fin de cada una son los de `span`.
  const buckets = bucketsFor(levels, (groupBy) =>
    timeBucketsOf(groupBy, range, settings),
  );
  // D-R5-4: los del gráfico, de su propia granularidad, aunque un nivel la
  // comparta: son los mismos instantes.
  const granularity = chartGranularityOf(range);
  const chartPlan = {
    granularity,
    buckets: timeBucketsOf(granularity, range, settings),
  };
  // ADR 0021, D-R3-3: una sola foto, con los catálogos de los filtros
  // (D-R4-5). Se abre después de `report.view`, de `scopeOf` y de las
  // invariantes.
  const snapshot = await db.transaction(
    (tx) =>
      readReport(tx, actor, scope, {
        levels,
        span,
        buckets,
        filters: request.filters,
        chartPlan,
        mode,
        entries: read?.entries ?? false,
        peopleWithoutTime,
      }),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const time: TimeContext = {
    buckets,
    last: range.last,
    weekStart: settings.weekStart,
    todayKey,
    format: settings.formats.date,
  };
  const levelsShown = levelsShownOf(snapshot.levels, levels.length);
  const report: ReportReadyState = {
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
    peopleWithoutTime,
    levelsShown,
    scope: scopeLineOf(scope),
    timeZone,
    totalSeconds: snapshot.totals.seconds,
    billableSeconds: snapshot.totals.billableSeconds,
    // D-R9-3, D-R9-7: las sin horas no pasan por el árbol: van después, sin hijos.
    groups: [...treeOf(snapshot.levels, time), ...snapshot.withoutTime],
    filters: snapshot.filters,
    filterOptions: toFilterOptions(snapshot.catalog, snapshot.people),
    chart: snapshot.chart === null ? null : chartOf(snapshot.chart, chartPlan, time),
  };
  return { kind: "ready", report, entries: snapshot.entries };
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
  const state = await readReportState(actor, settings, request, now, null, PAGE_READ);
  return state.kind === "forbidden" ? state : state.report;
}

/**
 * D-MCPE-1, D-MCPE-4, D-MCPE-6: el resumido para el asistente, con
 * `ASSISTANT_READ`. Es la única puerta del asistente a horas ajenas (ADR
 * 0030): pasa por `scopeOf` como la página y da lo mismo que `getReportState`
 * para el mismo pedido, salvo lo que decide el modo. La página no usa el modo
 * estricto porque una URL armada a mano no debe romperla (D-R4-5). Sin
 * `report.view`, `ForbiddenError`; un tope de sentencia vencido,
 * `ReportError("timeout")`.
 */
export async function getHoursSummary(
  actor: Actor,
  settings: TimeSettings,
  request: HoursSummaryValues,
  now: Date = new Date(),
): Promise<ReportReadyState> {
  try {
    const state = await readReportState(
      actor,
      settings,
      request,
      now,
      null,
      ASSISTANT_READ,
    );
    if (state.kind === "forbidden") {
      throw new ForbiddenError("report.view");
    }
    return state.report;
  } catch (error) {
    if (hasCode(error, QUERY_CANCELED)) {
      throw new ReportError("timeout", reportMessages.summaryTooSlow);
    }
    throw error;
  }
}

/** D-MCPE-2: una persona del catálogo, con el correo si `seesEmails` y no está liberado. */
function catalogPersonOf(
  person: WorkspacePerson,
  actor: Actor,
  seesEmails: boolean,
): PeopleCatalogPerson {
  return {
    id: person.userId,
    name: displayNameOf({ displayName: person.displayName }, person.accountName),
    email: seesEmails && !isReleasedEmail(person.email) ? person.email : null,
    inactive: person.status === "inactive",
    self: person.userId === actor.userId,
  };
}

/**
 * D-MCPE-2: las personas cuyas horas puede consultar `actor`: con
 * `timeEntry.others.view`, todas las del workspace, activas e inactivas; si
 * no, solo él. El correo, con `team.manage`, como `/equipo`. Sin
 * `report.view`, `ForbiddenError`. Una transacción de solo lectura.
 */
export async function getPeopleCatalog(actor: Actor): Promise<PeopleCatalog> {
  if (!can(actor, "report.view", workspaceResource(actor))) {
    throw new ForbiddenError("report.view");
  }
  const scope = scopeOf(actor);
  const seesEmails = can(actor, "team.manage", workspaceResource(actor));
  const people = await db.transaction(
    (tx) =>
      scope.people.kind === "everyone"
        ? listWorkspacePeople(tx, actor)
        : listWorkspacePeople(tx, actor, [actor.userId]),
    { accessMode: "read only" },
  );
  return {
    scope: scopeLineOf(scope),
    people: people
      .map((person) => catalogPersonOf(person, actor, seesEmails))
      .sort(compareNames),
  };
}

/** D-R7-3: lo que una exportación lee además del estado de la página. */
export type ReportExportRead = {
  /** D-R6-3: las entradas una por una; el PDF no las pide (D-R7-2). */
  readonly entries: boolean;
};

export type ReportExportState =
  /** RP-07: sin `report.view`. No se leyó nada. */
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "ready";
      /** El mismo estado que `getReportState` para el mismo pedido y `now`. */
      readonly report: ReportReadyState;
      /** `null` si el pedido no las pidió (D-R7-3). */
      readonly entries: ReportExportEntries | null;
      /** El `now` de la lectura: «Generado» (D-R6-8). */
      readonly generatedAt: Date;
    };

/** En orden de inicio y, con el mismo inicio, de id (D-R6-3). */
function compareEntries(left: EntryListRow, right: EntryListRow): number {
  const byStart = left.startedAt.getTime() - right.startedAt.getTime();
  if (byStart !== 0) {
    return byStart;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}

/** Una entrada del archivo en la zona de quien mira (RP-22, D-R6-9). */
function entryRowOf(row: EntryListRow, timeZone: string): ReportEntryRow {
  return {
    id: row.id,
    startDay: dayKey(row.startedAt, timeZone),
    startClock: formatClock(row.startedAt, timeZone),
    endDay: dayKey(row.endedAt, timeZone),
    endClock: formatClock(row.endedAt, timeZone),
    person: {
      name: displayNameOf({ displayName: row.displayName }, row.accountName),
      inactive: row.status !== "active",
    },
    project: row.projectName,
    client: row.clientName,
    task: row.taskName,
    description: row.description,
    tags: [...row.tags].sort(compareNames).map(({ name }) => name),
    billable: row.billable,
    seconds: row.seconds,
  };
}

/**
 * D-R6-3: todas, ordenadas, o ninguna si no entran o vinieron más que el
 * tope; `null` si no se leyeron (D-R7-3).
 */
function entriesOf(read: EntryRead | null, timeZone: string): ReportExportEntries | null {
  if (read === null) {
    return null;
  }
  if (read.kind === "tooMany" || read.rows.length > REPORT_EXPORT_MAX_ENTRIES) {
    return { kind: "tooMany" };
  }
  return {
    kind: "listed",
    rows: [...read.rows].sort(compareEntries).map((row) => entryRowOf(row, timeZone)),
  };
}

/** D-R6-2, D-R7-3: el estado de la página y las entradas pedidas, en una foto. */
export async function getReportExport(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  read: ReportExportRead,
  now: Date = new Date(),
): Promise<ReportExportState> {
  const state = await readReportState(actor, settings, request, now, read, EXPORT_READ);
  if (state.kind === "forbidden") {
    return state;
  }
  return {
    kind: "ready",
    report: state.report,
    entries: entriesOf(state.entries, settings.timezone),
    generatedAt: now,
  };
}

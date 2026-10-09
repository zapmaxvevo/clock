import { compareNames } from "@/lib/text";
import { db } from "@/server/db";
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

import { reportPeriodOf } from "./period";
import {
  reportRepository,
  type EntryTotals,
  type LevelGroupRow,
  type LevelTotalRow,
  type StoredProject,
} from "./repository";
import {
  REPORT_MAX_DAYS,
  type ReportDateGroup,
  type ReportGroup,
  type ReportGroupBy,
  type ReportRange,
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
  /** Los de `reportSubgroupParams`; ausente o vacío, un nivel (D-R3-5). */
  readonly subgroups?: readonly ReportGroupBy[];
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

/** El único nivel de una fila de un pedido de un nivel. */
function levelOf(row: LevelTotalRow): LevelGroupRow {
  const [level] = row.groups;
  if (level === undefined || row.groups.length !== 1) {
    throw new Error(`Se esperaba un nivel y la fila trae ${row.groups.length}.`);
  }
  return level;
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
  readonly rows: readonly LevelTotalRow[];
  readonly totals: EntryTotals;
};

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
  // Los subniveles llegan con el árbol (paso 8 de R3): hasta entonces, ningún
  // pedido devuelve otra cosa que un nivel.
  if ((request.subgroups ?? []).length > 0) {
    throw new Error("Los subniveles llegan con el árbol del reporte.");
  }
  const scope = scopeOf(actor);
  const timeZone = settings.timezone;
  const todayKey = dayKey(now, timeZone);
  const period = reportPeriodOf(todayKey, settings, request.range);
  const range = period.range;
  const groupBy = request.groupBy ?? "person";
  const days = daysBetweenKeys(range.first, range.last) + 1;
  // El esquema de la URL ya lo valida; acá es una invariante, para que
  // ningún otro llamador (la exportación de R6) lea fuera del tope.
  if (days < 1 || days > REPORT_MAX_DAYS) {
    throw new RangeError(
      `Período fuera de 1 a ${REPORT_MAX_DAYS} días: ${range.first} a ${range.last}.`,
    );
  }
  const span = {
    from: startOfDayKey(range.first, timeZone),
    to: startOfDayKey(addDaysToKey(range.last, 1), timeZone),
  };
  // Los cortes solo para la fecha; el primero y el fin son los de `span`.
  const buckets =
    groupBy === "date" ? dayBuckets(range.first, range.last, timeZone) : null;
  // ADR 0021, D-R3-3: una sola foto, aunque sea una sola lectura, para que el
  // service tenga un camino. Se abre después de `report.view` y de `scopeOf`.
  const read: ReportRead = await db.transaction(
    async (tx) => {
      const rows = await reportRepository.totalsByLevels(
        scope,
        { span, dimensions: [groupBy], buckets },
        tx,
      );
      // El total no pasa por la unión con las etiquetas; con un nivel sin
      // etiqueta, cada entrada está en un grupo y la suma es el total (D-R2a-7).
      const totals =
        groupBy === "tag"
          ? await reportRepository.entryTotals(scope, span, tx)
          : {
              seconds: rows.reduce((sum, row) => sum + row.seconds, 0),
              billableSeconds: rows.reduce((sum, row) => sum + row.billableSeconds, 0),
            };
      return { rows, totals };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const dates = { buckets, todayKey, format: settings.formats.date };
  const groups = read.rows
    .map((row) => groupOf(levelOf(row), row.seconds, dates))
    .sort(compareSiblings);
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
    subgroups: [],
    levelsShown: 1,
    scope: scope.people.kind,
    timeZone,
    totalSeconds: read.totals.seconds,
    billableSeconds: read.totals.billableSeconds,
    groups,
  };
}

import { compareNames } from "@/lib/text";
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
  type BucketTotalRow,
  type PersonTotalRow,
  type ProjectTotalRow,
  type ReportSpan,
} from "./repository";
import {
  REPORT_MAX_DAYS,
  type ReportClientGroup,
  type ReportDateGroup,
  type ReportGroup,
  type ReportGroupBy,
  type ReportPersonGroup,
  type ReportProjectGroup,
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

function personGroupOf(row: PersonTotalRow): ReportPersonGroup {
  return {
    kind: "person",
    userId: row.userId,
    name: displayNameOf({ displayName: row.displayName }, row.accountName),
    inactive: row.status !== "active",
    seconds: row.seconds,
  };
}

function projectGroupOf(row: ProjectTotalRow): ReportProjectGroup {
  const stored = row.project;
  if (stored === null) {
    return { kind: "project", project: null, client: null, seconds: row.seconds };
  }
  return {
    kind: "project",
    project: {
      id: stored.id,
      name: stored.name,
      color: paletteKeyOf(stored.color, stored.id),
    },
    client: row.client,
    seconds: row.seconds,
  };
}

/** Las sumas de un cliente: las de sus proyectos; `client` nulo es «Sin cliente». */
type ClientTotalRow = {
  readonly client: ProjectTotalRow["client"];
  readonly seconds: number;
  readonly billableSeconds: number;
};

/**
 * D-R2b-5: las filas por proyecto sumadas por cliente. «Sin cliente» junta la
 * fila «Sin proyecto» y las de los proyectos sin cliente (RP-28).
 */
function clientRowsOf(rows: readonly ProjectTotalRow[]): ClientTotalRow[] {
  const byClient = new Map<string | null, ClientTotalRow>();
  for (const row of rows) {
    const key = row.client?.id ?? null;
    const folded = byClient.get(key);
    byClient.set(key, {
      client: row.client,
      seconds: (folded?.seconds ?? 0) + row.seconds,
      billableSeconds: (folded?.billableSeconds ?? 0) + row.billableSeconds,
    });
  }
  return [...byClient.values()];
}

function clientGroupOf(row: ClientTotalRow): ReportClientGroup {
  return { kind: "client", client: row.client, seconds: row.seconds };
}

/** La fila de un día con horas, rotulada con su fecha y sin «Hoy» ni «Ayer» (D-R2b-6). */
function dateGroupOf(
  row: BucketTotalRow,
  buckets: TimeBuckets,
  todayKey: string,
  format: DateFormat,
): ReportDateGroup {
  const day = buckets.buckets[row.bucket].firstDay;
  return {
    kind: "date",
    dayKey: day,
    label: weekdayLabel(day, todayKey, format),
    seconds: row.seconds,
  };
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

/** Los grupos ordenados y los dos totales de la cabecera. */
type ReportTotals = {
  readonly groups: ReportGroup[];
  readonly totalSeconds: number;
  readonly billableSeconds: number;
};

/**
 * D-R2a-7: una sentencia. Con un solo nivel cada entrada está en un grupo, así
 * que la suma de los grupos es el total.
 */
function totalsOf<
  Row extends { readonly seconds: number; readonly billableSeconds: number },
  Group extends ReportGroup,
>(
  rows: readonly Row[],
  groupOf: (row: Row) => Group,
  compare: (left: Group, right: Group) => number,
): ReportTotals {
  return {
    groups: rows.map(groupOf).sort(compare),
    totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    billableSeconds: rows.reduce((sum, row) => sum + row.billableSeconds, 0),
  };
}

/** Lo que una lectura necesita del pedido, ya dentro del tope. */
type ReportRead = {
  readonly scope: Scope;
  readonly range: ReportRange;
  /** D-R2a-5: un solo intervalo cortado en la zona de quien mira. */
  readonly span: ReportSpan;
  readonly timeZone: string;
  readonly todayKey: string;
  readonly dateFormat: DateFormat;
};

async function readGroups(
  read: ReportRead,
  groupBy: ReportGroupBy,
): Promise<ReportTotals> {
  const { scope, span } = read;
  switch (groupBy) {
    case "person":
      return totalsOf(
        await reportRepository.totalsByPerson(scope, span),
        personGroupOf,
        compareGroups,
      );
    case "project":
      return totalsOf(
        await reportRepository.totalsByProject(scope, span),
        projectGroupOf,
        compareGroups,
      );
    case "client":
      return totalsOf(
        clientRowsOf(await reportRepository.totalsByProject(scope, span)),
        clientGroupOf,
        compareGroups,
      );
    case "task":
    case "tag":
      // Hasta que llegue la lectura por niveles, ningún pedido devuelve otra cosa (§7 de R3).
      throw new Error(`La agrupación ${groupBy} llega con la lectura por niveles.`);
    case "date": {
      // Los cortes solo para la fecha; el primero y el fin son los de `span`.
      const buckets = dayBuckets(read.range.first, read.range.last, read.timeZone);
      return totalsOf(
        await reportRepository.totalsByBucket(scope, buckets),
        (row) => dateGroupOf(row, buckets, read.todayKey, read.dateFormat),
        compareDays,
      );
    }
  }
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
  const totals = await readGroups(
    { scope, range, span, timeZone, todayKey, dateFormat: settings.formats.date },
    groupBy,
  );
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
    scope: scope.people.kind,
    timeZone,
    totalSeconds: totals.totalSeconds,
    billableSeconds: totals.billableSeconds,
    groups: totals.groups,
  };
}

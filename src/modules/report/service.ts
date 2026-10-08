import { compareNames } from "@/lib/text";
import { can, type Actor, type WorkspaceResource } from "@/server/permissions";
import {
  addDaysToKey,
  dayKey,
  dayRangeLabel,
  daysBetweenKeys,
  startOfDayKey,
  weekKeyLabel,
  weekStartKey,
  type TimeSettings,
} from "@/server/time";
import { displayNameOf } from "@/modules/profile/service";
import { paletteKeyOf } from "@/modules/project/palette";

import {
  reportRepository,
  type PersonTotalRow,
  type ProjectTotalRow,
  type ReportSpan,
} from "./repository";
import {
  reportRangeInput,
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

/** Los siete días desde `first`. */
function weekFrom(first: string): ReportRange {
  return { first, last: addDaysToKey(first, 6) };
}

/** El período corrido `days` días, o `null` si el destino no es un rango válido (D-R2a-4). */
function shifted(range: ReportRange, days: number): ReportRange | null {
  const moved = {
    first: addDaysToKey(range.first, days),
    last: addDaysToKey(range.last, days),
  };
  return reportRangeInput.safeParse(moved).success ? moved : null;
}

/** «Esta semana», «Semana anterior» o el rango de una semana alineada; si no, el de días. */
function rangeLabelOf(range: ReportRange, todayKey: string, settings: TimeSettings) {
  const format = settings.formats.date;
  const isWeek =
    daysBetweenKeys(range.first, range.last) === 6 &&
    weekStartKey(range.first, settings.weekStart) === range.first;
  return isWeek
    ? weekKeyLabel(range.first, todayKey, settings.weekStart, format)
    : dayRangeLabel(range.first, range.last, todayKey, format);
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

/** Lo que el orden compara de un grupo; `null` es «Sin proyecto». */
function sortKeyOf(
  group: ReportGroup,
): { readonly id: string; readonly name: string } | null {
  if (group.kind === "person") {
    return { id: group.userId, name: group.name };
  }
  return group.project;
}

/**
 * RP-12, D-R2a-3: duración descendente; con la misma, por nombre, y «Sin
 * proyecto» después de los proyectos.
 */
function compareGroups(left: ReportGroup, right: ReportGroup): number {
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

type Read = {
  readonly groups: readonly ReportGroup[];
  readonly totalSeconds: number;
  readonly billableSeconds: number;
};

/**
 * D-R2a-7: una sentencia. Con un solo nivel cada entrada está en un grupo, así
 * que la suma de los grupos es el total.
 */
function readOf<
  Row extends { readonly seconds: number; readonly billableSeconds: number },
>(rows: readonly Row[], groupOf: (row: Row) => ReportGroup): Read {
  return {
    groups: rows.map(groupOf).sort(compareGroups),
    totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    billableSeconds: rows.reduce((sum, row) => sum + row.billableSeconds, 0),
  };
}

async function readGroups(
  scope: Scope,
  span: ReportSpan,
  groupBy: ReportGroupBy,
): Promise<Read> {
  if (groupBy === "person") {
    return readOf(await reportRepository.totalsByPerson(scope, span), personGroupOf);
  }
  return readOf(await reportRepository.totalsByProject(scope, span), projectGroupOf);
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
  const currentWeek = weekFrom(weekStartKey(todayKey, settings.weekStart));
  const range = request.range ?? currentWeek;
  const groupBy = request.groupBy ?? "person";
  // D-R2a-5: un solo intervalo cortado en la zona de quien mira.
  const span = {
    from: startOfDayKey(range.first, timeZone),
    to: startOfDayKey(addDaysToKey(range.last, 1), timeZone),
  };
  const read = await readGroups(scope, span, groupBy);
  const days = daysBetweenKeys(range.first, range.last) + 1;
  return {
    kind: "ready",
    todayKey,
    range,
    rangeLabel: rangeLabelOf(range, todayKey, settings),
    previous: shifted(range, -days),
    next: shifted(range, days),
    currentWeek,
    groupBy,
    scope: scope.people.kind,
    timeZone,
    totalSeconds: read.totalSeconds,
    billableSeconds: read.billableSeconds,
    groups: [...read.groups],
  };
}

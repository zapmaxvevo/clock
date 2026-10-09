import {
  addDaysToKey,
  civilDateOf,
  dayKeyLabel,
  dayRangeLabel,
  daysBetweenKeys,
  monthEndKey,
  monthStartKey,
  toDayKey,
  weekKeyLabel,
  weekStartKey,
  wholeMonthCount,
  type TimeSettings,
} from "@/server/time";

import {
  REPORT_SHORTCUTS,
  reportRangeInput,
  sameRange,
  type ReportRange,
  type ReportShortcut,
  type ReportShortcutId,
} from "./schema";

type PeriodSettings = Pick<TimeSettings, "weekStart" | "formats">;

/** Lo que la pantalla necesita del período (D-R2a-4, D-R2b-1 a D-R2b-3). */
export type ReportPeriod = {
  /** El pedido o, sin pedido, «Esta semana». */
  readonly range: ReportRange;
  readonly rangeLabel: string;
  /** `null` si el destino no pasa `reportRangeInput`. */
  readonly previous: ReportRange | null;
  readonly next: ReportRange | null;
  /** El destino del enlace «Esta semana». */
  readonly currentWeek: ReportRange;
  /** En el orden de `REPORT_SHORTCUTS`, sin los que no pasan `reportRangeInput`. */
  readonly shortcuts: readonly ReportShortcut[];
};

/** Los rótulos que no salen de `dayKeyLabel` ni de `weekKeyLabel` (D-R2b-2). */
const SHORTCUT_LABELS = {
  lastTwoWeeks: "Últimas dos semanas",
  thisMonth: "Este mes",
  lastMonth: "Mes pasado",
  thisYear: "Este año",
  lastYear: "Año pasado",
} as const;

/** Los siete días desde `first`. */
function weekFrom(first: string): ReportRange {
  return { first, last: addDaysToKey(first, 6) };
}

/** Del 1 de enero al 31 de diciembre de `year`. */
function yearRange(year: number): ReportRange {
  return {
    first: toDayKey({ year, month: 1, day: 1 }),
    last: toDayKey({ year, month: 12, day: 31 }),
  };
}

/** El mes que está `months` meses después del de `dayKey`, entero. */
function monthRange(dayKey: string, months: number): ReportRange {
  return { first: monthStartKey(dayKey, months), last: monthEndKey(dayKey, months) };
}

function isValidRange(range: ReportRange): boolean {
  return reportRangeInput.safeParse(range).success;
}

/** El período si pasa `reportRangeInput`; si no, `null` (D-R2a-4). */
function validOrNull(range: ReportRange): ReportRange | null {
  return isValidRange(range) ? range : null;
}

/** D-R2b-2: el rótulo y el período de cada atajo con hoy en `todayKey`. */
function shortcutsOf(todayKey: string, settings: PeriodSettings): ReportShortcut[] {
  const format = settings.formats.date;
  const yesterday = addDaysToKey(todayKey, -1);
  const week = weekStartKey(todayKey, settings.weekStart);
  const previousWeek = addDaysToKey(week, -7);
  const year = civilDateOf(todayKey).year;
  const definitions: Record<
    ReportShortcutId,
    { readonly label: string; readonly range: ReportRange }
  > = {
    today: {
      label: dayKeyLabel(todayKey, todayKey, format),
      range: { first: todayKey, last: todayKey },
    },
    yesterday: {
      label: dayKeyLabel(yesterday, todayKey, format),
      range: { first: yesterday, last: yesterday },
    },
    thisWeek: {
      label: weekKeyLabel(week, todayKey, settings.weekStart, format),
      range: weekFrom(week),
    },
    lastWeek: {
      label: weekKeyLabel(previousWeek, todayKey, settings.weekStart, format),
      range: weekFrom(previousWeek),
    },
    // La semana anterior y esta, alineadas al primer día; no los 14 días hasta hoy.
    lastTwoWeeks: {
      label: SHORTCUT_LABELS.lastTwoWeeks,
      range: { first: previousWeek, last: addDaysToKey(week, 6) },
    },
    thisMonth: { label: SHORTCUT_LABELS.thisMonth, range: monthRange(todayKey, 0) },
    lastMonth: { label: SHORTCUT_LABELS.lastMonth, range: monthRange(todayKey, -1) },
    thisYear: { label: SHORTCUT_LABELS.thisYear, range: yearRange(year) },
    lastYear: { label: SHORTCUT_LABELS.lastYear, range: yearRange(year - 1) },
  };
  return REPORT_SHORTCUTS.map((id) => ({ id, ...definitions[id] })).filter((shortcut) =>
    isValidRange(shortcut.range),
  );
}

/** El período corrido `days` días, o `null` si el destino no es un rango válido (D-R2a-4). */
function shifted(range: ReportRange, days: number): ReportRange | null {
  const moved = {
    first: addDaysToKey(range.first, days),
    last: addDaysToKey(range.last, days),
  };
  return validOrNull(moved);
}

/** Las dos flechas: `k` meses enteros si el período lo es, si no sus `n` días (D-R2b-3). */
function arrowsOf(range: ReportRange): Pick<ReportPeriod, "previous" | "next"> {
  const months = wholeMonthCount(range.first, range.last);
  if (months === null) {
    const days = daysBetweenKeys(range.first, range.last) + 1;
    return { previous: shifted(range, -days), next: shifted(range, days) };
  }
  return {
    previous: validOrNull({
      first: monthStartKey(range.first, -months),
      last: monthEndKey(range.first, -1),
    }),
    next: validOrNull({
      first: monthStartKey(range.first, months),
      last: monthEndKey(range.first, 2 * months - 1),
    }),
  };
}

/**
 * El del atajo cuyo período es `range`; si no hay, «Semana anterior» o el rango
 * de una semana alineada, y si no, el de días.
 */
function rangeLabelOf(
  range: ReportRange,
  todayKey: string,
  settings: PeriodSettings,
  shortcuts: readonly ReportShortcut[],
): string {
  const shortcut = shortcuts.find((candidate) => sameRange(candidate.range, range));
  if (shortcut !== undefined) {
    return shortcut.label;
  }
  const format = settings.formats.date;
  const isWeek =
    daysBetweenKeys(range.first, range.last) === 6 &&
    weekStartKey(range.first, settings.weekStart) === range.first;
  return isWeek
    ? weekKeyLabel(range.first, todayKey, settings.weekStart, format)
    : dayRangeLabel(range.first, range.last, todayKey, format);
}

/**
 * El período de quien mira con hoy en `todayKey`. Aritmética de claves: no lee
 * el reloj ni la zona. No valida `requested`: lo recibe de `reportRangeParams`.
 */
export function reportPeriodOf(
  todayKey: string,
  settings: PeriodSettings,
  requested: ReportRange | null,
): ReportPeriod {
  const currentWeek = weekFrom(weekStartKey(todayKey, settings.weekStart));
  const range = requested ?? currentWeek;
  const shortcuts = shortcutsOf(todayKey, settings);
  return {
    range,
    rangeLabel: rangeLabelOf(range, todayKey, settings, shortcuts),
    ...arrowsOf(range),
    currentWeek,
    shortcuts,
  };
}

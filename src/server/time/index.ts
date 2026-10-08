import { TZDate, tzOffset } from "@date-fns/tz";
import { addDays, format as formatDate, startOfDay } from "date-fns";
import { es } from "date-fns/locale";

/** Día de la semana en que arranca la semana del usuario. 0 = domingo. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Interval = { readonly start: Date; readonly end: Date };

export const TIME_FORMATS = ["24h", "12h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const DATE_FORMATS = [
  "dd/MM/yyyy",
  "dd-MM-yyyy",
  "yyyy-MM-dd",
  "MM/dd/yyyy",
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Cómo ve las horas quien mira (PF-12, PF-13). */
export type DisplayFormats = { readonly time: TimeFormat; readonly date: DateFormat };

/** Todo lo que hace falta para cortar y rotular el tiempo de una persona. */
export type TimeSettings = {
  readonly timezone: string;
  readonly weekStart: WeekStart;
  readonly formats: DisplayFormats;
};

/**
 * Único lugar donde se resuelven días, semanas y duraciones. Los instantes se
 * guardan en UTC; la zona horaria del usuario decide dónde cae el corte.
 */
export function dayBounds(instant: Date, timeZone: string): Interval {
  const start = startOfLocalDay(instant, timeZone);
  const end = addDays(new TZDate(start, timeZone), 1);
  return { start, end: new Date(end.getTime()) };
}

/** La semana se corta sobre claves de día, que no tienen cambio de horario. */
export function weekBounds(
  instant: Date,
  timeZone: string,
  weekStartsOn: WeekStart,
): Interval {
  const first = weekStartKey(dayKey(instant, timeZone), weekStartsOn);
  return {
    start: startOfDayKey(first, timeZone),
    end: startOfDayKey(addDaysToKey(first, 7), timeZone),
  };
}

/** Duración en minutos entre dos instantes. Un timer activo mide hasta ahora. */
export function durationMinutes(start: Date, end: Date | null, now: Date): number {
  const closing = end === null ? now : end;
  return Math.max(0, Math.round((closing.getTime() - start.getTime()) / 60_000));
}

/** Formato h:mm, el que usa Clockify en totales. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours}:${rest.toString().padStart(2, "0")}`;
}

/** Redondeo de reportes. 0 minutos deja la duración como está. */
export function roundMinutes(minutes: number, step: number): number {
  if (step <= 0) {
    return minutes;
  }
  return Math.ceil(minutes / step) * step;
}

/** Inicio del día local en que cae el instante. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  return new Date(startOfDay(new TZDate(instant, timeZone)).getTime());
}

/** Día local del instante, como "2026-10-02". Es la clave de agrupación. */
export function dayKey(instant: Date, timeZone: string): string {
  return formatDate(new TZDate(instant, timeZone), "yyyy-MM-dd");
}

/** Rótulo del encabezado de un día: "Hoy", "Ayer" o "jue, 01/10", con año si es de otro. */
export function dayLabel(
  instant: Date,
  now: Date,
  timeZone: string,
  format: DateFormat,
): string {
  return dayKeyLabel(dayKey(instant, timeZone), dayKey(now, timeZone), format);
}

/** Hora local en 24 h, como "08:00". */
export function formatClock(instant: Date, timeZone: string): string {
  return formatDate(new TZDate(instant, timeZone), "HH:mm");
}

/** Minutos de reloj desde las 00:00 del día local del instante, de 0 a 1439. */
export function minuteOfDayIn(instant: Date, timeZone: string): number {
  const local = new TZDate(instant, timeZone);
  return local.getHours() * 60 + local.getMinutes();
}

/** Días locales que la entrada agrega sobre su día de inicio. 0 si no cruza la medianoche. */
export function extraDays(start: Date, end: Date, timeZone: string): number {
  const from = startOfLocalDay(start, timeZone).getTime();
  const to = startOfLocalDay(end, timeZone).getTime();
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/**
 * El instante cae después del último día que tiene clave de cuatro cifras. Un
 * día local del 9999-12-31 puede llegar a ese instante en UTC.
 */
export function isAfterYear9999(instant: Date): boolean {
  return instant.getUTCFullYear() > 9999;
}

/** Duración exacta en segundos entre dos instantes UTC, sin redondear. */
export function durationSeconds(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

/** Formato h:mm:ss, el del contador del timer. */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}

/** Una fecha del calendario, sin hora ni zona. */
export type CivilDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Minutos de reloj de un día de 24 h: el fin de la grilla y de un `MinuteRange`. */
export const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = MINUTES_PER_DAY * 60_000;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Única puerta de entrada de una clave de día. Rechaza lo que no tiene la
 * forma y lo que tiene la forma pero no existe en el calendario, como
 * "2026-02-30".
 */
export function parseDayKey(dayKey: string): CivilDate | null {
  const match = DAY_KEY.exec(dayKey);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // En UTC para que el calendario no dependa de la zona del proceso.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Clave de día de una fecha del calendario, como "2026-10-02". */
export function toDayKey(date: CivilDate): string {
  return `${date.year.toString().padStart(4, "0")}-${pad(date.month)}-${pad(date.day)}`;
}

/** El día que cae `days` días después. Admite negativos. */
export function addDaysToKey(dayKey: string, days: number): string {
  const date = parseDayKey(dayKey);
  if (date === null) {
    return dayKey;
  }
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return toDayKey({
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  });
}

type DatePart = "day" | "month" | "year";

/** El orden de las partes y el separador de cada formato de fecha. */
const DATE_LAYOUTS: Record<
  DateFormat,
  { readonly order: readonly DatePart[]; readonly separator: string }
> = {
  "dd/MM/yyyy": { order: ["day", "month", "year"], separator: "/" },
  "dd-MM-yyyy": { order: ["day", "month", "year"], separator: "-" },
  "yyyy-MM-dd": { order: ["year", "month", "day"], separator: "-" },
  "MM/dd/yyyy": { order: ["month", "day", "year"], separator: "/" },
};

/**
 * Una fecha civil en el formato de la persona: "03/10/2026", o "03/10" sin
 * año. La forma sin año es la de los rótulos del año en curso.
 */
export function formatDayKey(
  dayKey: string,
  format: DateFormat,
  withYear: boolean,
): string {
  const date = parseDayKey(dayKey);
  if (date === null) {
    return dayKey;
  }
  const parts: Record<DatePart, string> = {
    day: pad(date.day),
    month: pad(date.month),
    year: date.year.toString().padStart(4, "0"),
  };
  const layout = DATE_LAYOUTS[format];
  return layout.order
    .filter((part) => withYear || part !== "year")
    .map((part) => parts[part])
    .join(layout.separator);
}

/**
 * Rótulo de un día ya resuelto. Es la única implementación del "Hoy" / "Ayer" /
 * "mié, 01/10": lo usan el encabezado de la lista y el botón del calendario.
 */
export function dayKeyLabel(
  dayKey: string,
  todayKey: string,
  format: DateFormat,
): string {
  if (dayKey === todayKey) {
    return "Hoy";
  }
  if (dayKey === addDaysToKey(todayKey, -1)) {
    return "Ayer";
  }
  return weekdayLabel(dayKey, todayKey, format);
}

/**
 * El rótulo de una columna: día de la semana abreviado y fecha en el formato
 * de la persona, «jue, 01/10», con año si no es el de `todayKey`. Es la parte
 * de `dayKeyLabel` que no es «Hoy» ni «Ayer».
 */
export function weekdayLabel(
  dayKey: string,
  todayKey: string,
  format: DateFormat,
): string {
  const date = parseDayKey(dayKey);
  const today = parseDayKey(todayKey);
  if (date === null) {
    return dayKey;
  }
  // La fecha civil se formatea en UTC: así el rótulo no se corre un día según
  // dónde corra el proceso.
  const civil = new TZDate(Date.UTC(date.year, date.month - 1, date.day), "UTC");
  const sameYear = today !== null && today.year === date.year;
  const weekday = formatDate(civil, "EEE", { locale: es });
  return `${weekday}, ${formatDayKey(dayKey, format, !sameYear)}`;
}

/**
 * El día en el nombre de una celda: «miércoles 01/10», con el día de la semana
 * entero y la fecha en el formato de la persona, con año si no es el de
 * `todayKey` (TS-100). Es la forma larga de `weekdayLabel`.
 */
export function fullWeekdayLabel(
  dayKey: string,
  todayKey: string,
  format: DateFormat,
): string {
  const date = parseDayKey(dayKey);
  const today = parseDayKey(todayKey);
  if (date === null) {
    return dayKey;
  }
  // En UTC, como `weekdayLabel`.
  const civil = new TZDate(Date.UTC(date.year, date.month - 1, date.day), "UTC");
  const sameYear = today !== null && today.year === date.year;
  const weekday = formatDate(civil, "EEEE", { locale: es });
  return `${weekday} ${formatDayKey(dayKey, format, !sameYear)}`;
}

/**
 * El menor de varios días. Las claves "AAAA-MM-DD" se ordenan como el
 * calendario, así que la comparación es de cadenas. Sin claves, `null`.
 */
export function earliestDayKey(first: string, ...rest: readonly string[]): string;
export function earliestDayKey(...keys: readonly string[]): string | null;
export function earliestDayKey(...keys: readonly string[]): string | null {
  return keys.reduce<string | null>(
    (earliest, key) => (earliest === null || key < earliest ? key : earliest),
    null,
  );
}

const WEEK_STARTS: readonly WeekStart[] = [0, 1, 2, 3, 4, 5, 6];

/** El número de la columna como `WeekStart`; lanza si no está entre 0 y 6. */
export function parseWeekStart(value: number): WeekStart {
  const weekStart = WEEK_STARTS.find((candidate) => candidate === value);
  if (weekStart === undefined) {
    throw new RangeError(`Primer día de la semana fuera de rango: ${value}.`);
  }
  return weekStart;
}

/** Primer día de la semana que contiene ese día. Aritmética civil, sin zona. */
export function weekStartKey(dayKey: string, weekStart: WeekStart): string {
  const date = parseDayKey(dayKey);
  if (date === null) {
    return dayKey;
  }
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return addDaysToKey(dayKey, -((weekday - weekStart + 7) % 7));
}

/**
 * El primer instante del día local: la primera vez que marca las 00:00. Si
 * las 00:00 no existieron por un adelanto de hora, `startOfLocalDay` del
 * mediodía. Un día que falta entero en la zona —Samoa pasó del 29 al 31 de
 * diciembre de 2011— empieza donde empieza el primer día siguiente que existe:
 * no tiene instantes propios, y como cota de una lectura no deja nada afuera.
 * Si el mediodía falta en un día que sí existe, lanza en vez de devolver un
 * instante de otro día.
 */
export function startOfDayKey(dayKey: string, timeZone: string): Date {
  const midnights = localInstants(dayKey, "00:00", timeZone);
  if (midnights.length > 0) {
    return new Date(Math.min(...midnights));
  }
  const noon = instantFromLocal(dayKey, "12:00", timeZone);
  if (noon !== null) {
    return startOfLocalDay(noon, timeZone);
  }
  if (isMissingDay(dayKey, timeZone)) {
    return startOfDayKey(addDaysToKey(dayKey, 1), timeZone);
  }
  throw new RangeError(`El día ${dayKey} no tiene mediodía en ${timeZone}.`);
}

/** Si el día falta entero en la zona: ninguno de sus minutos marcó el reloj. */
function isMissingDay(dayKey: string, timeZone: string): boolean {
  return nonexistentMinutes(dayKey, timeZone).some(
    (range) => range.from === 0 && range.to === MINUTES_PER_DAY,
  );
}

/**
 * «Esta semana», «Semana anterior», o «28/09 – 04/10». Si alguno de los dos
 * extremos no es del año de `todayKey`, los dos llevan el año:
 * «29/12/2025 – 04/01/2026». Una semana futura lleva su rango (TT-47).
 */
export function weekKeyLabel(
  weekStart: string,
  todayKey: string,
  weekStartsOn: WeekStart,
  format: DateFormat,
): string {
  const current = weekStartKey(todayKey, weekStartsOn);
  if (weekStart === current) {
    return "Esta semana";
  }
  if (weekStart === addDaysToKey(current, -7)) {
    return "Semana anterior";
  }
  const lastKey = addDaysToKey(weekStart, 6);
  const first = parseDayKey(weekStart);
  const last = parseDayKey(lastKey);
  const today = parseDayKey(todayKey);
  if (first === null || last === null || today === null) {
    return weekStart;
  }
  const withYear = first.year !== today.year || last.year !== today.year;
  return `${formatDayKey(weekStart, format, withYear)} – ${formatDayKey(lastKey, format, withYear)}`;
}

/** Minutos desde las 00:00 de una hora canónica "HH:mm", o `null`. */
export function clockToMinutes(clock: string): number | null {
  const match = CLOCK.exec(clock);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/** Hora de pared canónica: "HH:mm" de 24 h. */
export function isClock(text: string): boolean {
  return clockToMinutes(text) !== null;
}

/** La hora canónica de un minuto del día, dando la vuelta a las 24 h. */
export function minutesToClock(minutes: number): string {
  const safe = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

/** Una hora canónica "HH:mm" como se muestra: "13:05" o "1:05 PM". */
export function clockLabel(clock: string, format: TimeFormat): string {
  const minutes = clockToMinutes(clock);
  if (format === "24h" || minutes === null) {
    return clock;
  }
  const hours = Math.floor(minutes / 60);
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${pad(minutes % 60)} ${suffix}`;
}

/**
 * El sufijo de 12 h al final del texto: `a`, `am`, `p` o `pm`, con o sin
 * puntos y espacios, en mayúsculas o minúsculas (PF-14).
 */
const MERIDIEM = /^(.*?)\s*([ap])\.?\s*(?:m\.?)?$/i;

type ClockParts = { readonly hours: number; readonly minutes: number };

/** "9", "0345", "9:45" o "9.45", sin acotar las horas ni los minutos. */
function clockParts(text: string): ClockParts | null {
  const clean = text.replace(/\./g, ":");
  const separated = /^(\d{1,2}):(\d{1,2})$/.exec(clean);
  if (separated !== null) {
    return { hours: Number(separated[1]), minutes: Number(separated[2]) };
  }
  const digits = /^(\d{1,4})$/.exec(clean);
  if (digits === null) {
    return null;
  }
  const value = digits[1];
  if (value.length <= 2) {
    return { hours: Number(value), minutes: 0 };
  }
  const cut = value.length - 2;
  return { hours: Number(value.slice(0, cut)), minutes: Number(value.slice(cut)) };
}

/**
 * Lo que la persona teclea en un campo de hora, llevado a "HH:mm" de 24 h.
 * `null` es «no se puede interpretar», que la interfaz revierte. El sufijo
 * `am` / `pm` solo vale con 12 h, y ahí la hora va de 1 a 12 (TT-20).
 */
export function parseClockInput(text: string, format: TimeFormat): string | null {
  const clean = text.trim();
  const meridiem = MERIDIEM.exec(clean);
  if (meridiem === null) {
    return buildClock(clockParts(clean));
  }
  if (format === "24h") {
    return null;
  }
  return buildMeridiemClock(clockParts(meridiem[1]), meridiem[2].toLowerCase() === "p");
}

function buildClock(parts: ClockParts | null): string | null {
  if (parts === null || parts.hours > 23 || parts.minutes > 59) {
    return null;
  }
  return `${pad(parts.hours)}:${pad(parts.minutes)}`;
}

function buildMeridiemClock(parts: ClockParts | null, afternoon: boolean): string | null {
  if (parts === null || parts.hours < 1 || parts.hours > 12 || parts.minutes > 59) {
    return null;
  }
  const hours = (parts.hours % 12) + (afternoon ? 12 : 0);
  return `${pad(hours)}:${pad(parts.minutes)}`;
}

/**
 * Lo que la persona teclea en el campo de duración, en minutos enteros. La
 * barra manual no expresa 24 horas o más, porque su fin es una hora de pared.
 */
export function parseDurationInput(text: string): number | null {
  const clean = text.trim().toLowerCase().replace(",", ".");
  if (clean.length === 0) {
    return null;
  }

  const separated = /^(\d{1,2}):(\d{1,2})$/.exec(clean);
  if (separated !== null) {
    const minutes = Number(separated[2]);
    return minutes > 59 ? null : bounded(Number(separated[1]) * 60 + minutes);
  }

  const decimal = /^(\d+)\.(\d+)$/.exec(clean);
  if (decimal !== null) {
    return bounded(Math.round(Number(clean) * 60));
  }

  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(clean);
  if (units !== null && units.slice(1).some((part) => part !== undefined)) {
    // Los segundos se truncan: la barra es de minutos.
    return bounded(Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0));
  }

  const whole = /^\d+$/.exec(clean);
  return whole === null ? null : bounded(Number(clean));
}

function bounded(minutes: number): number | null {
  return minutes >= 0 && minutes < MINUTES_PER_DAY ? minutes : null;
}

/**
 * Minutos entre dos horas de pared. Un fin anterior al inicio da la vuelta por
 * la medianoche; dos horas iguales dan 0, que el modo manual rechaza.
 */
export function clockDifferenceMinutes(start: string, end: string): number {
  const from = clockToMinutes(start);
  const to = clockToMinutes(end);
  if (from === null || to === null) {
    return 0;
  }
  return (to - from + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Un fin anterior al inicio es del día siguiente (TT-72). Dos horas iguales no
 * cruzan: duran 0, que el modo manual rechaza.
 */
export function crossesMidnight(start: string, end: string): boolean {
  const from = clockToMinutes(start);
  const to = clockToMinutes(end);
  return from !== null && to !== null && to < from;
}

/** Corre una hora de pared, dando la vuelta a las 24 h. El día extra se deriva aparte. */
export function shiftClock(time: string, minutes: number): string {
  const from = clockToMinutes(time);
  return from === null ? time : minutesToClock(from + minutes);
}

/**
 * Los instantes en que una zona marca esa hora de pared ese día: ninguno si no
 * existió por el cambio de horario, dos si ocurrió dos veces.
 */
function localInstants(dayKey: string, clock: string, timeZone: string): number[] {
  const date = parseDayKey(dayKey);
  const minutes = clockToMinutes(clock);
  if (date === null || minutes === null) {
    return [];
  }
  // La hora de pared leída como si fuera UTC. El instante buscado está a un
  // desplazamiento de distancia, y ese desplazamiento es alguno de los que rigen
  // entre un día antes y un día después: ninguna zona se aparta más de 14 h de
  // UTC ni cambia de horario dos veces en un día.
  const wall = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  const offsets = new Set(
    [wall - DAY_MS, wall, wall + DAY_MS].map((probe) =>
      tzOffset(timeZone, new Date(probe)),
    ),
  );
  // Un candidato vale si en ese instante rige justo el desplazamiento que lo
  // produjo. Ninguno es la hora que no existe; dos son la que ocurre dos veces.
  // Nada de esto pasa por la zona del proceso.
  return [...offsets]
    .filter((offset) => tzOffset(timeZone, new Date(wall - offset * 60_000)) === offset)
    .map((offset) => wall - offset * 60_000);
}

/**
 * El instante que corresponde a una hora de pared en una zona. Devuelve `null`
 * cuando esa hora no existió ese día por el cambio de horario; la hora que
 * ocurre dos veces se resuelve con el segundo instante. Ver el ADR 0005.
 */
export function instantFromLocal(
  dayKey: string,
  clock: string,
  timeZone: string,
): Date | null {
  const matches = localInstants(dayKey, clock, timeZone);
  return matches.length === 0 ? null : new Date(Math.max(...matches));
}

/**
 * La hora de pared de ese día como instante o, si no existió por un adelanto
 * de hora, el primer minuto posterior de ese mismo día que sí existió. La
 * hora que ocurre dos veces da el segundo instante, como `instantFromLocal`.
 * `null` si desde esa hora no existió ningún minuto ese día. Solo para horas
 * que nadie tecleó (ADR 0018).
 */
export function instantFromLocalOrLater(
  dayKey: string,
  clock: string,
  timeZone: string,
): Date | null {
  const exact = instantFromLocal(dayKey, clock, timeZone);
  const minute = clockToMinutes(clock);
  if (exact !== null || minute === null) {
    return exact;
  }
  const gap = nonexistentMinutes(dayKey, timeZone).find(
    (range) => range.from <= minute && minute < range.to,
  );
  if (gap === undefined || gap.to >= MINUTES_PER_DAY) {
    return null;
  }
  return instantFromLocal(dayKey, minutesToClock(gap.to), timeZone);
}

/** Minutos de reloj de un día, `[from, to)`. */
export type MinuteRange = { readonly from: number; readonly to: number };

/**
 * Ninguna zona se apartó más de 16 h de UTC, ni siquiera con su hora media
 * local: el instante en que el reloj marca cualquier minuto del día cae a esta
 * distancia de su hora de pared leída como UTC.
 */
const MAX_OFFSET_MS = 16 * 60 * 60_000;

/**
 * Los minutos de reloj que no existen ese día en esa zona, `[from, to)`. Vacío
 * en un día de 24 h o de 25 h. En un día más corto, el hueco se ubica por
 * búsqueda binaria del instante en que cambia el desplazamiento, sin probar
 * minuto por minuto. Un día que falta entero da `[{ from: 0, to: 1440 }]`.
 */
export function nonexistentMinutes(
  dayKey: string,
  timeZone: string,
): readonly MinuteRange[] {
  const date = parseDayKey(dayKey);
  if (date === null) {
    return [];
  }
  const wall = Date.UTC(date.year, date.month - 1, date.day);
  // Los instantes que pueden marcar algún minuto del día. Como `localInstants`,
  // supone a lo sumo un cambio de horario en ese tramo.
  let before = wall - MAX_OFFSET_MS;
  let after = wall + DAY_MS + MAX_OFFSET_MS;
  const offsetBefore = tzOffset(timeZone, new Date(before));
  const offsetAfter = tzOffset(timeZone, new Date(after));
  // Solo un adelanto deja horas sin marcar; un atraso las repite.
  if (offsetAfter <= offsetBefore) {
    return [];
  }
  while (after - before > 60_000) {
    const middle = before + Math.floor((after - before) / 120_000) * 60_000;
    if (tzOffset(timeZone, new Date(middle)) === offsetBefore) {
      before = middle;
    } else {
      after = middle;
    }
  }
  // En el instante del cambio el reloj salta de `offsetBefore` a `offsetAfter`:
  // lo que queda entre las dos horas de pared no se marca nunca. El salto puede
  // ser del día anterior o del siguiente, y entonces el recorte lo vacía. Un
  // desplazamiento con segundos, de la hora media local, se redondea hacia
  // afuera.
  const from = Math.max(0, Math.floor((after - wall) / 60_000 + offsetBefore));
  const to = Math.min(MINUTES_PER_DAY, Math.ceil((after - wall) / 60_000 + offsetAfter));
  return from < to ? [{ from, to }] : [];
}

/**
 * La forma canónica de una zona según el entorno, o `null` si el entorno no la
 * conoce. `America/Argentina/Buenos_Aires` da `America/Buenos_Aires`.
 */
export function canonicalTimeZone(value: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

/**
 * Las zonas que ofrece el entorno, en su forma canónica y en orden alfabético.
 * Suma `UTC` si el entorno no la lista, como Node 25: es su propia forma
 * canónica y sin ella no se podría elegir (PF-11).
 */
export function supportedTimeZones(): readonly string[] {
  const listed = Intl.supportedValuesOf("timeZone");
  return (listed.includes("UTC") ? [...listed] : [...listed, "UTC"]).sort();
}

/**
 * La forma canónica de la zona está en la lista del entorno. Es la validación
 * de la entrada (PF-35): la lista no nombra los alias, como el valor de
 * omisión, y compararlos como texto los rechazaría.
 */
export function isSupportedTimeZone(value: string): boolean {
  const canonical = canonicalTimeZone(value);
  return canonical !== null && supportedTimeZones().includes(canonical);
}

/** El entorno sabe convertir con esa zona, esté o no en su lista. */
export function isUsableTimeZone(value: string): boolean {
  return canonicalTimeZone(value) !== null;
}

/** El desplazamiento de la zona en ese instante: "UTC−03:00", "UTC+05:45". */
export function utcOffsetLabel(timeZone: string, at: Date): string {
  const offset = tzOffset(timeZone, at);
  const sign = offset < 0 ? "\u2212" : "+";
  const absolute = Math.abs(offset);
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

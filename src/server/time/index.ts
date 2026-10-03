import { TZDate, tzOffset } from "@date-fns/tz";
import { addDays, format, startOfDay, startOfWeek, subDays } from "date-fns";
import { es } from "date-fns/locale";

/** Día de la semana en que arranca la semana del usuario. 0 = domingo. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Interval = { readonly start: Date; readonly end: Date };

/**
 * Único lugar donde se resuelven días, semanas y duraciones. Los instantes se
 * guardan en UTC; la zona horaria del usuario decide dónde cae el corte.
 */
export function dayBounds(instant: Date, timeZone: string): Interval {
  const start = startOfLocalDay(instant, timeZone);
  const end = addDays(new TZDate(start, timeZone), 1);
  return { start, end: new Date(end.getTime()) };
}

export function weekBounds(
  instant: Date,
  timeZone: string,
  weekStartsOn: WeekStart,
): Interval {
  const local = new TZDate(instant, timeZone);
  const start = startOfWeek(local, { weekStartsOn });
  return { start: new Date(start.getTime()), end: new Date(addDays(start, 7).getTime()) };
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

/** Inicio del día local que cae `days` días antes del día de `instant`. */
export function startOfDayBefore(instant: Date, days: number, timeZone: string): Date {
  const start = new TZDate(startOfLocalDay(instant, timeZone), timeZone);
  return new Date(subDays(start, days).getTime());
}

/** Día local del instante, como "2026-10-02". Es la clave de agrupación. */
export function dayKey(instant: Date, timeZone: string): string {
  return format(new TZDate(instant, timeZone), "yyyy-MM-dd");
}

/** Rótulo del encabezado de un día: "Hoy", "Ayer" o "jue, 01/10", con año si es de otro. */
export function dayLabel(instant: Date, now: Date, timeZone: string): string {
  return dayKeyLabel(dayKey(instant, timeZone), dayKey(now, timeZone));
}

/** Hora local en 24 h, como "08:00". */
export function formatClock(instant: Date, timeZone: string): string {
  return format(new TZDate(instant, timeZone), "HH:mm");
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
const MINUTES_PER_DAY = 24 * 60;
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

/**
 * Rótulo de un día ya resuelto. Es la única implementación del "Hoy" / "Ayer" /
 * "mié, 01/10": lo usan el encabezado de la lista y el botón del calendario.
 */
export function dayKeyLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) {
    return "Hoy";
  }
  if (dayKey === addDaysToKey(todayKey, -1)) {
    return "Ayer";
  }
  const date = parseDayKey(dayKey);
  const today = parseDayKey(todayKey);
  if (date === null) {
    return dayKey;
  }
  // La fecha civil se formatea en UTC: así el rótulo no se corre un día según
  // dónde corra el proceso.
  const civil = new TZDate(Date.UTC(date.year, date.month - 1, date.day), "UTC");
  const sameYear = today !== null && today.year === date.year;
  return format(civil, sameYear ? "EEE, dd/MM" : "EEE, dd/MM/yyyy", { locale: es });
}

function clockToMinutes(clock: string): number | null {
  const match = CLOCK.exec(clock);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/** Hora de pared canónica: "HH:mm" de 24 h. */
export function isClock(text: string): boolean {
  return clockToMinutes(text) !== null;
}

function minutesToClock(minutes: number): string {
  const safe = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

/**
 * Lo que la persona teclea en un campo de hora, llevado a "HH:mm" de 24 h.
 * `null` es «no se puede interpretar», que la interfaz revierte.
 */
export function parseClockInput(text: string): string | null {
  const clean = text.trim().replace(/\./g, ":");
  const separated = /^(\d{1,2}):(\d{1,2})$/.exec(clean);
  if (separated !== null) {
    return buildClock(Number(separated[1]), Number(separated[2]));
  }
  const digits = /^(\d{1,4})$/.exec(clean);
  if (digits === null) {
    return null;
  }
  const value = digits[1];
  if (value.length <= 2) {
    return buildClock(Number(value), 0);
  }
  const cut = value.length - 2;
  return buildClock(Number(value.slice(0, cut)), Number(value.slice(cut)));
}

function buildClock(hours: number, minutes: number): string | null {
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${pad(hours)}:${pad(minutes)}`;
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
 * El instante que corresponde a una hora de pared en una zona. Devuelve `null`
 * cuando esa hora no existió ese día por el cambio de horario; la hora que
 * ocurre dos veces se resuelve con el segundo instante. Ver el ADR 0005.
 */
export function instantFromLocal(
  dayKey: string,
  clock: string,
  timeZone: string,
): Date | null {
  const date = parseDayKey(dayKey);
  const minutes = clockToMinutes(clock);
  if (date === null || minutes === null) {
    return null;
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
  const matches = [...offsets]
    .filter((offset) => tzOffset(timeZone, new Date(wall - offset * 60_000)) === offset)
    .map((offset) => wall - offset * 60_000);
  return matches.length === 0 ? null : new Date(Math.max(...matches));
}

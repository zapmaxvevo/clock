import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay, startOfWeek } from "date-fns";

/** Día de la semana en que arranca la semana del usuario. 0 = domingo. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Interval = { readonly start: Date; readonly end: Date };

/**
 * Único lugar donde se resuelven días, semanas y duraciones. Los instantes se
 * guardan en UTC; la zona horaria del usuario decide dónde cae el corte.
 */
export function dayBounds(instant: Date, timeZone: string): Interval {
  const local = new TZDate(instant, timeZone);
  const start = startOfDay(local);
  return { start: new Date(start.getTime()), end: new Date(addDays(start, 1).getTime()) };
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

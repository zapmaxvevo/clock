import { TZDate } from "@date-fns/tz";
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
  const key = dayKey(instant, timeZone);
  if (key === dayKey(now, timeZone)) {
    return "Hoy";
  }
  if (key === dayKey(startOfDayBefore(now, 1, timeZone), timeZone)) {
    return "Ayer";
  }
  const local = new TZDate(instant, timeZone);
  const sameYear = format(local, "yyyy") === format(new TZDate(now, timeZone), "yyyy");
  return format(local, sameYear ? "EEE, dd/MM" : "EEE, dd/MM/yyyy", { locale: es });
}

/** Hora local en 24 h, como "08:00". */
export function formatClock(instant: Date, timeZone: string): string {
  return format(new TZDate(instant, timeZone), "HH:mm");
}

/** Días locales que la entrada agrega sobre su día de inicio. 0 si no cruza la medianoche. */
export function extraDays(start: Date, end: Date, timeZone: string): number {
  const from = startOfLocalDay(start, timeZone).getTime();
  const to = startOfLocalDay(end, timeZone).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
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

import { parseDayKey, toDayKey } from "@/server/time";

/**
 * Los calendarios de mes trabajan con fechas civiles, no con instantes: esta
 * fecha es la medianoche local del navegador y solo sirve para dibujar. Lo que
 * sale del calendario es la clave del día, armada por `dayKeyOfCivilDate` con
 * los tres números de la fecha elegida.
 */
export function civilDate(dayKey: string): Date | undefined {
  const civil = parseDayKey(dayKey);
  return civil === null ? undefined : new Date(civil.year, civil.month - 1, civil.day);
}

/** La clave del día que se eligió en un calendario de mes. */
export function dayKeyOfCivilDate(date: Date): string {
  return toDayKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

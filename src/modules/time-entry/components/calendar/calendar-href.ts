import type { CalendarMode } from "@/modules/time-entry/schema";

/**
 * La URL de un período del calendario (CAL-17), la única función que la arma:
 * `?semana=` con el primer día y `&vista=dia` en la vista día. En la vista
 * semana el servidor normaliza un día que no es inicio de semana.
 */
export function calendarHref(mode: CalendarMode, start: string): string {
  const params = new URLSearchParams({ semana: start });
  if (mode === "day") {
    params.set("vista", "dia");
  }
  return `/calendario?${params.toString()}`;
}

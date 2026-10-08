/**
 * La URL de una semana de la planilla (TS-10), la única función que la arma.
 * El servidor normaliza un día que no es inicio de semana.
 */
export function timesheetHref(start: string): string {
  return `/planilla?${new URLSearchParams({ semana: start }).toString()}`;
}

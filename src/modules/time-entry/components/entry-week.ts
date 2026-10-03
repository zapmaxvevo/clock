import type { StartTimerResult } from "@/modules/time-entry/schema";
import { earliestDayKey } from "@/server/time";

/**
 * P-15: la semana hasta la que hay que extender la ventana para que se vean
 * las entradas que devolvió una mutación, o `null` si ya se ven todas aun
 * sin el timer activo.
 *
 * Las semanas son claves de día "AAAA-MM-DD" que arma el servidor, así que
 * el cliente compara sin aritmética de fechas (ADR 0008).
 */
export function weekToReach(
  reachFrom: string,
  weekStarts: readonly string[],
): string | null {
  const oldest = earliestDayKey(...weekStarts);
  return oldest !== null && oldest < reachFrom ? oldest : null;
}

/**
 * La cota contra la que `weekToReach` compara: el `reachFrom` del último
 * render o la semana que ya se pidió con `router.replace` y que todavía no
 * llegó en los props, la más vieja de las dos. Con dos mutaciones en vuelo, la
 * respuesta de la segunda no reemplaza un `desde` pedido por uno posterior,
 * que achicaría la ventana.
 */
export function reachFloor(reachFrom: string, requested: string | null): string {
  return requested === null ? reachFrom : earliestDayKey(reachFrom, requested);
}

/**
 * La semana pedida ya llegó: la ventana la alcanza aun sin el timer, o la URL
 * ya lleva ese `desde`. Mientras no llegue y no haya una navegación en vuelo,
 * hay que volver a pedirla: la de antes se descartó.
 */
export function reachArrived(
  requested: string,
  reachFrom: string,
  desde: string | null,
): boolean {
  return desde === requested || reachFloor(reachFrom, requested) === reachFrom;
}

/**
 * Las semanas de las entradas que devuelve un arranque, «Iniciar» o
 * «Continuar»: la del timer nuevo y, si cerró otro, la del cerrado.
 */
export function startedWeeks(result: StartTimerResult): readonly string[] {
  return result.stopped === null
    ? [result.running.weekStart]
    : [result.running.weekStart, result.stopped.weekStart];
}

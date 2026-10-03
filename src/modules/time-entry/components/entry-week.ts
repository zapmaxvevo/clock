/**
 * P-15: la semana hasta la que hay que extender la ventana para que se vean
 * las entradas que devolvió una mutación, o `null` si ya se ven todas aun
 * sin el timer activo.
 *
 * Las semanas son claves de día "AAAA-MM-DD" que arma el servidor: el orden
 * de las cadenas es el de las fechas, así que el cliente compara sin
 * aritmética de fechas (ADR 0008).
 */
export function weekToReach(
  reachFrom: string,
  weekStarts: readonly string[],
): string | null {
  const oldest = weekStarts.reduce<string | null>(
    (current, week) => (current === null || week < current ? week : current),
    null,
  );
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
  return requested !== null && requested < reachFrom ? requested : reachFrom;
}

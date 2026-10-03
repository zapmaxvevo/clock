/**
 * TT-65: el descarte confirmado, fijado al confirmar. El id es el del timer
 * elegido al abrir el diálogo y `draft`, lo que mostraba la descripción en ese
 * momento: la descripción del timer que se va.
 */
export type PendingDiscard = {
  readonly id: string;
  readonly draft: string;
};

/**
 * Si el cambio de la vista es el que deja el descarte: se fue el timer
 * descartado y no llegó otro. Lo mismo vale cuando el descarte termina en
 * `already_stopped`, porque otra pestaña lo detuvo. Si llegó otro timer, el
 * campo sigue a ese por la regla de siempre.
 */
export function resolvesDiscard(
  pending: PendingDiscard | null,
  previousId: string | null,
  nextId: string | null,
): pending is PendingDiscard {
  return pending !== null && previousId === pending.id && nextId === null;
}

/**
 * La descripción del timer descartado se va con él. Lo tecleado mientras el
 * descarte viajaba no es de ese timer y se queda, tenga o no el foco el campo
 * cuando llega la vista.
 */
export function draftAfterDiscard(pending: PendingDiscard, draft: string): string {
  return draft === pending.draft ? "" : draft;
}

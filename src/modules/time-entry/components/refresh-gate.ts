export type RefreshGate = { readonly paused: boolean; readonly pending: boolean };

export type RefreshEvent = "trigger" | "pause" | "resume";

/**
 * CAL-89: con la compuerta cerrada, los disparos de TT-40 se juntan en uno
 * que sale al abrirla. Abierta, cada disparo revalida.
 */
export function nextRefreshGate(
  gate: RefreshGate,
  event: RefreshEvent,
): { readonly gate: RefreshGate; readonly refresh: boolean } {
  void gate;
  void event;
  throw new Error("Sin implementar: slice 8b.");
}

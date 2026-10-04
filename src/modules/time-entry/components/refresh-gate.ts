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
  switch (event) {
    case "trigger":
      return gate.paused
        ? { gate: { paused: true, pending: true }, refresh: false }
        : { gate, refresh: true };
    case "pause":
      return { gate: { paused: true, pending: gate.pending }, refresh: false };
    case "resume":
      return { gate: { paused: false, pending: false }, refresh: gate.pending };
  }
}

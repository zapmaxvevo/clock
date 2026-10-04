import { describe, expect, it } from "vitest";

import { nextRefreshGate, type RefreshEvent, type RefreshGate } from "./refresh-gate";

const OPEN: RefreshGate = { paused: false, pending: false };

/** Los disparos en orden, y cuántas revalidaciones salen. */
function refreshesOf(events: readonly RefreshEvent[]): number {
  let gate = OPEN;
  let refreshes = 0;
  for (const event of events) {
    const next = nextRefreshGate(gate, event);
    gate = next.gate;
    refreshes += next.refresh ? 1 : 0;
  }
  return refreshes;
}

describe("nextRefreshGate (CAL-89, TT-40)", () => {
  it("abierta, cada disparo revalida, como siempre", () => {
    expect(nextRefreshGate(OPEN, "trigger")).toEqual({ gate: OPEN, refresh: true });
    expect(refreshesOf(["trigger", "trigger", "trigger"])).toBe(3);
  });

  it("cerrada, los disparos se juntan en uno que sale al abrirla", () => {
    expect(refreshesOf(["pause", "trigger", "trigger"])).toBe(0);
    expect(refreshesOf(["pause", "trigger", "trigger", "resume"])).toBe(1);
  });

  it("sin disparos mientras estuvo cerrada, abrirla no revalida", () => {
    expect(refreshesOf(["pause", "resume"])).toBe(0);
  });

  it("lo pendiente sale una vez: otra pausa empieza de cero", () => {
    expect(refreshesOf(["pause", "trigger", "resume", "pause", "resume"])).toBe(1);
    expect(nextRefreshGate({ paused: true, pending: true }, "resume")).toEqual({
      gate: OPEN,
      refresh: true,
    });
  });

  it("abrirla sin haberla cerrado no revalida", () => {
    expect(nextRefreshGate(OPEN, "resume")).toEqual({ gate: OPEN, refresh: false });
  });
});

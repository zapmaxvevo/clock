import { describe, expect, it } from "vitest";

import {
  draftAfterDiscard,
  resolvesDiscard,
  type PendingDiscard,
} from "./pending-discard";

const pending: PendingDiscard = { id: "timer-1", draft: "timer a descartar" };

describe("resolvesDiscard", () => {
  it("la vista sin el timer descartado resuelve el descarte", () => {
    expect(resolvesDiscard(pending, "timer-1", null)).toBe(true);
  });

  it("sin descarte confirmado no hay nada que resolver", () => {
    expect(resolvesDiscard(null, "timer-1", null)).toBe(false);
  });

  it("si se fue otro timer, no es el descartado", () => {
    expect(resolvesDiscard(pending, "timer-2", null)).toBe(false);
  });

  it("si llegó otro timer, el campo sigue a ese y no al descarte", () => {
    expect(resolvesDiscard(pending, "timer-1", "timer-2")).toBe(false);
  });
});

describe("draftAfterDiscard", () => {
  it("la descripción del timer descartado se va con él", () => {
    expect(draftAfterDiscard(pending, "timer a descartar")).toBe("");
  });

  it("lo tecleado mientras el descarte viajaba se queda", () => {
    expect(draftAfterDiscard(pending, "próxima tarea")).toBe("próxima tarea");
  });

  it("un campo vaciado mientras viajaba queda vacío", () => {
    expect(draftAfterDiscard(pending, "")).toBe("");
  });
});

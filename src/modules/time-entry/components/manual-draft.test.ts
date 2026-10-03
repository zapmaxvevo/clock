import { describe, expect, it } from "vitest";

import {
  draftDuration,
  draftExtraDays,
  reset,
  withDate,
  withDuration,
  withEnd,
  withStart,
  type ManualDraft,
} from "./manual-draft";

/**
 * Ni UTC ni la zona de quien corre los tests: con cualquiera de las dos, un
 * `reset` que ignorara la zona del workspace daría lo mismo y pasaría.
 */
const tokyo = "Asia/Tokyo";
const draft: ManualDraft = { date: "2026-10-02", start: "09:00", end: "11:30" };

describe("reset", () => {
  it("arranca en el día y la hora del workspace, sin duración", () => {
    // 2026-10-02T03:30:00Z son las 12:30 del 2 de octubre en Tokio.
    expect(reset("2026-10-02T03:30:00.000Z", tokyo)).toEqual({
      date: "2026-10-02",
      start: "12:30",
      end: "12:30",
    });
  });

  it("resuelve el día con la zona del workspace y no con UTC", () => {
    // 2026-10-02T20:00:00Z ya es el 3 de octubre en Tokio.
    expect(reset("2026-10-02T20:00:00.000Z", tokyo)).toEqual({
      date: "2026-10-03",
      start: "05:00",
      end: "05:00",
    });
  });

  it("el borrador inicial dura cero, que es lo que deja «Agregar» inactivo", () => {
    expect(draftDuration(reset("2026-10-02T03:30:00.000Z", tokyo))).toBe(0);
  });
});

describe("derivados del borrador", () => {
  it("la duración sale de las dos horas de pared", () => {
    expect(draftDuration(draft)).toBe(150);
  });

  it("un fin anterior al inicio da la vuelta por la medianoche", () => {
    expect(draftDuration({ ...draft, start: "23:00", end: "02:00" })).toBe(180);
    expect(draftExtraDays({ ...draft, start: "23:00", end: "02:00" })).toBe(1);
  });

  it("sin cruce de medianoche no hay día extra", () => {
    expect(draftExtraDays(draft)).toBe(0);
  });

  it("dos horas iguales duran cero", () => {
    expect(draftDuration({ ...draft, end: draft.start })).toBe(0);
  });
});

describe("withStart", () => {
  it("interpreta el formato tolerante y conserva el fin", () => {
    expect(withStart(draft, "0345")).toEqual({
      draft: { date: "2026-10-02", start: "03:45", end: "11:30" },
      rejected: null,
    });
  });

  it("mover el inicio recalcula la duración", () => {
    const { draft: next } = withStart(draft, "10:00");
    expect(draftDuration(next)).toBe(90);
  });

  it("un texto que no se puede interpretar deja el borrador igual y marca el campo", () => {
    expect(withStart(draft, "1pm")).toEqual({ draft, rejected: "start" });
  });
});

describe("withEnd", () => {
  it("interpreta el formato tolerante y conserva el inicio", () => {
    expect(withEnd(draft, "9.45")).toEqual({
      draft: { date: "2026-10-02", start: "09:00", end: "09:45" },
      rejected: null,
    });
  });

  it("un texto ilegible deja el borrador igual y marca el fin", () => {
    expect(withEnd(draft, "25:00")).toEqual({ draft, rejected: "end" });
  });
});

describe("withDuration", () => {
  it("mueve el fin y no toca el inicio", () => {
    expect(withDuration(draft, "2h")).toEqual({
      draft: { date: "2026-10-02", start: "09:00", end: "11:00" },
      rejected: null,
    });
  });

  it("acepta los formatos de TT-19 y deja la duración que dicen", () => {
    expect(draftDuration(withDuration(draft, "30").draft)).toBe(30);
    expect(draftDuration(withDuration(draft, "2:00").draft)).toBe(120);
    expect(draftDuration(withDuration(draft, "2.75").draft)).toBe(165);
    expect(draftDuration(withDuration(draft, "2,75").draft)).toBe(165);
    expect(draftDuration(withDuration(draft, "1h30m1s").draft)).toBe(90);
  });

  it("una duración que cruza la medianoche deja el fin del día siguiente", () => {
    const { draft: next } = withDuration({ ...draft, start: "23:00" }, "3h");
    expect(next.end).toBe("02:00");
    expect(draftExtraDays(next)).toBe(1);
  });

  it("un texto ilegible deja el borrador igual y marca la duración", () => {
    expect(withDuration(draft, "ab")).toEqual({ draft, rejected: "duration" });
    expect(withDuration(draft, "24:00")).toEqual({ draft, rejected: "duration" });
  });
});

describe("withDate", () => {
  it("cambia el día y deja las dos horas donde estaban", () => {
    expect(withDate(draft, "2026-09-15")).toEqual({
      date: "2026-09-15",
      start: "09:00",
      end: "11:30",
    });
  });
});

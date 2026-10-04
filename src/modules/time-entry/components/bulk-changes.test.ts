import { describe, expect, it } from "vitest";

import {
  BULK_DELETE_WORD,
  confirmsDelete,
  emptyBulkChanges,
  toChanges,
  withBulkClock,
} from "./bulk-changes";

describe("toChanges", () => {
  it("el borrador vacío no tiene nada que mandar", () => {
    expect(toChanges(emptyBulkChanges)).toBeNull();
  });

  it("una descripción de solo espacios no cambia", () => {
    expect(toChanges({ ...emptyBulkChanges, description: "   " })).toBeNull();
  });

  it("manda solo los campos con algo", () => {
    expect(toChanges({ ...emptyBulkChanges, start: "09:30" })).toEqual({
      start: "09:30",
    });
  });

  it("la descripción viaja recortada", () => {
    expect(toChanges({ ...emptyBulkChanges, description: "  Revisión  " })).toEqual({
      description: "Revisión",
    });
  });

  it("con todos los campos, los manda todos", () => {
    expect(
      toChanges({
        description: "Revisión",
        date: "2026-10-02",
        start: "09:30",
        end: "10:00",
      }),
    ).toEqual({
      description: "Revisión",
      date: "2026-10-02",
      start: "09:30",
      end: "10:00",
    });
  });
});

describe("withBulkClock", () => {
  const withStart = { ...emptyBulkChanges, description: "Revisión", start: "09:30" };

  it("interpreta lo tecleado y deja el resto del borrador", () => {
    expect(withBulkClock(withStart, "end", "1015", "24h")).toEqual({
      ...withStart,
      end: "10:15",
    });
  });

  it("guarda la hora canónica aunque la persona escriba en 12 h", () => {
    expect(withBulkClock(emptyBulkChanges, "start", "2:05 pm", "12h")).toEqual({
      ...emptyBulkChanges,
      start: "14:05",
    });
  });

  it("vaciada, o con solo espacios, la hora vuelve a «sin cambios»", () => {
    expect(withBulkClock(withStart, "start", "", "24h")).toEqual({
      ...withStart,
      start: "",
    });
    expect(withBulkClock(withStart, "start", "   ", "24h")).toEqual({
      ...withStart,
      start: "",
    });
  });

  it("lo que no se puede interpretar no toca el borrador", () => {
    expect(withBulkClock(withStart, "start", "abc", "24h")).toBeNull();
    expect(withBulkClock(withStart, "start", "2 pm", "24h")).toBeNull();
  });
});

describe("confirmsDelete", () => {
  it("la palabra exacta confirma", () => {
    expect(confirmsDelete(BULK_DELETE_WORD)).toBe(true);
  });

  it("sin distinguir mayúsculas ni espacios en los extremos", () => {
    expect(confirmsDelete("  borrar ")).toBe(true);
    expect(confirmsDelete("Borrar")).toBe(true);
  });

  it("otra palabra, una parte o un espacio en el medio no confirman", () => {
    expect(confirmsDelete("")).toBe(false);
    expect(confirmsDelete("BORRA")).toBe(false);
    expect(confirmsDelete("BOR RAR")).toBe(false);
  });
});

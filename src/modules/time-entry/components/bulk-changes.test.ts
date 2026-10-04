import { describe, expect, it } from "vitest";

import {
  BULK_DELETE_WORD,
  confirmsDelete,
  emptyBulkChanges,
  toChanges,
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

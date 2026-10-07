import { describe, expect, it } from "vitest";

import { NO_SELECTION } from "@/modules/project/components/picker-model";
import type { ProjectSelection, TagRef } from "@/modules/project/schema";

import {
  BULK_DELETE_WORD,
  changesTags,
  confirmsDelete,
  emptyBulkChanges,
  toChanges,
  withBulkClock,
} from "./bulk-changes";

const web = { id: "p-web", name: "Web", color: "teal" } as const;
const webDesign: ProjectSelection = {
  project: web,
  task: { id: "t-design", name: "Diseño" },
};
const urgent: TagRef = { id: "tag-urgent", name: "Urgente" };
const client: TagRef = { id: "tag-client", name: "Cliente" };

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

  it("un proyecto viaja como el par de ids", () => {
    expect(toChanges({ ...emptyBulkChanges, selection: webDesign })).toEqual({
      project: { projectId: "p-web", taskId: "t-design" },
    });
  });

  it("«Sin proyecto» es un cambio: el par nulo", () => {
    expect(toChanges({ ...emptyBulkChanges, selection: NO_SELECTION })).toEqual({
      project: { projectId: null, taskId: null },
    });
  });

  it("«Agregar» manda las etiquetas elegidas; sin ninguna no cambia", () => {
    expect(toChanges({ ...emptyBulkChanges, tags: [urgent, client] })).toEqual({
      tags: { mode: "add", ids: ["tag-urgent", "tag-client"] },
    });
    expect(toChanges({ ...emptyBulkChanges, tagMode: "add", tags: [] })).toBeNull();
  });

  it("«Reemplazar» manda las elegidas, y sin ninguna la lista vacía (D12-3)", () => {
    expect(
      toChanges({ ...emptyBulkChanges, tagMode: "replace", tags: [urgent] }),
    ).toEqual({ tags: { mode: "replace", ids: ["tag-urgent"] } });
    expect(toChanges({ ...emptyBulkChanges, tagMode: "replace" })).toEqual({
      tags: { mode: "replace", ids: [] },
    });
  });

  it("el facturable viaja si no es nulo, también apagado", () => {
    expect(toChanges({ ...emptyBulkChanges, billable: true })).toEqual({
      billable: true,
    });
    expect(toChanges({ ...emptyBulkChanges, billable: false })).toEqual({
      billable: false,
    });
  });

  it("con todos los campos, los manda todos", () => {
    expect(
      toChanges({
        description: "Revisión",
        date: "2026-10-02",
        start: "09:30",
        end: "10:00",
        selection: { project: web, task: null },
        tagMode: "add",
        tags: [client],
        billable: false,
      }),
    ).toEqual({
      description: "Revisión",
      date: "2026-10-02",
      start: "09:30",
      end: "10:00",
      project: { projectId: "p-web", taskId: null },
      tags: { mode: "add", ids: ["tag-client"] },
      billable: false,
    });
  });
});

describe("changesTags", () => {
  it("«Agregar» cambia solo con alguna etiqueta", () => {
    expect(changesTags(emptyBulkChanges)).toBe(false);
    expect(changesTags({ ...emptyBulkChanges, tags: [urgent] })).toBe(true);
  });

  it("«Reemplazar» cambia también sin ninguna (D12-3)", () => {
    expect(changesTags({ ...emptyBulkChanges, tagMode: "replace" })).toBe(true);
    expect(changesTags({ ...emptyBulkChanges, tagMode: "replace", tags: [urgent] })).toBe(
      true,
    );
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

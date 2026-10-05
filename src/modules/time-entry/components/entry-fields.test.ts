import { describe, expect, it } from "vitest";

import type { ProjectSelection } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import {
  afterAdd,
  fieldsInput,
  fieldsOf,
  NO_FIELDS,
  withSelection,
  type EntryFields,
} from "./entry-fields";

const web = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "Web",
  color: "teal",
} as const;
const app = {
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  name: "App",
  color: "violet",
} as const;
const design = { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" };

const onWeb: ProjectSelection = { project: web, task: null };
const onWebDesign: ProjectSelection = { project: web, task: design };
const onApp: ProjectSelection = { project: app, task: null };

const entry: TimeEntryView = {
  id: "8d0f7a52-4c1e-4b8e-9a43-2f6a1c3e5b70",
  description: "Informe",
  startedAt: "2026-10-02T12:00:00.000Z",
  endedAt: "2026-10-02T13:30:00.000Z",
  dayDate: "2026-10-02",
  weekStart: "2026-09-28",
  startLabel: "09:00",
  endLabel: "10:30",
  startClock: "09:00",
  endClock: "10:30",
  extraDays: 0,
  durationSeconds: 5_400,
  durationLabel: "1:30",
  editableTimes: true,
  project: web,
  task: design,
};

describe("fieldsOf", () => {
  it("toma el par de la vista", () => {
    expect(fieldsOf(entry)).toEqual({ selection: onWebDesign });
  });
});

describe("withSelection", () => {
  it("cambia la selección y conserva el resto del borrador", () => {
    const dialog = { description: "Informe", selection: onWeb };

    expect(withSelection(dialog, onApp)).toEqual({
      description: "Informe",
      selection: onApp,
    });
  });
});

describe("fieldsInput", () => {
  it("manda los ids del par", () => {
    expect(fieldsInput({ selection: onWebDesign })).toEqual({
      projectId: web.id,
      taskId: design.id,
    });
  });

  it("sin proyecto manda los dos nulos", () => {
    expect(fieldsInput(NO_FIELDS)).toEqual({ projectId: null, taskId: null });
  });
});

describe("afterAdd", () => {
  const sent: EntryFields = { selection: onWeb };

  it("limpia el par que sigue igual a lo que se mandó (TT-25)", () => {
    expect(afterAdd(sent, sent)).toEqual(NO_FIELDS);
  });

  it("el mismo par con otras mayúsculas también se limpia", () => {
    const upper = {
      selection: { project: { ...web, id: web.id.toUpperCase() }, task: null },
    };

    expect(afterAdd(upper, sent)).toEqual(NO_FIELDS);
  });

  it("conserva el par que se eligió mientras el alta viajaba", () => {
    expect(afterAdd({ selection: onApp }, sent)).toEqual({ selection: onApp });
    expect(afterAdd({ selection: onWebDesign }, sent)).toEqual({
      selection: onWebDesign,
    });
  });
});

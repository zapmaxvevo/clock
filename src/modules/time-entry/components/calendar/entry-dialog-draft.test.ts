import { describe, expect, it } from "vitest";

import type { ProjectSelection } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import {
  changesOf,
  createInputOf,
  draftOfEntry,
  draftOfNew,
  runningChangesOf,
  type EntryDialogDraft,
} from "./entry-dialog-draft";

const web = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "Web",
  color: "teal",
} as const;
const design = { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" };

const closed: TimeEntryView = {
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
  task: null,
};

const running: TimeEntryView = {
  ...closed,
  endedAt: null,
  endLabel: null,
  endClock: null,
  durationSeconds: null,
  durationLabel: null,
  editableTimes: false,
};

function edited(
  entry: TimeEntryView,
  change: Partial<EntryDialogDraft>,
): EntryDialogDraft {
  return { ...draftOfEntry(entry), ...change };
}

describe("draftOfEntry", () => {
  it("toma la descripción, el par y el trío canónico de la vista", () => {
    expect(draftOfEntry(closed)).toEqual({
      description: "Informe",
      selection: { project: web, task: null },
      times: { date: "2026-10-02", start: "09:00", end: "10:30" },
    });
  });

  it("el timer no tiene fin: el del borrador queda en su inicio", () => {
    expect(draftOfEntry(running).times).toEqual({
      date: "2026-10-02",
      start: "09:00",
      end: "09:00",
    });
  });
});

describe("changesOf", () => {
  it("sin cambios devuelve null: «Guardar» cierra sin pedido", () => {
    expect(changesOf(closed, draftOfEntry(closed))).toBeNull();
  });

  it("la descripción, recortada, solo si su recorte difiere", () => {
    expect(changesOf(closed, edited(closed, { description: "  Informe  " }))).toBeNull();
    expect(changesOf(closed, edited(closed, { description: " Revisión " }))).toEqual({
      description: "Revisión",
    });
    expect(changesOf(closed, edited(closed, { description: "" }))).toEqual({
      description: "",
    });
  });

  it("el par entero, solo si es otro", () => {
    const withTask: ProjectSelection = { project: web, task: design };
    expect(changesOf(closed, edited(closed, { selection: withTask }))).toEqual({
      project: { projectId: web.id, taskId: design.id },
    });
    expect(
      changesOf(closed, edited(closed, { selection: { project: null, task: null } })),
    ).toEqual({ project: { projectId: null, taskId: null } });
  });

  it("el mismo par con otras mayúsculas no es un cambio", () => {
    const upper = { project: { ...web, id: web.id.toUpperCase() }, task: null };
    expect(changesOf(closed, edited(closed, { selection: upper }))).toBeNull();
  });

  it("el trío entero, si cambió alguno de sus tres", () => {
    const times = { date: "2026-10-02", start: "09:00", end: "11:00" };
    expect(changesOf(closed, edited(closed, { times }))).toEqual({ times });
    const date = { date: "2026-10-01", start: "09:00", end: "10:30" };
    expect(changesOf(closed, edited(closed, { times: date }))).toEqual({ times: date });
  });

  it("los grupos que cambiaron viajan juntos", () => {
    const times = { date: "2026-10-02", start: "09:30", end: "10:30" };
    expect(
      changesOf(
        closed,
        edited(closed, {
          description: "Otra",
          selection: { project: null, task: null },
          times,
        }),
      ),
    ).toEqual({
      description: "Otra",
      project: { projectId: null, taskId: null },
      times,
    });
  });

  it("nunca manda el trío de una entrada de más de un día (TT-110)", () => {
    const multiDay = { ...closed, editableTimes: false };
    const times = { date: "2026-10-02", start: "09:00", end: "11:00" };
    expect(changesOf(multiDay, edited(multiDay, { times }))).toBeNull();
    expect(changesOf(multiDay, edited(multiDay, { description: "Otra", times }))).toEqual(
      {
        description: "Otra",
      },
    );
  });
});

describe("runningChangesOf", () => {
  it("sin cambios devuelve null", () => {
    expect(runningChangesOf(running, draftOfEntry(running))).toBeNull();
  });

  it("el inicio, día y hora, si cambió alguno de los dos", () => {
    const start = { date: "2026-10-02", start: "08:00", end: "09:00" };
    expect(runningChangesOf(running, edited(running, { times: start }))).toEqual({
      runningStart: { date: "2026-10-02", start: "08:00" },
    });
    const date = { date: "2026-10-01", start: "09:00", end: "09:00" };
    expect(runningChangesOf(running, edited(running, { times: date }))).toEqual({
      runningStart: { date: "2026-10-01", start: "09:00" },
    });
  });

  it("nunca manda el trío, y el fin del borrador no cuenta", () => {
    const end = { date: "2026-10-02", start: "09:00", end: "12:00" };
    expect(runningChangesOf(running, edited(running, { times: end }))).toBeNull();
  });

  it("suma la descripción y el par con la misma regla", () => {
    expect(
      runningChangesOf(
        running,
        edited(running, {
          description: "Soporte",
          selection: { project: null, task: null },
        }),
      ),
    ).toEqual({ description: "Soporte", project: { projectId: null, taskId: null } });
  });
});

describe("createInputOf", () => {
  it("el alta lleva la descripción, el trío y los ids del par", () => {
    const draft = {
      ...draftOfNew({ date: "2026-09-30", start: "10:00", end: "11:30" }),
      description: "Planificación",
      selection: { project: web, task: design },
    };
    expect(createInputOf(draft)).toEqual({
      description: "Planificación",
      date: "2026-09-30",
      start: "10:00",
      end: "11:30",
      projectId: web.id,
      taskId: design.id,
    });
  });

  it("un alta nueva arranca sin descripción ni proyecto", () => {
    expect(
      createInputOf(draftOfNew({ date: "2026-09-30", start: "10:00", end: "11:00" })),
    ).toEqual({
      description: "",
      date: "2026-09-30",
      start: "10:00",
      end: "11:00",
      projectId: null,
      taskId: null,
    });
  });
});

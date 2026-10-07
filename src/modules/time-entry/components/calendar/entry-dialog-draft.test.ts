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
const review = { id: "4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80", name: "Revisión" };
const urgent = { id: "5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091", name: "Urgente" };

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
  billable: false,
  tags: [review],
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
  it("toma la descripción, el par, el facturable, las etiquetas y el trío canónico de la vista", () => {
    expect(draftOfEntry({ ...closed, billable: true })).toEqual({
      description: "Informe",
      selection: { project: web, task: null },
      billable: true,
      tags: [review],
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

  it("el par entero, solo si es otro, con el facturable que quedó a la vista", () => {
    const withTask: ProjectSelection = { project: web, task: design };
    expect(changesOf(closed, edited(closed, { selection: withTask }))).toEqual({
      project: { projectId: web.id, taskId: design.id },
      billable: false,
    });
    expect(
      changesOf(closed, edited(closed, { selection: { project: null, task: null } })),
    ).toEqual({ project: { projectId: null, taskId: null }, billable: false });
  });

  it("el facturable solo, si difiere de la vista", () => {
    expect(changesOf(closed, edited(closed, { billable: true }))).toEqual({
      billable: true,
    });
    const billable = { ...closed, billable: true };
    expect(changesOf(billable, edited(billable, { billable: false }))).toEqual({
      billable: false,
    });
  });

  it("con el par, el facturable viaja aunque sea el de la vista: el servidor no aplica el por defecto", () => {
    const billable = { ...closed, billable: true };
    expect(
      changesOf(
        billable,
        edited(billable, { selection: { project: null, task: null }, billable: true }),
      ),
    ).toEqual({ project: { projectId: null, taskId: null }, billable: true });
  });

  it("el mismo par con otras mayúsculas no es un cambio", () => {
    const upper = { project: { ...web, id: web.id.toUpperCase() }, task: null };
    expect(changesOf(closed, edited(closed, { selection: upper }))).toBeNull();
  });

  it("las etiquetas enteras, por id, solo si el conjunto es otro", () => {
    expect(changesOf(closed, edited(closed, { tags: [urgent, review] }))).toEqual({
      tags: [urgent.id, review.id],
    });
    expect(changesOf(closed, edited(closed, { tags: [] }))).toEqual({ tags: [] });
  });

  it("el mismo conjunto con otras mayúsculas en los ids no es un cambio", () => {
    const upperReview = { ...review, id: review.id.toUpperCase() };

    expect(changesOf(closed, edited(closed, { tags: [upperReview] }))).toBeNull();
  });

  it("el mismo conjunto en otro orden no es un cambio", () => {
    const both = { ...closed, tags: [review, urgent] };

    expect(changesOf(both, edited(both, { tags: [urgent, review] }))).toBeNull();
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
      billable: false,
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
    ).toEqual({
      description: "Soporte",
      project: { projectId: null, taskId: null },
      billable: false,
    });
  });

  it("el facturable de la que corre, solo si difiere (TT-27)", () => {
    expect(runningChangesOf(running, edited(running, { billable: true }))).toEqual({
      billable: true,
    });
  });

  it("las etiquetas de la que corre, solo si el conjunto es otro (TT-27)", () => {
    expect(runningChangesOf(running, edited(running, { tags: [urgent] }))).toEqual({
      tags: [urgent.id],
    });
    expect(runningChangesOf(running, edited(running, { tags: [review] }))).toBeNull();
  });
});

describe("createInputOf", () => {
  it("el alta lleva la descripción, el trío, y los ids del par y de las etiquetas", () => {
    const draft = {
      ...draftOfNew({ date: "2026-09-30", start: "10:00", end: "11:30" }),
      description: "Planificación",
      selection: { project: web, task: design },
      billable: true,
      tags: [urgent, review],
    };
    expect(createInputOf(draft)).toEqual({
      description: "Planificación",
      date: "2026-09-30",
      start: "10:00",
      end: "11:30",
      projectId: web.id,
      taskId: design.id,
      billable: true,
      tagIds: [urgent.id, review.id],
    });
  });

  it("un alta nueva arranca sin descripción, proyecto ni etiquetas, y manda el facturable y las etiquetas explícitos", () => {
    expect(
      createInputOf(draftOfNew({ date: "2026-09-30", start: "10:00", end: "11:00" })),
    ).toEqual({
      description: "",
      date: "2026-09-30",
      start: "10:00",
      end: "11:00",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
    });
  });
});

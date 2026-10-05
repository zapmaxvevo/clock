import { describe, expect, it } from "vitest";

import type { ProjectSelection, TrackingCatalog } from "@/modules/project/schema";
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
/** Archivado: la entrada lo conserva, pero el catálogo no lo trae. */
const archived = {
  id: "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f",
  name: "Viejo",
  color: "pink",
} as const;
const design = { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" };

const onWeb: ProjectSelection = { project: web, task: null };
const onWebDesign: ProjectSelection = { project: web, task: design };
const onApp: ProjectSelection = { project: app, task: null };
const onArchived: ProjectSelection = { project: archived, task: null };
const none: ProjectSelection = { project: null, task: null };

/** «Web» arranca facturable y «App» no (PR-21). */
const catalog: TrackingCatalog = {
  canCreateProject: true,
  groups: [
    {
      client: null,
      projects: [
        { ...app, tasks: [], billableByDefault: false },
        { ...web, tasks: [design], billableByDefault: true },
      ],
    },
  ],
};

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
  billable: true,
};

describe("fieldsOf", () => {
  it("toma el par y el facturable de la vista", () => {
    expect(fieldsOf(entry)).toEqual({ selection: onWebDesign, billable: true });
  });
});

describe("withSelection", () => {
  it("otro proyecto impone su facturable por defecto (D-2)", () => {
    expect(withSelection(NO_FIELDS, onWeb, catalog)).toEqual({
      selection: onWeb,
      billable: true,
    });
    expect(withSelection({ selection: onWeb, billable: true }, onApp, catalog)).toEqual({
      selection: onApp,
      billable: false,
    });
  });

  it("el mismo proyecto con otra tarea, o sin ella, conserva el facturable", () => {
    expect(
      withSelection({ selection: onWeb, billable: false }, onWebDesign, catalog),
    ).toEqual({ selection: onWebDesign, billable: false });
    expect(
      withSelection({ selection: onWebDesign, billable: false }, onWeb, catalog),
    ).toEqual({ selection: onWeb, billable: false });
  });

  it("el mismo proyecto con otras mayúsculas es el mismo", () => {
    const upper = { project: { ...web, id: web.id.toUpperCase() }, task: null };

    expect(withSelection({ selection: upper, billable: false }, onWeb, catalog)).toEqual({
      selection: onWeb,
      billable: false,
    });
  });

  it("«Sin proyecto» conserva el facturable", () => {
    expect(withSelection({ selection: onWeb, billable: true }, none, catalog)).toEqual({
      selection: none,
      billable: true,
    });
  });

  it("busca el proyecto en el catálogo sin distinguir mayúsculas", () => {
    const upper = { project: { ...web, id: web.id.toUpperCase() }, task: null };

    expect(withSelection(NO_FIELDS, upper, catalog).billable).toBe(true);
  });

  it("una selección fuera del catálogo conserva el facturable del borrador", () => {
    // El borrador es facturable aunque la fila no lo sea: la regla mira el
    // borrador, no la fila, y no trata al archivado como un proyecto nuevo.
    expect(
      withSelection({ selection: onApp, billable: true }, onArchived, catalog),
    ).toEqual({ selection: onArchived, billable: true });
    expect(
      withSelection({ selection: onWeb, billable: false }, onArchived, catalog),
    ).toEqual({ selection: onArchived, billable: false });
  });

  it("conserva el resto del borrador", () => {
    const dialog = { description: "Informe", selection: none, billable: false };

    expect(withSelection(dialog, onWeb, catalog)).toEqual({
      description: "Informe",
      selection: onWeb,
      billable: true,
    });
  });
});

describe("fieldsInput", () => {
  it("manda los ids del par y el facturable explícito", () => {
    expect(fieldsInput({ selection: onWebDesign, billable: true })).toEqual({
      projectId: web.id,
      taskId: design.id,
      billable: true,
    });
  });

  it("una entrada nueva manda sin proyecto y no facturable", () => {
    expect(fieldsInput(NO_FIELDS)).toEqual({
      projectId: null,
      taskId: null,
      billable: false,
    });
  });
});

describe("afterAdd", () => {
  const sent: EntryFields = { selection: onWeb, billable: true };

  it("limpia lo que sigue igual a lo que se mandó (TT-25)", () => {
    expect(afterAdd(sent, sent, catalog)).toEqual(NO_FIELDS);
  });

  it("el mismo par con otras mayúsculas también se limpia", () => {
    const upper = {
      selection: { project: { ...web, id: web.id.toUpperCase() }, task: null },
      billable: true,
    };

    expect(afterAdd(upper, sent, catalog)).toEqual(NO_FIELDS);
  });

  it("conserva el par que se eligió mientras el alta viajaba", () => {
    expect(afterAdd({ selection: onWebDesign, billable: true }, sent, catalog)).toEqual({
      selection: onWebDesign,
      billable: true,
    });
  });

  it("un facturable igual al enviado vuelve al por defecto del proyecto que queda (D-7)", () => {
    // Se mandó «App» marcado a mano y, antes de la respuesta, se eligió «Web»,
    // que arranca facturable: el próximo alta no manda `false` contra TT-14.
    expect(
      afterAdd(
        { selection: onWeb, billable: true },
        { selection: onApp, billable: true },
        catalog,
      ),
    ).toEqual({ selection: onWeb, billable: true });
  });

  it("con el proyecto que queda fuera del catálogo, vuelve a no facturable", () => {
    expect(
      afterAdd(
        { selection: onArchived, billable: true },
        { selection: onApp, billable: true },
        catalog,
      ),
    ).toEqual({ selection: onArchived, billable: false });
  });

  it("conserva el facturable que se cambió mientras el alta viajaba", () => {
    expect(
      afterAdd(
        { selection: onWeb, billable: true },
        { selection: onWeb, billable: false },
        catalog,
      ),
    ).toEqual({ selection: none, billable: true });
  });
});

import { describe, expect, it } from "vitest";

import type { TimeEntryView } from "@/modules/time-entry/schema";

import {
  answersSent,
  isSentEntry,
  recordSent,
  sameRequest,
  type NewEntryRequest,
} from "./sent-entry";

const web = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "Web",
  color: "teal",
} as const;
const mobile = {
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  name: "Móvil",
  color: "blue",
} as const;
const design = { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" };
const qa = { id: "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f", name: "QA" };
const review = { id: "4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80", name: "Revisión" };
const urgent = { id: "5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091", name: "Urgente" };
const internal = { id: "6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102", name: "Interno" };

const ID = "7a8b9c0d-1e2f-4a3b-8c4d-6e7f80910213";
const OTHER_ID = "8b9c0d1e-2f3a-4b4c-9d5e-7f8091021324";

/** La vista de la entrada que crea `sent`, como la responde el servidor. */
const created: TimeEntryView = {
  id: ID,
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
  tags: [review, urgent],
};

/** Lo que viaja siempre, y lo que puede faltar en un pedido. */
const times = { date: "2026-10-02", start: "09:00", end: "10:30" };
const pair = { projectId: web.id, taskId: design.id };
const tagIds = [review.id, urgent.id];

const sent: NewEntryRequest = {
  ...times,
  description: "Informe",
  ...pair,
  billable: true,
  tagIds,
};
/** Sin el par ni las etiquetas: ausentes, el esquema pone nulos y ninguna. */
const withoutPair: NewEntryRequest = { ...times, description: "Informe", billable: true };

/** Sin proyecto, tarea ni etiquetas, del lado de la vista. */
const bare: TimeEntryView = { ...created, project: null, task: null, tags: [] };

describe("isSentEntry", () => {
  it("es verdadera con la vista de lo mandado", () => {
    expect(isSentEntry(created, sent)).toBe(true);
  });

  it("recorta la descripción mandada, como el esquema", () => {
    expect(isSentEntry(created, { ...sent, description: "  Informe \t" })).toBe(true);
  });

  it("toma la descripción ausente como vacía", () => {
    const withoutDescription: NewEntryRequest = {
      ...times,
      ...pair,
      billable: true,
      tagIds,
    };
    expect(isSentEntry({ ...created, description: "" }, withoutDescription)).toBe(true);
    expect(isSentEntry(created, withoutDescription)).toBe(false);
  });

  it("compara los ids sin distinguir mayúsculas", () => {
    expect(
      isSentEntry(created, {
        ...sent,
        projectId: web.id.toUpperCase(),
        taskId: design.id.toUpperCase(),
        tagIds: [review.id.toUpperCase(), urgent.id],
      }),
    ).toBe(true);
  });

  it("compara las etiquetas como conjunto, en cualquier orden", () => {
    expect(isSentEntry(created, { ...sent, tagIds: [urgent.id, review.id] })).toBe(true);
  });

  it("el par y las etiquetas ausentes son lo mismo que nulos y ninguna", () => {
    expect(isSentEntry(bare, withoutPair)).toBe(true);
    expect(
      isSentEntry(bare, { ...sent, projectId: null, taskId: null, tagIds: [] }),
    ).toBe(true);
  });

  it("sin facturable en lo mandado no lo compara: lo resolvió el servidor (r3-2)", () => {
    const withoutBillable: NewEntryRequest = {
      ...times,
      description: "Informe",
      ...pair,
      tagIds,
    };
    expect(isSentEntry(created, withoutBillable)).toBe(true);
    expect(isSentEntry({ ...created, billable: false }, withoutBillable)).toBe(true);
  });

  it.each<[string, Partial<NewEntryRequest>]>([
    ["la descripción", { description: "Otro informe" }],
    ["el día", { date: "2026-10-01" }],
    ["el inicio", { start: "09:01" }],
    ["el fin", { end: "10:31" }],
    ["el proyecto", { projectId: mobile.id }],
    ["el proyecto, contra ninguno", { projectId: null, taskId: null }],
    ["la tarea", { taskId: qa.id }],
    ["la tarea, contra ninguna", { taskId: null }],
    ["el facturable", { billable: false }],
    ["una etiqueta de más", { tagIds: [review.id, urgent.id, internal.id] }],
    ["una etiqueta de menos", { tagIds: [review.id] }],
    ["otra etiqueta", { tagIds: [review.id, internal.id] }],
  ])("es falsa si cambia %s", (_field, change) => {
    expect(isSentEntry(created, { ...sent, ...change })).toBe(false);
  });

  it("es falsa con un proyecto en la vista y ninguno mandado", () => {
    expect(
      isSentEntry(created, { ...sent, projectId: undefined, taskId: undefined }),
    ).toBe(false);
  });

  it("es falsa con una entrada abierta", () => {
    expect(
      isSentEntry(
        { ...created, endedAt: null, endLabel: null, endClock: null },
        { ...sent },
      ),
    ).toBe(false);
  });
});

describe("sameRequest", () => {
  it("iguala lo que el servidor guarda igual", () => {
    expect(
      sameRequest(sent, {
        ...sent,
        description: " Informe ",
        projectId: web.id.toUpperCase(),
        tagIds: [urgent.id, review.id],
      }),
    ).toBe(true);
    expect(
      sameRequest(withoutPair, { ...sent, projectId: null, taskId: null, tagIds: [] }),
    ).toBe(true);
  });

  it.each<[string, Partial<NewEntryRequest>]>([
    ["la descripción", { description: "Otro informe" }],
    ["el día", { date: "2026-10-01" }],
    ["el inicio", { start: "09:01" }],
    ["el fin", { end: "10:31" }],
    ["el proyecto", { projectId: mobile.id }],
    ["la tarea", { taskId: qa.id }],
    ["el facturable", { billable: false }],
    ["el facturable, contra ninguno", { billable: undefined }],
    ["las etiquetas", { tagIds: [review.id] }],
  ])("distingue %s", (_field, change) => {
    expect(sameRequest(sent, { ...sent, ...change })).toBe(false);
  });
});

describe("recordSent", () => {
  it("suma los pedidos del mismo id y empieza de cero con otro", () => {
    const other = { ...sent, description: "Otra" };
    const first = recordSent(null, ID, sent);
    expect(first).toEqual({ id: ID, requests: [sent] });
    expect(recordSent(first, ID, other)).toEqual({ id: ID, requests: [sent, other] });
    expect(recordSent(first, OTHER_ID, other)).toEqual({
      id: OTHER_ID,
      requests: [other],
    });
  });
});

describe("answersSent", () => {
  /** La fila del primer intento, editada después en otra pestaña. */
  const editedElsewhere: TimeEntryView = { ...created, description: "Editada" };
  const second: NewEntryRequest = {
    ...sent,
    description: "Segunda",
    start: "11:00",
    end: "11:30",
  };

  it("con la vista de lo mandado, es la respuesta de lo mandado", () => {
    expect(answersSent(created, ID, sent, recordSent(null, ID, sent))).toBe(true);
  });

  it("el mismo pedido reenviado con su id es suyo aunque la fila se haya editado (r3-1)", () => {
    const resent = recordSent(recordSent(null, ID, sent), ID, sent);
    expect(answersSent(editedElsewhere, ID, sent, resent)).toBe(true);
  });

  it("un pedido distinto con el id pendiente que recibe la fila del primero no es suyo", () => {
    const changed = recordSent(recordSent(null, ID, sent), ID, second);
    expect(answersSent(created, ID, second, changed)).toBe(false);
  });

  it("con el pedido igual al último pero distinto de uno anterior, decide la vista", () => {
    // El primero se pudo aplicar: la fila que vuelve puede ser la suya.
    const mixed = recordSent(
      recordSent(recordSent(null, ID, sent), ID, second),
      ID,
      second,
    );
    expect(answersSent(created, ID, second, mixed)).toBe(false);
    const secondView: TimeEntryView = {
      ...created,
      description: "Segunda",
      startClock: "11:00",
      endClock: "11:30",
    };
    expect(answersSent(secondView, ID, second, mixed)).toBe(true);
  });

  it("un alta con un id nuevo responde siempre lo mandado, aunque la vista difiera", () => {
    expect(answersSent(editedElsewhere, ID, sent, recordSent(null, ID, sent))).toBe(true);
  });

  it("sin pedidos registrados con ese id, decide la vista", () => {
    const otherId = recordSent(null, OTHER_ID, sent);
    expect(answersSent(editedElsewhere, ID, sent, otherId)).toBe(false);
    expect(answersSent(editedElsewhere, ID, sent, null)).toBe(false);
    expect(answersSent(created, ID, sent, null)).toBe(true);
  });
});

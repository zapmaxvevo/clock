import { describe, expect, it } from "vitest";

import type { RemoveTimesheetRowInput } from "@/modules/time-entry/schema";

import {
  NO_ROW_REMOVALS,
  removingOf,
  rowRemovalsReducer,
  type RowRemovalsEvent,
  type RowRemovalsState,
} from "./row-removals";

const web = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function request(projectId: string | null): RemoveTimesheetRowInput {
  return {
    weekStart: "2026-09-28",
    projectId,
    taskId: null,
    ids: ["7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3"],
  };
}

const webRow = request(web);
const noProjectRow = request(null);
const failure = { request: webRow, code: "unexpected", message: "Sin red." } as const;

function run(...events: RowRemovalsEvent[]): RowRemovalsState {
  return events.reduce(rowRemovalsReducer, NO_ROW_REMOVALS);
}

describe("rowRemovalsReducer (§5.8)", () => {
  it("la fila que se quita no se dibuja mientras viaja", () => {
    const state = run({ type: "sent", id: 1, request: webRow });

    expect(removingOf(state)).toEqual([{ projectId: web, taskId: null }]);
  });

  it("aplicada, sigue sin dibujarse hasta otra foto de la misma semana", () => {
    const settled = run(
      { type: "sent", id: 1, request: webRow },
      { type: "sent", id: 2, request: noProjectRow },
      { type: "settled", id: 1 },
    );

    expect(removingOf(settled)).toHaveLength(2);

    const next = rowRemovalsReducer(settled, { type: "snapshot" });

    expect(removingOf(next)).toEqual([{ projectId: null, taskId: null }]);
  });

  it("con una falla vuelve a dibujarse y el aviso lleva su pedido", () => {
    const state = run(
      { type: "sent", id: 1, request: webRow },
      { type: "failed", id: 1, failure },
    );

    expect(removingOf(state)).toEqual([]);
    expect(state.failure).toEqual(failure);
  });

  it("otra semana descarta lo pendiente y conserva la falla (F-m2)", () => {
    const state = run(
      { type: "sent", id: 1, request: webRow },
      { type: "failed", id: 1, failure },
      { type: "sent", id: 2, request: noProjectRow },
      { type: "weekChanged" },
    );

    expect(removingOf(state)).toEqual([]);
    expect(state.failure).toEqual(failure);
  });

  it("después de otra semana, el pedido viejo que se asienta no toca uno nuevo del mismo par", () => {
    const state = run(
      { type: "sent", id: 1, request: webRow },
      { type: "weekChanged" },
      { type: "sent", id: 2, request: webRow },
      { type: "failed", id: 1, failure },
    );

    expect(removingOf(state)).toEqual([{ projectId: web, taskId: null }]);
  });

  it("quitar otra vez la fila que falló baja el aviso; quitar otra no", () => {
    const failed = run(
      { type: "sent", id: 1, request: webRow },
      { type: "failed", id: 1, failure },
    );

    expect(
      rowRemovalsReducer(failed, { type: "sent", id: 2, request: noProjectRow }).failure,
    ).toEqual(failure);
    expect(
      rowRemovalsReducer(failed, { type: "sent", id: 2, request: webRow }).failure,
    ).toBeNull();
  });

  it("bajar el aviso no toca lo que viaja", () => {
    const state = run(
      { type: "sent", id: 1, request: webRow },
      { type: "failed", id: 1, failure },
      { type: "sent", id: 2, request: noProjectRow },
      { type: "dismissed" },
    );

    expect(state.failure).toBeNull();
    expect(removingOf(state)).toEqual([{ projectId: null, taskId: null }]);
  });
});

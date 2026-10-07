import { describe, expect, it } from "vitest";

import type { ActionFailure, ActionHandle } from "@/hooks/use-action";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { trackerLabels } from "../labels";
import { dialogFailureOf } from "./calendar-notices";
import type { DialogSubject } from "./entry-dialog";
import { calendarLabels } from "./labels";

function handle(failure: ActionFailure | null): ActionHandle<never> {
  return { pending: false, failure, run: () => {}, retry: () => {}, clear: () => {} };
}

const idle = handle(null);

const add: DialogSubject = {
  kind: "add",
  draft: { date: "2026-10-02", start: "09:00", end: "10:30" },
  opener: "button",
};

const entry: DialogSubject = {
  kind: "entry",
  entry: {
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
    project: null,
    task: null,
    billable: false,
    tags: [],
  } satisfies TimeEntryView,
};

const network = {
  code: "unexpected",
  message: "No se pudo guardar. Revisá la conexión.",
};
const invalid = {
  code: "validation",
  message: "El fin tiene que ser posterior al inicio.",
};
const missing = { code: "not_found", message: "El proyecto ya no existe." };

describe("dialogFailureOf, en el alta", () => {
  it("una falla por red ofrece «Reintentar» con su mensaje (TT-89)", () => {
    expect(dialogFailureOf(add, idle, handle(network), false)).toEqual({
      title: trackerLabels.entryNotAdded,
      message: network.message,
      retryable: true,
    });
  });

  it.each([
    ["validation", invalid],
    ["not_found", missing],
  ])("un %s muestra su mensaje sin «Reintentar»", (_code, failure) => {
    expect(dialogFailureOf(add, idle, handle(failure), false)).toEqual({
      title: trackerLabels.entryNotAdded,
      message: failure.message,
      retryable: false,
    });
  });

  it("sin falla y con la respuesta de otro pedido, el informativo (r2-1)", () => {
    expect(dialogFailureOf(add, idle, idle, true)).toEqual({
      title: calendarLabels.addReplayed,
      message: undefined,
      tone: "info",
      retryable: false,
    });
  });

  it("la falla del pedido nuevo manda sobre el informativo", () => {
    expect(dialogFailureOf(add, idle, handle(network), true)?.title).toBe(
      trackerLabels.entryNotAdded,
    );
  });

  it("sin falla ni informativo, ningún aviso; la falla de «Guardar» no es del alta", () => {
    expect(dialogFailureOf(add, idle, idle, false)).toBeNull();
    expect(dialogFailureOf(add, handle(network), idle, false)).toBeNull();
  });
});

describe("dialogFailureOf, en una entrada", () => {
  it("una falla por red de «Guardar» ofrece «Reintentar»; otra, no", () => {
    expect(dialogFailureOf(entry, handle(network), idle, false)).toEqual({
      title: calendarLabels.entryNotSaved,
      message: network.message,
      retryable: true,
    });
    expect(dialogFailureOf(entry, handle(invalid), idle, false)).toEqual({
      title: calendarLabels.entryNotSaved,
      message: invalid.message,
      retryable: false,
    });
  });

  it("las fallas que cierran el diálogo no dejan aviso en él", () => {
    expect(dialogFailureOf(entry, handle(missing), idle, false)).toBeNull();
  });

  it("ni la falla ni el informativo del alta son de la entrada", () => {
    expect(dialogFailureOf(entry, idle, handle(network), true)).toBeNull();
  });
});

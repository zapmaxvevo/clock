import { describe, expect, it } from "vitest";

import {
  deleteEntryInput,
  startTimerInput,
  stopTimerInput,
  timeEntryMessages,
  trackerState,
  updateDescriptionInput,
  TRACKER_WINDOW_DAYS,
} from "./schema";

const id = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";

describe("startTimerInput", () => {
  it("deja arrancar sin descripción", () => {
    expect(startTimerInput.parse({})).toEqual({ description: "" });
  });

  it("recorta los espacios de los extremos", () => {
    expect(startTimerInput.parse({ description: "  reunión  " })).toEqual({
      description: "reunión",
    });
  });

  it("acepta exactamente 3000 caracteres y rechaza uno más", () => {
    expect(startTimerInput.safeParse({ description: "a".repeat(3000) }).success).toBe(
      true,
    );
    const tooLong = startTimerInput.safeParse({ description: "a".repeat(3001) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues.at(0)?.message).toBe(
      timeEntryMessages.descriptionTooLong,
    );
  });

  it("no cuenta como largo lo que el recorte saca", () => {
    expect(
      startTimerInput.safeParse({ description: `  ${"a".repeat(3000)}  ` }).success,
    ).toBe(true);
  });
});

describe("updateDescriptionInput", () => {
  it("exige un id con forma de uuid", () => {
    expect(
      updateDescriptionInput.safeParse({ id: "no-es-uuid", description: "" }).success,
    ).toBe(false);
  });

  it("acepta la descripción vacía, que es «sin descripción»", () => {
    expect(updateDescriptionInput.parse({ id, description: "   " })).toEqual({
      id,
      description: "",
    });
  });

  it("no tiene default: la descripción es obligatoria en la entrada", () => {
    expect(updateDescriptionInput.safeParse({ id }).success).toBe(false);
  });
});

describe("stopTimerInput y deleteEntryInput", () => {
  it("solo aceptan un uuid", () => {
    expect(stopTimerInput.parse({ id })).toEqual({ id });
    expect(deleteEntryInput.parse({ id })).toEqual({ id });
    expect(stopTimerInput.safeParse({ id: "1" }).success).toBe(false);
    expect(deleteEntryInput.safeParse({}).success).toBe(false);
  });
});

describe("trackerState", () => {
  const entry = {
    id,
    description: "",
    startedAt: "2026-10-02T11:00:00.000Z",
    endedAt: "2026-10-02T12:30:00.000Z",
    dayDate: "2026-10-02",
    startLabel: "08:00",
    endLabel: "09:30",
    extraDays: 0,
    durationSeconds: 5400,
    durationLabel: "1:30",
  };

  const state = {
    serverNow: "2026-10-02T15:00:00.000Z",
    timeZone: "America/Argentina/Buenos_Aires",
    canTrack: true,
    running: null,
    days: [
      {
        date: "2026-10-02",
        label: "Hoy",
        isRunningDay: false,
        closedSeconds: 5400,
        entries: [entry],
      },
    ],
    hasAnyEntry: true,
  };

  it("acepta un estado completo", () => {
    expect(trackerState.parse(state)).toEqual(state);
  });

  it("acepta el timer activo sin fin, sin duración y sin superíndice", () => {
    const running = {
      ...entry,
      endedAt: null,
      endLabel: null,
      extraDays: 0,
      durationSeconds: null,
      durationLabel: null,
    };
    expect(trackerState.parse({ ...state, running }).running).toEqual(running);
  });

  it("rechaza una duración negativa y un superíndice negativo", () => {
    expect(
      trackerState.safeParse({
        ...state,
        days: [{ ...state.days[0], entries: [{ ...entry, durationSeconds: -1 }] }],
      }).success,
    ).toBe(false);
    expect(
      trackerState.safeParse({
        ...state,
        days: [{ ...state.days[0], entries: [{ ...entry, extraDays: -1 }] }],
      }).success,
    ).toBe(false);
  });

  it("rechaza instantes que no son ISO", () => {
    expect(trackerState.safeParse({ ...state, serverNow: "02/10/2026" }).success).toBe(
      false,
    );
  });
});

describe("TRACKER_WINDOW_DAYS", () => {
  it("es la ventana de dos semanas del contrato", () => {
    expect(TRACKER_WINDOW_DAYS).toBe(14);
  });
});

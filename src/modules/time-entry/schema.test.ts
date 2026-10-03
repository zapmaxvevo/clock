import { describe, expect, it } from "vitest";

import {
  createManualEntryInput,
  deleteEntryInput,
  startTimerInput,
  stopTimerInput,
  timeEntryMessages,
  trackerState,
  updateDescriptionInput,
  updateEntryTimesInput,
  updateRunningStartInput,
  TRACKER_WINDOW_DAYS,
} from "./schema";

const id = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";

describe("startTimerInput", () => {
  it("deja arrancar sin descripción", () => {
    expect(startTimerInput.parse({ id })).toEqual({ id, description: "" });
  });

  it("recorta los espacios de los extremos", () => {
    expect(startTimerInput.parse({ id, description: "  reunión  " })).toEqual({
      id,
      description: "reunión",
    });
  });

  it("acepta exactamente 3000 caracteres y rechaza uno más", () => {
    expect(startTimerInput.safeParse({ id, description: "a".repeat(3000) }).success).toBe(
      true,
    );
    const tooLong = startTimerInput.safeParse({ id, description: "a".repeat(3001) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues.at(0)?.message).toBe(
      timeEntryMessages.descriptionTooLong,
    );
  });

  it("no cuenta como largo lo que el recorte saca", () => {
    expect(
      startTimerInput.safeParse({ id, description: `  ${"a".repeat(3000)}  ` }).success,
    ).toBe(true);
  });

  it("acepta el id que genera crypto.randomUUID()", () => {
    const generated = crypto.randomUUID();
    expect(startTimerInput.parse({ id: generated })).toEqual({
      id: generated,
      description: "",
    });
  });

  it.each([
    ["sin id", {}],
    ["con un texto que no es uuid", { id: "no-es-uuid" }],
    ["con el uuid nulo", { id: "00000000-0000-0000-0000-000000000000" }],
    ["con un uuid v7", { id: "01890a5d-ac96-774b-bcce-b302099a8057" }],
  ])("rechaza el arranque %s", (_, input) => {
    const result = startTimerInput.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.path).toEqual(["id"]);
  });
});

describe("el carácter nulo en la descripción", () => {
  const withNull = "antes\u0000después";

  it.each([
    ["startTimerInput", startTimerInput, { id }],
    ["updateDescriptionInput", updateDescriptionInput, { id }],
    [
      "createManualEntryInput",
      createManualEntryInput,
      { date: "2026-10-02", start: "08:00", end: "09:00" },
    ],
  ] as const)("%s lo rechaza con su mensaje", (_, schema, rest) => {
    const result = schema.safeParse({ ...rest, description: withNull });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(
      timeEntryMessages.descriptionNullCharacter,
    );
  });

  it("deja pasar el resto de los caracteres de control", () => {
    expect(
      startTimerInput.safeParse({ id, description: "tab\tsalto\nfin\u0001" }).success,
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
    editableTimes: true,
  };

  const state = {
    serverNow: "2026-10-02T15:00:00.000Z",
    timeZone: "America/Argentina/Buenos_Aires",
    todayKey: "2026-10-02",
    minDayKey: "2026-09-01",
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
      editableTimes: false,
    };
    expect(trackerState.parse({ ...state, running }).running).toEqual(running);
  });

  it("exige editableTimes en cada entrada", () => {
    const withoutFlag = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "editableTimes"),
    );
    expect(
      trackerState.safeParse({
        ...state,
        days: [{ ...state.days[0], entries: [withoutFlag] }],
      }).success,
    ).toBe(false);
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

describe("createManualEntryInput", () => {
  const valid = { date: "2026-10-02", start: "08:00", end: "10:30" };

  it("acepta la forma canónica y deja la descripción vacía por defecto", () => {
    expect(createManualEntryInput.parse(valid)).toEqual({ ...valid, description: "" });
  });

  it("rechaza un día que tiene la forma pero no existe", () => {
    const result = createManualEntryInput.safeParse({ ...valid, date: "2026-02-30" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.invalidDate);
  });

  it("rechaza una fecha con otro formato", () => {
    for (const date of ["02/10/2026", "2026-10-2", "2026-10-02T00:00:00Z", ""]) {
      expect(createManualEntryInput.safeParse({ ...valid, date }).success).toBe(false);
    }
  });

  it("exige la hora en forma canónica: los formatos tolerantes los normaliza el cliente", () => {
    for (const start of ["8:00", "0800", "24:00", "08:60", "8", ""]) {
      const result = createManualEntryInput.safeParse({ ...valid, start });
      expect([start, result.success]).toEqual([start, false]);
      expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.invalidClock);
    }
  });

  it("acepta los dos extremos del día", () => {
    expect(
      createManualEntryInput.safeParse({ ...valid, start: "00:00", end: "23:59" })
        .success,
    ).toBe(true);
  });

  it("acepta un fin menor que el inicio, que es el cruce de medianoche", () => {
    expect(
      createManualEntryInput.safeParse({ ...valid, start: "23:00", end: "02:00" })
        .success,
    ).toBe(true);
  });

  it("acepta una fecha futura, que P-10 ya no rechaza", () => {
    expect(
      createManualEntryInput.safeParse({ ...valid, date: "2099-12-31" }).success,
    ).toBe(true);
  });

  it("no recibe duración: la deriva el servidor de las dos horas", () => {
    const parsed = createManualEntryInput.parse({ ...valid, duration: 999 });
    expect(parsed).not.toHaveProperty("duration");
  });

  it("corta la descripción demasiado larga", () => {
    const result = createManualEntryInput.safeParse({
      ...valid,
      description: "a".repeat(3001),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(
      timeEntryMessages.descriptionTooLong,
    );
  });
});

describe("updateEntryTimesInput", () => {
  const valid = { id, date: "2026-10-02", start: "08:00", end: "10:30" };

  it("acepta el trío completo en forma canónica", () => {
    expect(updateEntryTimesInput.parse(valid)).toEqual(valid);
  });

  it("exige los tres campos: no es un parche", () => {
    for (const field of ["date", "start", "end"] as const) {
      const partial = Object.fromEntries(
        Object.entries(valid).filter(([key]) => key !== field),
      );
      expect([field, updateEntryTimesInput.safeParse(partial).success]).toEqual([
        field,
        false,
      ]);
    }
  });

  it("exige un id con forma de uuid", () => {
    expect(updateEntryTimesInput.safeParse({ ...valid, id: "no-es-uuid" }).success).toBe(
      false,
    );
  });

  it("rechaza un día que no existe con el mensaje de fecha", () => {
    const result = updateEntryTimesInput.safeParse({ ...valid, date: "2026-02-30" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.invalidDate);
  });

  it("rechaza una hora que no es canónica con el mensaje de hora", () => {
    for (const end of ["9:00", "0900", "24:00", ""]) {
      const result = updateEntryTimesInput.safeParse({ ...valid, end });
      expect([end, result.success]).toEqual([end, false]);
      expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.invalidClock);
    }
  });

  it("acepta un fin menor que el inicio y dos horas iguales: los decide el servidor", () => {
    expect(
      updateEntryTimesInput.safeParse({ ...valid, start: "23:00", end: "02:00" }).success,
    ).toBe(true);
    expect(
      updateEntryTimesInput.safeParse({ ...valid, start: "08:00", end: "08:00" }).success,
    ).toBe(true);
  });
});

describe("updateRunningStartInput", () => {
  const valid = { id, date: "2026-10-02", start: "08:00" };

  it("acepta el día y la hora del inicio", () => {
    expect(updateRunningStartInput.parse(valid)).toEqual(valid);
  });

  it("exige el día además de la hora", () => {
    expect(updateRunningStartInput.safeParse({ id, start: "08:00" }).success).toBe(false);
  });

  it("rechaza un día que no existe y una hora no canónica", () => {
    const date = updateRunningStartInput.safeParse({ ...valid, date: "2026-02-30" });
    expect(date.error?.issues.at(0)?.message).toBe(timeEntryMessages.invalidDate);
    const start = updateRunningStartInput.safeParse({ ...valid, start: "8:00" });
    expect(start.error?.issues.at(0)?.message).toBe(timeEntryMessages.invalidClock);
  });

  it("no recibe un fin", () => {
    expect(updateRunningStartInput.parse({ ...valid, end: "09:00" })).not.toHaveProperty(
      "end",
    );
  });
});

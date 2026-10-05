import { describe, expect, it } from "vitest";

import {
  BULK_MAX,
  bulkDeleteEntriesInput,
  bulkEditChanges,
  bulkEditEntriesInput,
  calendarModeParams,
  calendarState,
  calendarWeekParams,
  continueEntryInput,
  createManualEntryInput,
  deleteEntryInput,
  discardTimerInput,
  duplicateEntryInput,
  startTimerInput,
  stopTimerInput,
  timeEntryMessages,
  trackerSearchParams,
  trackerState,
  updateDescriptionInput,
  updateEntryChanges,
  updateEntryInput,
  updateEntryProjectInput,
  updateEntryTimesInput,
  updateRunningStartInput,
  TRACKER_WINDOW_DAYS,
} from "./schema";

const id = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";

describe("startTimerInput", () => {
  it("deja arrancar sin descripción", () => {
    expect(startTimerInput.parse({ id })).toEqual({
      id,
      description: "",
      projectId: null,
      taskId: null,
    });
  });

  it("TT-14: deja el facturable ausente para el servidor y acepta solo un booleano", () => {
    expect(startTimerInput.parse({ id })).not.toHaveProperty("billable");
    expect(startTimerInput.parse({ id, billable: true })).toMatchObject({
      billable: true,
    });
    expect(startTimerInput.parse({ id, billable: false })).toMatchObject({
      billable: false,
    });
    for (const billable of ["true", 1, null]) {
      expect(startTimerInput.safeParse({ id, billable }).success).toBe(false);
    }
  });

  it("recorta los espacios de los extremos", () => {
    expect(startTimerInput.parse({ id, description: "  reunión  " })).toEqual({
      id,
      description: "reunión",
      projectId: null,
      taskId: null,
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
      projectId: null,
      taskId: null,
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

describe("TT-70: la tarea no viaja sin su proyecto (criterio 5)", () => {
  const projectId = "6f1c1a52-3c55-4a43-9d0e-0d6b7d0f4d11";
  const taskId = "9a7c2b1e-4d3f-4e8a-8b6c-5d4e3f2a1b0c";

  const inputs = [
    ["startTimerInput", startTimerInput, { id }],
    [
      "createManualEntryInput",
      createManualEntryInput,
      { date: "2026-10-02", start: "08:00", end: "09:00" },
    ],
    ["updateEntryProjectInput", updateEntryProjectInput, { id }],
  ] as const;

  it.each(inputs)(
    "%s rechaza la tarea sin proyecto con su mensaje",
    (_, schema, rest) => {
      const result = schema.safeParse({ ...rest, projectId: null, taskId });
      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          message: timeEntryMessages.taskNeedsProject,
          path: ["taskId"],
        }),
      ]);
    },
  );

  it.each(inputs)(
    "%s acepta el proyecto con y sin tarea, y los dos nulos",
    (_, schema, rest) => {
      for (const pair of [
        { projectId, taskId },
        { projectId, taskId: null },
        { projectId: null, taskId: null },
      ]) {
        expect(schema.parse({ ...rest, ...pair })).toMatchObject(pair);
      }
    },
  );

  it("las altas rechazan la tarea sola aunque falte projectId", () => {
    for (const [schema, rest] of [
      [startTimerInput, { id }],
      [createManualEntryInput, { date: "2026-10-02", start: "08:00", end: "09:00" }],
    ] as const) {
      const result = schema.safeParse({ ...rest, taskId });
      expect(result.error?.issues.at(0)?.message).toBe(
        timeEntryMessages.taskNeedsProject,
      );
    }
  });

  it("los ids del par tienen forma de uuid", () => {
    expect(startTimerInput.safeParse({ id, projectId: "web" }).success).toBe(false);
    expect(
      createManualEntryInput.safeParse({
        date: "2026-10-02",
        start: "08:00",
        end: "09:00",
        projectId,
        taskId: "diseño",
      }).success,
    ).toBe(false);
  });
});

describe("updateEntryProjectInput", () => {
  it("exige el par entero: la action fija los dos valores", () => {
    expect(updateEntryProjectInput.safeParse({ id, projectId: null }).success).toBe(
      false,
    );
    expect(updateEntryProjectInput.safeParse({ id, taskId: null }).success).toBe(false);
    expect(updateEntryProjectInput.parse({ id, projectId: null, taskId: null })).toEqual({
      id,
      projectId: null,
      taskId: null,
    });
  });

  it("exige un id de entrada con forma de uuid", () => {
    expect(
      updateEntryProjectInput.safeParse({ id: "1", projectId: null, taskId: null })
        .success,
    ).toBe(false);
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
    weekStart: "2026-09-28",
    startLabel: "08:00",
    endLabel: "09:30",
    startClock: "08:00",
    endClock: "09:30",
    extraDays: 0,
    durationSeconds: 5400,
    durationLabel: "1:30",
    editableTimes: true,
    project: null,
    task: null,
    billable: false,
  };

  /** Una semana con un solo día, que lleva las entradas que se le pasen. */
  function weeksWith(entries: readonly object[]) {
    return [
      {
        start: "2026-09-28",
        label: "Esta semana",
        isRunningWeek: false,
        closedSeconds: 5400,
        days: [
          {
            date: "2026-10-02",
            label: "Hoy",
            isRunningDay: false,
            closedSeconds: 5400,
            entries,
          },
        ],
      },
    ];
  }

  const state = {
    serverNow: "2026-10-02T15:00:00.000Z",
    timeZone: "America/Argentina/Buenos_Aires",
    todayKey: "2026-10-02",
    minDayKey: "2026-09-01",
    canTrack: true,
    running: null,
    lastEntryId: id,
    weeks: weeksWith([entry]),
    windowFrom: "2026-09-14",
    reachFrom: "2026-09-14",
    loadMoreFrom: "2026-08-31",
    hasAnyEntry: true,
  };

  it("acepta un estado completo", () => {
    expect(trackerState.parse(state)).toEqual(state);
  });

  it("acepta lastEntryId nulo y exige que esté, con forma de uuid", () => {
    expect(trackerState.parse({ ...state, lastEntryId: null }).lastEntryId).toBeNull();
    const { lastEntryId, ...missing } = state;
    expect(lastEntryId).toBe(id);
    expect(trackerState.safeParse(missing).success).toBe(false);
    expect(trackerState.safeParse({ ...state, lastEntryId: "no-es-uuid" }).success).toBe(
      false,
    );
  });

  it("acepta el timer activo sin fin, sin duración y sin superíndice", () => {
    const running = {
      ...entry,
      endedAt: null,
      endLabel: null,
      endClock: null,
      extraDays: 0,
      durationSeconds: null,
      durationLabel: null,
      editableTimes: false,
    };
    expect(trackerState.parse({ ...state, running }).running).toEqual(running);
  });

  it("exige las horas canónicas de cada entrada, que no son los rótulos", () => {
    const twelveHour = { ...entry, startLabel: "8:00 AM", endLabel: "9:30 AM" };
    expect(
      trackerState.parse({ ...state, weeks: weeksWith([twelveHour]) }).weeks[0].days[0]
        .entries[0],
    ).toEqual(twelveHour);
    for (const key of ["startClock", "endClock"]) {
      const missing = Object.fromEntries(
        Object.entries(entry).filter(([other]) => other !== key),
      );
      expect([
        key,
        trackerState.safeParse({ ...state, weeks: weeksWith([missing]) }).success,
      ]).toEqual([key, false]);
    }
    expect(
      trackerState.safeParse({
        ...state,
        weeks: weeksWith([{ ...entry, startClock: null }]),
      }).success,
    ).toBe(false);
  });

  it("exige editableTimes en cada entrada", () => {
    const withoutFlag = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "editableTimes"),
    );
    expect(
      trackerState.safeParse({ ...state, weeks: weeksWith([withoutFlag]) }).success,
    ).toBe(false);
  });

  it("exige billable en cada entrada (TT-14)", () => {
    const withoutBillable = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "billable"),
    );
    expect(
      trackerState.safeParse({ ...state, weeks: weeksWith([withoutBillable]) }).success,
    ).toBe(false);
    expect(
      trackerState.safeParse({ ...state, running: { ...entry, billable: "no" } }).success,
    ).toBe(false);
  });

  it("acepta el proyecto y la tarea de la entrada, y exige que estén", () => {
    const withProject = {
      ...entry,
      project: { id, name: "Web", color: "pink" },
      task: { id, name: "Diseño" },
    };
    expect(
      trackerState.parse({ ...state, weeks: weeksWith([withProject]) }).weeks[0].days[0]
        .entries[0],
    ).toEqual(withProject);
    for (const key of ["project", "task"]) {
      const missing = Object.fromEntries(
        Object.entries(entry).filter(([other]) => other !== key),
      );
      expect([
        key,
        trackerState.safeParse({ ...state, weeks: weeksWith([missing]) }).success,
      ]).toEqual([key, false]);
    }
    const offPalette = { ...withProject, project: { id, name: "Web", color: "#ff0000" } };
    expect(
      trackerState.safeParse({ ...state, weeks: weeksWith([offPalette]) }).success,
    ).toBe(false);
  });

  it("exige weekStart en cada entrada", () => {
    const withoutWeek = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "weekStart"),
    );
    expect(
      trackerState.safeParse({ ...state, weeks: weeksWith([withoutWeek]) }).success,
    ).toBe(false);
  });

  it("acepta loadMoreFrom nulo y exige los dos pisos", () => {
    expect(trackerState.parse({ ...state, loadMoreFrom: null }).loadMoreFrom).toBeNull();
    for (const key of ["windowFrom", "reachFrom", "loadMoreFrom"]) {
      const missing = Object.fromEntries(
        Object.entries(state).filter(([other]) => other !== key),
      );
      expect([key, trackerState.safeParse(missing).success]).toEqual([key, false]);
    }
  });

  it("exige el total de la semana entero y no negativo", () => {
    for (const closedSeconds of [-1, 1.5]) {
      const [week] = weeksWith([entry]);
      expect(
        trackerState.safeParse({ ...state, weeks: [{ ...week, closedSeconds }] }).success,
      ).toBe(false);
    }
  });

  it("rechaza una duración negativa y un superíndice negativo", () => {
    expect(
      trackerState.safeParse({
        ...state,
        weeks: weeksWith([{ ...entry, durationSeconds: -1 }]),
      }).success,
    ).toBe(false);
    expect(
      trackerState.safeParse({
        ...state,
        weeks: weeksWith([{ ...entry, extraDays: -1 }]),
      }).success,
    ).toBe(false);
  });

  it("rechaza instantes que no son ISO", () => {
    expect(trackerState.safeParse({ ...state, serverNow: "02/10/2026" }).success).toBe(
      false,
    );
  });
});

describe("trackerSearchParams", () => {
  it("acepta un día válido", () => {
    expect(trackerSearchParams.safeParse({ desde: "2026-09-07" })).toEqual({
      success: true,
      data: { desde: "2026-09-07" },
    });
  });

  it("no pasa sin desde, con un día que no existe ni con otro formato", () => {
    for (const params of [
      {},
      { desde: "2026-02-30" },
      { desde: "07/09/2026" },
      { desde: "" },
    ]) {
      expect(trackerSearchParams.safeParse(params).success).toBe(false);
    }
  });

  it("no pasa con desde repetido, que Next entrega como arreglo", () => {
    expect(
      trackerSearchParams.safeParse({ desde: ["2026-09-07", "2026-08-31"] }).success,
    ).toBe(false);
  });

  it("un parámetro ajeno no arrastra a desde", () => {
    expect(
      trackerSearchParams.safeParse({ desde: "2026-09-07", otro: ["a", "b"] }).success,
    ).toBe(true);
  });
});

describe("calendarWeekParams", () => {
  it("acepta un día válido, sea o no inicio de semana", () => {
    expect(calendarWeekParams.safeParse({ semana: "2026-10-01" })).toEqual({
      success: true,
      data: { semana: "2026-10-01" },
    });
  });

  it("no pasa sin semana, con un día que no existe ni con otro formato", () => {
    for (const params of [
      {},
      { semana: "2026-02-30" },
      { semana: "01/10/2026" },
      { semana: "" },
    ]) {
      expect(calendarWeekParams.safeParse(params).success).toBe(false);
    }
  });

  it("no pasa con semana repetida, que Next entrega como arreglo (ADR 0008)", () => {
    expect(
      calendarWeekParams.safeParse({ semana: ["2026-10-01", "2026-09-24"] }).success,
    ).toBe(false);
  });
});

describe("calendarModeParams", () => {
  it("acepta solo vista=dia", () => {
    expect(calendarModeParams.safeParse({ vista: "dia" }).success).toBe(true);
    for (const params of [
      {},
      { vista: "semana" },
      { vista: "Dia" },
      { vista: ["dia", "dia"] },
    ]) {
      expect(calendarModeParams.safeParse(params).success).toBe(false);
    }
  });
});

describe("calendarState", () => {
  const entry = {
    id,
    description: "",
    startedAt: "2026-10-01T11:00:00.000Z",
    endedAt: "2026-10-01T12:30:00.000Z",
    dayDate: "2026-10-01",
    weekStart: "2026-09-28",
    startLabel: "08:00",
    endLabel: "09:30",
    startClock: "08:00",
    endClock: "09:30",
    extraDays: 0,
    durationSeconds: 5400,
    durationLabel: "1:30",
    editableTimes: true,
    project: null,
    task: null,
    billable: false,
  };

  const day = {
    date: "2026-10-01",
    label: "jue, 01/10",
    isToday: false,
    beforeWorkspace: false,
    closedSeconds: 5400,
    missingMinutes: [],
  };

  const state = {
    serverNow: "2026-10-02T15:00:00.000Z",
    todayKey: "2026-10-02",
    minDayKey: "2026-09-01",
    nowMinute: 720,
    canTrack: true,
    mode: "week",
    periodStart: "2026-09-28",
    periodLabel: "Esta semana",
    previousStart: "2026-09-21",
    nextStart: "2026-10-05",
    todayStart: "2026-09-28",
    dayModeStart: "2026-10-02",
    weekModeStart: "2026-09-28",
    days: [day],
    entries: [entry],
    running: null,
    closedSeconds: 5400,
  };

  it("acepta un estado completo", () => {
    expect(calendarState.parse(state)).toEqual(state);
  });

  it("acepta la vista día y un timer", () => {
    const running = {
      ...entry,
      endedAt: null,
      endLabel: null,
      endClock: null,
      durationSeconds: null,
      durationLabel: null,
      editableTimes: false,
    };
    expect(calendarState.safeParse({ ...state, mode: "day", running }).success).toBe(
      true,
    );
  });

  it("rechaza una vista que no es semana ni día", () => {
    expect(calendarState.safeParse({ ...state, mode: "month" }).success).toBe(false);
  });

  it("acota el minuto de ahora al día", () => {
    expect(calendarState.safeParse({ ...state, nowMinute: 1439 }).success).toBe(true);
    expect(calendarState.safeParse({ ...state, nowMinute: 1440 }).success).toBe(false);
    expect(calendarState.safeParse({ ...state, nowMinute: -1 }).success).toBe(false);
    expect(calendarState.safeParse({ ...state, nowMinute: 1.5 }).success).toBe(false);
  });

  it("acota los minutos que faltan entre 0 y 1440, enteros", () => {
    const withMissing = (from: number, to: number) => ({
      ...state,
      days: [{ ...day, missingMinutes: [{ from, to }] }],
    });
    expect(calendarState.safeParse(withMissing(0, 1440)).success).toBe(true);
    expect(calendarState.safeParse(withMissing(120, 180)).success).toBe(true);
    expect(calendarState.safeParse(withMissing(-1, 60)).success).toBe(false);
    expect(calendarState.safeParse(withMissing(0, 1441)).success).toBe(false);
    expect(calendarState.safeParse(withMissing(0, 60.5)).success).toBe(false);
  });

  it("rechaza totales negativos", () => {
    expect(calendarState.safeParse({ ...state, closedSeconds: -1 }).success).toBe(false);
    expect(
      calendarState.safeParse({ ...state, days: [{ ...day, closedSeconds: -1 }] })
        .success,
    ).toBe(false);
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
    expect(createManualEntryInput.parse(valid)).toEqual({
      ...valid,
      description: "",
      projectId: null,
      taskId: null,
    });
  });

  it("TT-14: deja el facturable ausente para el servidor y acepta solo un booleano", () => {
    expect(createManualEntryInput.parse(valid)).not.toHaveProperty("billable");
    expect(createManualEntryInput.parse({ ...valid, billable: false })).toMatchObject({
      billable: false,
    });
    for (const billable of ["false", 0, null]) {
      expect(createManualEntryInput.safeParse({ ...valid, billable }).success).toBe(
        false,
      );
    }
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

describe.each([
  ["continueEntryInput", continueEntryInput],
  ["duplicateEntryInput", duplicateEntryInput],
] as const)("%s", (_, input) => {
  const sourceId = "7d0e9a52-1f3b-4c8d-a2e6-5b9c0d1e2f3a";

  it("acepta el id nuevo y el de la original", () => {
    expect(input.parse({ id, sourceId })).toEqual({ id, sourceId });
  });

  it("acepta como original cualquier uuid: la fila ya existe y no la eligió este cliente", () => {
    const v7 = "01890a5d-ac96-774b-bcce-b302099a8057";
    expect(input.parse({ id, sourceId: v7 })).toEqual({ id, sourceId: v7 });
  });

  it.each([
    ["sin id", { sourceId }],
    ["con un texto que no es uuid", { id: "no-es-uuid", sourceId }],
    ["con el uuid nulo", { id: "00000000-0000-0000-0000-000000000000", sourceId }],
    ["con un uuid v7", { id: "01890a5d-ac96-774b-bcce-b302099a8057", sourceId }],
    ["sin la original", { id }],
    ["con una original que no es uuid", { id, sourceId: "no-es-uuid" }],
  ])("rechaza el pedido %s", (__, values) => {
    expect(input.safeParse(values).success).toBe(false);
  });

  it.each([
    ["el mismo id", id],
    ["el mismo id con otras mayúsculas", id.toUpperCase()],
  ])("rechaza %s que la original con su mensaje", (__, same) => {
    const result = input.safeParse({ id, sourceId: same });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.sameEntryId);
  });
});

describe("discardTimerInput", () => {
  it("solo acepta un uuid", () => {
    expect(discardTimerInput.parse({ id })).toEqual({ id });
    expect(discardTimerInput.safeParse({ id: "no-es-uuid" }).success).toBe(false);
    expect(discardTimerInput.safeParse({}).success).toBe(false);
  });
});

/** `count` uuid distintos, con la forma que genera el cliente. */
function idsOf(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID());
}

describe.each([
  ["bulkEditEntriesInput", bulkEditEntriesInput, { changes: { description: "x" } }],
  ["bulkDeleteEntriesInput", bulkDeleteEntriesInput, {}],
] as const)("los ids de %s (criterio 5)", (_, schema, rest) => {
  it("rechaza cero ids con bulkEmpty", () => {
    const result = schema.safeParse({ ids: [], ...rest });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.bulkEmpty);
  });

  it("acepta el tope y rechaza uno más con bulkTooMany", () => {
    expect(BULK_MAX).toBe(200);
    expect(schema.safeParse({ ids: idsOf(200), ...rest }).success).toBe(true);
    const tooMany = schema.safeParse({ ids: idsOf(201), ...rest });
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues.at(0)?.message).toBe(timeEntryMessages.bulkTooMany);
  });

  it("normaliza a minúsculas y quita los repetidos, con o sin la misma mayúscula", () => {
    const [first, second] = idsOf(2);
    const result = schema.parse({
      ids: [first.toUpperCase(), second, first, second],
      ...rest,
    });
    expect(result.ids).toEqual([first, second]);
  });

  it("rechaza un id que no es uuid", () => {
    const result = schema.safeParse({ ids: ["no-es-uuid"], ...rest });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.path).toEqual(["ids", 0]);
  });
});

describe("bulkEditChanges (criterio 8)", () => {
  it("deja cada campo opcional y conserva la descripción vacía, que reemplaza", () => {
    expect(bulkEditChanges.parse({ description: "" })).toEqual({ description: "" });
    expect(bulkEditChanges.parse({ start: "09:00" })).toEqual({ start: "09:00" });
    expect(
      bulkEditChanges.parse({
        description: "  reunión  ",
        date: "2026-10-01",
        start: "09:00",
        end: "08:00",
      }),
    ).toEqual({
      description: "reunión",
      date: "2026-10-01",
      start: "09:00",
      end: "08:00",
    });
  });

  it("rechaza un pedido sin ningún cambio con bulkNoChanges", () => {
    for (const changes of [{}, { description: undefined }]) {
      const result = bulkEditChanges.safeParse(changes);
      expect(result.success).toBe(false);
      expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.bulkNoChanges);
    }
  });

  it("rechaza un campo que no conoce con el texto de unexpected, no con el de Zod", () => {
    const result = bulkEditChanges.safeParse({ description: "x", projectId: null });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.unexpected);
  });

  it("valida cada campo con las reglas de la fila", () => {
    const cases = [
      [{ description: "a".repeat(3001) }, timeEntryMessages.descriptionTooLong],
      [{ description: "a\u0000b" }, timeEntryMessages.descriptionNullCharacter],
      [{ date: "2026-02-30" }, timeEntryMessages.invalidDate],
      [{ start: "9:00" }, timeEntryMessages.invalidClock],
      [{ end: "1:15 PM" }, timeEntryMessages.invalidClock],
    ] as const;
    for (const [changes, message] of cases) {
      const result = bulkEditChanges.safeParse(changes);
      expect(result.success).toBe(false);
      expect(result.error?.issues.at(0)?.message).toBe(message);
    }
  });

  it("bulkEditEntriesInput exige los cambios", () => {
    const result = bulkEditEntriesInput.safeParse({ ids: idsOf(1) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.path).toEqual(["changes"]);
  });
});

describe("updateEntryChanges (ADR 0013)", () => {
  const projectId = "1c6e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";
  const taskId = "2d7e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";

  /** El primer texto del rechazo, o `null` si pasa. */
  function messageOf(changes: unknown): string | null {
    const result = updateEntryChanges.safeParse(changes);
    return result.success ? null : (result.error.issues.at(0)?.message ?? "");
  }

  it("acepta cada grupo solo y conserva la descripción vacía, que reemplaza", () => {
    expect(updateEntryChanges.parse({ description: "" })).toEqual({ description: "" });
    expect(updateEntryChanges.parse({ description: "  reunión  " })).toEqual({
      description: "reunión",
    });
    expect(updateEntryChanges.parse({ project: { projectId, taskId } })).toEqual({
      project: { projectId, taskId },
    });
    expect(
      updateEntryChanges.parse({ project: { projectId: null, taskId: null } }),
    ).toEqual({ project: { projectId: null, taskId: null } });
    expect(
      updateEntryChanges.parse({
        times: { date: "2026-10-01", start: "22:00", end: "02:00" },
      }),
    ).toEqual({ times: { date: "2026-10-01", start: "22:00", end: "02:00" } });
    expect(
      updateEntryChanges.parse({ runningStart: { date: "2026-10-01", start: "08:00" } }),
    ).toEqual({ runningStart: { date: "2026-10-01", start: "08:00" } });
  });

  it("acepta varios grupos juntos", () => {
    const changes = {
      description: "x",
      project: { projectId, taskId: null },
      times: { date: "2026-10-01", start: "09:00", end: "10:00" },
    };
    expect(updateEntryChanges.parse(changes)).toEqual(changes);
  });

  it("rechaza un pedido sin ningún grupo con bulkNoChanges", () => {
    expect(messageOf({})).toBe(timeEntryMessages.bulkNoChanges);
    expect(messageOf({ description: undefined })).toBe(timeEntryMessages.bulkNoChanges);
  });

  it("el facturable es un grupo: solo, con el par, y solo booleano (11a)", () => {
    expect(updateEntryChanges.parse({ billable: false })).toEqual({ billable: false });
    expect(
      updateEntryChanges.parse({ project: { projectId, taskId: null }, billable: true }),
    ).toEqual({ project: { projectId, taskId: null }, billable: true });
    expect(messageOf({ billable: undefined })).toBe(timeEntryMessages.bulkNoChanges);
    for (const billable of ["true", 1, null]) {
      expect(updateEntryChanges.safeParse({ billable }).success).toBe(false);
    }
  });

  it("rechaza el trío y el inicio del timer juntos con unexpected", () => {
    expect(
      messageOf({
        times: { date: "2026-10-01", start: "09:00", end: "10:00" },
        runningStart: { date: "2026-10-01", start: "09:00" },
      }),
    ).toBe(timeEntryMessages.unexpected);
  });

  it("rechaza un grupo o una clave que no conoce, en cada nivel, con unexpected", () => {
    for (const changes of [
      { description: "x", tags: [] },
      { project: { projectId, taskId: null, billable: true } },
      { times: { date: "2026-10-01", start: "09:00", end: "10:00", extra: 1 } },
      { runningStart: { date: "2026-10-01", start: "09:00", end: "10:00" } },
    ]) {
      expect(messageOf(changes)).toBe(timeEntryMessages.unexpected);
    }
  });

  it("exige cada grupo entero", () => {
    for (const changes of [
      { project: { projectId } },
      { times: { date: "2026-10-01", start: "09:00" } },
      { runningStart: { start: "09:00" } },
    ]) {
      expect(updateEntryChanges.safeParse(changes).success).toBe(false);
    }
  });

  it("no deja viajar la tarea sin su proyecto (TT-70)", () => {
    const result = updateEntryChanges.safeParse({
      project: { projectId: null, taskId },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe(timeEntryMessages.taskNeedsProject);
    expect(result.error?.issues.at(0)?.path).toEqual(["project", "taskId"]);
  });

  it("valida cada campo con las reglas de la fila", () => {
    const cases = [
      [{ description: "a".repeat(3001) }, timeEntryMessages.descriptionTooLong],
      [{ description: "a\u0000b" }, timeEntryMessages.descriptionNullCharacter],
      [
        { times: { date: "2026-02-30", start: "09:00", end: "10:00" } },
        timeEntryMessages.invalidDate,
      ],
      [
        { times: { date: "2026-10-01", start: "9:00", end: "10:00" } },
        timeEntryMessages.invalidClock,
      ],
      [
        { runningStart: { date: "2026-10-01", start: "1:15 PM" } },
        timeEntryMessages.invalidClock,
      ],
      [
        { runningStart: { date: "01/10/2026", start: "09:00" } },
        timeEntryMessages.invalidDate,
      ],
    ] as const;
    for (const [changes, message] of cases) {
      expect(messageOf(changes)).toBe(message);
    }
  });

  it("updateEntryInput exige un id con forma de uuid y los cambios", () => {
    expect(
      updateEntryInput.safeParse({ id: "no-es-uuid", changes: { description: "x" } })
        .success,
    ).toBe(false);
    const result = updateEntryInput.safeParse({ id });
    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.path).toEqual(["changes"]);
    expect(updateEntryInput.parse({ id, changes: { description: " x " } })).toEqual({
      id,
      changes: { description: "x" },
    });
  });
});

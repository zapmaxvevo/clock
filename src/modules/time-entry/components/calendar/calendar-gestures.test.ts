import { describe, expect, it } from "vitest";

import type { TimeEntryView } from "@/modules/time-entry/schema";

import {
  autoScrollStep,
  candidateAt,
  dragStep,
  entryGesture,
  gridMinuteAt,
  initialCandidate,
  movedView,
  nearestColumn,
  NO_GESTURES,
  passedThreshold,
  segmentGestures,
  selectionAnchor,
  startsGesture,
  type GestureGrid,
} from "./calendar-gestures";
import {
  entrySegments,
  isOutsidePeriod,
  minuteHeight,
  slotAt,
  slotDraft,
  type ClosedEntryView,
} from "./calendar-layout";
import type { CalendarZoom } from "./calendar-zoom";

/** La semana del lunes 2026-09-28 al domingo 2026-10-04, sin huecos. */
const week = [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
];
const DAY = 1440;

function gridOf(zoom: CalendarZoom, overrides: Partial<GestureGrid> = {}): GestureGrid {
  return {
    days: week.map((date) => ({ date, beforeFloor: false, missingMinutes: [] })),
    minDayKey: "2026-01-01",
    zoom,
    ...overrides,
  };
}

/** La semana del adelanto de Madrid: el domingo 2026-03-29 no tiene de 02:00 a 03:00. */
const madridWeek = [
  "2026-03-23",
  "2026-03-24",
  "2026-03-25",
  "2026-03-26",
  "2026-03-27",
  "2026-03-28",
  "2026-03-29",
];

function madridGrid(zoom: CalendarZoom): GestureGrid {
  return {
    days: madridWeek.map((date) => ({
      date,
      beforeFloor: false,
      missingMinutes: date === "2026-03-29" ? [{ from: 120, to: 180 }] : [],
    })),
    minDayKey: "2026-01-01",
    zoom,
  };
}

function entry(
  dayDate: string,
  startClock: string,
  endClock: string | null,
  overrides: Partial<TimeEntryView> = {},
): TimeEntryView {
  return {
    id: "8d0f7a52-4c1e-4b8e-9a43-2f6a1c3e5b70",
    description: "Informe",
    startedAt: `${dayDate}T12:00:00.000Z`,
    endedAt: endClock === null ? null : `${dayDate}T13:00:00.000Z`,
    dayDate,
    weekStart: "2026-09-28",
    startLabel: startClock,
    endLabel: endClock,
    startClock,
    endClock,
    extraDays:
      endClock !== null && endClock <= startClock && endClock !== startClock ? 1 : 0,
    durationSeconds: endClock === null ? null : 3_600,
    durationLabel: endClock === null ? null : "1:00",
    editableTimes: endClock !== null,
    project: null,
    task: null,
    billable: false,
    tags: [],
    ...overrides,
  };
}

/** Una entrada cerrada, la que tienen los gestos. */
function closedEntry(
  dayDate: string,
  startClock: string,
  endClock: string,
  overrides: Partial<TimeEntryView> = {},
): ClosedEntryView {
  return { ...entry(dayDate, startClock, endClock, overrides), endClock };
}

/** Un punto de la recta: el día de la semana por índice y la hora. */
function at(dayIndex: number, clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return dayIndex * DAY + hours * 60 + minutes;
}

describe("segmentGestures (CAL-05, CAL-39, CAL-58, CAL-90, CAL-100)", () => {
  const closed = closedEntry("2026-09-30", "10:00", "11:00");
  const [only] = entrySegments(closed, week);

  it("una cerrada de un día se mueve y tiene las dos asas", () => {
    expect(segmentGestures(closed, only, true)).toEqual({
      move: true,
      start: true,
      end: true,
    });
  });

  it("sin permiso de carga no ofrece nada", () => {
    expect(segmentGestures(closed, only, false)).toEqual(NO_GESTURES);
  });

  it("el timer no ofrece nada (CAL-39), aunque la vista dijera que su trío se edita", () => {
    const running = entry("2026-09-30", "10:00", null, { editableTimes: true });
    const [segment] = entrySegments({ ...running, endClock: "11:00" }, week);
    expect(segmentGestures(running, segment, true)).toEqual(NO_GESTURES);
  });

  it("una entrada que el trío no expresa no ofrece nada (CAL-58)", () => {
    expect(segmentGestures({ ...closed, editableTimes: false }, only, true)).toEqual(
      NO_GESTURES,
    );
  });

  it("una de distancia de reloj cero se estira pero no se mueve (CAL-90)", () => {
    const zero = closedEntry("2026-09-30", "10:00", "10:00");
    const [segment] = entrySegments(zero, week);
    expect(segmentGestures(zero, segment, true)).toEqual({
      move: false,
      start: true,
      end: true,
    });
  });

  it("la que cruza la medianoche: el inicio en su día, el fin en el siguiente", () => {
    const overnight = closedEntry("2026-09-30", "22:00", "02:00");
    const [first, second] = entrySegments(overnight, week);
    expect(segmentGestures(overnight, first, true)).toEqual({
      move: true,
      start: true,
      end: false,
    });
    expect(segmentGestures(overnight, second, true)).toEqual({
      move: true,
      start: false,
      end: true,
    });
  });

  it("la que termina a las 00:00 tiene el asa de fin en el día de inicio", () => {
    const toMidnight = closedEntry("2026-09-30", "22:00", "00:00");
    const segments = entrySegments(toMidnight, week);
    expect(segments).toHaveLength(1);
    expect(segmentGestures(toMidnight, segments[0], true).end).toBe(true);
  });

  it("en la hora repetida de un atraso, el segmento no termina donde la entrada: sin asa de fin", () => {
    // 02:30 en la primera pasada a 02:15 en la segunda (Madrid, 2026-10-25).
    const repeated = closedEntry("2026-10-01", "02:30", "02:15", { extraDays: 0 });
    const [segment] = entrySegments(repeated, week);
    expect(segment.to).toBe(150);
    expect(segmentGestures(repeated, segment, true).end).toBe(false);
  });

  it("la que empezó antes o termina después del período no tiene el asa de ese extremo", () => {
    const fromBefore = closedEntry("2026-09-27", "22:00", "02:00");
    const [monday] = entrySegments(fromBefore, week);
    expect(segmentGestures(fromBefore, monday, true)).toEqual({
      move: true,
      start: false,
      end: true,
    });
    const pastEnd = closedEntry("2026-10-04", "22:00", "02:00");
    const [sunday] = entrySegments(pastEnd, week);
    expect(segmentGestures(pastEnd, sunday, true)).toEqual({
      move: true,
      start: true,
      end: false,
    });
  });
});

describe("entryGesture", () => {
  it("el inicio en la recta, la distancia de reloj y el punto tomado", () => {
    const gesture = entryGesture(
      "move",
      closedEntry("2026-09-30", "10:00", "11:30"),
      week,
      at(2, "10:20"),
    );
    expect(gesture).toEqual({
      kind: "move",
      entryId: "8d0f7a52-4c1e-4b8e-9a43-2f6a1c3e5b70",
      original: { date: "2026-09-30", start: "10:00", end: "11:30" },
      start: at(2, "10:00"),
      span: 90,
      grab: 20,
    });
  });

  it("la que empezó el día anterior al período empieza en negativo", () => {
    const gesture = entryGesture(
      "end",
      closedEntry("2026-09-27", "22:00", "02:00"),
      week,
      60,
    );
    expect(gesture.start).toBe(-120);
    expect(gesture.span).toBe(240);
    expect(gesture.grab).toBe(0);
  });
});

describe("dragStep (CAL-53)", () => {
  it("15 minutos, o el zoom si es más chico", () => {
    expect(dragStep(60)).toBe(15);
    expect(dragStep(30)).toBe(15);
    expect(dragStep(15)).toBe(15);
    expect(dragStep(5)).toBe(5);
  });
});

describe("candidateAt: mover (CAL-50, CAL-51, CAL-53, CAL-57, CAL-61)", () => {
  const hour = closedEntry("2026-09-30", "10:00", "11:00");

  it("lleva el bloque al día y a la marca bajo el puntero, con su distancia de reloj", () => {
    const gesture = entryGesture("move", hour, week, at(2, "10:30"));
    expect(candidateAt(gesture, at(3, "14:40"), gridOf(60))).toEqual({
      date: "2026-10-01",
      start: "14:15",
      end: "15:15",
    });
  });

  it("ajusta a la marca más cercana con el paso de cada zoom", () => {
    const gesture = entryGesture("move", hour, week, at(2, "10:00"));
    expect(candidateAt(gesture, at(2, "13:20"), gridOf(60))?.start).toBe("13:15");
    expect(candidateAt(gesture, at(2, "13:20"), gridOf(30))?.start).toBe("13:15");
    expect(candidateAt(gesture, at(2, "13:20"), gridOf(15))?.start).toBe("13:15");
    expect(candidateAt(gesture, at(2, "13:23"), gridOf(5))?.start).toBe("13:25");
  });

  it("con el zoom en 60 va de a 15 minutos: la marca cambia pasada la mitad del paso", () => {
    const gesture = entryGesture("move", hour, week, at(2, "10:00"));
    expect(candidateAt(gesture, at(2, "13:07"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "13:00",
      end: "14:00",
    });
    expect(candidateAt(gesture, at(2, "13:08"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "13:15",
      end: "14:15",
    });
  });

  it("de vuelta en su marca de casa, el original: una de 10:07 no se escribe a 10:00", () => {
    const offMark = closedEntry("2026-09-30", "10:07", "10:37");
    const gesture = entryGesture("move", offMark, week, at(2, "10:17"));
    expect(candidateAt(gesture, at(2, "10:14"), gridOf(60))).toEqual(gesture.original);
    expect(candidateAt(gesture, at(2, "10:19"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "10:15",
      end: "10:45",
    });
    expect(candidateAt(gesture, at(2, "11:17"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "11:00",
      end: "11:30",
    });
  });

  it("pasa a cruzar la medianoche y queda en dos segmentos (CAL-54)", () => {
    const late = closedEntry("2026-09-28", "22:00", "23:30");
    const gesture = entryGesture("move", late, week, at(0, "22:00"));
    const candidate = candidateAt(gesture, at(0, "23:00"), gridOf(60));
    expect(candidate).toEqual({ date: "2026-09-28", start: "23:00", end: "00:30" });
  });

  it("tomada de un segundo segmento, puede quedar empezando el día anterior al período", () => {
    const overnight = closedEntry("2026-09-27", "22:00", "02:00");
    const gesture = entryGesture("move", overnight, week, at(0, "01:00"));
    expect(candidateAt(gesture, at(0, "02:00"), gridOf(60))).toEqual({
      date: "2026-09-27",
      start: "23:00",
      end: "03:00",
    });
    // El puntero en el borde de arriba: el inicio queda donde lo deja el agarre,
    // a una hora del período.
    expect(candidateAt(gesture, 0, gridOf(60))).toEqual({
      date: "2026-09-27",
      start: "21:00",
      end: "01:00",
    });
  });

  it("tomada lejos de su inicio, el tope de arriba le deja un paso en el período", () => {
    const longer = closedEntry("2026-09-27", "20:00", "02:00");
    // Tomada a las 01:50 del lunes: con el puntero arriba, el inicio quedaría a
    // las 18:10 del domingo y el bloque no tendría nada en el período.
    const gesture = entryGesture("move", longer, week, at(0, "01:50"));
    expect(candidateAt(gesture, 0, gridOf(60))).toEqual({
      date: "2026-09-27",
      start: "18:15",
      end: "00:15",
    });
  });

  it("no sale por el final: empieza a lo sumo en el último paso", () => {
    const gesture = entryGesture("move", hour, week, at(2, "10:00"));
    expect(candidateAt(gesture, 7 * DAY, gridOf(60))).toEqual({
      date: "2026-10-04",
      start: "23:45",
      end: "00:45",
    });
  });

  it("en los bordes, el bloque soltado nunca queda fuera del período (CAL-46)", () => {
    const overnight = closedEntry("2026-09-27", "22:00", "02:00");
    for (const zoom of [60, 30, 15, 5] as const) {
      const fromSecond = entryGesture("move", overnight, week, at(0, "01:30"));
      const fromHour = entryGesture("move", hour, week, at(2, "10:30"));
      for (const candidate of [
        candidateAt(fromSecond, 0, gridOf(zoom)),
        candidateAt(fromHour, 0, gridOf(zoom)),
        candidateAt(fromHour, 7 * DAY, gridOf(zoom)),
      ]) {
        expect(candidate).not.toBeNull();
        const times = candidate ?? { date: "", start: "", end: "" };
        expect(
          isOutsidePeriod(
            {
              dayDate: times.date,
              startClock: times.start,
              endClock: times.end,
              extraDays: times.end <= times.start ? 1 : 0,
            },
            week,
          ),
        ).toBe(false);
      }
    }
  });

  it("no empieza antes del piso de fechas (CAL-48)", () => {
    const grid = gridOf(60, {
      minDayKey: "2026-09-30",
      days: week.map((date) => ({
        date,
        beforeFloor: date < "2026-09-30",
        missingMinutes: [],
      })),
    });
    const gesture = entryGesture(
      "move",
      closedEntry("2026-10-01", "10:00", "11:00"),
      week,
      at(3, "10:00"),
    );
    expect(candidateAt(gesture, at(0, "10:00"), grid)).toEqual({
      date: "2026-09-30",
      start: "00:00",
      end: "01:00",
    });
  });

  it("con un extremo en un minuto que no existe, no hay candidato (CAL-30, CAL-59)", () => {
    const sunday = closedEntry("2026-03-29", "00:00", "01:00");
    const gesture = entryGesture("move", sunday, madridWeek, at(6, "00:00"));
    expect(candidateAt(gesture, at(6, "02:00"), madridGrid(60))).toBeNull();
    expect(candidateAt(gesture, at(6, "01:30"), madridGrid(30))).toBeNull();
    expect(candidateAt(gesture, at(6, "03:00"), madridGrid(60))?.start).toBe("03:00");
  });
});

describe("candidateAt: estirar (CAL-52, CAL-55, CAL-56, CAL-57)", () => {
  const offStart = closedEntry("2026-09-30", "10:07", "11:00");
  const offEnd = closedEntry("2026-09-30", "09:00", "10:07");

  it("el asa de inicio mueve solo el inicio; el fin conserva su rótulo", () => {
    const gesture = entryGesture("start", offStart, week, at(2, "10:07"));
    expect(candidateAt(gesture, at(2, "08:50"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "08:45",
      end: "11:00",
    });
  });

  it("el inicio de 10:07 que vuelve a su marca de casa toma su valor original", () => {
    const gesture = entryGesture("start", offStart, week, at(2, "10:07"));
    expect(candidateAt(gesture, at(2, "10:05"), gridOf(60))).toEqual(gesture.original);
    expect(candidateAt(gesture, at(2, "10:25"), gridOf(60))?.start).toBe("10:30");
  });

  it("el inicio se detiene en la última marca anterior al fin y a 24 horas de él", () => {
    const gesture = entryGesture("start", offStart, week, at(2, "10:07"));
    expect(candidateAt(gesture, at(2, "13:00"), gridOf(60))?.start).toBe("10:45");
    expect(candidateAt(gesture, at(0, "00:00"), gridOf(60))).toEqual({
      date: "2026-09-29",
      start: "11:15",
      end: "11:00",
    });
  });

  it("con el zoom en 60, cada extremo va de a 15 minutos y se queda en su marca de casa", () => {
    const nine = closedEntry("2026-09-30", "09:00", "10:00");
    const end = entryGesture("end", nine, week, at(2, "10:00"));
    expect(candidateAt(end, at(2, "10:07"), gridOf(60))).toEqual(end.original);
    expect(candidateAt(end, at(2, "10:08"), gridOf(60))?.end).toBe("10:15");
    const start = entryGesture("start", nine, week, at(2, "09:00"));
    expect(candidateAt(start, at(2, "08:37"), gridOf(60))?.start).toBe("08:30");
    expect(candidateAt(start, at(2, "08:38"), gridOf(60))?.start).toBe("08:45");
  });

  it("deja al menos un paso entre los extremos (CAL-56)", () => {
    const nine = closedEntry("2026-09-30", "09:00", "10:00");
    const end = entryGesture("end", nine, week, at(2, "10:00"));
    expect(candidateAt(end, at(2, "07:00"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "09:00",
      end: "09:15",
    });
    const start = entryGesture("start", nine, week, at(2, "09:00"));
    expect(candidateAt(start, at(2, "12:00"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "09:45",
      end: "10:00",
    });
  });

  it("el inicio no pasa al piso de fechas (CAL-48)", () => {
    const grid = gridOf(60, {
      minDayKey: "2026-09-30",
      days: week.map((date) => ({
        date,
        beforeFloor: date < "2026-09-30",
        missingMinutes: [],
      })),
    });
    const gesture = entryGesture(
      "start",
      closedEntry("2026-09-30", "10:00", "11:00"),
      week,
      at(2, "10:00"),
    );
    expect(candidateAt(gesture, at(1, "23:00"), grid)).toEqual({
      date: "2026-09-30",
      start: "00:00",
      end: "11:00",
    });
  });

  it("el asa de fin mueve solo el fin, y sigue a la columna siguiente (CAL-54)", () => {
    const gesture = entryGesture(
      "end",
      closedEntry("2026-09-29", "10:00", "11:00"),
      week,
      0,
    );
    expect(candidateAt(gesture, at(1, "12:40"), gridOf(30))).toEqual({
      date: "2026-09-29",
      start: "10:00",
      end: "12:45",
    });
    expect(candidateAt(gesture, at(1, "09:00"), gridOf(30))?.end).toBe("10:15");
    const late = entryGesture(
      "end",
      closedEntry("2026-09-30", "22:00", "23:00"),
      week,
      0,
    );
    expect(candidateAt(late, at(3, "23:00"), gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "22:00",
      end: "21:45",
    });
  });

  it("el fin de 10:07 que vuelve a su marca de casa toma su valor original", () => {
    const gesture = entryGesture("end", offEnd, week, at(2, "10:07"));
    expect(candidateAt(gesture, at(2, "09:55"), gridOf(60))).toEqual(gesture.original);
    expect(candidateAt(gesture, at(2, "11:10"), gridOf(60))?.end).toBe("11:15");
  });

  it("el fin al final del período es 24:00, escrito «00:00» (TT-72)", () => {
    const gesture = entryGesture(
      "end",
      closedEntry("2026-10-04", "22:00", "23:00"),
      week,
      0,
    );
    expect(candidateAt(gesture, 7 * DAY, gridOf(60))?.end).toBe("00:00");
  });

  it("un extremo estirado a un minuto que no existe no da candidato", () => {
    const start = entryGesture(
      "start",
      closedEntry("2026-03-29", "05:00", "06:00"),
      madridWeek,
      0,
    );
    expect(candidateAt(start, at(6, "02:30"), madridGrid(30))).toBeNull();
    const end = entryGesture(
      "end",
      closedEntry("2026-03-29", "00:00", "01:00"),
      madridWeek,
      0,
    );
    expect(candidateAt(end, at(6, "02:00"), madridGrid(60))).toBeNull();
    expect(candidateAt(end, at(6, "03:00"), madridGrid(60))?.end).toBe("03:00");
    // Con el paso de 15 minutos, el fin llega a la última marca antes del salto.
    expect(candidateAt(end, at(6, "01:50"), madridGrid(60))?.end).toBe("01:45");
    expect(candidateAt(end, at(6, "02:20"), madridGrid(60))).toBeNull();
  });
});

describe("candidateAt: crear (CAL-44)", () => {
  const friday = 4;

  it("cubre las celdas del paso entre la tocada y la del puntero, hacia abajo y hacia arriba", () => {
    const down = { kind: "create", dayIndex: friday, anchor: 510 } as const;
    expect(candidateAt(down, at(friday, "09:35"), gridOf(15))).toEqual({
      date: "2026-10-02",
      start: "08:30",
      end: "09:45",
    });
    const up = { kind: "create", dayIndex: friday, anchor: 570 } as const;
    expect(candidateAt(up, at(friday, "08:20"), gridOf(15))).toEqual({
      date: "2026-10-02",
      start: "08:15",
      end: "09:45",
    });
  });

  it("con el zoom en 60, cubre las celdas de 15 minutos en las dos direcciones", () => {
    const anchor = { kind: "create", dayIndex: friday, anchor: 630 } as const;
    expect(candidateAt(anchor, at(friday, "11:10"), gridOf(60))).toEqual({
      date: "2026-10-02",
      start: "10:30",
      end: "11:15",
    });
    expect(candidateAt(anchor, at(friday, "09:50"), gridOf(60))).toEqual({
      date: "2026-10-02",
      start: "09:45",
      end: "10:45",
    });
  });

  it("mide como máximo 24 horas menos un paso, recortada del lado del puntero", () => {
    const fromTop = { kind: "create", dayIndex: 0, anchor: 0 } as const;
    expect(candidateAt(fromTop, at(0, "23:59"), gridOf(60))).toEqual({
      date: "2026-09-28",
      start: "00:00",
      end: "23:45",
    });
    const fromBottom = { kind: "create", dayIndex: 0, anchor: 1425 } as const;
    expect(candidateAt(fromBottom, at(0, "00:00"), gridOf(60))).toEqual({
      date: "2026-09-28",
      start: "00:15",
      end: "00:00",
    });
  });

  it("con un extremo en un minuto que no existe, no hay candidato", () => {
    const gesture = { kind: "create", dayIndex: 6, anchor: 60 } as const;
    expect(candidateAt(gesture, at(6, "02:10"), madridGrid(30))).toBeNull();
    // Hacia arriba, con el inicio en el hueco.
    const up = { kind: "create", dayIndex: 6, anchor: 240 } as const;
    expect(candidateAt(up, at(6, "02:10"), madridGrid(30))).toBeNull();
    expect(candidateAt(up, at(6, "03:10"), madridGrid(30))?.start).toBe("03:00");
    // Un fin a las 02:00 tampoco existe: el reloj pasa de 01:59 a 03:00.
    expect(candidateAt(gesture, at(6, "01:50"), madridGrid(30))).toBeNull();
    expect(candidateAt(gesture, at(6, "01:10"), madridGrid(30))?.end).toBe("01:15");
  });

  it("parte del mismo borrador que un clic (CAL-43)", () => {
    const gesture = { kind: "create", dayIndex: 6, anchor: 60 } as const;
    expect(initialCandidate(gesture, madridGrid(60))).toEqual(
      slotDraft("2026-03-29", 60, 60, [{ from: 120, to: 180 }]),
    );
  });

  it("el clic sin recorrido no cambia: el ancla es la celda del paso, el borrador el de la franja", () => {
    const tenForty = 640 * minuteHeight(60);
    const day = { beforeFloor: false, missingMinutes: [] };
    expect(slotAt(day, tenForty, 60, true)).toBe(600);
    const anchor = selectionAnchor(tenForty, 60);
    expect(anchor).toBe(630);
    const gesture = { kind: "create", dayIndex: friday, anchor } as const;
    expect(initialCandidate(gesture, gridOf(60))).toEqual({
      date: "2026-10-02",
      start: "10:00",
      end: "11:00",
    });
    // Madrid, con el ancla en 01:15: la franja de 01:00 llega al final del hueco.
    const madrid = { kind: "create", dayIndex: 6, anchor: 75 } as const;
    expect(initialCandidate(madrid, madridGrid(60))).toEqual({
      date: "2026-03-29",
      start: "01:00",
      end: "03:00",
    });
  });
});

describe("selectionAnchor (CAL-44)", () => {
  it("la celda del paso bajo el puntero, dentro del día", () => {
    expect(selectionAnchor(640 * minuteHeight(60), 60)).toBe(630);
    expect(selectionAnchor(642 * minuteHeight(5), 5)).toBe(640);
    expect(selectionAnchor(-30, 60)).toBe(0);
    expect(selectionAnchor(1440 * minuteHeight(60), 60)).toBe(1425);
    expect(selectionAnchor(1440 * minuteHeight(5), 5)).toBe(1435);
  });
});

describe("initialCandidate", () => {
  it("en un gesto sobre una entrada, su trío", () => {
    const gesture = entryGesture(
      "move",
      closedEntry("2026-09-30", "10:07", "11:00"),
      week,
      0,
    );
    expect(initialCandidate(gesture, gridOf(60))).toEqual({
      date: "2026-09-30",
      start: "10:07",
      end: "11:00",
    });
  });
});

describe("movedView (ADR 0012)", () => {
  it("dibuja la entrada con el trío nuevo, en el formato de la persona", () => {
    const original = closedEntry("2026-09-30", "10:00", "11:00");
    expect(
      movedView(original, { date: "2026-10-01", start: "23:00", end: "00:30" }, "12h"),
    ).toEqual({
      ...original,
      dayDate: "2026-10-01",
      startClock: "23:00",
      endClock: "00:30",
      extraDays: 1,
      startLabel: "11:00 PM",
      endLabel: "12:30 AM",
      durationSeconds: 5_400,
      durationLabel: "1:30",
    });
  });
});

describe("gridMinuteAt", () => {
  it("el punto de la columna con la escala del zoom, acotado a ella", () => {
    expect(gridMinuteAt(2, 10 * 48, 60)).toBe(at(2, "10:00"));
    expect(gridMinuteAt(2, 10 * 48, 30)).toBe(at(2, "05:00"));
    expect(gridMinuteAt(2, -30, 60)).toBe(at(2, "00:00"));
    expect(gridMinuteAt(2, 30 * 48, 60)).toBe(3 * DAY);
  });
});

describe("nearestColumn (CAL-61)", () => {
  const columns = [
    { index: 0, left: 100, right: 200 },
    { index: 1, left: 200, right: 300 },
    { index: 2, left: 300, right: 400 },
  ];

  it("la columna cuyo ancho contiene el puntero, con el borde derecho en la siguiente", () => {
    expect(nearestColumn(columns, 150)?.index).toBe(0);
    expect(nearestColumn(columns, 200)?.index).toBe(1);
    expect(nearestColumn(columns, 399)?.index).toBe(2);
  });

  it("fuera de las columnas, la más cercana: el puntero no sale del período", () => {
    expect(nearestColumn(columns, 20)?.index).toBe(0);
    expect(nearestColumn(columns, 400)?.index).toBe(2);
    expect(nearestColumn(columns, 900)?.index).toBe(2);
  });

  it("sin columnas, ninguna", () => {
    expect(nearestColumn([], 150)).toBeUndefined();
  });
});

describe("startsGesture (ADR 0014)", () => {
  it("solo el botón principal del mouse", () => {
    expect(startsGesture({ pointerType: "mouse", button: 0, isPrimary: true })).toBe(
      true,
    );
    expect(startsGesture({ pointerType: "touch", button: 0, isPrimary: true })).toBe(
      false,
    );
    expect(startsGesture({ pointerType: "pen", button: 0, isPrimary: true })).toBe(false);
    expect(startsGesture({ pointerType: "mouse", button: 2, isPrimary: true })).toBe(
      false,
    );
    expect(startsGesture({ pointerType: "mouse", button: 0, isPrimary: false })).toBe(
      false,
    );
  });
});

describe("passedThreshold", () => {
  it("desde 4 px de recorrido deja de ser un clic", () => {
    expect(passedThreshold(3, 0)).toBe(false);
    expect(passedThreshold(2, 2)).toBe(false);
    expect(passedThreshold(4, 0)).toBe(true);
    expect(passedThreshold(0, -4)).toBe(true);
    expect(passedThreshold(3, 3)).toBe(true);
  });
});

describe("autoScrollStep", () => {
  it("cero fuera de la banda, y más rápido cuanto más cerca del borde", () => {
    expect(autoScrollStep(40)).toBe(0);
    expect(autoScrollStep(32)).toBe(0);
    expect(autoScrollStep(31)).toBe(1);
    expect(autoScrollStep(16)).toBe(8);
    expect(autoScrollStep(0)).toBe(16);
    expect(autoScrollStep(-10)).toBe(16);
  });
});

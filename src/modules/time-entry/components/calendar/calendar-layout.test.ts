import { describe, expect, it } from "vitest";

import type { TimeEntryView } from "@/modules/time-entry/schema";

import {
  addEntryDraft,
  chronological,
  entrySegments,
  initialScrollMinute,
  isMissing,
  isOutsidePeriod,
  layoutColumn,
  MIN_BLOCK_HEIGHT_PX,
  minuteAt,
  nowPosition,
  runningSegments,
  slotAt,
  slotDraft,
  slotOf,
} from "./calendar-layout";

/** La semana del lunes 2026-09-28 al domingo 2026-10-04. */
const week = [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
];

function closed(
  dayDate: string,
  startClock: string,
  endClock: string,
  extraDays = 0,
): { dayDate: string; startClock: string; endClock: string; extraDays: number } {
  return { dayDate, startClock, endClock, extraDays };
}

describe("entrySegments", () => {
  it("una entrada de un día da un segmento con sus minutos de reloj", () => {
    expect(entrySegments(closed("2026-09-30", "09:00", "10:30"), week)).toEqual([
      { date: "2026-09-30", from: 540, to: 630, startsHere: true, firstVisible: true },
    ]);
  });

  it("la que cruza la medianoche da un segmento por día; solo el primero lleva el horario", () => {
    expect(entrySegments(closed("2026-10-01", "22:00", "02:00", 1), week)).toEqual([
      { date: "2026-10-01", from: 1320, to: 1440, startsHere: true, firstVisible: true },
      { date: "2026-10-02", from: 0, to: 120, startsHere: false, firstVisible: false },
    ]);
  });

  it("la de más de un día tiene los días del medio de alto completo", () => {
    const segments = entrySegments(closed("2026-09-28", "18:00", "06:00", 2), week);
    expect(segments.map((segment) => [segment.date, segment.from, segment.to])).toEqual([
      ["2026-09-28", 1080, 1440],
      ["2026-09-29", 0, 1440],
      ["2026-09-30", 0, 360],
    ]);
  });

  it("la que termina a las 00:00 no dibuja nada en el día siguiente", () => {
    expect(entrySegments(closed("2026-10-01", "22:00", "00:00", 1), week)).toEqual([
      { date: "2026-10-01", from: 1320, to: 1440, startsHere: true, firstVisible: true },
    ]);
  });

  it("la de duración cero de 00:00 a 00:00 da un segmento en su día", () => {
    expect(entrySegments(closed("2026-10-01", "00:00", "00:00"), week)).toEqual([
      { date: "2026-10-01", from: 0, to: 0, startsHere: true, firstVisible: true },
    ]);
  });

  it("en la hora repetida el fin de reloj antes del inicio no da altura negativa", () => {
    expect(entrySegments(closed("2026-10-01", "02:30", "02:15"), week)).toEqual([
      { date: "2026-10-01", from: 150, to: 150, startsHere: true, firstVisible: true },
    ]);
  });

  it("se recorta al período: la que empezó antes muestra solo sus días visibles", () => {
    expect(entrySegments(closed("2026-09-27", "20:00", "03:00", 1), week)).toEqual([
      { date: "2026-09-28", from: 0, to: 180, startsHere: false, firstVisible: true },
    ]);
  });

  it("la que termina después del período muestra solo hasta el último día", () => {
    expect(entrySegments(closed("2026-10-04", "23:00", "01:00", 1), week)).toEqual([
      { date: "2026-10-04", from: 1380, to: 1440, startsHere: true, firstVisible: true },
    ]);
  });

  it("una entrada fuera del período no da segmentos", () => {
    expect(entrySegments(closed("2026-09-25", "09:00", "10:00"), week)).toEqual([]);
    expect(entrySegments(closed("2026-10-05", "09:00", "10:00"), week)).toEqual([]);
    // Termina exactamente al principio del período.
    expect(entrySegments(closed("2026-09-27", "22:00", "00:00", 1), week)).toEqual([]);
  });

  it("en la vista día dibuja solo ese día", () => {
    expect(
      entrySegments(closed("2026-10-01", "22:00", "02:00", 1), ["2026-10-02"]),
    ).toEqual([
      { date: "2026-10-02", from: 0, to: 120, startsHere: false, firstVisible: true },
    ]);
  });
});

describe("runningSegments", () => {
  it("el timer llega hasta la línea de ahora", () => {
    const now = { date: "2026-10-02", minute: 615 };
    expect(
      runningSegments({ dayDate: "2026-10-02", startClock: "00:00" }, now, week),
    ).toEqual([
      { date: "2026-10-02", from: 0, to: 615, startsHere: true, firstVisible: true },
    ]);
  });

  it("el que empezó ayer dibuja ayer hasta la medianoche y hoy hasta ahora", () => {
    const now = { date: "2026-10-02", minute: 60 };
    expect(
      runningSegments({ dayDate: "2026-10-01", startClock: "23:00" }, now, week),
    ).toEqual([
      { date: "2026-10-01", from: 1380, to: 1440, startsHere: true, firstVisible: true },
      { date: "2026-10-02", from: 0, to: 60, startsHere: false, firstVisible: false },
    ]);
  });

  it("en una semana sin el timer no dibuja nada (CAL-93)", () => {
    const now = { date: "2026-10-05", minute: 60 };
    expect(
      runningSegments({ dayDate: "2026-10-05", startClock: "00:00" }, now, week),
    ).toEqual([]);
  });

  it("un ahora anterior al inicio deja el bloque en cero, no al revés", () => {
    const now = { date: "2026-10-01", minute: 1439 };
    expect(
      runningSegments({ dayDate: "2026-10-02", startClock: "00:00" }, now, week),
    ).toEqual([
      { date: "2026-10-02", from: 0, to: 0, startsHere: true, firstVisible: true },
    ]);
  });
});

describe("nowPosition", () => {
  const anchor = {
    todayKey: "2026-10-02",
    nowMinute: 600,
    serverNow: "2026-10-02T13:00:20.000Z",
  };

  it("sin tiempo transcurrido es el minuto del servidor", () => {
    expect(nowPosition(anchor, 0)).toEqual({ date: "2026-10-02", minute: 600 });
  });

  it("suma los segundos que el servidor ya llevaba de su minuto", () => {
    expect(nowPosition(anchor, 39)).toEqual({ date: "2026-10-02", minute: 600 });
    expect(nowPosition(anchor, 40)).toEqual({ date: "2026-10-02", minute: 601 });
  });

  it("en el último minuto pasa de día a la medianoche", () => {
    const last = { ...anchor, nowMinute: 1439, serverNow: "2026-10-03T02:59:00.000Z" };
    expect(nowPosition(last, 59)).toEqual({ date: "2026-10-02", minute: 1439 });
    expect(nowPosition(last, 60)).toEqual({ date: "2026-10-03", minute: 0 });
  });

  it("varios días después sigue en el día que corresponde", () => {
    expect(nowPosition(anchor, 2 * 86_400 + 60)).toEqual({
      date: "2026-10-04",
      minute: 601,
    });
  });
});

describe("isMissing", () => {
  const madridSpring = [{ from: 120, to: 180 }];

  it("los minutos del hueco no existen; el fin del rango sí", () => {
    expect(isMissing(119, madridSpring)).toBe(false);
    expect(isMissing(120, madridSpring)).toBe(true);
    expect(isMissing(179, madridSpring)).toBe(true);
    expect(isMissing(180, madridSpring)).toBe(false);
  });

  it("un día sin cambio de horario no tiene minutos faltantes", () => {
    expect(isMissing(120, [])).toBe(false);
  });
});

describe("initialScrollMinute", () => {
  it("con hoy en el período, la línea de ahora queda una hora por debajo del borde", () => {
    expect(initialScrollMinute({ date: "2026-10-02", minute: 600 }, week)).toBe(540);
  });

  it("temprano a la mañana no sube más allá de las 00:00", () => {
    expect(initialScrollMinute({ date: "2026-10-02", minute: 30 }, week)).toBe(0);
  });

  it("en un período sin hoy, las 08:00 arriba", () => {
    expect(initialScrollMinute({ date: "2026-10-12", minute: 600 }, week)).toBe(480);
  });
});

describe("layoutColumn", () => {
  function item(key: string, from: number, to: number) {
    return { key, from, to };
  }

  function lanesOf(placed: ReturnType<typeof layoutColumn>) {
    return placed.map((block) => [block.item.key, block.lane, block.lanes]);
  }

  it("una entrada sola ocupa todo el ancho, a la altura de su reloj", () => {
    expect(layoutColumn([item("a", 540, 600)], 60)).toEqual([
      { item: item("a", 540, 600), top: 540 * 0.8, height: 60 * 0.8, lane: 0, lanes: 1 },
    ]);
  });

  it("el zoom cambia la escala: a 5 minutos, un minuto mide 9,6 px", () => {
    const [block] = layoutColumn([item("a", 10, 20)], 5);
    expect(block.top).toBeCloseTo(96);
    expect(block.height).toBeCloseTo(96);
  });

  it("dos que se pisan van lado a lado; la que sigue después, en ancho completo", () => {
    const placed = layoutColumn(
      [item("a", 540, 600), item("b", 540, 600), item("c", 600, 660)],
      60,
    );
    expect(lanesOf(placed)).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
  });

  it("las que solo se tocan no comparten el ancho", () => {
    expect(lanesOf(layoutColumn([item("a", 540, 600), item("b", 600, 660)], 60))).toEqual(
      [
        ["a", 0, 1],
        ["b", 0, 1],
      ],
    );
  });

  it("dos bloques de segundos en el mismo minuto se pisan por la altura mínima", () => {
    const placed = layoutColumn([item("a", 540, 540), item("b", 540, 540)], 60);
    expect(placed.map((block) => block.height)).toEqual([
      MIN_BLOCK_HEIGHT_PX,
      MIN_BLOCK_HEIGHT_PX,
    ]);
    expect(lanesOf(placed)).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
    ]);
  });

  it("la altura mínima también junta a una corta con la que empieza poco después", () => {
    // 540 → 432 px y 22 px de alto; 560 → 448 px, dentro de esos 22.
    expect(lanesOf(layoutColumn([item("a", 540, 541), item("b", 560, 620)], 60))).toEqual(
      [
        ["a", 0, 2],
        ["b", 1, 2],
      ],
    );
  });

  it("un grupo encadenado reparte el ancho y reusa el carril que se libera justo cuando empieza otra", () => {
    const placed = layoutColumn(
      [
        item("a", 540, 660),
        item("b", 560, 600),
        item("c", 600, 700),
        item("d", 720, 780),
      ],
      60,
    );
    expect(lanesOf(placed)).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 1, 2],
      ["d", 0, 1],
    ]);
  });

  it("dos del mismo minuto siguen el orden de llegada, no el de la clave (CAL-76)", () => {
    // `entries` llega por inicio y después por id; la clave puede ordenar al revés.
    const placed = layoutColumn([item("z", 540, 600), item("a", 540, 600)], 60);
    expect(lanesOf(placed)).toEqual([
      ["z", 0, 2],
      ["a", 1, 2],
    ]);
  });

  it("en la hora repetida de un atraso el DOM sigue el orden de llegada, no el reloj", () => {
    // 02:30 en la primera pasada y 02:15 en la segunda: la segunda empezó
    // después aunque su reloj marque antes.
    const placed = layoutColumn(
      [item("primera", 150, 165), item("segunda", 135, 140), item("despues", 240, 300)],
      60,
    );
    expect(placed.map((block) => block.item.key)).toEqual([
      "primera",
      "segunda",
      "despues",
    ]);
    // Los carriles se reparten por el reloj: la de las 02:15 queda en el primero.
    expect(lanesOf(placed)).toEqual([
      ["primera", 1, 2],
      ["segunda", 0, 2],
      ["despues", 0, 1],
    ]);
  });
});

describe("chronological", () => {
  function view(id: string, startedAt: string, running = false): TimeEntryView {
    return {
      id,
      description: "",
      startedAt,
      endedAt: running ? null : "2026-10-02T20:00:00.000Z",
      dayDate: "2026-10-02",
      weekStart: "2026-09-28",
      startLabel: "",
      endLabel: running ? null : "",
      startClock: "00:00",
      endClock: running ? null : "17:00",
      extraDays: 0,
      durationSeconds: running ? null : 0,
      durationLabel: running ? null : "0:00",
      editableTimes: !running,
      project: null,
      task: null,
      billable: false,
      tags: [],
    };
  }

  const closed = view("4b000000-0000-4000-8000-000000000000", "2026-10-02T12:00:00.000Z");
  const later = view("2c000000-0000-4000-8000-000000000000", "2026-10-02T14:00:00.000Z");

  it("sin timer deja las cerradas por inicio", () => {
    expect(chronological([closed, later], null)).toEqual([closed, later]);
  });

  it("un timer que empezó antes que una cerrada va primero, no al final", () => {
    const timer = view(
      "9f000000-0000-4000-8000-000000000000",
      "2026-10-02T03:00:00.000Z",
      true,
    );
    expect(chronological([closed, later], timer)).toEqual([timer, closed, later]);
  });

  it("con el mismo instante desempata por id, como la lectura del repository", () => {
    const timer = view("1a000000-0000-4000-8000-000000000000", closed.startedAt, true);
    expect(chronological([closed, later], timer)).toEqual([timer, closed, later]);
  });
});

describe("minuteAt", () => {
  it("ajusta hacia abajo a la franja: a 1 h, cualquier punto de la franja es su inicio", () => {
    expect(minuteAt(0, 60)).toBe(0);
    expect(minuteAt(10 * 48, 60)).toBe(600);
    expect(minuteAt(10 * 48 + 47.9, 60)).toBe(600);
    expect(minuteAt(11 * 48, 60)).toBe(660);
  });

  it("con otro zoom, cada franja de 48 px son esos minutos", () => {
    expect(minuteAt(3 * 48 + 20, 15)).toBe(45);
    expect(minuteAt(7 * 48, 5)).toBe(35);
  });

  it("no sale del día por arriba ni por abajo", () => {
    expect(minuteAt(-5, 60)).toBe(0);
    expect(minuteAt(24 * 48, 60)).toBe(1380);
    expect(minuteAt(288 * 48 + 10, 5)).toBe(1435);
  });
});

describe("slotDraft", () => {
  it("propone la franja tocada y una franja de largo", () => {
    expect(slotDraft("2026-09-30", 600, 60, [])).toEqual({
      date: "2026-09-30",
      start: "10:00",
      end: "11:00",
    });
    expect(slotDraft("2026-09-30", 615, 15, [])).toEqual({
      date: "2026-09-30",
      start: "10:15",
      end: "10:30",
    });
  });

  it("con el fin dentro de un hueco, pasa al primer minuto que existe (Madrid, adelanto)", () => {
    const madridSpring = [{ from: 120, to: 180 }];
    expect(slotDraft("2026-03-29", 60, 60, madridSpring)).toEqual({
      date: "2026-03-29",
      start: "01:00",
      end: "03:00",
    });
    expect(slotDraft("2026-03-29", 105, 30, madridSpring).end).toBe("03:00");
  });

  it("un fin justo al final del hueco ya existe y queda", () => {
    expect(slotDraft("2026-03-29", 150, 30, [{ from: 120, to: 180 }]).end).toBe("03:00");
    expect(slotDraft("2026-03-29", 0, 60, [{ from: 120, to: 180 }]).end).toBe("01:00");
  });

  it("la última franja termina a las 00:00, que es el día siguiente en el trío", () => {
    expect(slotDraft("2026-09-30", 1380, 60, [])).toEqual({
      date: "2026-09-30",
      start: "23:00",
      end: "00:00",
    });
  });
});

describe("addEntryDraft", () => {
  const now = { date: "2026-10-02", minute: 617 };

  it("con hoy a la vista, propone hoy y la franja de ahora", () => {
    expect(addEntryDraft(week, now, "2026-01-01", 60)).toEqual({
      date: "2026-10-02",
      start: "10:00",
      end: "11:00",
    });
    expect(addEntryDraft(week, now, "2026-01-01", 15)).toEqual({
      date: "2026-10-02",
      start: "10:15",
      end: "10:30",
    });
  });

  it("sin hoy a la vista, el primer día del período a las 08:00", () => {
    const later = { date: "2026-10-12", minute: 617 };
    expect(addEntryDraft(week, later, "2026-01-01", 30)).toEqual({
      date: "2026-09-28",
      start: "08:00",
      end: "08:30",
    });
  });

  it("nunca antes del piso de fechas", () => {
    const later = { date: "2026-10-12", minute: 617 };
    expect(addEntryDraft(week, later, "2026-09-30", 60)).toEqual({
      date: "2026-09-30",
      start: "08:00",
      end: "09:00",
    });
  });

  it("si el piso es hoy, propone la franja de ahora", () => {
    const earlier = ["2026-09-21", "2026-09-22"];
    expect(addEntryDraft(earlier, now, "2026-10-02", 60)).toEqual({
      date: "2026-10-02",
      start: "10:00",
      end: "11:00",
    });
  });
});

describe("slotAt", () => {
  const plain = { beforeFloor: false, missingMinutes: [] };
  const madridSpring = {
    beforeFloor: false,
    missingMinutes: [{ from: 120, to: 180 }],
  };

  it("con permiso de carga, el minuto de la franja tocada", () => {
    expect(slotAt(plain, 10 * 48 + 30, 60, true)).toBe(600);
    expect(slotAt(plain, 3 * 48 + 5, 15, true)).toBe(45);
  });

  it("sin permiso de carga no abre nada (CAL-05)", () => {
    expect(slotAt(plain, 10 * 48, 60, false)).toBeNull();
  });

  it("en un día anterior al piso no abre nada (CAL-48)", () => {
    expect(slotAt({ ...plain, beforeFloor: true }, 10 * 48, 60, true)).toBeNull();
  });

  it("en un minuto que no existe no abre nada; en los de al lado, sí (CAL-30, Madrid)", () => {
    expect(slotAt(madridSpring, 2 * 48 + 10, 60, true)).toBeNull();
    expect(slotAt(madridSpring, 5 * 48, 30, true)).toBeNull();
    expect(slotAt(madridSpring, 1 * 48 + 10, 60, true)).toBe(60);
    expect(slotAt(madridSpring, 3 * 48, 60, true)).toBe(180);
  });
});

describe("isOutsidePeriod", () => {
  it("la que empieza y termina en el período está adentro", () => {
    expect(isOutsidePeriod(closed("2026-09-30", "09:00", "10:00"), week)).toBe(false);
  });

  it("la que empezó el domingo anterior y tiene segmento el lunes está adentro (CAL-46)", () => {
    expect(isOutsidePeriod(closed("2026-09-27", "22:00", "02:00", 1), week)).toBe(false);
  });

  it("la de otra semana está afuera, también la que termina justo al empezar el período", () => {
    expect(isOutsidePeriod(closed("2026-09-09", "09:00", "10:00"), week)).toBe(true);
    expect(isOutsidePeriod(closed("2026-09-27", "22:00", "00:00", 1), week)).toBe(true);
  });
});

describe("slotOf", () => {
  it("la franja que contiene el minuto, entre la primera y la última del día", () => {
    expect(slotOf(617, 60)).toBe(600);
    expect(slotOf(617, 15)).toBe(615);
    expect(slotOf(-20, 30)).toBe(0);
    expect(slotOf(1440, 30)).toBe(1410);
  });
});

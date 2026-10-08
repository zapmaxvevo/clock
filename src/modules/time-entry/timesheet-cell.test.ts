import { describe, expect, it } from "vitest";

import {
  cellMinutes,
  cellWrite,
  EMPTY_CELL_START,
  latestStarting,
  type CellEntry,
} from "./timesheet-cell";

const buenosAires = "America/Argentina/Buenos_Aires";
const madrid = "Europe/Madrid";

/** Una celda del miércoles 30/09/2026 en Buenos Aires (-03:00). */
const cell = { date: "2026-09-30", timeZone: buenosAires };

const ids = {
  a: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b",
  b: "6f1c1a52-3c55-4a43-9d0e-0d6b7d0f4d11",
  c: "9a7c2b1e-4d3f-4e8a-8b6c-5d4e3f2a1b0c",
} as const;

/** Una entrada cerrada con los instantes en ISO; creada a la hora de su inicio. */
function entry(
  id: string,
  startedAt: string,
  endedAt: string,
  createdAt: string = startedAt,
): CellEntry {
  return {
    id,
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt),
    createdAt: new Date(createdAt),
  };
}

describe("EMPTY_CELL_START (TS-31)", () => {
  it("es las 09:00", () => {
    expect(EMPTY_CELL_START).toBe("09:00");
  });
});

describe("cellMinutes (TS-24, D13-3)", () => {
  it("suma en segundos y trunca una sola vez", () => {
    // 0:45:40 y 0:44:40 suman 1:30:20: 90 minutos, no 89.
    expect(
      cellMinutes([
        entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T12:45:40Z"),
        entry(ids.b, "2026-09-30T13:00:00Z", "2026-09-30T13:44:40Z"),
      ]),
    ).toBe(90);
  });

  it("una entrada de cero minutos cuenta cero (TS-118)", () => {
    expect(
      cellMinutes([entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T12:00:00Z")]),
    ).toBe(0);
  });
});

describe("latestStarting (TS-34)", () => {
  it("es la de inicio mayor, aunque se haya creado antes", () => {
    const early = entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T13:00:00Z");
    const late = entry(
      ids.b,
      "2026-09-30T14:00:00Z",
      "2026-09-30T15:00:00Z",
      "2026-09-30T10:00:00Z",
    );
    expect(latestStarting([late, early])).toBe(late);
    expect(latestStarting([early, late])).toBe(late);
  });

  it("con el mismo inicio, la de createdAt más reciente, sea cual sea el id", () => {
    const older = entry(
      ids.c,
      "2026-09-30T12:00:00Z",
      "2026-09-30T13:00:00Z",
      "2026-09-30T12:00:00Z",
    );
    const newer = entry(
      ids.a,
      "2026-09-30T12:00:00Z",
      "2026-09-30T13:00:00Z",
      "2026-09-30T12:00:01Z",
    );
    expect(latestStarting([older, newer])).toBe(newer);
    expect(latestStarting([newer, older])).toBe(newer);
  });

  it("con el mismo inicio y el mismo createdAt, la de id mayor", () => {
    const low = entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T13:00:00Z");
    const high = entry(ids.c, "2026-09-30T12:00:00Z", "2026-09-30T13:00:00Z");
    expect(latestStarting([high, low])).toBe(high);
    expect(latestStarting([low, high])).toBe(high);
  });
});

describe("cellWrite: celda vacía (TS-29, TS-31)", () => {
  it("crea a las 09:00 locales con V minutos", () => {
    expect(cellWrite(cell, [], 90)).toEqual({
      kind: "create",
      startedAt: new Date("2026-09-30T12:00:00Z"),
      endedAt: new Date("2026-09-30T13:30:00Z"),
    });
  });

  it("el fin es el inicio más V en instantes: Madrid, 20 h el día antes del adelanto", () => {
    // 2026-03-28 09:00 (+01:00) = 08:00Z; 20 horas reales después son las 04:00Z
    // del 29, las 06:00 locales y no las 05:00 que daría el rótulo.
    expect(cellWrite({ date: "2026-03-28", timeZone: madrid }, [], 20 * 60)).toEqual({
      kind: "create",
      startedAt: new Date("2026-03-28T08:00:00Z"),
      endedAt: new Date("2026-03-29T04:00:00Z"),
    });
  });

  it("rechaza con noStartThatDay si el día no existió: Apia, 2011-12-30", () => {
    expect(cellWrite({ date: "2011-12-30", timeZone: "Pacific/Apia" }, [], 60)).toEqual({
      kind: "rejected",
      reason: "noStartThatDay",
    });
  });

  it("rechaza con afterYear9999 si el fin pasa del año 9999 en UTC", () => {
    // 9999-12-31 09:00 en Kiritimati (+14:00) es 9999-12-30T19:00Z: 23:59 después
    // todavía es el 9999. En Honolulu (-10:00) es 9999-12-31T19:00Z: cinco horas
    // después ya es el 10000.
    expect(
      cellWrite({ date: "9999-12-31", timeZone: "Pacific/Kiritimati" }, [], 1439).kind,
    ).toBe("create");
    expect(
      cellWrite({ date: "9999-12-31", timeZone: "Pacific/Honolulu" }, [], 299).kind,
    ).toBe("create");
    expect(
      cellWrite({ date: "9999-12-31", timeZone: "Pacific/Honolulu" }, [], 300),
    ).toEqual({ kind: "rejected", reason: "afterYear9999" });
  });
});

describe("cellWrite: la celda ya muestra V (TS-36, TS-37)", () => {
  it("con una entrada del timer de 1:30:42 y V = 90, no escribe (TS-105)", () => {
    const timer = entry(ids.a, "2026-09-30T13:00:40Z", "2026-09-30T14:31:22Z");
    expect(cellWrite(cell, [timer], 90)).toEqual({ kind: "unchanged" });
  });

  it("con varias que suman lo que se muestra, no escribe", () => {
    const entries = [
      entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T12:45:40Z"),
      entry(ids.b, "2026-09-30T13:00:00Z", "2026-09-30T13:44:40Z"),
    ];
    expect(cellWrite(cell, entries, 90)).toEqual({ kind: "unchanged" });
  });
});

describe("cellWrite: una entrada (TS-33)", () => {
  it("lleva el fin a su inicio más V, con los segundos del inicio (TS-106)", () => {
    const timer = entry(ids.a, "2026-09-30T13:00:40Z", "2026-09-30T14:31:22Z");
    expect(cellWrite(cell, [timer], 120)).toEqual({
      kind: "setEnd",
      target: timer,
      endedAt: new Date("2026-09-30T15:00:40Z"),
    });
  });

  it("achica una entrada de más de un día (TS-104)", () => {
    const long = entry(ids.a, "2026-09-30T12:00:00Z", "2026-10-01T18:00:00Z");
    expect(cellWrite(cell, [long], 60)).toEqual({
      kind: "setEnd",
      target: long,
      endedAt: new Date("2026-09-30T13:00:00Z"),
    });
  });

  it("edita también la única de cero minutos (TS-118)", () => {
    const zero = entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T12:00:00Z");
    expect(cellWrite(cell, [zero], 30)).toEqual({
      kind: "setEnd",
      target: zero,
      endedAt: new Date("2026-09-30T12:30:00Z"),
    });
  });

  it("rechaza con afterYear9999 si el fin pasa del año 9999", () => {
    const last = entry(ids.a, "9999-12-31T23:00:00Z", "9999-12-31T23:30:00Z");
    expect(cellWrite({ date: "9999-12-31", timeZone: "UTC" }, [last], 90)).toEqual({
      kind: "rejected",
      reason: "afterYear9999",
    });
  });
});

describe("cellWrite: subir con varias (TS-34)", () => {
  const a = entry(ids.a, "2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z");
  const b = entry(ids.b, "2026-09-30T15:00:00Z", "2026-09-30T16:00:00Z");

  it("agrega V − S desde el fin de la que termina más tarde, copiando la que empieza más tarde", () => {
    expect(cellWrite(cell, [b, a], 180)).toEqual({
      kind: "append",
      source: b,
      startedAt: new Date("2026-09-30T16:00:00Z"),
      endedAt: new Date("2026-09-30T17:00:00Z"),
    });
  });

  it("V − S es de minutos enteros, aunque la suma tenga segundos (D13-3)", () => {
    // 1:30:42 se muestra 1:30; llevada a 1:31, agrega un minuto y no 18 segundos.
    const first = entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T12:45:00Z");
    const second = entry(ids.b, "2026-09-30T13:00:00Z", "2026-09-30T13:45:42Z");
    expect(cellWrite(cell, [first, second], 91)).toEqual({
      kind: "append",
      source: second,
      startedAt: new Date("2026-09-30T13:45:42Z"),
      endedAt: new Date("2026-09-30T13:46:42Z"),
    });
  });

  it("la que empieza más tarde no es la que termina más tarde (TS-120)", () => {
    const long = entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T18:00:00Z");
    const short = entry(ids.b, "2026-09-30T14:00:00Z", "2026-09-30T15:00:00Z");
    expect(cellWrite(cell, [long, short], 7 * 60 + 30)).toEqual({
      kind: "append",
      source: short,
      startedAt: new Date("2026-09-30T18:00:00Z"),
      endedAt: new Date("2026-09-30T18:30:00Z"),
    });
  });

  it("copia la de createdAt más reciente con el mismo inicio", () => {
    const older = entry(
      ids.c,
      "2026-09-30T13:00:00Z",
      "2026-09-30T14:00:00Z",
      "2026-09-30T13:00:00Z",
    );
    const newer = entry(
      ids.a,
      "2026-09-30T13:00:00Z",
      "2026-09-30T13:30:00Z",
      "2026-09-30T13:05:00Z",
    );
    const write = cellWrite(cell, [older, newer], 120);
    expect(write).toMatchObject({ kind: "append", source: newer });
  });

  it("rechaza si la que termina más tarde cruza la medianoche (TS-119)", () => {
    // 22:00 a 01:00 locales: termina el jueves.
    const late = entry(ids.b, "2026-10-01T01:00:00Z", "2026-10-01T04:00:00Z");
    expect(cellWrite(cell, [a, late], 300)).toEqual({
      kind: "rejected",
      reason: "appendOtherDay",
    });
  });

  it("rechaza si la que termina más tarde termina justo a las 00:00 del día siguiente (TS-119)", () => {
    const late = entry(ids.b, "2026-10-01T01:00:00Z", "2026-10-01T03:00:00Z");
    expect(cellWrite(cell, [a, late], 240)).toEqual({
      kind: "rejected",
      reason: "appendOtherDay",
    });
  });

  it("acepta si la que termina más tarde termina a las 23:59", () => {
    const late = entry(ids.b, "2026-10-01T01:00:00Z", "2026-10-01T02:59:00Z");
    expect(cellWrite(cell, [a, late], 240)).toMatchObject({
      kind: "append",
      startedAt: new Date("2026-10-01T02:59:00Z"),
    });
  });

  it("rechaza con afterYear9999 si el fin pasa del año 9999", () => {
    const utc = { date: "9999-12-31", timeZone: "UTC" };
    const first = entry(ids.a, "9999-12-31T20:00:00Z", "9999-12-31T21:00:00Z");
    const second = entry(ids.b, "9999-12-31T22:00:00Z", "9999-12-31T23:30:00Z");
    expect(cellWrite(utc, [first, second], 180)).toEqual({
      kind: "rejected",
      reason: "afterYear9999",
    });
  });
});

describe("cellWrite: bajar con varias (TS-34, D13-4)", () => {
  const a = entry(ids.a, "2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z");
  const b = entry(ids.b, "2026-09-30T15:00:00Z", "2026-09-30T16:00:00Z");

  it("adelanta el fin de la que empieza más tarde en S − V", () => {
    expect(cellWrite(cell, [b, a], 90)).toEqual({
      kind: "setEnd",
      target: b,
      endedAt: new Date("2026-09-30T15:30:00Z"),
    });
  });

  it("achica la que empieza más tarde aunque otra termine después (TS-120)", () => {
    const long = entry(ids.a, "2026-09-30T12:00:00Z", "2026-09-30T18:00:00Z");
    const short = entry(ids.b, "2026-09-30T14:00:00Z", "2026-09-30T15:00:00Z");
    expect(cellWrite(cell, [long, short], 6 * 60 + 30)).toEqual({
      kind: "setEnd",
      target: short,
      endedAt: new Date("2026-09-30T14:30:00Z"),
    });
  });

  it("con el mismo inicio, achica la de createdAt más reciente", () => {
    const older = entry(
      ids.c,
      "2026-09-30T13:00:00Z",
      "2026-09-30T14:00:00Z",
      "2026-09-30T13:00:00Z",
    );
    const newer = entry(
      ids.a,
      "2026-09-30T13:00:00Z",
      "2026-09-30T14:00:00Z",
      "2026-09-30T13:05:00Z",
    );
    expect(cellWrite(cell, [older, newer], 90)).toMatchObject({
      kind: "setEnd",
      target: newer,
    });
  });

  it("acepta la baja que deja exactamente un minuto", () => {
    // S = 62 y V = 61: a la de dos minutos le queda uno justo.
    const exact = entry(ids.b, "2026-09-30T15:00:00Z", "2026-09-30T15:02:00Z");
    expect(cellWrite(cell, [a, exact], 61)).toEqual({
      kind: "setEnd",
      target: exact,
      endedAt: new Date("2026-09-30T15:01:00Z"),
    });
  });

  it("rechaza la baja que deja 59 segundos (TT-73)", () => {
    // S = 61 (1:01:59) y V = 60: a la de 0:01:59 le quedan 59 segundos.
    const short = entry(ids.b, "2026-09-30T15:00:00Z", "2026-09-30T15:01:59Z");
    expect(cellWrite(cell, [a, short], 60)).toEqual({
      kind: "rejected",
      reason: "trimTooShort",
    });
  });

  it("rechaza la baja que la vaciaría o la dejaría en negativo", () => {
    expect(cellWrite(cell, [a, b], 60)).toEqual({
      kind: "rejected",
      reason: "trimTooShort",
    });
    expect(cellWrite(cell, [a, b], 30)).toEqual({
      kind: "rejected",
      reason: "trimTooShort",
    });
  });

  it("rechaza toda baja si la que empieza más tarde dura cero (TS-118)", () => {
    const zero = entry(ids.b, "2026-09-30T15:00:00Z", "2026-09-30T15:00:00Z");
    expect(cellWrite(cell, [a, zero], 59)).toEqual({
      kind: "rejected",
      reason: "trimTooShort",
    });
  });

  it("con una de cero minutos que empieza más tarde, subir la copia (TS-118)", () => {
    const zero = entry(ids.b, "2026-09-30T15:00:00Z", "2026-09-30T15:00:00Z");
    expect(cellWrite(cell, [a, zero], 90)).toEqual({
      kind: "append",
      source: zero,
      startedAt: new Date("2026-09-30T15:00:00Z"),
      endedAt: new Date("2026-09-30T15:30:00Z"),
    });
  });
});

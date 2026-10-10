import { describe, expect, it } from "vitest";

import {
  activeBarIndex,
  barHeightPercent,
  chartScaleOf,
  nextBarIndex,
  tickAlignOf,
  tickIndexesOf,
} from "./chart-model";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** Las barras con estos segundos; la escala solo mira la más alta. */
function bars(...seconds: number[]) {
  return seconds.map((value) => ({ seconds: value }));
}

describe("chartScaleOf (D-R5-8)", () => {
  it("todo en cero da un paso de 0:15 y dos líneas", () => {
    expect(chartScaleOf(bars(0, 0, 0))).toEqual({
      step: 15 * MINUTE,
      ceiling: 15 * MINUTE,
      lines: [0, 15 * MINUTE],
    });
  });

  it("10 min: el techo es un paso de 0:15", () => {
    expect(chartScaleOf(bars(0, 10 * MINUTE))).toMatchObject({
      step: 15 * MINUTE,
      ceiling: 15 * MINUTE,
    });
  });

  it("60 min: paso de 0:15, techo de 1:00 y cinco líneas", () => {
    expect(chartScaleOf(bars(HOUR, 20 * MINUTE))).toEqual({
      step: 15 * MINUTE,
      ceiling: HOUR,
      lines: [0, 15 * MINUTE, 30 * MINUTE, 45 * MINUTE, HOUR],
    });
  });

  it("61 min: el paso es el menor que cubre en cuatro, 0:30, y el techo 1:30", () => {
    expect(chartScaleOf(bars(61 * MINUTE))).toEqual({
      step: 30 * MINUTE,
      ceiling: 90 * MINUTE,
      lines: [0, 30 * MINUTE, 60 * MINUTE, 90 * MINUTE],
    });
  });

  it("7:30: paso de 2:00 y techo de 8:00", () => {
    expect(chartScaleOf(bars(HOUR, 7.5 * HOUR))).toEqual({
      step: 2 * HOUR,
      ceiling: 8 * HOUR,
      lines: [0, 2 * HOUR, 4 * HOUR, 6 * HOUR, 8 * HOUR],
    });
  });

  it("5280 h: paso de 2000 h y techo de 6000 h, sin tope en el paso", () => {
    expect(chartScaleOf(bars(5280 * HOUR))).toEqual({
      step: 2000 * HOUR,
      ceiling: 6000 * HOUR,
      lines: [0, 2000 * HOUR, 4000 * HOUR, 6000 * HOUR],
    });
  });

  it("nunca más de cinco líneas, ni menos de dos", () => {
    for (let seconds = 0; seconds <= 200 * HOUR; seconds += 7 * MINUTE + 13) {
      const { lines } = chartScaleOf(bars(seconds));
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(5);
    }
  });
});

describe("tickIndexesOf (D-R5-8)", () => {
  it.each<[number, number[]]>([
    [1, [0]],
    [7, [0, 1, 2, 3, 4, 5, 6]],
    [8, [0, 2, 4, 6]],
    [13, [0, 2, 4, 6, 8, 10, 12]],
    [27, [0, 4, 8, 12, 16, 20, 24]],
    [31, [0, 5, 10, 15, 20, 25, 30]],
  ])("con %i columnas, las marcas van en %o", (count, expected) => {
    expect(tickIndexesOf(count)).toEqual(expected);
  });
});

describe("tickAlignOf (D-R5-8)", () => {
  it("la primera al inicio, la última al final y la del medio centrada", () => {
    expect(tickAlignOf(0, 31)).toBe("start");
    expect(tickAlignOf(30, 31)).toBe("end");
    expect(tickAlignOf(15, 31)).toBe("center");
  });

  it("una sola columna, centrada", () => {
    expect(tickAlignOf(0, 1)).toBe("center");
  });
});

describe("barHeightPercent", () => {
  it("es el porcentaje del techo", () => {
    const scale = chartScaleOf(bars(HOUR));
    expect(barHeightPercent(HOUR, scale)).toBe(100);
    expect(barHeightPercent(15 * MINUTE, scale)).toBe(25);
    expect(barHeightPercent(0, scale)).toBe(0);
  });
});

describe("nextBarIndex (D-R5-9)", () => {
  it.each<[string, number, number]>([
    ["ArrowRight", 3, 4],
    ["ArrowDown", 3, 4],
    ["ArrowLeft", 3, 2],
    ["ArrowUp", 3, 2],
    ["Home", 3, 0],
    ["End", 3, 9],
  ])("%s desde la columna %i va a la %i", (key, index, expected) => {
    expect(nextBarIndex(index, key, 10)).toBe(expected);
  });

  it.each(["ArrowRight", "ArrowDown", "End"])("%s en la última se queda", (key) => {
    expect(nextBarIndex(9, key, 10)).toBe(9);
  });

  it.each(["ArrowLeft", "ArrowUp", "Home"])("%s en la primera se queda", (key) => {
    expect(nextBarIndex(0, key, 10)).toBe(0);
  });

  it("otra tecla no mueve el foco", () => {
    expect(nextBarIndex(3, "Tab", 10)).toBeNull();
    expect(nextBarIndex(3, "Enter", 10)).toBeNull();
  });
});

describe("activeBarIndex (D-R5-9)", () => {
  it("con puntero y foco en columnas distintas, gana el puntero", () => {
    expect(activeBarIndex(2, 5)).toBe(2);
  });

  it("solo con foco, la del foco", () => {
    expect(activeBarIndex(null, 5)).toBe(5);
  });

  it("solo con puntero, la del puntero", () => {
    expect(activeBarIndex(2, null)).toBe(2);
  });

  it("sin ninguno, ninguna", () => {
    expect(activeBarIndex(null, null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  dayCheckState,
  keepVisible,
  toggleDay,
  toggleEntry,
  withoutIds,
} from "./selection";

describe("toggleEntry", () => {
  it("elige una fila que no estaba", () => {
    expect(toggleEntry(["a"], "b")).toEqual(["a", "b"]);
  });

  it("suelta una fila elegida", () => {
    expect(toggleEntry(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("dayCheckState", () => {
  const day = ["a", "b"];

  it("sin ninguna fila del día elegida, vacía", () => {
    expect(dayCheckState(["x"], day)).toBe("none");
  });

  it("con algunas, mixta", () => {
    expect(dayCheckState(["b", "x"], day)).toBe("some");
  });

  it("con todas, marcada", () => {
    expect(dayCheckState(["b", "a"], day)).toBe("all");
  });
});

describe("toggleDay", () => {
  const day = ["a", "b", "c"];

  it("con ninguna, elige todas las del día y conserva las de otros días", () => {
    expect(toggleDay(["x"], day)).toEqual(["x", "a", "b", "c"]);
  });

  it("con algunas, suma solo las que faltan", () => {
    expect(toggleDay(["b", "x"], day)).toEqual(["b", "x", "a", "c"]);
  });

  it("con todas, las suelta y conserva las de otros días", () => {
    expect(toggleDay(["a", "x", "c", "b"], day)).toEqual(["x"]);
  });
});

describe("keepVisible", () => {
  it("quita las entradas que la lista ya no dibuja", () => {
    expect(keepVisible(["a", "b", "c"], new Set(["a", "c", "d"]))).toEqual(["a", "c"]);
  });

  it("si no quitó nada, devuelve la misma referencia", () => {
    const selection = ["a", "b"];
    expect(keepVisible(selection, new Set(["a", "b", "c"]))).toBe(selection);
  });
});

describe("withoutIds", () => {
  it("quita los ids pedidos y conserva el orden del resto", () => {
    expect(withoutIds(["a", "b", "c", "d"], ["c", "a", "z"])).toEqual(["b", "d"]);
  });
});

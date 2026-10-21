import { describe, expect, it } from "vitest";

import { knownChoice } from "./known-choice";

const SIZES = ["small", "large"] as const;

describe("knownChoice", () => {
  it("sin valor da el de omisión", () => {
    expect(knownChoice(SIZES, null, "small")).toBe("small");
    expect(knownChoice(SIZES, null, "large")).toBe("large");
  });

  it("devuelve cada valor de la lista", () => {
    expect(knownChoice(SIZES, "small", "large")).toBe("small");
    expect(knownChoice(SIZES, "large", "small")).toBe("large");
  });

  it("lanza con un valor fuera de lista, también con otras mayúsculas", () => {
    expect(() => knownChoice(SIZES, "medium", "small")).toThrow(
      new RangeError("Valor fuera de lista: medium."),
    );
    expect(() => knownChoice(SIZES, "LARGE", "small")).toThrow(RangeError);
    expect(() => knownChoice(SIZES, "", "small")).toThrow(RangeError);
  });
});

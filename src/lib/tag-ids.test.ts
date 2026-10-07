import { describe, expect, it } from "vitest";

import { normalizedIds, sameTagIds } from "./tag-ids";

const design = "9a7c2b1e-4d3f-4e8a-8b6c-5d4e3f2a1b0c";
const review = "1e2d3c4b-5a69-4788-9a0b-c1d2e3f4a5b6";
const urgent = "6f1c1a52-3c55-4a43-9d0e-0d6b7d0f4d11";

describe("sameTagIds (criterio 10 del 11b)", () => {
  it("iguala el mismo conjunto en otro orden y con otras mayúsculas", () => {
    expect(sameTagIds([design, review], [review.toUpperCase(), design])).toBe(true);
  });

  it("iguala dos conjuntos vacíos", () => {
    expect(sameTagIds([], [])).toBe(true);
  });

  it("distingue un conjunto con una etiqueta de más o de menos", () => {
    expect(sameTagIds([design], [design, review])).toBe(false);
    expect(sameTagIds([design, review], [design])).toBe(false);
    expect(sameTagIds([], [design])).toBe(false);
  });

  it("distingue dos conjuntos del mismo tamaño con otra etiqueta", () => {
    expect(sameTagIds([design, review], [design, urgent])).toBe(false);
  });

  it("un id repetido no cuenta dos veces", () => {
    expect(sameTagIds([design, design.toUpperCase()], [design])).toBe(true);
  });
});

describe("normalizedIds", () => {
  it("pasa a minúsculas y quita los repetidos, en el orden de la primera aparición", () => {
    expect(normalizedIds([review, design.toUpperCase(), design, review])).toEqual([
      review,
      design,
    ]);
    expect(normalizedIds([])).toEqual([]);
  });
});

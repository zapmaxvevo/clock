import { describe, expect, it } from "vitest";

import { nextPaletteColor, PALETTE, PALETTE_KEYS, paletteColor } from "./palette";

describe("la paleta (P-30)", () => {
  it("tiene doce colores distintos, en el orden de las claves", () => {
    expect(PALETTE.map((color) => color.key)).toEqual([...PALETTE_KEYS]);
    expect(new Set(PALETTE.map((color) => color.value)).size).toBe(12);
    expect(paletteColor("teal")).toEqual({
      key: "teal",
      label: "Verde azulado",
      value: "#0D9488",
    });
  });
});

describe("nextPaletteColor (PR-15)", () => {
  it("da el color que sigue según cuántos proyectos hay", () => {
    expect(nextPaletteColor(0)).toBe("red");
    expect(nextPaletteColor(1)).toBe("orange");
    expect(nextPaletteColor(11)).toBe("slate");
  });

  it("vuelve a empezar después del último", () => {
    expect(nextPaletteColor(12)).toBe("red");
    expect(nextPaletteColor(25)).toBe("orange");
  });
});

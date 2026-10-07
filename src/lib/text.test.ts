import { describe, expect, it } from "vitest";

import { compareNames, initialsOf, noNullCharacter, normalizeSearch } from "./text";

describe("initialsOf (PF-44)", () => {
  it("da la primera letra de cada una de las dos primeras palabras, en mayúsculas", () => {
    expect(initialsOf("María José Pérez", "mj@empresa.com")).toBe("MJ");
    expect(initialsOf("ana lópez", "ana@empresa.com")).toBe("AL");
  });

  it("da una sola letra con una sola palabra", () => {
    expect(initialsOf("  Ana  ", "ana@empresa.com")).toBe("A");
  });

  it("da la primera letra del correo con el nombre vacío", () => {
    expect(initialsOf("", "zoe@empresa.com")).toBe("Z");
    expect(initialsOf("   ", "zoe@empresa.com")).toBe("Z");
  });

  it("no parte una letra que ocupa dos unidades de UTF-16", () => {
    expect(initialsOf("𝒜na Bel", "x@empresa.com")).toBe("𝒜B");
  });
});

describe("normalizeSearch (TT-07)", () => {
  it("no distingue mayúsculas", () => {
    expect(normalizeSearch("TOKYO")).toBe("tokyo");
  });

  it("descarta los acentos", () => {
    expect(normalizeSearch("Bogotá")).toBe("bogota");
    expect(normalizeSearch("Ñandú")).toBe("nandu");
  });

  it("recorta los espacios de los extremos", () => {
    expect(normalizeSearch("  buenos aires  ")).toBe("buenos aires");
  });
});

describe("noNullCharacter", () => {
  it("rechaza el texto con el carácter nulo", () => {
    expect(noNullCharacter("a\u0000b")).toBe(false);
    expect(noNullCharacter("ab")).toBe(true);
  });
});

describe("compareNames", () => {
  const ref = (id: string, name: string) => ({ id, name });

  it("ordena alfabéticamente sin distinguir mayúsculas", () => {
    const sorted = [ref("1", "beta"), ref("2", "Alfa"), ref("3", "gamma")].sort(
      compareNames,
    );
    expect(sorted.map((row) => row.name)).toEqual(["Alfa", "beta", "gamma"]);
  });

  it("distingue los acentos", () => {
    expect(compareNames(ref("1", "diseño"), ref("2", "diseno"))).not.toBe(0);
  });

  // «ß» y «ss» no empatan en el collator de `es`; el ancho completo sí, y
  // `lower()` los distingue.
  it("desempata por id dos nombres que el collator iguala y `lower()` no", () => {
    const wide = ref("b", "Ａna");
    const narrow = ref("a", "Ana");
    expect(wide.name.toLowerCase()).not.toBe(narrow.name.toLowerCase());
    expect(compareNames(wide, narrow)).toBeGreaterThan(0);
    expect(compareNames(narrow, wide)).toBeLessThan(0);
    expect([wide, narrow].sort(compareNames)).toEqual([narrow, wide]);
    expect(
      [ref("a", "Ａna"), ref("b", "Ana")].sort(compareNames).map((row) => row.id),
    ).toEqual(["a", "b"]);
  });

  it("da cero con la misma fila", () => {
    expect(compareNames(ref("a", "x"), ref("a", "x"))).toBe(0);
  });
});

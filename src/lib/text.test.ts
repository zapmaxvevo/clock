import { describe, expect, it } from "vitest";

import { initialsOf, noNullCharacter, normalizeSearch } from "./text";

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

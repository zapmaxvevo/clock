import { describe, expect, it } from "vitest";

import type { TagRef } from "@/modules/project/schema";

import { sameTags, sortedTags, tagIdsOf, tagPickerView } from "./tag-picker-model";

const design: TagRef = { id: "t-design", name: "Diseño" };
const review: TagRef = { id: "t-review", name: "revisión" };
const urgent: TagRef = { id: "t-urgent", name: "Urgente" };
const old: TagRef = { id: "t-old", name: "Vieja" };

const catalog = { canCreateTag: true, tags: [urgent, design, review] } as const;

function labelsOf(search: string, value: readonly TagRef[] = []): string[] {
  return tagPickerView(catalog, value, search).options.map((option) => option.label);
}

describe("tagPickerView", () => {
  it("sin búsqueda ofrece el catálogo entero en orden alfabético, sin distinguir mayúsculas", () => {
    expect(tagPickerView(catalog, [], "")).toEqual({
      options: [
        { tag: design, archived: false, label: "Diseño" },
        { tag: review, archived: false, label: "revisión" },
        { tag: urgent, archived: false, label: "Urgente" },
      ],
      empty: null,
    });
  });

  it("busca sin distinguir mayúsculas ni acentos (H-2)", () => {
    expect(labelsOf("diseno")).toEqual(["Diseño"]);
    expect(labelsOf("DISEÑO")).toEqual(["Diseño"]);
    expect(labelsOf("Revision")).toEqual(["revisión"]);
    expect(labelsOf("  urg ")).toEqual(["Urgente"]);
  });

  it("busca dentro del nombre, no solo al principio", () => {
    expect(labelsOf("gen")).toEqual(["Urgente"]);
  });

  it("una de `value` fuera del catálogo se ofrece rotulada «(archivada)», en su lugar alfabético (H-5)", () => {
    const view = tagPickerView(catalog, [design, old], "");

    expect(view.options.map((option) => option.label)).toEqual([
      "Diseño",
      "revisión",
      "Urgente",
      "Vieja (archivada)",
    ]);
    expect(view.options.at(-1)).toEqual({
      tag: old,
      archived: true,
      label: "Vieja (archivada)",
    });
  });

  it("la búsqueda alcanza a la archivada por su nombre", () => {
    expect(labelsOf("viej", [old])).toEqual(["Vieja (archivada)"]);
  });

  it("una de `value` que está en el catálogo con otras mayúsculas en el id no se repite ni se rotula", () => {
    const sameDesign = { id: "T-DESIGN", name: "Diseño" };

    expect(labelsOf("", [sameDesign])).toEqual(["Diseño", "revisión", "Urgente"]);
  });

  it("sin `value` fuera del catálogo, nada se rotula archivada", () => {
    const view = tagPickerView(catalog, [review, urgent], "");

    expect(view.options.every((option) => !option.archived)).toBe(true);
  });

  it("un catálogo sin etiquetas dice «No hay etiquetas todavía», con el enlace si puede crearlas (TT-88)", () => {
    expect(tagPickerView({ canCreateTag: true, tags: [] }, [], "")).toEqual({
      options: [],
      empty: { kind: "noTags", canCreateTag: true },
    });
    expect(tagPickerView({ canCreateTag: false, tags: [] }, [], "algo")).toEqual({
      options: [],
      empty: { kind: "noTags", canCreateTag: false },
    });
  });

  it("un catálogo vacío con una archivada en la entrada ofrece la archivada y no es vacío", () => {
    const view = tagPickerView({ canCreateTag: true, tags: [] }, [old], "");

    expect(view.options.map((option) => option.label)).toEqual(["Vieja (archivada)"]);
    expect(view.empty).toBeNull();
  });

  it("una búsqueda sin coincidencias se distingue del catálogo vacío", () => {
    expect(tagPickerView(catalog, [], "zzz")).toEqual({
      options: [],
      empty: { kind: "noMatches" },
    });
  });
});

describe("sameTags", () => {
  it("compara los conjuntos sin importar orden ni mayúsculas de los ids", () => {
    expect(sameTags([design, review], [{ ...review, id: "T-REVIEW" }, design])).toBe(
      true,
    );
    expect(sameTags([design], [design, review])).toBe(false);
    expect(sameTags([], [])).toBe(true);
  });
});

describe("sortedTags y tagIdsOf", () => {
  it("ordena con la regla del catálogo sin cambiar lo que recibe", () => {
    const value = [urgent, review, design];

    expect(sortedTags(value)).toEqual([design, review, urgent]);
    expect(value).toEqual([urgent, review, design]);
  });

  it("deja solo los ids, en el orden que recibe", () => {
    expect(tagIdsOf([urgent, design])).toEqual(["t-urgent", "t-design"]);
  });
});

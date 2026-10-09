import { describe, expect, it } from "vitest";

import {
  NO_REPORT_FILTERS,
  REPORT_MAX_FILTER_VALUES,
  REPORT_WITHOUT_PROJECT,
  type ReportFilters,
  type ReportGrouping,
  type ReportReadyState,
} from "@/modules/report/schema";

import {
  applyFilter,
  chosenKeys,
  filterOptionsOf,
  filterSummary,
  hasNoMatches,
  visibleOptions,
  withChosen,
  type FilterOption,
} from "./filter-model";

const C1 = "c1000000-0000-4000-8000-000000000000";
const C2 = "0c200000-0000-4000-8000-000000000000";
const P1 = "f1000000-0000-4000-8000-000000000000";
const P2 = "a2000000-0000-4000-8000-000000000000";
const P3 = "b3000000-0000-4000-8000-000000000000";
const P4 = "d4000000-0000-4000-8000-000000000000";

/** El catálogo del estado, ya en el orden de `compareNames`. */
const catalog: ReportReadyState["filterOptions"] = {
  clients: [
    { id: C1, name: "Acme", archived: false },
    { id: C2, name: "Bosque", archived: true },
  ],
  projects: [
    { id: P3, name: "Árbol", color: "green", client: null, archived: true },
    {
      id: P1,
      name: "Diseño",
      color: "teal",
      client: { id: C1, name: "Acme" },
      archived: false,
    },
    { id: P2, name: "Interno", color: "red", client: null, archived: false },
    {
      id: P4,
      name: "Web",
      color: "blue",
      client: { id: C2, name: "Bosque" },
      archived: true,
    },
  ],
};

const clientOptions = filterOptionsOf(catalog, "clients");
const projectOptions = filterOptionsOf(catalog, "projects");

const range = { first: "2026-09-28", last: "2026-10-04" };
const grouping: ReportGrouping = { groupBy: "project", subgroups: ["date"] };
const base =
  "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=proyecto&subagrupar=fecha";

/** `count` ids de proyecto distintos, como opciones y como claves. */
function manyProjects(count: number): readonly FilterOption[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Proyecto ${index}`,
    detail: null,
    color: "slate",
    retired: false,
  }));
}

function keysOf(options: readonly FilterOption[]): string[] {
  return options.map((option) => option.key);
}

describe("filterOptionsOf", () => {
  it("en proyectos, «Sin proyecto» primero, sin color ni cliente, y después el catálogo", () => {
    expect(projectOptions).toEqual([
      {
        key: REPORT_WITHOUT_PROJECT,
        name: "Sin proyecto",
        detail: null,
        color: null,
        retired: false,
      },
      { key: P3, name: "Árbol", detail: null, color: "green", retired: true },
      { key: P1, name: "Diseño", detail: "Acme", color: "teal", retired: false },
      { key: P2, name: "Interno", detail: null, color: "red", retired: false },
      { key: P4, name: "Web", detail: "Bosque", color: "blue", retired: true },
    ]);
  });

  it("en clientes, el catálogo con el archivado marcado y sin «Sin proyecto»", () => {
    expect(clientOptions).toEqual([
      { key: C1, name: "Acme", detail: null, color: null, retired: false },
      { key: C2, name: "Bosque", detail: null, color: null, retired: true },
    ]);
  });
});

describe("visibleOptions", () => {
  it("sin búsqueda, las vigentes y los archivados separados, cada uno en su orden", () => {
    const visible = visibleOptions(projectOptions, "");
    expect(keysOf(visible.current)).toEqual([REPORT_WITHOUT_PROJECT, P1, P2]);
    expect(keysOf(visible.retired)).toEqual([P3, P4]);
  });

  it("la búsqueda no distingue mayúsculas ni acentos (TT-07)", () => {
    expect(keysOf(visibleOptions(projectOptions, "DISENO").current)).toEqual([
      REPORT_WITHOUT_PROJECT,
      P1,
    ]);
    expect(keysOf(visibleOptions(projectOptions, "arbol").retired)).toEqual([P3]);
  });

  it("«Sin proyecto» no se filtra: siempre está, primero", () => {
    const visible = visibleOptions(projectOptions, "web");
    expect(keysOf(visible.current)).toEqual([REPORT_WITHOUT_PROJECT]);
    expect(keysOf(visible.retired)).toEqual([P4]);
    expect(keysOf(visibleOptions(projectOptions, "nada así").current)).toEqual([
      REPORT_WITHOUT_PROJECT,
    ]);
  });

  it("sin coincidencias en clientes, los dos grupos vacíos", () => {
    expect(visibleOptions(clientOptions, "zeta")).toEqual({ current: [], retired: [] });
  });
});

describe("chosenKeys y withChosen", () => {
  it("lo elegido de proyectos lleva `sin-proyecto` al final si está", () => {
    const filters: ReportFilters = {
      clients: [C1],
      projects: [P2, P1],
      withoutProject: true,
    };
    expect(chosenKeys(filters, "projects")).toEqual([P2, P1, REPORT_WITHOUT_PROJECT]);
    expect(chosenKeys(filters, "clients")).toEqual([C1]);
    expect(chosenKeys(NO_REPORT_FILTERS, "projects")).toEqual([]);
  });

  it("withChosen ordena por las opciones, separa «Sin proyecto» y conserva el otro filtro", () => {
    const filters: ReportFilters = {
      clients: [C2],
      projects: [P4],
      withoutProject: false,
    };
    expect(
      withChosen(filters, "projects", [P2, REPORT_WITHOUT_PROJECT, P3], projectOptions),
    ).toEqual({ clients: [C2], projects: [P3, P2], withoutProject: true });
    expect(withChosen(filters, "clients", [C2, C1], clientOptions)).toEqual({
      clients: [C1, C2],
      projects: [P4],
      withoutProject: false,
    });
  });
});

describe("hasNoMatches", () => {
  it("sin búsqueda, nunca: tampoco con el catálogo vacío", () => {
    expect(hasNoMatches(projectOptions, "")).toBe(false);
    expect(hasNoMatches(clientOptions, "  ")).toBe(false);
    expect(hasNoMatches([], "")).toBe(false);
    expect(
      hasNoMatches(filterOptionsOf({ clients: [], projects: [] }, "projects"), ""),
    ).toBe(false);
  });

  it("con una búsqueda que deja alguna vigente o archivada, no", () => {
    expect(hasNoMatches(projectOptions, "dise")).toBe(false);
    expect(hasNoMatches(projectOptions, "WEB")).toBe(false);
    expect(hasNoMatches(clientOptions, "bosq")).toBe(false);
  });

  it("con una búsqueda que no deja ninguna, sí, aunque «Sin proyecto» siga visible", () => {
    expect(hasNoMatches(projectOptions, "zeta")).toBe(true);
    expect(hasNoMatches(clientOptions, "zeta")).toBe(true);
  });

  it("con el catálogo vacío y algo escrito, sí", () => {
    expect(hasNoMatches([], "acme")).toBe(true);
    expect(
      hasNoMatches(filterOptionsOf({ clients: [], projects: [] }, "projects"), "acme"),
    ).toBe(true);
  });
});

describe("filterSummary (D-R4-8)", () => {
  it("con ninguno, «todos»", () => {
    expect(filterSummary("projects", [], projectOptions)).toBe("todos");
    expect(filterSummary("clients", [], clientOptions)).toBe("todos");
  });

  it("con uno, su nombre", () => {
    expect(filterSummary("projects", [P1], projectOptions)).toBe("Diseño");
    expect(filterSummary("clients", [C2], clientOptions)).toBe("Bosque");
  });

  it("con «Sin proyecto» solo, «Sin proyecto»", () => {
    expect(filterSummary("projects", [REPORT_WITHOUT_PROJECT], projectOptions)).toBe(
      "Sin proyecto",
    );
  });

  it("con tres, la cantidad; «Sin proyecto» cuenta como uno", () => {
    expect(filterSummary("projects", [P1, P2, P3], projectOptions)).toBe("3");
    expect(
      filterSummary("projects", [P1, P2, REPORT_WITHOUT_PROJECT], projectOptions),
    ).toBe("3");
  });
});

describe("applyFilter, el efecto de «Aplicar» (D-R4-8)", () => {
  const location = {
    range,
    grouping,
    filters: { clients: [C2, C1], projects: [], withoutProject: false },
  };

  it("navega con las listas ordenadas y conserva el otro filtro", () => {
    expect(
      applyFilter(location, "projects", [P1, REPORT_WITHOUT_PROJECT, P2], projectOptions),
    ).toEqual({
      open: false,
      error: null,
      href: `${base}&clientes=${C2}%2C${C1}&proyectos=${P2}%2C${P1}%2Csin-proyecto`,
    });
  });

  it("sin nada elegido, el `href` sin ese filtro y con los otros", () => {
    expect(applyFilter(location, "projects", [], projectOptions)).toEqual({
      open: false,
      error: null,
      href: `${base}&clientes=${C2}%2C${C1}`,
    });
    expect(applyFilter(location, "clients", [], clientOptions)).toEqual({
      open: false,
      error: null,
      href: base,
    });
  });

  it("con 50 navega con las 50 ordenadas", () => {
    const options = manyProjects(REPORT_MAX_FILTER_VALUES);
    const keys = keysOf(options).reverse();
    const effect = applyFilter(location, "projects", keys, options);
    expect(effect.open).toBe(false);
    expect(effect.error).toBeNull();
    expect(effect.href).toBe(
      `${base}&clientes=${C2}%2C${C1}&proyectos=${[...keys].sort().join("%2C")}`,
    );
  });

  it("con 51 sigue abierto con «Elegí hasta 50.» y no navega", () => {
    const options = manyProjects(REPORT_MAX_FILTER_VALUES + 1);
    expect(applyFilter(location, "projects", keysOf(options), options)).toEqual({
      open: true,
      error: "Elegí hasta 50.",
      href: null,
    });
  });

  it("con 49 proyectos y «Sin proyecto» navega", () => {
    const options = [
      ...filterOptionsOf({ clients: [], projects: [] }, "projects"),
      ...manyProjects(REPORT_MAX_FILTER_VALUES - 1),
    ];
    const effect = applyFilter(location, "projects", keysOf(options), options);
    expect(effect.open).toBe(false);
    expect(effect.href).toMatch(/%2Csin-proyecto$/);
  });

  it("con 50 proyectos y «Sin proyecto» sigue abierto con el mensaje", () => {
    const options = [
      ...filterOptionsOf({ clients: [], projects: [] }, "projects"),
      ...manyProjects(REPORT_MAX_FILTER_VALUES),
    ];
    expect(applyFilter(location, "projects", keysOf(options), options)).toEqual({
      open: true,
      error: "Elegí hasta 50.",
      href: null,
    });
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  NO_REPORT_FILTERS,
  type ReportFilters,
  type ReportReadyState,
} from "@/modules/report/schema";

import { ReportToolbar } from "./report-toolbar";

// El selector del período navega con el router de Next, que fuera de la app no existe.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const thisWeek = { first: "2026-10-05", last: "2026-10-11" };
const lastWeek = { first: "2026-09-28", last: "2026-10-04" };

/** Las opciones de los filtros de todos los estados del archivo. */
const filterOptions: ReportReadyState["filterOptions"] = {
  people: null,
  clients: [],
  projects: [],
};

const state: ReportReadyState = {
  kind: "ready",
  todayKey: "2026-10-08",
  range: lastWeek,
  rangeLabel: "Semana anterior",
  previous: { first: "2026-09-21", last: "2026-09-27" },
  next: thisWeek,
  currentWeek: thisWeek,
  shortcuts: [],
  groupBy: "project",
  subgroups: [],
  levelsShown: 1,
  scope: "everyone",
  timeZone: "America/Argentina/Buenos_Aires",
  totalSeconds: 0,
  billableSeconds: 0,
  groups: [],
  filters: NO_REPORT_FILTERS,
  filterOptions,
  chart: null,
};

function render(overrides: Partial<ReportReadyState> = {}): string {
  return renderToStaticMarkup(<ReportToolbar state={{ ...state, ...overrides }} />);
}

/** Los enlaces de la barra, por su nombre accesible o su texto. */
function links(markup: string): Map<string, { href: string; current: string | null }> {
  return new Map(
    [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(([, attributes, content]) => {
      const name =
        /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? content.replace(/<[^>]+>/g, "");
      const href = (/href="([^"]*)"/.exec(attributes)?.[1] ?? "").replaceAll(
        "&amp;",
        "&",
      );
      const current = /aria-current="([^"]*)"/.exec(attributes)?.[1] ?? null;
      return [name, { href, current }];
    }),
  );
}

/** Los enlaces de «Agrupar por», en orden. */
function groupByLinks(
  markup: string,
): { label: string; href: string; current: string | null }[] {
  const group = /<div role="group"[^>]*>(.*?)<\/div>/.exec(markup)?.[1] ?? "";
  return [...links(group)].map(([label, link]) => ({ label, ...link }));
}

/** El texto de cada botón, en orden. */
function buttonTexts(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, content]) =>
    content.replace(/<[^>]+>/g, ""),
  );
}

describe("ReportToolbar", () => {
  it("las flechas mueven el período y conservan la agrupación (RP-20)", () => {
    const found = links(render());
    expect(found.get("Período anterior")?.href).toBe(
      "/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=proyecto",
    );
    expect(found.get("Período siguiente")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto",
    );
  });

  it("sin destino anterior, no hay «Período anterior»", () => {
    const markup = render({ previous: null });
    expect(markup).not.toContain("Período anterior");
    expect(markup).toContain("Período siguiente");
  });

  it("sin destino siguiente, no hay «Período siguiente»", () => {
    const markup = render({ next: null });
    expect(markup).not.toContain("Período siguiente");
    expect(markup).toContain("Período anterior");
  });

  it("fuera de la semana actual, «Esta semana» lleva a ella con la misma agrupación", () => {
    expect(links(render()).get("Esta semana")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto",
    );
  });

  it("en la semana actual no hay «Esta semana»", () => {
    const found = links(render({ range: thisWeek, rangeLabel: "Esta semana" }));
    expect(found.has("Esta semana")).toBe(false);
  });

  it("un período que empieza con la semana actual pero es más largo no es ella", () => {
    const found = links(render({ range: { first: "2026-10-05", last: "2026-10-12" } }));
    expect(found.has("Esta semana")).toBe(true);
  });

  it("la agrupación elegida lleva aria-current y los enlaces conservan el rango (RP-11)", () => {
    const markup = render();
    expect(markup).toMatch(/<div role="group" aria-labelledby="([^"]+)"/);
    const labelId = /<div role="group" aria-labelledby="([^"]+)"/.exec(markup)?.[1];
    expect(markup).toContain(`<span id="${labelId}"`);
    expect(markup).toMatch(new RegExp(`<span id="${labelId}"[^>]*>Agrupar por</span>`));

    expect(groupByLinks(markup)).toEqual([
      {
        label: "Persona",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=persona",
        current: null,
      },
      {
        label: "Proyecto",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=proyecto",
        current: "true",
      },
      {
        label: "Cliente",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=cliente",
        current: null,
      },
      {
        label: "Tarea",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=tarea",
        current: null,
      },
      {
        label: "Etiqueta",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=etiqueta",
        current: null,
      },
      {
        label: "Fecha",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=fecha",
        current: null,
      },
      {
        label: "Semana",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=semana",
        current: null,
      },
      {
        label: "Mes",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=mes",
        current: null,
      },
      {
        label: "Descripción",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=descripcion",
        current: null,
      },
    ]);
  });

  it("por cliente, la marca pasa a «Cliente» y las flechas la conservan", () => {
    const markup = render({ groupBy: "client" });
    expect(groupByLinks(markup).map(({ label, current }) => [label, current])).toEqual([
      ["Persona", null],
      ["Proyecto", null],
      ["Cliente", "true"],
      ["Tarea", null],
      ["Etiqueta", null],
      ["Fecha", null],
      ["Semana", null],
      ["Mes", null],
      ["Descripción", null],
    ]);
    const found = links(markup);
    expect(found.get("Período anterior")?.href).toBe(
      "/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=cliente",
    );
    expect(found.get("Esta semana")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=cliente",
    );
  });

  it("por persona, la marca pasa a «Persona»", () => {
    const found = links(render({ groupBy: "person" }));
    expect(found.get("Persona")?.current).toBe("true");
    expect(found.get("Proyecto")?.current).toBeNull();
    expect(found.get("Período anterior")?.href).toContain("agrupar=persona");
  });

  it("por fecha, la marca pasa a «Fecha» y las flechas la conservan", () => {
    const markup = render({ groupBy: "date" });
    expect(groupByLinks(markup).map(({ label, current }) => [label, current])).toEqual([
      ["Persona", null],
      ["Proyecto", null],
      ["Cliente", null],
      ["Tarea", null],
      ["Etiqueta", null],
      ["Fecha", "true"],
      ["Semana", null],
      ["Mes", null],
      ["Descripción", null],
    ]);
    expect(links(markup).get("Período siguiente")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=fecha",
    );
  });

  it.each([
    ["week", "Semana", "semana"],
    ["month", "Mes", "mes"],
  ] as const)(
    "por %s, la marca pasa a «%s» y las flechas la conservan (D-R10-5)",
    (groupBy, label, param) => {
      const markup = render({ groupBy });
      const marked = groupByLinks(markup);
      expect(marked.filter(({ current }) => current !== null)).toEqual([
        {
          label,
          href: `/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=${param}`,
          current: "true",
        },
      ]);
      expect(marked.map((link) => link.label).slice(-3)).toEqual([
        "Semana",
        "Mes",
        "Descripción",
      ]);
      const found = links(markup);
      expect(found.get("Período anterior")?.href).toBe(
        `/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=${param}`,
      );
      expect(found.get("Esta semana")?.href).toBe(
        `/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=${param}`,
      );
    },
  );

  it("por tarea, la marca pasa a «Tarea» y las flechas la conservan (RP-11)", () => {
    const markup = render({ groupBy: "task" });
    expect(groupByLinks(markup).map(({ label, current }) => [label, current])).toEqual([
      ["Persona", null],
      ["Proyecto", null],
      ["Cliente", null],
      ["Tarea", "true"],
      ["Etiqueta", null],
      ["Fecha", null],
      ["Semana", null],
      ["Mes", null],
      ["Descripción", null],
    ]);
    const found = links(markup);
    expect(found.get("Período anterior")?.href).toBe(
      "/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=tarea",
    );
    expect(found.get("Esta semana")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=tarea",
    );
  });

  it("por etiqueta, la marca pasa a «Etiqueta» y las flechas la conservan (RP-11)", () => {
    const markup = render({ groupBy: "tag" });
    expect(groupByLinks(markup).map(({ label, current }) => [label, current])).toEqual([
      ["Persona", null],
      ["Proyecto", null],
      ["Cliente", null],
      ["Tarea", null],
      ["Etiqueta", "true"],
      ["Fecha", null],
      ["Semana", null],
      ["Mes", null],
      ["Descripción", null],
    ]);
    expect(links(markup).get("Período siguiente")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=etiqueta",
    );
  });

  it("el botón del período se nombra por lo que muestra", () => {
    expect(render()).toContain('aria-label="Elegir período: Semana anterior"');
  });
});

describe("ReportToolbar con subniveles (D-R3-8)", () => {
  /** Los botones de «Subagrupar por», por su texto: los que siguen hasta «Filtrar por». */
  function subgroupButtons(markup: string): string[] {
    const start = markup.indexOf(">Subagrupar por</span>");
    const end = markup.indexOf(">Filtrar por</span>");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return buttonTexts(markup.slice(start, end));
  }

  it("«Subagrupar por» es un grupo nombrado por su rótulo, después de «Agrupar por»", () => {
    const markup = render();
    const labelIds = [
      ...markup.matchAll(/<div role="group" aria-labelledby="([^"]+)"/g),
    ].map(([, id]) => id);
    expect(labelIds).toHaveLength(3);
    expect(markup).toMatch(
      new RegExp(`<span id="${labelIds[1]}"[^>]*>Subagrupar por</span>`),
    );
    expect(markup.indexOf(">Agrupar por<")).toBeLessThan(
      markup.indexOf(">Subagrupar por<"),
    );
  });

  it("sin subniveles, «Segundo nivel: Ninguno» y sin «Tercer nivel»", () => {
    const markup = render();
    expect(subgroupButtons(markup)).toEqual(["Segundo nivel: Ninguno"]);
    expect(markup).not.toContain("Tercer nivel");
  });

  it("con segundo nivel, el botón lo dice y aparece «Tercer nivel: Ninguno»", () => {
    expect(subgroupButtons(render({ subgroups: ["date"] }))).toEqual([
      "Segundo nivel: Fecha",
      "Tercer nivel: Ninguno",
    ]);
  });

  it("con tres niveles, cada botón dice el suyo, aunque el tope los haya cortado", () => {
    expect(
      subgroupButtons(render({ subgroups: ["date", "tag"], levelsShown: 1 })),
    ).toEqual(["Segundo nivel: Fecha", "Tercer nivel: Etiqueta"]);
  });

  it("las flechas y «Esta semana» conservan los subniveles", () => {
    const found = links(render({ subgroups: ["date", "tag"] }));
    expect(found.get("Período anterior")?.href).toBe(
      "/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=proyecto&subagrupar=fecha%2Cetiqueta",
    );
    expect(found.get("Período siguiente")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha%2Cetiqueta",
    );
    expect(found.get("Esta semana")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha%2Cetiqueta",
    );
  });

  it("«Agrupar por» conserva los subniveles y, con una que está abajo, las intercambia", () => {
    const base = "/reportes?desde=2026-09-28&hasta=2026-10-04";
    expect(
      Object.fromEntries(
        groupByLinks(render({ subgroups: ["date", "tag"] })).map(({ label, href }) => [
          label,
          href,
        ]),
      ),
    ).toEqual({
      Persona: `${base}&agrupar=persona&subagrupar=fecha%2Cetiqueta`,
      Proyecto: `${base}&agrupar=proyecto&subagrupar=fecha%2Cetiqueta`,
      Cliente: `${base}&agrupar=cliente&subagrupar=fecha%2Cetiqueta`,
      Tarea: `${base}&agrupar=tarea&subagrupar=fecha%2Cetiqueta`,
      Etiqueta: `${base}&agrupar=etiqueta&subagrupar=fecha%2Cproyecto`,
      Fecha: `${base}&agrupar=fecha&subagrupar=proyecto%2Cetiqueta`,
      Semana: `${base}&agrupar=semana&subagrupar=fecha%2Cetiqueta`,
      Mes: `${base}&agrupar=mes&subagrupar=fecha%2Cetiqueta`,
      Descripción: `${base}&agrupar=descripcion&subagrupar=fecha%2Cetiqueta`,
    });
  });
});

describe("ReportToolbar con filtros (D-R4-8, D-R4-10)", () => {
  const C1 = "c1000000-0000-4000-8000-000000000000";
  const P1 = "f1000000-0000-4000-8000-000000000000";
  const P2 = "a2000000-0000-4000-8000-000000000000";
  const options: ReportReadyState["filterOptions"] = {
    people: null,
    clients: [{ id: C1, name: "Acme", archived: false }],
    projects: [
      { id: P2, name: "Interno", color: "red", client: null, archived: false },
      {
        id: P1,
        name: "Web",
        color: "teal",
        client: { id: C1, name: "Acme" },
        archived: true,
      },
    ],
  };
  const filters: ReportFilters = {
    people: [],
    clients: [C1],
    projects: [P1, P2],
    withoutProject: false,
  };
  /** Lo que `filters` escribe en la URL, después de la agrupación. */
  const kept = `&clientes=${C1}&proyectos=${P2}%2C${P1}`;

  /** Los botones de «Filtrar por», por su texto. */
  function filterButtons(markup: string): string[] {
    const start = markup.indexOf(">Filtrar por</span>");
    expect(start).toBeGreaterThan(-1);
    return buttonTexts(markup.slice(start));
  }

  it("«Filtrar por» es el tercer grupo nombrado por su rótulo, después de «Subagrupar por»", () => {
    const markup = render();
    const labelIds = [
      ...markup.matchAll(/<div role="group" aria-labelledby="([^"]+)"/g),
    ].map(([, id]) => id);
    expect(labelIds).toHaveLength(3);
    expect(markup).toMatch(
      new RegExp(`<span id="${labelIds[2]}"[^>]*>Filtrar por</span>`),
    );
    expect(markup.indexOf(">Subagrupar por<")).toBeLessThan(
      markup.indexOf(">Filtrar por<"),
    );
  });

  it("sin filtros, «Clientes: todos» y «Proyectos: todos», sin «Personas»", () => {
    const markup = render({ filterOptions: options });
    expect(filterButtons(markup)).toEqual(["Clientes: todos", "Proyectos: todos"]);
    expect(markup).not.toContain("Personas");
  });

  it("el botón no pasa del ancho disponible y recorta lo elegido a la vista", () => {
    const markup = render({ filterOptions: options, filters });
    const start = markup.indexOf(">Filtrar por</span>");
    const buttons = [...markup.slice(start).matchAll(/<button([^>]*)>(.*?)<\/button>/g)];
    expect(buttons).toHaveLength(2);
    for (const [, attributes, content] of buttons) {
      expect(attributes).toMatch(/class="[^"]*max-w-full/);
      expect(content).toMatch(/^<span class="truncate">[^<]+<\/span>$/);
    }
  });

  it("con uno, el botón dice su nombre; con dos, la cantidad", () => {
    expect(filterButtons(render({ filterOptions: options, filters }))).toEqual([
      "Clientes: Acme",
      "Proyectos: 2",
    ]);
  });

  it("«Sin proyecto» cuenta como uno y se nombra así", () => {
    expect(
      filterButtons(
        render({
          filterOptions: options,
          filters: { people: [], clients: [], projects: [], withoutProject: true },
        }),
      ),
    ).toEqual(["Clientes: todos", "Proyectos: Sin proyecto"]);
    expect(
      filterButtons(
        render({
          filterOptions: options,
          filters: { people: [], clients: [], projects: [P1], withoutProject: true },
        }),
      ),
    ).toEqual(["Clientes: todos", "Proyectos: 2"]);
  });

  it("las flechas y «Esta semana» conservan los filtros", () => {
    const found = links(render({ filterOptions: options, filters, subgroups: ["date"] }));
    expect(found.get("Período anterior")?.href).toBe(
      `/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=proyecto&subagrupar=fecha${kept}`,
    );
    expect(found.get("Período siguiente")?.href).toBe(
      `/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha${kept}`,
    );
    expect(found.get("Esta semana")?.href).toBe(
      `/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha${kept}`,
    );
  });

  it("«Agrupar por» conserva los filtros", () => {
    const base = "/reportes?desde=2026-09-28&hasta=2026-10-04";
    expect(
      Object.fromEntries(
        groupByLinks(render({ filterOptions: options, filters })).map(
          ({ label, href }) => [label, href],
        ),
      ),
    ).toEqual({
      Persona: `${base}&agrupar=persona${kept}`,
      Proyecto: `${base}&agrupar=proyecto${kept}`,
      Cliente: `${base}&agrupar=cliente${kept}`,
      Tarea: `${base}&agrupar=tarea${kept}`,
      Etiqueta: `${base}&agrupar=etiqueta${kept}`,
      Fecha: `${base}&agrupar=fecha${kept}`,
      Semana: `${base}&agrupar=semana${kept}`,
      Mes: `${base}&agrupar=mes${kept}`,
      Descripción: `${base}&agrupar=descripcion${kept}`,
    });
  });
});

describe("ReportToolbar con el filtro de personas (D-R4-4, D-R4-8)", () => {
  const ANA = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY";
  const BRUNO = "Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx";
  const C1 = "c1000000-0000-4000-8000-000000000000";
  const options: ReportReadyState["filterOptions"] = {
    people: [
      { id: ANA, name: "Ana", inactive: false },
      { id: BRUNO, name: "Bruno", inactive: true },
    ],
    clients: [{ id: C1, name: "Acme", archived: false }],
    projects: [],
  };

  /** Los botones de «Filtrar por», por su texto. */
  function filterButtons(markup: string): string[] {
    const start = markup.indexOf(">Filtrar por</span>");
    expect(start).toBeGreaterThan(-1);
    return buttonTexts(markup.slice(start));
  }

  it("con el catálogo de personas, «Personas: todas» antes de «Clientes»", () => {
    expect(filterButtons(render({ filterOptions: options }))).toEqual([
      "Personas: todas",
      "Clientes: todos",
      "Proyectos: todos",
    ]);
  });

  it("sin el catálogo (`null`), no hay «Personas», aunque lleguen personas elegidas", () => {
    const markup = render({
      filterOptions: { ...options, people: null },
      filters: { ...NO_REPORT_FILTERS, people: [ANA] },
    });
    expect(filterButtons(markup)).toEqual(["Clientes: todos", "Proyectos: todos"]);
    expect(markup).not.toContain("Personas");
  });

  it("con una, el botón dice su nombre; con dos, la cantidad", () => {
    expect(
      filterButtons(
        render({
          filterOptions: options,
          filters: { ...NO_REPORT_FILTERS, people: [BRUNO] },
        }),
      )[0],
    ).toBe("Personas: Bruno");
    expect(
      filterButtons(
        render({
          filterOptions: options,
          filters: { ...NO_REPORT_FILTERS, people: [ANA, BRUNO] },
        }),
      )[0],
    ).toBe("Personas: 2");
  });

  it("las flechas, «Esta semana» y «Agrupar por» conservan `personas` con los ids tal cual", () => {
    const markup = render({
      filterOptions: options,
      filters: { ...NO_REPORT_FILTERS, people: [ANA, BRUNO], clients: [C1] },
    });
    const kept = `&personas=${BRUNO}%2C${ANA}&clientes=${C1}`;
    const found = links(markup);
    expect(found.get("Período anterior")?.href).toBe(
      `/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=proyecto${kept}`,
    );
    expect(found.get("Período siguiente")?.href).toBe(
      `/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto${kept}`,
    );
    expect(found.get("Esta semana")?.href).toBe(
      `/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto${kept}`,
    );
    expect(groupByLinks(markup).every(({ href }) => href.endsWith(kept))).toBe(true);
  });
});

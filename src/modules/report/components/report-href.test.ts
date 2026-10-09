import { describe, expect, it } from "vitest";

import {
  NO_REPORT_FILTERS,
  reportFiltersOf,
  reportGroupParams,
  reportRangeParams,
  reportSubgroupParams,
  type ReportFilters,
  type ReportGrouping,
} from "@/modules/report/schema";

import { reportHref } from "./report-href";

const range = { first: "2026-10-05", last: "2026-10-11" };
const filters = NO_REPORT_FILTERS;

describe("reportHref", () => {
  it("lleva el rango con los dos extremos y la agrupación por persona", () => {
    expect(reportHref({ range, groupBy: "person", filters })).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=persona",
    );
  });

  it("la agrupación por proyecto se escribe `proyecto`", () => {
    expect(reportHref({ range, groupBy: "project", filters })).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto",
    );
  });

  it("los parámetros vuelven a leerse como uno solo cada uno", () => {
    const params = new URL(
      reportHref({
        range: { first: "2026-10-08", last: "2026-10-08" },
        groupBy: "person",
        filters,
      }),
      "https://clock.test",
    ).searchParams;
    expect(params.getAll("desde")).toEqual(["2026-10-08"]);
    expect(params.getAll("hasta")).toEqual(["2026-10-08"]);
    expect(params.getAll("agrupar")).toEqual(["persona"]);
  });

  it.each(["person", "project"] as const)(
    "la página lee lo mismo que se escribió, agrupando por %s",
    (groupBy) => {
      const params = Object.fromEntries(
        new URL(reportHref({ range, groupBy, filters }), "https://clock.test")
          .searchParams,
      );
      expect(reportRangeParams.safeParse(params).data).toEqual(range);
      expect(reportGroupParams.safeParse(params).data).toBe(groupBy);
    },
  );

  it("sin subniveles, la URL de R2b: tres parámetros y sin `subagrupar`", () => {
    const href = reportHref({ range, groupBy: "tag", subgroups: [], filters });
    expect(href).toBe("/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=etiqueta");
    expect([...new URL(href, "https://clock.test").searchParams.keys()]).toEqual([
      "desde",
      "hasta",
      "agrupar",
    ]);
  });

  it("con un subnivel, `subagrupar` es el cuarto parámetro (D-R3-5)", () => {
    expect(reportHref({ range, groupBy: "project", subgroups: ["date"], filters })).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha",
    );
  });

  it("con dos subniveles, en su orden y separados por una coma", () => {
    const href = reportHref({
      range,
      groupBy: "project",
      subgroups: ["date", "tag"],
      filters,
    });
    expect(href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha%2Cetiqueta",
    );
    const params = new URL(href, "https://clock.test").searchParams;
    expect([...params.keys()]).toEqual(["desde", "hasta", "agrupar", "subagrupar"]);
    expect(params.getAll("subagrupar")).toEqual(["fecha,etiqueta"]);
  });

  it.each<ReportGrouping>([
    { groupBy: "person", subgroups: ["task"] },
    { groupBy: "project", subgroups: ["date", "tag"] },
    { groupBy: "tag", subgroups: ["client", "person"] },
  ])("la página lee la misma agrupación que se escribió: %o", (grouping) => {
    const params = Object.fromEntries(
      new URL(reportHref({ range, ...grouping, filters }), "https://clock.test")
        .searchParams,
    );
    expect(reportRangeParams.safeParse(params).data).toEqual(range);
    expect(reportGroupParams.safeParse(params).data).toBe(grouping.groupBy);
    expect(reportSubgroupParams.safeParse(params).data).toEqual(grouping.subgroups);
  });
});

describe("reportHref con filtros (D-R4-2)", () => {
  const C1 = "c1000000-0000-4000-8000-000000000000";
  const C2 = "0c200000-0000-4000-8000-000000000000";
  const P1 = "f1000000-0000-4000-8000-000000000000";
  const P2 = "a2000000-0000-4000-8000-000000000000";
  const P3 = "b3000000-0000-4000-8000-000000000000";
  /** Un id de Better Auth: 32 alfanuméricos con mayúsculas. */
  const ANA = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY";
  const BRUNO = "Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx";
  const CARLA = "9e0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
  const base = "/reportes?desde=2026-10-05&hasta=2026-10-11";

  it("sin filtros, la URL de R3", () => {
    expect(reportHref({ range, groupBy: "project", subgroups: ["date"], filters })).toBe(
      `${base}&agrupar=proyecto&subagrupar=fecha`,
    );
  });

  it("después de `subagrupar`, `clientes` y `proyectos`, cada lista ordenada y `sin-proyecto` al final", () => {
    const href = reportHref({
      range,
      groupBy: "project",
      subgroups: ["date"],
      filters: {
        people: [],
        clients: [C1, C2],
        projects: [P1, P2, P3],
        withoutProject: true,
      },
    });
    expect(href).toBe(
      `${base}&agrupar=proyecto&subagrupar=fecha` +
        `&clientes=${C2}%2C${C1}` +
        `&proyectos=${P2}%2C${P3}%2C${P1}%2Csin-proyecto`,
    );
    expect([...new URL(href, "https://clock.test").searchParams.keys()]).toEqual([
      "desde",
      "hasta",
      "agrupar",
      "subagrupar",
      "clientes",
      "proyectos",
    ]);
  });

  it("una lista vacía no se escribe", () => {
    expect(
      reportHref({
        range,
        groupBy: "person",
        filters: { people: [], clients: [], projects: [P1], withoutProject: false },
      }),
    ).toBe(`${base}&agrupar=persona&proyectos=${P1}`);
    expect(
      reportHref({
        range,
        groupBy: "person",
        filters: { people: [], clients: [C1], projects: [], withoutProject: false },
      }),
    ).toBe(`${base}&agrupar=persona&clientes=${C1}`);
  });

  it("«Sin proyecto» solo es `proyectos=sin-proyecto`", () => {
    expect(
      reportHref({
        range,
        groupBy: "person",
        filters: { people: [], clients: [], projects: [], withoutProject: true },
      }),
    ).toBe(`${base}&agrupar=persona&proyectos=sin-proyecto`);
  });

  it("no cambia el orden de las listas que recibe", () => {
    const projects = [P1, P2];
    reportHref({
      range,
      groupBy: "person",
      filters: { people: [], clients: [], projects, withoutProject: false },
    });
    expect(projects).toEqual([P1, P2]);
  });

  it("`personas` va antes de `clientes`, ordenada por unidades de código y con los ids tal cual", () => {
    const href = reportHref({
      range,
      groupBy: "person",
      filters: {
        people: [ANA, CARLA, BRUNO],
        clients: [C1],
        projects: [],
        withoutProject: false,
      },
    });
    expect(href).toBe(
      `${base}&agrupar=persona&personas=${CARLA}%2C${BRUNO}%2C${ANA}&clientes=${C1}`,
    );
    expect([...new URL(href, "https://clock.test").searchParams.keys()]).toEqual([
      "desde",
      "hasta",
      "agrupar",
      "personas",
      "clientes",
    ]);
  });

  it("las tres listas, en el orden de D-R4-2, después de `subagrupar`", () => {
    const href = reportHref({
      range,
      groupBy: "project",
      subgroups: ["date"],
      filters: { people: [ANA], clients: [C1], projects: [P1], withoutProject: true },
    });
    expect([...new URL(href, "https://clock.test").searchParams.keys()]).toEqual([
      "desde",
      "hasta",
      "agrupar",
      "subagrupar",
      "personas",
      "clientes",
      "proyectos",
    ]);
  });

  it.each<ReportFilters>([
    { people: [], clients: [C1, C2], projects: [P1, P2, P3], withoutProject: true },
    { people: [], clients: [], projects: [], withoutProject: true },
    { people: [], clients: [C2], projects: [], withoutProject: false },
    { people: [ANA, BRUNO, CARLA], clients: [], projects: [], withoutProject: false },
    { people: [BRUNO], clients: [C1], projects: [P2], withoutProject: true },
  ])("la página lee los mismos filtros que se escribieron: %o", (written) => {
    const params = Object.fromEntries(
      new URL(
        reportHref({ range, groupBy: "client", subgroups: ["tag"], filters: written }),
        "https://clock.test",
      ).searchParams,
    );
    expect(reportFiltersOf(params)).toEqual({
      people: [...written.people].sort(),
      clients: [...written.clients].sort(),
      projects: [...written.projects].sort(),
      withoutProject: written.withoutProject,
    });
  });
});

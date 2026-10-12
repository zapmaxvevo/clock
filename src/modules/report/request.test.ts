import { describe, expect, it } from "vitest";

import { reportRequestOf, searchParamsRecord } from "./request";
import { NO_REPORT_FILTERS } from "./schema";

const CLIENT_ID = "0b6f3a52-6c1e-4d8b-9f2a-3c4d5e6f7a8b";
const PROJECT_ID = "5e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b";
const PERSON_ID = "Xk3vR9pL2mQ8sT5wY7zB1nC4dF6gH0jA";

/** El pedido de una query, por el mismo camino que la ruta de exportación. */
function requestOfQuery(query: string) {
  return reportRequestOf(searchParamsRecord(new URLSearchParams(query)));
}

describe("searchParamsRecord (D-R6-4; criterio 3 de R6)", () => {
  it("da un string por parámetro", () => {
    expect(
      searchParamsRecord(new URLSearchParams("desde=2026-09-28&agrupar=proyecto")),
    ).toEqual({ desde: "2026-09-28", agrupar: "proyecto" });
  });

  it("da un arreglo con un parámetro repetido, en el orden de la URL", () => {
    expect(
      searchParamsRecord(new URLSearchParams("desde=a&agrupar=proyecto&desde=b")),
    ).toEqual({ desde: ["a", "b"], agrupar: "proyecto" });
  });

  it("da un registro vacío sin query", () => {
    expect(searchParamsRecord(new URLSearchParams(""))).toEqual({});
  });
});

describe("reportRequestOf (RP-32, D-R6-4; criterio 3 de R6)", () => {
  it("sin query, el pedido de la semana actual por persona, sin subniveles ni filtros", () => {
    expect(requestOfQuery("")).toEqual({
      range: null,
      groupBy: null,
      subgroups: [],
      filters: NO_REPORT_FILTERS,
      peopleWithoutTime: false,
    });
  });

  it("lee una query válida con subniveles y los tres filtros", () => {
    expect(
      requestOfQuery(
        `desde=2026-09-28&hasta=2026-10-04&agrupar=proyecto&subagrupar=persona,fecha` +
          `&personas=${PERSON_ID}&clientes=${CLIENT_ID}&proyectos=${PROJECT_ID},sin-proyecto`,
      ),
    ).toEqual({
      range: { first: "2026-09-28", last: "2026-10-04" },
      groupBy: "project",
      subgroups: ["person", "date"],
      filters: {
        people: [PERSON_ID],
        clients: [CLIENT_ID],
        projects: [PROJECT_ID],
        withoutProject: true,
      },
      peopleWithoutTime: false,
    });
  });

  it("descarta el rango invertido y deja lo demás", () => {
    expect(requestOfQuery("desde=2026-10-04&hasta=2026-09-28&agrupar=proyecto")).toEqual({
      range: null,
      groupBy: "project",
      subgroups: [],
      filters: NO_REPORT_FILTERS,
      peopleWithoutTime: false,
    });
  });

  it("descarta una agrupación desconocida y deja el rango", () => {
    expect(
      requestOfQuery("desde=2026-09-28&hasta=2026-10-04&agrupar=cualquiera"),
    ).toEqual({
      range: { first: "2026-09-28", last: "2026-10-04" },
      groupBy: null,
      subgroups: [],
      filters: NO_REPORT_FILTERS,
      peopleWithoutTime: false,
    });
  });

  it("descarta un subnivel que repite el primero, también el que se toma por omisión", () => {
    expect(requestOfQuery("subagrupar=persona")).toEqual({
      range: null,
      groupBy: null,
      subgroups: [],
      filters: NO_REPORT_FILTERS,
      peopleWithoutTime: false,
    });
    expect(requestOfQuery("agrupar=proyecto&subagrupar=proyecto")).toEqual({
      range: null,
      groupBy: "project",
      subgroups: [],
      filters: NO_REPORT_FILTERS,
      peopleWithoutTime: false,
    });
  });

  it("descarta personas repetidas sin arrastrar a los otros filtros", () => {
    expect(requestOfQuery(`personas=a,a&clientes=${CLIENT_ID}`)).toEqual({
      range: null,
      groupBy: null,
      subgroups: [],
      filters: { ...NO_REPORT_FILTERS, clients: [CLIENT_ID] },
      peopleWithoutTime: false,
    });
  });

  it("con desde repetido descarta el rango y deja lo demás igual", () => {
    expect(
      requestOfQuery(
        `desde=2026-09-28&desde=2026-09-29&hasta=2026-10-04&agrupar=proyecto` +
          `&subagrupar=fecha&proyectos=${PROJECT_ID}`,
      ),
    ).toEqual({
      range: null,
      groupBy: "project",
      subgroups: ["date"],
      filters: { ...NO_REPORT_FILTERS, projects: [PROJECT_ID] },
      peopleWithoutTime: false,
    });
  });

  it("con sin-horas=1, true, también con un agrupar inválido o por proyecto: el pedido no decide si aplica (D-R9-4; criterio 2 de R9)", () => {
    for (const [query, groupBy] of [
      ["sin-horas=1", null],
      ["agrupar=cualquiera&sin-horas=1", null],
      ["agrupar=proyecto&sin-horas=1", "project"],
    ] as const) {
      expect(requestOfQuery(query)).toEqual({
        range: null,
        groupBy,
        subgroups: [],
        filters: NO_REPORT_FILTERS,
        peopleWithoutTime: true,
      });
    }
  });

  it("un sin-horas inválido o repetido da false y no cambia los otros parámetros (D-R9-4, RP-32; criterio 2 de R9)", () => {
    const others =
      `desde=2026-09-28&hasta=2026-10-04&agrupar=persona&subagrupar=proyecto,fecha` +
      `&personas=${PERSON_ID}&clientes=${CLIENT_ID}&proyectos=${PROJECT_ID}`;
    const expected = {
      range: { first: "2026-09-28", last: "2026-10-04" },
      groupBy: "person",
      subgroups: ["project", "date"],
      filters: {
        people: [PERSON_ID],
        clients: [CLIENT_ID],
        projects: [PROJECT_ID],
        withoutProject: false,
      },
      peopleWithoutTime: false,
    };
    expect(requestOfQuery(others)).toEqual(expected);
    for (const option of [
      "sin-horas=0",
      "sin-horas=true",
      "sin-horas=si",
      "sin-horas=",
      "sin-horas",
      "sin-horas=%201",
      "sin-horas=1%20",
      "sin-horas=1&sin-horas=1",
      "Sin-horas=1",
      "sin_horas=1",
    ]) {
      expect([option, requestOfQuery(`${others}&${option}`)]).toEqual([option, expected]);
      expect([option, requestOfQuery(`${option}&${others}`)]).toEqual([option, expected]);
    }
    expect(requestOfQuery(`${others}&sin-horas=1`)).toEqual({
      ...expected,
      peopleWithoutTime: true,
    });
  });
});

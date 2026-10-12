import { describe, expect, it } from "vitest";

import {
  REPORT_GROUP_BYS,
  type ReportGroupBy,
  type ReportGrouping,
} from "@/modules/report/schema";

import { levelOptions, withLevel } from "./grouping-model";

/** «persona · proyecto · fecha», como la tabla de §5.2. */
function grouping(...[groupBy, ...subgroups]: [ReportGroupBy, ...ReportGroupBy[]]) {
  return { groupBy, subgroups, peopleWithoutTime: false } satisfies ReportGrouping;
}

describe("withLevel (D-R3-8, §5.2)", () => {
  it.each<[ReportGrouping, 0 | 1 | 2, ReportGroupBy | null, ReportGrouping]>([
    [grouping("person"), 0, "project", grouping("project")],
    [grouping("person", "project"), 0, "project", grouping("project", "person")],
    [
      grouping("person", "project", "date"),
      0,
      "date",
      grouping("date", "project", "person"),
    ],
    [grouping("person"), 1, "date", grouping("person", "date")],
    [grouping("person", "project"), 1, "date", grouping("person", "date")],
    [
      grouping("person", "project", "date"),
      1,
      "date",
      grouping("person", "date", "project"),
    ],
    [grouping("person", "project"), 2, "tag", grouping("person", "project", "tag")],
    [grouping("person", "project", "date"), 1, null, grouping("person")],
    [grouping("person", "project", "date"), 2, null, grouping("person", "project")],
    [grouping("person"), 1, null, grouping("person")],
  ])("%o, nivel %i: %s da %o", (from, level, dimension, expected) => {
    expect(withLevel(from, level, dimension)).toEqual(expected);
  });

  it("la que ya está en ese nivel deja todo igual", () => {
    expect(withLevel(grouping("person", "project"), 1, "project")).toEqual(
      grouping("person", "project"),
    );
  });

  it("no cambia la agrupación que recibe", () => {
    const from = grouping("person", "project", "date");
    withLevel(from, 0, "date");
    expect(from).toEqual(grouping("person", "project", "date"));
  });

  it("lanza con un nivel debajo del siguiente al último", () => {
    expect(() => withLevel(grouping("person"), 2, "date")).toThrow(RangeError);
  });

  it("lanza con «Ninguno» en el primer nivel", () => {
    expect(() => withLevel(grouping("person", "project"), 0, null)).toThrow(RangeError);
  });

  it("lanza con un nivel nuevo que repite uno de arriba", () => {
    expect(() => withLevel(grouping("person", "project"), 2, "person")).toThrow(
      RangeError,
    );
  });
});

/** La misma agrupación con las personas sin horas encendidas. */
function withoutTime(...levels: [ReportGroupBy, ...ReportGroupBy[]]) {
  return { ...grouping(...levels), peopleWithoutTime: true } satisfies ReportGrouping;
}

describe("withLevel con las personas sin horas (D-R9-12, §5.2)", () => {
  it.each<[ReportGrouping, 0 | 1 | 2, ReportGroupBy | null, ReportGrouping]>([
    [withoutTime("person"), 1, "project", withoutTime("person", "project")],
    [withoutTime("person", "project"), 1, "date", withoutTime("person", "date")],
    [withoutTime("person", "project"), 2, "tag", withoutTime("person", "project", "tag")],
    [
      withoutTime("person", "project", "date"),
      2,
      "tag",
      withoutTime("person", "project", "tag"),
    ],
    [
      withoutTime("person", "project", "date"),
      1,
      "date",
      withoutTime("person", "date", "project"),
    ],
    [withoutTime("person", "project", "date"), 1, null, withoutTime("person")],
    [withoutTime("person", "project", "date"), 2, null, withoutTime("person", "project")],
    [withoutTime("person"), 0, "person", withoutTime("person")],
    [withoutTime("person", "project"), 0, "person", withoutTime("person", "project")],
  ])(
    "con la persona arriba la conserva: %o, nivel %i: %s da %o",
    (from, level, dimension, expected) => {
      expect(withLevel(from, level, dimension)).toEqual(expected);
    },
  );

  it.each<[ReportGrouping, ReportGroupBy, ReportGrouping]>([
    [withoutTime("person"), "project", grouping("project")],
    [withoutTime("person", "project"), "project", grouping("project", "person")],
    [
      withoutTime("person", "project", "date"),
      "date",
      grouping("date", "project", "person"),
    ],
  ])(
    "otra dimensión en el primer nivel la apaga: %o con %s da %o",
    (from, dimension, expected) => {
      expect(withLevel(from, 0, dimension)).toEqual(expected);
    },
  );

  it("volver a «Persona» después de «Proyecto» la deja apagada", () => {
    const byProject = withLevel(withoutTime("person", "project"), 0, "project");
    expect(withLevel(byProject, 0, "person")).toEqual(grouping("person", "project"));
  });

  it("sin la opción, ninguna transición la enciende", () => {
    const froms = [
      grouping("person"),
      grouping("person", "project"),
      grouping("person", "project", "date"),
      grouping("project"),
      grouping("project", "person"),
      grouping("project", "person", "date"),
    ];
    let transitions = 0;
    for (const from of froms) {
      for (const level of [0, 1, 2] as const) {
        for (const dimension of [...REPORT_GROUP_BYS, null]) {
          let to: ReportGrouping;
          try {
            to = withLevel(from, level, dimension);
          } catch {
            continue;
          }
          transitions += 1;
          expect(to.peopleWithoutTime).toBe(false);
        }
      }
    }
    // Que el recorrido no quede vacío por un `RangeError` de más.
    expect(transitions).toBeGreaterThan(100);
  });
});

describe("levelOptions", () => {
  it("con un nivel, el segundo ofrece las ocho que no son el primero, en orden", () => {
    expect(levelOptions(grouping("project"), 1)).toEqual([
      "person",
      "client",
      "task",
      "tag",
      "date",
      "week",
      "month",
      "description",
    ]);
  });

  it("con dos niveles, el segundo sigue ofreciendo las que no son el primero", () => {
    expect(levelOptions(grouping("project", "date"), 1)).toEqual([
      "person",
      "client",
      "task",
      "tag",
      "date",
      "week",
      "month",
      "description",
    ]);
  });

  it("con dos niveles, el tercero ofrece las siete que no son los de arriba", () => {
    expect(levelOptions(grouping("project", "date"), 2)).toEqual([
      "person",
      "client",
      "task",
      "tag",
      "week",
      "month",
      "description",
    ]);
  });

  it("Mes → Semana: el tercero ofrece la fecha y no las dos de arriba (D-R10-6)", () => {
    expect(levelOptions(grouping("month", "week"), 2)).toEqual([
      "person",
      "project",
      "client",
      "task",
      "tag",
      "date",
      "description",
    ]);
  });

  it("con tres niveles, el tercero no ofrece los de arriba y sí el suyo", () => {
    expect(levelOptions(grouping("tag", "person", "client"), 2)).toEqual([
      "project",
      "client",
      "task",
      "date",
      "week",
      "month",
      "description",
    ]);
    expect(levelOptions(grouping("tag", "person", "client"), 1)).toEqual([
      "person",
      "project",
      "client",
      "task",
      "date",
      "week",
      "month",
      "description",
    ]);
  });
});

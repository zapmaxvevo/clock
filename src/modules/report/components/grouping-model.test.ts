import { describe, expect, it } from "vitest";

import type { ReportGroupBy, ReportGrouping } from "@/modules/report/schema";

import { levelOptions, withLevel } from "./grouping-model";

/** «persona · proyecto · fecha», como la tabla de §5.2. */
function grouping(...[groupBy, ...subgroups]: [ReportGroupBy, ...ReportGroupBy[]]) {
  return { groupBy, subgroups } satisfies ReportGrouping;
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

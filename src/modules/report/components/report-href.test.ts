import { describe, expect, it } from "vitest";

import {
  reportGroupParams,
  reportRangeParams,
  reportSubgroupParams,
  type ReportGrouping,
} from "@/modules/report/schema";

import { reportHref } from "./report-href";

const range = { first: "2026-10-05", last: "2026-10-11" };

describe("reportHref", () => {
  it("lleva el rango con los dos extremos y la agrupación por persona", () => {
    expect(reportHref({ range, groupBy: "person" })).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=persona",
    );
  });

  it("la agrupación por proyecto se escribe `proyecto`", () => {
    expect(reportHref({ range, groupBy: "project" })).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto",
    );
  });

  it("los parámetros vuelven a leerse como uno solo cada uno", () => {
    const params = new URL(
      reportHref({
        range: { first: "2026-10-08", last: "2026-10-08" },
        groupBy: "person",
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
        new URL(reportHref({ range, groupBy }), "https://clock.test").searchParams,
      );
      expect(reportRangeParams.safeParse(params).data).toEqual(range);
      expect(reportGroupParams.safeParse(params).data).toBe(groupBy);
    },
  );

  it("sin subniveles, la URL de R2b: tres parámetros y sin `subagrupar`", () => {
    const href = reportHref({ range, groupBy: "tag", subgroups: [] });
    expect(href).toBe("/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=etiqueta");
    expect([...new URL(href, "https://clock.test").searchParams.keys()]).toEqual([
      "desde",
      "hasta",
      "agrupar",
    ]);
  });

  it("con un subnivel, `subagrupar` es el cuarto parámetro (D-R3-5)", () => {
    expect(reportHref({ range, groupBy: "project", subgroups: ["date"] })).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha",
    );
  });

  it("con dos subniveles, en su orden y separados por una coma", () => {
    const href = reportHref({ range, groupBy: "project", subgroups: ["date", "tag"] });
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
      new URL(reportHref({ range, ...grouping }), "https://clock.test").searchParams,
    );
    expect(reportRangeParams.safeParse(params).data).toEqual(range);
    expect(reportGroupParams.safeParse(params).data).toBe(grouping.groupBy);
    expect(reportSubgroupParams.safeParse(params).data).toEqual(grouping.subgroups);
  });
});

import { describe, expect, it } from "vitest";

import { calendarHref } from "./calendar-href";

describe("calendarHref", () => {
  it("la vista semana lleva solo el día de inicio", () => {
    expect(calendarHref("week", "2026-09-28")).toBe("/calendario?semana=2026-09-28");
  });

  it("la vista día suma `vista=dia`", () => {
    expect(calendarHref("day", "2026-10-01")).toBe(
      "/calendario?semana=2026-10-01&vista=dia",
    );
  });

  it("los parámetros vuelven a leerse como uno solo cada uno", () => {
    const params = new URL(calendarHref("day", "2026-10-01"), "https://clock.test")
      .searchParams;
    expect(params.getAll("semana")).toEqual(["2026-10-01"]);
    expect(params.getAll("vista")).toEqual(["dia"]);
  });
});

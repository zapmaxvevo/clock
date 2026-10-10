import { describe, expect, it } from "vitest";

import { chartGranularityOf } from "./chart";

describe("chartGranularityOf (D-R5-4; criterio 1 de R5)", () => {
  it("por día de 1 a 31 días", () => {
    expect(chartGranularityOf({ first: "2026-10-01", last: "2026-10-01" })).toBe("date");
    expect(chartGranularityOf({ first: "2026-10-01", last: "2026-10-31" })).toBe("date");
  });

  it("por semana de 32 a 182 días", () => {
    expect(chartGranularityOf({ first: "2026-10-01", last: "2026-11-01" })).toBe("week");
    expect(chartGranularityOf({ first: "2026-07-01", last: "2026-12-29" })).toBe("week");
  });

  it("por mes de 183 a 366 días", () => {
    expect(chartGranularityOf({ first: "2026-07-01", last: "2026-12-30" })).toBe("month");
    expect(chartGranularityOf({ first: "2025-01-15", last: "2026-01-15" })).toBe("month");
  });

  it("cuenta en días un período que cruza el año", () => {
    expect(chartGranularityOf({ first: "2025-12-15", last: "2026-01-14" })).toBe("date");
  });
});

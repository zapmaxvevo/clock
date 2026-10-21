import { describe, expect, it } from "vitest";

import { cellText } from "./cell-text";

describe("cellText (D-R6-9, D-R7-6; criterio 2 de R7)", () => {
  it("deja el texto tal cual, sin el ' de la inyección, que es del CSV", () => {
    expect(cellText({ kind: "text", text: "Web (ACME)" }, "compact")).toBe("Web (ACME)");
    expect(cellText({ kind: "text", text: "=1+1" }, "compact")).toBe("=1+1");
  });

  it("escribe la duración como `h:mm`, también con más de cien horas", () => {
    expect(cellText({ kind: "duration", seconds: 5400 }, "compact")).toBe("1:30");
    expect(cellText({ kind: "duration", seconds: 7_200_000 }, "compact")).toBe("2000:00");
  });

  it("escribe las horas con coma, truncadas al centésimo", () => {
    expect(cellText({ kind: "hours", minutes: 1 }, "compact")).toBe("0,01");
    expect(cellText({ kind: "hours", minutes: 89 }, "compact")).toBe("1,48");
  });

  it("escribe el nivel, las claves canónicas y la celda vacía", () => {
    expect(cellText({ kind: "integer", value: 3 }, "compact")).toBe("3");
    expect(cellText({ kind: "day", dayKey: "2026-10-01" }, "compact")).toBe("2026-10-01");
    expect(cellText({ kind: "clock", clock: "09:30" }, "compact")).toBe("09:30");
    expect(cellText({ kind: "empty" }, "compact")).toBe("");
  });
});

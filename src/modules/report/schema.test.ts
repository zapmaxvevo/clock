import { describe, expect, it } from "vitest";

import {
  REPORT_MAX_DAYS,
  reportGroupParams,
  reportMessages,
  reportRangeInput,
  reportRangeParams,
} from "./schema";

/** Los mensajes de un `safeParse` fallido; vacío si pasa. */
function messagesOf(result: {
  readonly success: boolean;
  readonly error?: { readonly issues: readonly { readonly message: string }[] };
}): readonly string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("reportRangeInput (RP-21, RP-34)", () => {
  it("acepta un día suelto, una semana y 366 días contando los dos extremos", () => {
    for (const range of [
      { first: "2026-10-05", last: "2026-10-05" },
      { first: "2026-10-05", last: "2026-10-11" },
      { first: "2025-01-01", last: "2025-12-31" },
      // 2028 es bisiesto: el año entero son 366 días.
      { first: "2028-01-01", last: "2028-12-31" },
      { first: "2025-10-08", last: "2026-10-08" },
    ]) {
      expect(reportRangeInput.safeParse(range)).toEqual({ success: true, data: range });
    }
    expect(REPORT_MAX_DAYS).toBe(366);
  });

  it("rechaza 367 días con rangeTooLong, también cruzando el año", () => {
    for (const range of [
      { first: "2025-10-07", last: "2026-10-08" },
      { first: "2025-01-01", last: "2026-01-02" },
      { first: "2027-12-31", last: "2028-12-31" },
    ]) {
      expect(messagesOf(reportRangeInput.safeParse(range))).toEqual([
        reportMessages.rangeTooLong,
      ]);
    }
  });

  it("rechaza el fin anterior al inicio con endBeforeStart", () => {
    expect(
      messagesOf(reportRangeInput.safeParse({ first: "2026-10-11", last: "2026-10-05" })),
    ).toEqual([reportMessages.endBeforeStart]);
    expect(
      messagesOf(reportRangeInput.safeParse({ first: "2026-01-01", last: "2025-12-31" })),
    ).toEqual([reportMessages.endBeforeStart]);
  });

  it("rechaza una clave que no existe con invalidDate", () => {
    for (const range of [
      { first: "2026-02-30", last: "2026-03-05" },
      { first: "2026-03-01", last: "2026-02-30" },
      { first: "ayer", last: "2026-03-05" },
      { first: "2026-03-01", last: "" },
    ]) {
      expect(messagesOf(reportRangeInput.safeParse(range))).toEqual([
        reportMessages.invalidDate,
      ]);
    }
  });

  it("rechaza hasta = 9999-12-31 con invalidDate: el día siguiente no tiene clave", () => {
    expect(
      messagesOf(reportRangeInput.safeParse({ first: "9999-12-01", last: "9999-12-31" })),
    ).toEqual([reportMessages.invalidDate]);
    expect(
      reportRangeInput.safeParse({ first: "9999-12-01", last: "9999-12-30" }).success,
    ).toBe(true);
  });

  it("un rango de 367 días que termina en 9999-12-31 da invalidDate primero", () => {
    expect(
      messagesOf(reportRangeInput.safeParse({ first: "9998-12-29", last: "9999-12-31" })),
    ).toEqual([reportMessages.invalidDate]);
  });

  it("un fin anterior al inicio y a más de 366 días da endBeforeStart y no rangeTooLong", () => {
    expect(
      messagesOf(reportRangeInput.safeParse({ first: "2026-10-05", last: "2024-01-01" })),
    ).toEqual([reportMessages.endBeforeStart]);
  });
});

describe("reportRangeParams (RP-32)", () => {
  it("lee desde y hasta como el período", () => {
    expect(
      reportRangeParams.safeParse({ desde: "2026-10-05", hasta: "2026-10-11" }),
    ).toEqual({ success: true, data: { first: "2026-10-05", last: "2026-10-11" } });
  });

  it("no pasa con uno solo de los dos", () => {
    expect(reportRangeParams.safeParse({ desde: "2026-10-05" }).success).toBe(false);
    expect(reportRangeParams.safeParse({ hasta: "2026-10-11" }).success).toBe(false);
    expect(reportRangeParams.safeParse({}).success).toBe(false);
  });

  it("no pasa con un parámetro repetido", () => {
    expect(
      reportRangeParams.safeParse({
        desde: ["2026-10-05", "2026-10-06"],
        hasta: "2026-10-11",
      }).success,
    ).toBe(false);
    expect(
      reportRangeParams.safeParse({
        desde: "2026-10-05",
        hasta: ["2026-10-11", "2026-10-11"],
      }).success,
    ).toBe(false);
  });

  it("aplica las reglas de reportRangeInput", () => {
    for (const params of [
      { desde: "2026-10-11", hasta: "2026-10-05" },
      { desde: "2025-01-01", hasta: "2026-01-02" },
      { desde: "2026-02-30", hasta: "2026-03-05" },
      { desde: "9999-12-01", hasta: "9999-12-31" },
    ]) {
      expect(reportRangeParams.safeParse(params).success).toBe(false);
    }
  });

  it("pasa con un agrupar inválido al lado y descarta las claves que no declara", () => {
    expect(
      reportRangeParams.safeParse({
        desde: "2026-10-05",
        hasta: "2026-10-11",
        agrupar: "otro",
        personas: "u2",
      }),
    ).toEqual({ success: true, data: { first: "2026-10-05", last: "2026-10-11" } });
  });
});

describe("reportGroupParams (D-R2a-3)", () => {
  it("lee persona y proyecto", () => {
    expect(reportGroupParams.safeParse({ agrupar: "persona" })).toEqual({
      success: true,
      data: "person",
    });
    expect(reportGroupParams.safeParse({ agrupar: "proyecto" })).toEqual({
      success: true,
      data: "project",
    });
  });

  it("no pasa con otro valor, repetido ni ausente", () => {
    for (const params of [
      { agrupar: "otro" },
      { agrupar: "person" },
      { agrupar: "project" },
      { agrupar: "" },
      { agrupar: ["persona", "persona"] },
      {},
    ]) {
      expect(reportGroupParams.safeParse(params).success).toBe(false);
    }
  });

  it("se valida aparte del rango: pasa con un rango inválido al lado, y no pasa con uno válido", () => {
    expect(
      reportGroupParams.safeParse({
        desde: "2026-10-11",
        hasta: "2026-10-05",
        agrupar: "proyecto",
      }),
    ).toEqual({ success: true, data: "project" });
    expect(
      reportGroupParams.safeParse({ desde: "2026-10-05", agrupar: "persona" }),
    ).toEqual({ success: true, data: "person" });
    expect(
      reportGroupParams.safeParse({
        desde: "2026-10-05",
        hasta: "2026-10-11",
        agrupar: "otro",
      }).success,
    ).toBe(false);
  });
});

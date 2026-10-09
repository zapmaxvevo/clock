import { describe, expect, it } from "vitest";

import {
  REPORT_GROUP_BYS,
  REPORT_GROUP_PARAMS,
  REPORT_MAX_DAYS,
  reportGroupParams,
  reportMessages,
  reportRangeInput,
  reportRangeParams,
  reportReadyState,
  sameRange,
  type ReportReadyState,
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

describe("sameRange", () => {
  it("compara los dos extremos", () => {
    const week = { first: "2026-10-05", last: "2026-10-11" };
    expect(sameRange(week, { first: "2026-10-05", last: "2026-10-11" })).toBe(true);
    expect(sameRange(week, { first: "2026-10-05", last: "2026-10-12" })).toBe(false);
    expect(sameRange(week, { first: "2026-10-04", last: "2026-10-11" })).toBe(false);
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

  it("lee cliente (D-R2b-5) y fecha (D-R2b-6)", () => {
    expect(reportGroupParams.safeParse({ agrupar: "cliente" })).toEqual({
      success: true,
      data: "client",
    });
    expect(reportGroupParams.safeParse({ agrupar: "fecha" })).toEqual({
      success: true,
      data: "date",
    });
    expect([REPORT_GROUP_PARAMS.client, REPORT_GROUP_PARAMS.date]).toEqual([
      "cliente",
      "fecha",
    ]);
  });

  it("tarea y etiqueta pasan con o sin un rango válido al lado, y Tarea, tareas y etiquetas no pasan con ninguno", () => {
    for (const range of [
      { desde: "2026-10-05", hasta: "2026-10-11" },
      { desde: "2026-10-11", hasta: "2026-10-05" },
      {},
    ]) {
      expect(reportGroupParams.safeParse({ ...range, agrupar: "tarea" })).toEqual({
        success: true,
        data: "task",
      });
      expect(reportGroupParams.safeParse({ ...range, agrupar: "etiqueta" })).toEqual({
        success: true,
        data: "tag",
      });
      for (const agrupar of ["Tarea", "tareas", "etiquetas", "Etiqueta", "task", "tag"]) {
        expect(reportGroupParams.safeParse({ ...range, agrupar }).success).toBe(false);
      }
    }
  });

  it("lee lo que escribe REPORT_GROUP_PARAMS, para cada agrupación", () => {
    expect(REPORT_GROUP_BYS).toEqual([
      "person",
      "project",
      "client",
      "task",
      "tag",
      "date",
    ]);
    for (const groupBy of REPORT_GROUP_BYS) {
      expect(
        reportGroupParams.safeParse({ agrupar: REPORT_GROUP_PARAMS[groupBy] }),
      ).toEqual({
        success: true,
        data: groupBy,
      });
    }
  });

  it("no pasa con otro valor, repetido ni ausente", () => {
    for (const params of [
      { agrupar: "otro" },
      { agrupar: "person" },
      { agrupar: "project" },
      { agrupar: "client" },
      { agrupar: "Cliente" },
      { agrupar: "CLIENTE" },
      { agrupar: "fechas" },
      { agrupar: "date" },
      { agrupar: "Fecha" },
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

  it("cliente y fecha pasan con o sin un rango válido al lado, y Cliente y fechas no pasan con ninguno", () => {
    for (const range of [
      { desde: "2026-10-05", hasta: "2026-10-11" },
      { desde: "2026-10-11", hasta: "2026-10-05" },
      {},
    ]) {
      expect(reportGroupParams.safeParse({ ...range, agrupar: "cliente" })).toEqual({
        success: true,
        data: "client",
      });
      expect(reportGroupParams.safeParse({ ...range, agrupar: "fecha" })).toEqual({
        success: true,
        data: "date",
      });
      for (const agrupar of ["Cliente", "fechas"]) {
        expect(reportGroupParams.safeParse({ ...range, agrupar }).success).toBe(false);
      }
    }
  });
});

describe("reportReadyState (D-R2b-2, D-R2b-5, D-R3-3, D-R3-4)", () => {
  const week = { first: "2026-10-05", last: "2026-10-11" };
  const ready: ReportReadyState = {
    kind: "ready",
    todayKey: "2026-10-08",
    range: week,
    rangeLabel: "Esta semana",
    previous: null,
    next: null,
    currentWeek: week,
    shortcuts: [{ id: "thisWeek", label: "Esta semana", range: week }],
    groupBy: "client",
    scope: "everyone",
    timeZone: "America/Argentina/Buenos_Aires",
    totalSeconds: 90,
    billableSeconds: 0,
    groups: [
      {
        kind: "client",
        client: { id: "0b6f1c2e-6a0d-4d3e-9a52-3b1f1a6c9d01", name: "Acme" },
        seconds: 60,
      },
      { kind: "client", client: null, seconds: 30 },
    ],
  };

  it("admite los grupos de cliente, con «Sin cliente», y los atajos", () => {
    expect(reportReadyState.parse(ready)).toEqual(ready);
  });

  it("admite los grupos de fecha", () => {
    const byDate: ReportReadyState = {
      ...ready,
      groupBy: "date",
      groups: [
        { kind: "date", dayKey: "2026-10-01", label: "jue, 01/10", seconds: 60 },
        { kind: "date", dayKey: "2026-10-02", label: "vie, 02/10", seconds: 30 },
      ],
    };
    expect(reportReadyState.parse(byDate)).toEqual(byDate);
  });

  const taskId = "4c1d2b3a-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
  const projectId = "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d";
  const tagId = "2f3e4d5c-6b7a-4980-a1b2-c3d4e5f60718";

  it("admite los grupos de tarea, con su proyecto y con «Sin tarea» (D-R3-4)", () => {
    const byTask: ReportReadyState = {
      ...ready,
      groupBy: "task",
      groups: [
        {
          kind: "task",
          task: { id: taskId, name: "Diseño" },
          project: { id: projectId, name: "Web", color: "green" },
          seconds: 60,
        },
        { kind: "task", task: null, project: null, seconds: 30 },
      ],
    };
    expect(reportReadyState.parse(byTask)).toEqual(byTask);
  });

  it("rechaza un grupo de tarea sin project", () => {
    for (const task of [{ id: taskId, name: "Diseño" }, null]) {
      expect(
        reportReadyState.safeParse({
          ...ready,
          groupBy: "task",
          groups: [{ kind: "task", task, seconds: 60 }],
        }).success,
      ).toBe(false);
    }
  });

  it("admite los grupos de etiqueta, con «Sin etiqueta» (D-R3-3)", () => {
    const byTag: ReportReadyState = {
      ...ready,
      groupBy: "tag",
      totalSeconds: 60,
      groups: [
        { kind: "tag", tag: { id: tagId, name: "Urgente" }, seconds: 60 },
        { kind: "tag", tag: null, seconds: 30 },
      ],
    };
    expect(reportReadyState.parse(byTag)).toEqual(byTag);
  });

  it("rechaza un atajo con un id desconocido", () => {
    expect(
      reportReadyState.safeParse({
        ...ready,
        shortcuts: [{ id: "nextWeek", label: "Semana siguiente", range: week }],
      }).success,
    ).toBe(false);
  });

  it("rechaza un estado sin atajos", () => {
    expect(reportReadyState.safeParse({ ...ready, shortcuts: undefined }).success).toBe(
      false,
    );
  });
});

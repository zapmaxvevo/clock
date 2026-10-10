import { describe, expect, it } from "vitest";

import {
  hasReportFilters,
  NO_REPORT_FILTERS,
  REPORT_DESCRIPTION_SHOWN,
  REPORT_GROUP_BYS,
  REPORT_GROUP_PARAMS,
  REPORT_MAX_DAYS,
  REPORT_MAX_FILTER_VALUES,
  REPORT_MAX_ROWS,
  REPORT_TIME_GROUP_BYS,
  REPORT_WITHOUT_PROJECT,
  reportClientParams,
  reportFiltersOf,
  reportGroupParams,
  reportMessages,
  reportPeopleParams,
  reportProjectParams,
  reportRangeInput,
  reportRangeParams,
  reportReadyState,
  reportSubgroupParams,
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
      "week",
      "month",
      "description",
    ]);
    expect(REPORT_TIME_GROUP_BYS).toEqual(["date", "week", "month"]);
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

  it("semana y mes pasan con o sin un rango válido al lado, y Semana, semanas, Mes, meses, week y month no pasan con ninguno (D-R10-5)", () => {
    for (const range of [
      { desde: "2026-10-05", hasta: "2026-10-11" },
      { desde: "2026-10-11", hasta: "2026-10-05" },
      {},
    ]) {
      expect(reportGroupParams.safeParse({ ...range, agrupar: "semana" })).toEqual({
        success: true,
        data: "week",
      });
      expect(reportGroupParams.safeParse({ ...range, agrupar: "mes" })).toEqual({
        success: true,
        data: "month",
      });
      for (const agrupar of ["Semana", "semanas", "Mes", "meses", "week", "month"]) {
        expect(reportGroupParams.safeParse({ ...range, agrupar }).success).toBe(false);
      }
    }
  });

  it("descripcion pasa con o sin un rango válido al lado, y descripción, Descripcion, descripciones y description no pasan con ninguno (D-R10-5)", () => {
    expect(REPORT_GROUP_PARAMS.description).toBe("descripcion");
    for (const range of [
      { desde: "2026-10-05", hasta: "2026-10-11" },
      { desde: "2026-10-11", hasta: "2026-10-05" },
      {},
    ]) {
      expect(reportGroupParams.safeParse({ ...range, agrupar: "descripcion" })).toEqual({
        success: true,
        data: "description",
      });
      for (const agrupar of [
        "descripción",
        "Descripcion",
        "DESCRIPCION",
        "descripciones",
        "description",
      ]) {
        expect(reportGroupParams.safeParse({ ...range, agrupar }).success).toBe(false);
      }
    }
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

describe("reportSubgroupParams (D-R3-5, RP-12, RP-32)", () => {
  /** Los rangos que pueden acompañar al parámetro: válido, inválido y ninguno. */
  const ranges = [
    { desde: "2026-10-05", hasta: "2026-10-11" },
    { desde: "2026-10-11", hasta: "2026-10-05" },
    {},
  ];

  it("lee uno o dos niveles, en el orden de la URL, con o sin un rango válido al lado", () => {
    for (const range of ranges) {
      for (const [params, subgroups] of [
        [{ subagrupar: "fecha" }, ["date"]],
        [{ subagrupar: "fecha,etiqueta" }, ["date", "tag"]],
        [{ subagrupar: "etiqueta,fecha" }, ["tag", "date"]],
        [{ agrupar: "proyecto", subagrupar: "persona" }, ["person"]],
        [{ agrupar: "fecha", subagrupar: "persona,tarea" }, ["person", "task"]],
        // D-R10-6: una dimensión de tiempo debajo de otra.
        [{ agrupar: "fecha", subagrupar: "mes,semana" }, ["month", "week"]],
        [{ agrupar: "mes", subagrupar: "semana,fecha" }, ["week", "date"]],
        [{ agrupar: "descripcion", subagrupar: "proyecto" }, ["project"]],
        [{ subagrupar: "descripcion,fecha" }, ["description", "date"]],
        // `Proyecto` no es un `agrupar` válido: el primer nivel es persona.
        [{ agrupar: "Proyecto", subagrupar: "proyecto" }, ["project"]],
      ] as const) {
        expect(reportSubgroupParams.safeParse({ ...range, ...params })).toEqual({
          success: true,
          data: subgroups,
        });
      }
    }
  });

  it("descarta entero cualquier otro valor, con o sin un rango válido al lado", () => {
    for (const range of ranges) {
      for (const params of [
        // El primer nivel efectivo, persona sin `agrupar` o con uno repetido.
        { subagrupar: "persona" },
        { agrupar: ["proyecto", "proyecto"], subagrupar: "persona" },
        { agrupar: "proyecto", subagrupar: "proyecto" },
        { agrupar: "proyecto", subagrupar: "fecha,proyecto" },
        { subagrupar: "fecha,fecha" },
        { subagrupar: "fecha,etiqueta,tarea" },
        { subagrupar: "fecha," },
        { subagrupar: ",fecha" },
        { subagrupar: "fecha,,tarea" },
        { subagrupar: "Fecha" },
        { subagrupar: " fecha" },
        { subagrupar: "date" },
        { agrupar: "semana", subagrupar: "semana" },
        { agrupar: "mes", subagrupar: "semana,mes" },
        { subagrupar: "Semana" },
        { subagrupar: "meses" },
        { subagrupar: "week" },
        { agrupar: "descripcion", subagrupar: "descripcion" },
        { subagrupar: "descripción" },
        { subagrupar: "" },
        { subagrupar: ["fecha", "fecha"] },
        { subagrupar: ["fecha", "etiqueta"] },
        {},
      ]) {
        expect([
          params,
          reportSubgroupParams.safeParse({ ...range, ...params }).success,
        ]).toEqual([params, false]);
      }
    }
  });
});

describe("reportReadyState (D-R2b-2, D-R2b-5, D-R3-3, D-R3-4, D-R3-7)", () => {
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
    subgroups: [],
    levelsShown: 1,
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
    filters: NO_REPORT_FILTERS,
    filterOptions: { people: null, clients: [], projects: [] },
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

  it("admite los grupos de semana y de mes, con partial nulo y con texto (D-R10-3)", () => {
    const byWeek: ReportReadyState = {
      ...ready,
      groupBy: "week",
      groups: [
        {
          kind: "week",
          weekStart: "2026-09-28",
          label: "28/09 – 04/10",
          partial: "01/10 – 04/10",
          seconds: 60,
        },
        {
          kind: "week",
          weekStart: "2026-10-05",
          label: "05/10 – 11/10",
          partial: null,
          seconds: 30,
        },
      ],
    };
    expect(reportReadyState.parse(byWeek)).toEqual(byWeek);
    const byMonth: ReportReadyState = {
      ...ready,
      groupBy: "month",
      groups: [
        {
          kind: "month",
          monthStart: "2026-09-01",
          label: "septiembre",
          partial: "15/09 – 30/09",
          seconds: 60,
        },
        {
          kind: "month",
          monthStart: "2026-10-01",
          label: "octubre",
          partial: null,
          seconds: 30,
        },
      ],
    };
    expect(reportReadyState.parse(byMonth)).toEqual(byMonth);
  });

  it("rechaza un grupo de semana o de mes sin partial", () => {
    expect(
      reportReadyState.safeParse({
        ...ready,
        groupBy: "week",
        groups: [
          { kind: "week", weekStart: "2026-09-28", label: "28/09 – 04/10", seconds: 60 },
        ],
      }).success,
    ).toBe(false);
    expect(
      reportReadyState.safeParse({
        ...ready,
        groupBy: "month",
        groups: [
          { kind: "month", monthStart: "2026-09-01", label: "septiembre", seconds: 60 },
        ],
      }).success,
    ).toBe(false);
  });

  it("admite Mes → Semana → Fecha anidados (D-R10-6)", () => {
    const byTime: ReportReadyState = {
      ...ready,
      groupBy: "month",
      subgroups: ["week", "date"],
      levelsShown: 3,
      groups: [
        {
          kind: "month",
          monthStart: "2026-10-01",
          label: "octubre",
          partial: "01/10 – 11/10",
          seconds: 90,
          children: [
            {
              kind: "week",
              weekStart: "2026-09-28",
              label: "28/09 – 04/10",
              partial: "01/10 – 04/10",
              seconds: 90,
              children: [
                { kind: "date", dayKey: "2026-10-01", label: "jue, 01/10", seconds: 90 },
              ],
            },
          ],
        },
      ],
    };
    expect(reportReadyState.parse(byTime)).toEqual(byTime);
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

  /** Proyecto → fecha → etiqueta: un grupo de cada nivel. */
  const nested: ReportReadyState = {
    ...ready,
    groupBy: "project",
    subgroups: ["date", "tag"],
    levelsShown: 3,
    groups: [
      {
        kind: "project",
        project: { id: projectId, name: "Web", color: "green" },
        client: null,
        seconds: 90,
        children: [
          {
            kind: "date",
            dayKey: "2026-10-05",
            label: "lun, 05/10",
            seconds: 90,
            children: [
              { kind: "tag", tag: { id: tagId, name: "Urgente" }, seconds: 60 },
              { kind: "tag", tag: null, seconds: 30 },
            ],
          },
        ],
      },
    ],
  };

  it("admite tres niveles anidados, con los subniveles y los niveles mostrados", () => {
    expect(reportReadyState.parse(nested)).toEqual(nested);
    expect(REPORT_MAX_ROWS).toBe(3000);
  });

  it("rechaza children vacío, en cualquier nivel", () => {
    expect(
      reportReadyState.safeParse({
        ...nested,
        groups: [{ ...nested.groups[0], children: [] }],
      }).success,
    ).toBe(false);
    expect(
      reportReadyState.safeParse({
        ...ready,
        groups: [
          {
            kind: "client",
            client: null,
            seconds: 30,
            children: [
              {
                kind: "date",
                dayKey: "2026-10-05",
                label: "lun, 05/10",
                seconds: 30,
                children: [],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rechaza levelsShown 0 con grupos, −1, 4 y tres subniveles", () => {
    for (const levelsShown of [0, -1, 4, 1.5]) {
      expect(reportReadyState.safeParse({ ...nested, levelsShown }).success).toBe(false);
    }
    expect(
      reportReadyState.safeParse({ ...nested, subgroups: ["date", "tag", "task"] })
        .success,
    ).toBe(false);
  });

  it("rechaza un estado sin subgroups o sin levelsShown", () => {
    expect(reportReadyState.safeParse({ ...ready, subgroups: undefined }).success).toBe(
      false,
    );
    expect(reportReadyState.safeParse({ ...ready, levelsShown: undefined }).success).toBe(
      false,
    );
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

  /** Un `id` de descripción: 32 hexadecimales en minúsculas. */
  const descriptionId = "0123456789abcdef0123456789abcdef";

  /** El estado por descripción con un solo grupo, `description`. */
  function byDescription(description: unknown) {
    return {
      ...ready,
      groupBy: "description",
      groups: [{ kind: "description", description, seconds: 60 }],
    };
  }

  it("admite los grupos de descripción, con «Sin descripción» y recortados (D-R10-8, D-R10-9)", () => {
    const state: ReportReadyState = {
      ...ready,
      groupBy: "description",
      subgroups: ["project"],
      levelsShown: 2,
      groups: [
        {
          kind: "description",
          description: { id: descriptionId, text: "Reunión", truncated: false },
          seconds: 60,
          children: [
            {
              kind: "project",
              project: { id: projectId, name: "Web", color: "green" },
              client: null,
              seconds: 60,
            },
          ],
        },
        {
          kind: "description",
          description: {
            id: "fedcba9876543210fedcba9876543210",
            text: "x".repeat(REPORT_DESCRIPTION_SHOWN),
            truncated: true,
          },
          seconds: 30,
          children: [{ kind: "project", project: null, client: null, seconds: 30 }],
        },
        {
          kind: "description",
          description: null,
          seconds: 30,
          children: [{ kind: "project", project: null, client: null, seconds: 30 }],
        },
      ],
    };
    expect(reportReadyState.parse(state)).toEqual(state);
    expect(REPORT_DESCRIPTION_SHOWN).toBe(100);
  });

  it("cuenta el texto en puntos de código: admite 100 emojis y rechaza 101, y 101 letras", () => {
    const emojis = "😀".repeat(100);
    expect(emojis).toHaveLength(200);
    expect(
      reportReadyState.safeParse(
        byDescription({ id: descriptionId, text: emojis, truncated: true }),
      ).success,
    ).toBe(true);
    for (const text of ["😀".repeat(101), "x".repeat(101)]) {
      expect(
        reportReadyState.safeParse(
          byDescription({ id: descriptionId, text, truncated: true }),
        ).success,
      ).toBe(false);
    }
  });

  it("rechaza un id con mayúsculas, de 31 o 33 caracteres, un texto vacío y una descripción sin truncated", () => {
    for (const description of [
      { id: descriptionId.toUpperCase(), text: "Reunión", truncated: false },
      { id: descriptionId.slice(1), text: "Reunión", truncated: false },
      { id: `${descriptionId}0`, text: "Reunión", truncated: false },
      { id: `${descriptionId.slice(1)}g`, text: "Reunión", truncated: false },
      { id: descriptionId, text: "", truncated: false },
      { id: descriptionId, text: "Reunión" },
      "",
    ]) {
      expect([
        description,
        reportReadyState.safeParse(byDescription(description)).success,
      ]).toEqual([description, false]);
    }
  });

  it("admite levelsShown 0 sin grupos, y no con un grupo ni −1 sin grupos (D-R10-10)", () => {
    const cut = { ...ready, groupBy: "description", subgroups: ["project"] };
    expect(
      reportReadyState.safeParse({ ...cut, levelsShown: 0, groups: [] }).success,
    ).toBe(true);
    // Sin grupos el `refine` deja pasar cualquier valor: lo frena `.min(0)`.
    expect(
      reportReadyState.safeParse({ ...cut, levelsShown: -1, groups: [] }).success,
    ).toBe(false);
    expect(
      reportReadyState.safeParse({
        ...cut,
        levelsShown: 0,
        groups: [{ kind: "description", description: null, seconds: 60 }],
      }).success,
    ).toBe(false);
    expect(reportReadyState.safeParse({ ...ready, levelsShown: 0 }).success).toBe(false);
    // Con el primer nivel, un período sin horas no tiene grupos (RP-33).
    expect(
      reportReadyState.safeParse({ ...ready, levelsShown: 1, groups: [] }).success,
    ).toBe(true);
  });
});

/** El uuid `n`, en minúsculas, como los devuelve Postgres. */
function uuidAt(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

/** Los `count` primeros uuid de `uuidAt`, desde 1. */
function uuids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => uuidAt(index + 1));
}

const p1 = "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d";
const p2 = "2f3e4d5c-6b7a-4980-a1b2-c3d4e5f60718";

/** Los parámetros mal formados que descartan una lista entera, armados con `name`. */
function malformedLists(name: string) {
  return [
    { [name]: p1.toUpperCase() },
    { [name]: `${p1.slice(0, 7)}A${p1.slice(8)}` },
    { [name]: "" },
    { [name]: `${p1},` },
    { [name]: `,${p1}` },
    { [name]: `${p1},,${p2}` },
    { [name]: `${p1},${p1}` },
    { [name]: ` ${p1}` },
    { [name]: "proyecto" },
    { [name]: "7a8b9c0d1e2f4a3b9c4d5e6f7a8b9c0d" },
    { [name]: uuids(REPORT_MAX_FILTER_VALUES + 1).join(",") },
    { [name]: [p1, p2] },
    { [name]: [p1, p1] },
    {},
  ];
}

describe("reportClientParams (D-R4-2, RP-32)", () => {
  it("lee uno, dos y hasta el tope de uuid en minúsculas, en el orden de la URL", () => {
    expect(REPORT_MAX_FILTER_VALUES).toBe(50);
    for (const ids of [[p1], [p2, p1], uuids(REPORT_MAX_FILTER_VALUES)]) {
      expect(reportClientParams.safeParse({ clientes: ids.join(",") })).toEqual({
        success: true,
        data: ids,
      });
    }
  });

  it("descarta entero cualquier otro valor, también sin-proyecto", () => {
    for (const params of [
      ...malformedLists("clientes"),
      { clientes: REPORT_WITHOUT_PROJECT },
      { clientes: `${p1},${REPORT_WITHOUT_PROJECT}` },
    ]) {
      expect([params, reportClientParams.safeParse(params).success]).toEqual([
        params,
        false,
      ]);
    }
  });
});

describe("reportProjectParams (D-R4-2, RP-26, RP-32)", () => {
  it("lee uuid y sin-proyecto, que cuenta en el tope", () => {
    expect(REPORT_WITHOUT_PROJECT).toBe("sin-proyecto");
    for (const [proyectos, projects, withoutProject] of [
      [p1, [p1], false],
      [`${p2},${p1}`, [p2, p1], false],
      [REPORT_WITHOUT_PROJECT, [], true],
      [`${p1},${REPORT_WITHOUT_PROJECT}`, [p1], true],
      [`${REPORT_WITHOUT_PROJECT},${p1}`, [p1], true],
      [uuids(REPORT_MAX_FILTER_VALUES).join(","), uuids(REPORT_MAX_FILTER_VALUES), false],
      [
        [...uuids(REPORT_MAX_FILTER_VALUES - 1), REPORT_WITHOUT_PROJECT].join(","),
        uuids(REPORT_MAX_FILTER_VALUES - 1),
        true,
      ],
    ] as const) {
      expect(reportProjectParams.safeParse({ proyectos })).toEqual({
        success: true,
        data: { projects, withoutProject },
      });
    }
  });

  it("descarta entero cualquier otro valor, sin-proyecto repetido y 50 uuid con sin-proyecto", () => {
    for (const params of [
      ...malformedLists("proyectos"),
      { proyectos: `${REPORT_WITHOUT_PROJECT},${REPORT_WITHOUT_PROJECT}` },
      { proyectos: "Sin-proyecto" },
      { proyectos: "sin proyecto" },
      {
        proyectos: [...uuids(REPORT_MAX_FILTER_VALUES), REPORT_WITHOUT_PROJECT].join(","),
      },
    ]) {
      expect([params, reportProjectParams.safeParse(params).success]).toEqual([
        params,
        false,
      ]);
    }
  });
});

describe("reportFiltersOf (D-R4-2, RP-32)", () => {
  it("valida cada parámetro por su lado: uno inválido no vacía al otro", () => {
    expect(
      reportFiltersOf({
        clientes: `${p1},`,
        proyectos: `${p2},${REPORT_WITHOUT_PROJECT}`,
      }),
    ).toEqual({ people: [], clients: [], projects: [p2], withoutProject: true });
    expect(reportFiltersOf({ clientes: p1, proyectos: `${p2},${p2}` })).toEqual({
      people: [],
      clients: [p1],
      projects: [],
      withoutProject: false,
    });
  });

  it("también aparte del rango y de la agrupación", () => {
    expect(
      reportFiltersOf({
        desde: "2026-10-11",
        hasta: "2026-10-05",
        agrupar: "Proyecto",
        subagrupar: "fecha,fecha",
        clientes: p1,
        proyectos: p2,
      }),
    ).toEqual({ people: [], clients: [p1], projects: [p2], withoutProject: false });
  });

  it("sin filtros, o con claves que no declara, da NO_REPORT_FILTERS", () => {
    for (const params of [
      {},
      {
        persona: "ajena-1",
        people: "ajena-1",
        userId: "ajena-1",
        cliente: p1,
        proyecto: p2,
        clients: p1,
        projects: p2,
      },
    ]) {
      expect(reportFiltersOf(params)).toEqual(NO_REPORT_FILTERS);
    }
  });
});

describe("hasReportFilters (D-R4-7)", () => {
  it("es cierto con alguna lista o con sin-proyecto, y falso sin nada", () => {
    expect(hasReportFilters(NO_REPORT_FILTERS)).toBe(false);
    for (const filters of [
      { ...NO_REPORT_FILTERS, people: ["ajena-1"] },
      { ...NO_REPORT_FILTERS, clients: [p1] },
      { ...NO_REPORT_FILTERS, projects: [p1] },
      { ...NO_REPORT_FILTERS, withoutProject: true },
    ]) {
      expect(hasReportFilters(filters)).toBe(true);
    }
  });
});

describe("reportReadyState con los filtros (D-R4-5, D-R4-9)", () => {
  const week = { first: "2026-10-05", last: "2026-10-11" };
  const ready: ReportReadyState = {
    kind: "ready",
    todayKey: "2026-10-08",
    range: week,
    rangeLabel: "Esta semana",
    previous: null,
    next: null,
    currentWeek: week,
    shortcuts: [],
    groupBy: "project",
    subgroups: [],
    levelsShown: 1,
    scope: "self",
    timeZone: "America/Argentina/Buenos_Aires",
    totalSeconds: 0,
    billableSeconds: 0,
    groups: [],
    filters: { people: [], clients: [p1], projects: [p2], withoutProject: true },
    filterOptions: {
      people: null,
      clients: [{ id: p1, name: "Acme", archived: true }],
      projects: [
        {
          id: p2,
          name: "Web",
          color: "green",
          client: { id: p1, name: "Acme" },
          archived: false,
        },
        { id: uuidAt(1), name: "Interno", color: "red", client: null, archived: true },
      ],
    },
  };

  it("admite los filtros efectivos y las opciones", () => {
    expect(reportReadyState.parse(ready)).toEqual(ready);
  });

  it("admite el tope con sin-proyecto contado y rechaza pasarlo", () => {
    const within = [
      { people: [], clients: uuids(50), projects: uuids(50), withoutProject: false },
      { people: [], clients: [], projects: uuids(49), withoutProject: true },
    ];
    for (const filters of within) {
      expect(reportReadyState.safeParse({ ...ready, filters }).success).toBe(true);
    }
    const beyond = [
      { people: [], clients: uuids(51), projects: [], withoutProject: false },
      { people: [], clients: [], projects: uuids(51), withoutProject: false },
      { people: [], clients: [], projects: uuids(50), withoutProject: true },
    ];
    for (const filters of beyond) {
      expect(reportReadyState.safeParse({ ...ready, filters }).success).toBe(false);
    }
  });

  it("rechaza un estado sin filters o sin filterOptions, y una opción sin su marca", () => {
    for (const state of [
      { ...ready, filters: undefined },
      { ...ready, filterOptions: undefined },
      {
        ...ready,
        filterOptions: { ...ready.filterOptions, clients: [{ id: p1, name: "Acme" }] },
      },
      {
        ...ready,
        filterOptions: {
          ...ready.filterOptions,
          projects: [{ id: p2, name: "Web", color: "green", client: null }],
        },
      },
      {
        ...ready,
        filterOptions: {
          ...ready.filterOptions,
          projects: [
            { id: p2, name: "Web", color: "#00ff00", client: null, archived: false },
          ],
        },
      },
    ]) {
      expect(reportReadyState.safeParse(state).success).toBe(false);
    }
  });
});

/** Un id como los de Better Auth: 32 alfanuméricos con mayúsculas y minúsculas. */
const betterAuthId = "Xk3fQ9pLm2ZtR7wB4nVc8HsJd1GyA6Ue";
const otherBetterAuthId = "aB4dE6gH8jK0mN2pQ4sT6vW8yZ0bC2dE";

describe("reportPeopleParams (D-R4-2, RP-32; criterio 16)", () => {
  it("lee un id de Better Auth tal cual, un uuid, dos y hasta el tope, en el orden de la URL", () => {
    expect(betterAuthId).toMatch(/^[A-Za-z0-9]{32}$/);
    const fifty = Array.from(
      { length: REPORT_MAX_FILTER_VALUES },
      (_, index) => `${betterAuthId.slice(0, 30)}${String(index).padStart(2, "0")}`,
    );
    for (const ids of [
      [betterAuthId],
      [p1],
      [otherBetterAuthId, betterAuthId],
      [betterAuthId, betterAuthId.toLowerCase()],
      ["a".repeat(64)],
      fifty,
    ]) {
      expect(reportPeopleParams.safeParse({ personas: ids.join(",") })).toEqual({
        success: true,
        data: ids,
      });
    }
  });

  it("descarta entero un correo, un espacio, 65 caracteres, un vacío, un repetido, 51 valores o el parámetro repetido", () => {
    const fiftyOne = Array.from(
      { length: REPORT_MAX_FILTER_VALUES + 1 },
      (_, index) => `persona-${index}`,
    );
    for (const params of [
      { personas: "persona@empresa.com" },
      { personas: `${betterAuthId},persona@empresa.com` },
      { personas: "persona.uno" },
      { personas: ` ${betterAuthId}` },
      { personas: "dos palabras" },
      { personas: "a".repeat(65) },
      { personas: "" },
      { personas: `${betterAuthId},` },
      { personas: `,${betterAuthId}` },
      { personas: `${betterAuthId},,${otherBetterAuthId}` },
      { personas: `${betterAuthId},${betterAuthId}` },
      { personas: fiftyOne.join(",") },
      { personas: [betterAuthId, otherBetterAuthId] },
      { personas: [betterAuthId, betterAuthId] },
      {},
    ]) {
      expect([params, reportPeopleParams.safeParse(params).success]).toEqual([
        params,
        false,
      ]);
    }
  });

  it("reportFiltersOf lee personas por su lado: uno inválido no arrastra a los otros", () => {
    expect(
      reportFiltersOf({
        personas: `${otherBetterAuthId},${betterAuthId}`,
        clientes: `${p1},`,
      }),
    ).toEqual({
      people: [otherBetterAuthId, betterAuthId],
      clients: [],
      projects: [],
      withoutProject: false,
    });
    expect(
      reportFiltersOf({
        personas: "persona@empresa.com",
        clientes: p1,
        proyectos: REPORT_WITHOUT_PROJECT,
      }),
    ).toEqual({ people: [], clients: [p1], projects: [], withoutProject: true });
  });
});

describe("reportReadyState con el filtro de personas (D-R4-4, D-R4-9; criterio 16)", () => {
  const week = { first: "2026-10-05", last: "2026-10-11" };
  const ready: ReportReadyState = {
    kind: "ready",
    todayKey: "2026-10-08",
    range: week,
    rangeLabel: "Esta semana",
    previous: null,
    next: null,
    currentWeek: week,
    shortcuts: [],
    groupBy: "person",
    subgroups: [],
    levelsShown: 1,
    scope: "everyone",
    timeZone: "America/Argentina/Buenos_Aires",
    totalSeconds: 0,
    billableSeconds: 0,
    groups: [],
    filters: { ...NO_REPORT_FILTERS, people: [betterAuthId] },
    filterOptions: {
      people: [
        { id: betterAuthId, name: "Ana", inactive: false },
        { id: otherBetterAuthId, name: "Beto", inactive: true },
      ],
      clients: [],
      projects: [],
    },
  };

  it("admite las personas elegidas y sus opciones, y people en null sin el filtro", () => {
    expect(reportReadyState.parse(ready)).toEqual(ready);
    const withoutPeople = {
      ...ready,
      filters: NO_REPORT_FILTERS,
      filterOptions: { ...ready.filterOptions, people: null },
    };
    expect(reportReadyState.parse(withoutPeople)).toEqual(withoutPeople);
  });

  it("rechaza 51 personas, una opción sin inactive y un estado sin people", () => {
    for (const state of [
      {
        ...ready,
        filters: {
          ...ready.filters,
          people: Array.from({ length: 51 }, (_, index) => `persona-${index}`),
        },
      },
      {
        ...ready,
        filterOptions: {
          ...ready.filterOptions,
          people: [{ id: betterAuthId, name: "Ana" }],
        },
      },
      { ...ready, filters: { ...ready.filters, people: undefined } },
      { ...ready, filterOptions: { ...ready.filterOptions, people: undefined } },
    ]) {
      expect(reportReadyState.safeParse(state).success).toBe(false);
    }
  });
});

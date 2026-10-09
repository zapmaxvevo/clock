import { describe, expect, it } from "vitest";

import {
  hasReportFilters,
  NO_REPORT_FILTERS,
  REPORT_GROUP_BYS,
  REPORT_GROUP_PARAMS,
  REPORT_MAX_DAYS,
  REPORT_MAX_FILTER_VALUES,
  REPORT_MAX_ROWS,
  REPORT_WITHOUT_PROJECT,
  reportClientParams,
  reportFiltersOf,
  reportGroupParams,
  reportMessages,
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
    filterOptions: { clients: [], projects: [] },
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

  it("rechaza levelsShown 0 o 4 y tres subniveles", () => {
    for (const levelsShown of [0, 4, 1.5]) {
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
    ).toEqual({ clients: [], projects: [p2], withoutProject: true });
    expect(reportFiltersOf({ clientes: p1, proyectos: `${p2},${p2}` })).toEqual({
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
    ).toEqual({ clients: [p1], projects: [p2], withoutProject: false });
  });

  it("sin filtros, o con claves que no declara, da NO_REPORT_FILTERS", () => {
    for (const params of [
      {},
      { personas: "ajena-1", cliente: p1, proyecto: p2, clients: p1, projects: p2 },
    ]) {
      expect(reportFiltersOf(params)).toEqual(NO_REPORT_FILTERS);
    }
  });
});

describe("hasReportFilters (D-R4-7)", () => {
  it("es cierto con alguna lista o con sin-proyecto, y falso sin nada", () => {
    expect(hasReportFilters(NO_REPORT_FILTERS)).toBe(false);
    for (const filters of [
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
    filters: { clients: [p1], projects: [p2], withoutProject: true },
    filterOptions: {
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
      { clients: uuids(50), projects: uuids(50), withoutProject: false },
      { clients: [], projects: uuids(49), withoutProject: true },
    ];
    for (const filters of within) {
      expect(reportReadyState.safeParse({ ...ready, filters }).success).toBe(true);
    }
    const beyond = [
      { clients: uuids(51), projects: [], withoutProject: false },
      { clients: [], projects: uuids(51), withoutProject: false },
      { clients: [], projects: uuids(50), withoutProject: true },
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

import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import { durationLabel } from "@/modules/report/components/group-heading";
import {
  NO_REPORT_FILTERS,
  type ReportChart,
  type ReportEntryRow,
  type ReportGroup,
  type ReportReadyState,
} from "@/modules/report/schema";
import type { TimeSettings } from "@/server/time";

import { csvBytesOf } from "./csv";
import { exportDocumentOf, groupTextOf, type ReportExportInput } from "./document";
import type { ExportDocument, ExportRow } from "./types";
import { xlsxBytesOf } from "./xlsx";

const settings: TimeSettings = {
  timezone: "America/Argentina/Buenos_Aires",
  weekStart: 1,
  formats: { time: "24h", date: "dd/MM/yyyy", duration: "compact" },
};

const ANA = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY";
const BRUNO = "Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx";
const CARLA = "9e0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const C1 = "c1000000-0000-4000-8000-000000000000";
const C2 = "c2000000-0000-4000-8000-000000000000";
const P1 = "f1000000-0000-4000-8000-000000000000";
const P2 = "a2000000-0000-4000-8000-000000000000";
const T1 = "d1000000-0000-4000-8000-000000000000";
const G1 = "e1000000-0000-4000-8000-000000000000";

const web = { id: P1, name: "Web", color: "teal" } as const;
const acme = { id: C1, name: "ACME" };

const report: ReportReadyState = {
  kind: "ready",
  todayKey: "2026-10-12",
  range: { first: "2026-09-28", last: "2026-10-04" },
  rangeLabel: "Semana anterior",
  previous: null,
  next: null,
  currentWeek: { first: "2026-10-12", last: "2026-10-18" },
  shortcuts: [],
  groupBy: "person",
  subgroups: [],
  peopleWithoutTime: false,
  levelsShown: 1,
  scope: "everyone",
  timeZone: "America/Argentina/Buenos_Aires",
  totalSeconds: 3599,
  billableSeconds: 1800,
  groups: [{ kind: "person", userId: ANA, name: "Ana", inactive: false, seconds: 3599 }],
  filters: NO_REPORT_FILTERS,
  filterOptions: { people: null, clients: [], projects: [] },
  chart: null,
};

/** 14:05 en Buenos Aires. */
const generatedAt = new Date("2026-10-12T17:05:00Z");

function input(
  overrides: Partial<ReportReadyState> = {},
  rest: Partial<Omit<ReportExportInput, "report">> = {},
): ReportExportInput {
  return {
    kind: "ready",
    report: { ...report, ...overrides },
    entries: { kind: "listed", rows: [] },
    generatedAt,
    exporter: "Ana Pérez",
    ...rest,
  };
}

/**
 * Las filas como las escribe el CSV (§4.7), un campo por celda, sin las
 * comillas. `TextDecoder` quita el BOM. Ningún texto de este archivo lleva un
 * salto de línea, así que cada línea es una fila.
 */
function texts(rows: readonly ExportRow[]): string[][] {
  const csv = new TextDecoder().decode(
    csvBytesOf({ header: rows, chart: null, sections: [], durationFormat: "compact" }),
  );
  return csv
    .split("\r\n")
    .slice(0, -1)
    .map((line) =>
      [...line.matchAll(/"((?:[^"]|"")*)"(?:;|$)/g)].map(([, field]) =>
        field.replaceAll('""', '"'),
      ),
    );
}

function header(document: ReturnType<typeof exportDocumentOf>): string[][] {
  return texts(document.header);
}

/** Las filas de la cabecera que empiezan con `name`. */
function headerRows(
  overrides: Partial<ReportReadyState>,
  name: string,
  custom: TimeSettings = settings,
): string[][] {
  return header(exportDocumentOf(input(overrides), custom)).filter(
    ([first]) => first === name,
  );
}

function section(
  document: ReturnType<typeof exportDocumentOf>,
  title: "Resumen" | "Entradas",
) {
  const found = document.sections.find((candidate) => candidate.title === title);
  if (found === undefined) {
    throw new Error(`Sin la sección «${title}»`);
  }
  return found;
}

function summary(overrides: Partial<ReportReadyState>): string[][] {
  return texts(section(exportDocumentOf(input(overrides), settings), "Resumen").rows);
}

describe("exportDocumentOf: la cabecera (D-R6-8)", () => {
  it("una fila por dato, en su orden, con el título solo y sin filtros ni notas", () => {
    expect(header(exportDocumentOf(input(), settings))).toEqual([
      ["Reporte resumido"],
      ["Período", "28/09/2026 – 04/10/2026"],
      ["Zona horaria", "America/Argentina/Buenos_Aires"],
      ["Alcance", "Todas las personas del workspace"],
      ["Agrupado por", "Persona"],
      ["Total", "0:59", "0,98"],
      ["Facturable", "0:30", "0,50"],
      ["Generado", "12/10/2026 14:05"],
    ]);
  });

  it("el título y los nombres son celdas de texto; los totales, duración y horas", () => {
    const rows = exportDocumentOf(input(), settings).header;
    expect(rows[0]).toEqual([{ kind: "text", text: "Reporte resumido" }]);
    expect(rows[5]).toEqual([
      { kind: "text", text: "Total" },
      { kind: "duration", seconds: 3599 },
      { kind: "hours", minutes: 59 },
    ]);
  });

  it("el período lleva año en el formato de quien mira, y un solo día es una fecha", () => {
    expect(
      headerRows({}, "Período", {
        ...settings,
        formats: { ...settings.formats, date: "yyyy-MM-dd" },
      }),
    ).toEqual([["Período", "2026-09-28 – 2026-10-04"]]);
    expect(
      headerRows({ range: { first: "2026-10-05", last: "2026-10-05" } }, "Período"),
    ).toEqual([["Período", "05/10/2026"]]);
  });

  it("la zona tal como está en el perfil", () => {
    expect(headerRows({ timeZone: "Europe/Madrid" }, "Zona horaria")).toEqual([
      ["Zona horaria", "Europe/Madrid"],
    ]);
  });

  it("el alcance propio dice de quién son las horas", () => {
    expect(headerRows({ scope: "self" }, "Alcance")).toEqual([
      ["Alcance", "Solo las horas de Ana Pérez"],
    ]);
  });

  it("«Agrupado por» dice los niveles pedidos, también los que el tope cortó", () => {
    expect(
      headerRows(
        { groupBy: "person", subgroups: ["project", "date"], levelsShown: 1 },
        "Agrupado por",
      ),
    ).toEqual([["Agrupado por", "Persona / Proyecto / Fecha"]]);
  });

  it("los filtros efectivos, por nombre, en el orden de las opciones y cada uno en una celda", () => {
    const rows = header(
      exportDocumentOf(
        input({
          filters: {
            people: [CARLA, ANA],
            clients: [C2, C1],
            projects: [P1, P2],
            withoutProject: true,
          },
          filterOptions: {
            people: [
              { id: ANA, name: "Ana", inactive: false },
              { id: BRUNO, name: "Bruno", inactive: false },
              { id: CARLA, name: "Carla", inactive: true },
            ],
            clients: [
              { id: C1, name: "ACME", archived: false },
              { id: C2, name: "Beta", archived: true },
            ],
            projects: [
              { id: P2, name: "Interno", color: "red", client: null, archived: false },
              { id: P1, name: "Web", color: "teal", client: acme, archived: false },
            ],
          },
        }),
        settings,
      ),
    );
    expect(rows.slice(5, 8)).toEqual([
      ["Personas", "Ana, Carla (inactiva)"],
      ["Clientes", "ACME, Beta"],
      ["Proyectos", "Interno, Web (ACME), Sin proyecto"],
    ]);
    expect(rows[8][0]).toBe("Total");
  });

  it("dos proyectos con el mismo nombre se distinguen por su cliente; «Sin proyecto» al final", () => {
    const P3 = "b3000000-0000-4000-8000-000000000000";
    expect(
      headerRows(
        {
          filters: { ...NO_REPORT_FILTERS, projects: [P1, P3], withoutProject: true },
          filterOptions: {
            people: null,
            clients: [],
            projects: [
              { id: P1, name: "Web", color: "teal", client: acme, archived: false },
              {
                id: P3,
                name: "Web",
                color: "red",
                client: { id: C2, name: "Beta" },
                archived: true,
              },
            ],
          },
        },
        "Proyectos",
      ),
    ).toEqual([["Proyectos", "Web (ACME), Web (Beta), Sin proyecto"]]);
  });

  it("solo «Sin proyecto» es una línea de proyectos; sin otros filtros, ninguna más", () => {
    const rows = header(
      exportDocumentOf(
        input({ filters: { ...NO_REPORT_FILTERS, withoutProject: true } }),
        settings,
      ),
    );
    expect(rows.map(([name]) => name)).not.toContain("Personas");
    expect(rows.map(([name]) => name)).not.toContain("Clientes");
    expect(rows.filter(([name]) => name === "Proyectos")).toEqual([
      ["Proyectos", "Sin proyecto"],
    ]);
  });

  it("«Generado» en 24 h y en 12 h, en la zona de quien mira", () => {
    expect(headerRows({}, "Generado")).toEqual([["Generado", "12/10/2026 14:05"]]);
    expect(
      headerRows({}, "Generado", {
        ...settings,
        formats: { time: "12h", date: "MM/dd/yyyy", duration: "compact" },
      }),
    ).toEqual([["Generado", "10/12/2026 2:05 PM"]]);
    expect(
      headerRows({}, "Generado", { ...settings, timezone: "Europe/Madrid" }),
    ).toEqual([["Generado", "12/10/2026 19:05"]]);
  });

  it("la nota de etiquetas solo con la etiqueta entre los niveles mostrados", () => {
    expect(
      headerRows({ groupBy: "person", subgroups: ["tag"], levelsShown: 2 }, "Nota"),
    ).toEqual([
      [
        "Nota",
        "Una entrada con varias etiquetas suma en cada una: las filas por etiqueta pueden sumar más que el total.",
      ],
    ]);
    // Pedida y cortada por el tope: solo la nota del tope.
    expect(
      headerRows({ groupBy: "person", subgroups: ["tag"], levelsShown: 1 }, "Nota"),
    ).toEqual([
      [
        "Nota",
        "El reporte pasa de 3000 filas con todos sus niveles: se muestran solo los de arriba. Acortá el período o quitá un nivel.",
      ],
    ]);
  });

  it("sin niveles cortados no hay nota del tope", () => {
    expect(
      headerRows({ groupBy: "person", subgroups: ["date"], levelsShown: 2 }, "Nota"),
    ).toEqual([]);
  });

  it("con las dos notas, dos filas «Nota», la de etiquetas primero", () => {
    const notes = headerRows(
      { groupBy: "tag", subgroups: ["date", "person"], levelsShown: 2 },
      "Nota",
    );
    expect(notes.map(([, note]) => note.slice(0, 20))).toEqual([
      "Una entrada con vari",
      "El reporte pasa de 3",
    ]);
  });

  it("con el primer nivel cortado, ninguna nota del tope en la cabecera", () => {
    expect(
      headerRows(
        { groupBy: "description", subgroups: ["date"], levelsShown: 0, groups: [] },
        "Nota",
      ),
    ).toEqual([]);
  });
});

describe("exportDocumentOf con las personas sin horas (D-R9-10; criterio 15 de R9)", () => {
  const people = [
    { id: ANA, name: "Ana", inactive: false },
    { id: BRUNO, name: "Bruno", inactive: false },
    { id: CARLA, name: "Carla", inactive: true },
  ];
  const withTime: ReportGroup = {
    kind: "person",
    userId: ANA,
    name: "Ana",
    inactive: false,
    seconds: 3599,
    children: [{ kind: "project", project: web, client: acme, seconds: 3599 }],
  };
  const bruno: ReportGroup = {
    kind: "person",
    userId: BRUNO,
    name: "Bruno",
    inactive: false,
    seconds: 0,
  };
  const carla: ReportGroup = {
    kind: "person",
    userId: CARLA,
    name: "Carla",
    inactive: true,
    seconds: 0,
  };
  const option: Partial<ReportReadyState> = {
    groupBy: "person",
    subgroups: ["project"],
    peopleWithoutTime: true,
    levelsShown: 2,
    groups: [withTime, bruno, carla],
    filters: { ...NO_REPORT_FILTERS, people: [ANA, BRUNO, CARLA] },
    filterOptions: { people, clients: [], projects: [] },
  };

  it("con la opción, «Personas sin horas» y «Sí» justo después de «Agrupado por» y antes de «Personas»", () => {
    const rows = header(exportDocumentOf(input(option), settings));
    expect(rows.slice(4, 7)).toEqual([
      ["Agrupado por", "Persona / Proyecto"],
      ["Personas sin horas", "Sí"],
      ["Personas", "Ana, Bruno, Carla (inactiva)"],
    ]);
    expect(rows.filter(([first]) => first === "Personas sin horas")).toHaveLength(1);
  });

  it("con la opción y sin filtros, la fila va antes de «Total»", () => {
    const rows = header(
      exportDocumentOf(input({ ...option, filters: NO_REPORT_FILTERS }), settings),
    );
    expect(rows.slice(4, 7)).toEqual([
      ["Agrupado por", "Persona / Proyecto"],
      ["Personas sin horas", "Sí"],
      ["Total", "0:59", "0,98"],
    ]);
  });

  it("sin la opción, ninguna fila, con las mismas filas sin horas en el resumen", () => {
    expect(
      headerRows({ ...option, peopleWithoutTime: false }, "Personas sin horas"),
    ).toEqual([]);
    expect(headerRows({}, "Personas sin horas")).toEqual([]);
  });

  it("una fila sin horas del resumen es nivel 1, con su nombre, vacío abajo, «0:00» y «0,00», sin filas hijas", () => {
    expect(summary(option)).toEqual([
      ["Nivel", "Persona", "Proyecto", "Duración", "Horas"],
      ["1", "Ana", "", "0:59", "0,98"],
      ["2", "Ana", "Web (ACME)", "0:59", "0,98"],
      ["1", "Bruno", "", "0:00", "0,00"],
      ["1", "Carla (inactiva)", "", "0:00", "0,00"],
    ]);
    const rows = section(exportDocumentOf(input(option), settings), "Resumen").rows;
    expect(rows[3]).toEqual([
      { kind: "integer", value: 1 },
      { kind: "text", text: "Bruno" },
      { kind: "empty" },
      { kind: "duration", seconds: 0 },
      { kind: "hours", minutes: 0 },
    ]);
  });

  it("con solo filas sin horas, el resumen las lista y no hay vacío", () => {
    expect(
      summary({ ...option, groups: [bruno, carla], totalSeconds: 0, billableSeconds: 0 }),
    ).toEqual([
      ["Nivel", "Persona", "Proyecto", "Duración", "Horas"],
      ["1", "Bruno", "", "0:00", "0,00"],
      ["1", "Carla (inactiva)", "", "0:00", "0,00"],
    ]);
  });
});

describe("exportDocumentOf: el resumen (D-R6-7)", () => {
  const tree: ReportGroup[] = [
    {
      kind: "person",
      userId: ANA,
      name: "Ana",
      inactive: false,
      seconds: 36_059,
      children: [
        {
          kind: "project",
          project: web,
          client: acme,
          seconds: 21_659,
          children: [
            { kind: "date", dayKey: "2026-09-28", label: "lun, 28/09", seconds: 21_659 },
          ],
        },
        {
          kind: "project",
          project: null,
          client: null,
          seconds: 14_400,
          children: [
            { kind: "date", dayKey: "2026-09-29", label: "mar, 29/09", seconds: 14_400 },
          ],
        },
      ],
    },
    {
      kind: "person",
      userId: CARLA,
      name: "Carla",
      inactive: true,
      seconds: 59,
      children: [
        {
          kind: "project",
          project: web,
          client: null,
          seconds: 59,
          children: [
            { kind: "date", dayKey: "2026-09-30", label: "mié, 30/09", seconds: 59 },
          ],
        },
      ],
    },
  ];

  it("una columna por nivel y una fila por grupo, en profundidad, con los antepasados repetidos", () => {
    expect(
      summary({
        groupBy: "person",
        subgroups: ["project", "date"],
        levelsShown: 3,
        groups: tree,
      }),
    ).toEqual([
      ["Nivel", "Persona", "Proyecto", "Fecha", "Duración", "Horas"],
      ["1", "Ana", "", "", "10:00", "10,00"],
      ["2", "Ana", "Web (ACME)", "", "6:00", "6,00"],
      ["3", "Ana", "Web (ACME)", "lun, 28/09", "6:00", "6,00"],
      ["2", "Ana", "Sin proyecto", "", "4:00", "4,00"],
      ["3", "Ana", "Sin proyecto", "mar, 29/09", "4:00", "4,00"],
      ["1", "Carla (inactiva)", "", "", "0:00", "0,00"],
      ["2", "Carla (inactiva)", "Web", "", "0:00", "0,00"],
      ["3", "Carla (inactiva)", "Web", "mié, 30/09", "0:00", "0,00"],
    ]);
  });

  it("el nivel es un entero, los rótulos texto y lo de abajo, vacío", () => {
    const rows = section(
      exportDocumentOf(
        input({
          groupBy: "person",
          subgroups: ["project", "date"],
          levelsShown: 3,
          groups: tree,
        }),
        settings,
      ),
      "Resumen",
    ).rows;
    expect(rows[1]).toEqual([
      { kind: "integer", value: 1 },
      { kind: "text", text: "Ana" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "duration", seconds: 36_059 },
      { kind: "hours", minutes: 600 },
    ]);
  });

  it("solo las columnas de los niveles que entraron en el tope", () => {
    const shallow = tree.map((person) => ({
      ...person,
      children: person.children?.map((project) => ({ ...project, children: undefined })),
    }));
    const rows = summary({
      groupBy: "person",
      subgroups: ["project", "date"],
      levelsShown: 2,
      groups: shallow,
    });
    expect(rows[0]).toEqual(["Nivel", "Persona", "Proyecto", "Duración", "Horas"]);
    expect(rows.slice(1, 3)).toEqual([
      ["1", "Ana", "", "10:00", "10,00"],
      ["2", "Ana", "Web (ACME)", "6:00", "6,00"],
    ]);
  });

  it("los minutos de cada fila son los de `durationLabel`, truncados", () => {
    for (const seconds of [0, 59, 60, 3599, 5399, 36_059]) {
      const rows = summary({
        groups: [{ kind: "person", userId: ANA, name: "Ana", inactive: false, seconds }],
      });
      expect(rows[1][2]).toBe(durationLabel(seconds));
    }
    expect(
      summary({
        groups: [
          { kind: "person", userId: ANA, name: "Ana", inactive: false, seconds: 3599 },
        ],
      })[1],
    ).toEqual(["1", "Ana", "0:59", "0,98"]);
  });

  it("sin grupos, el vacío y, con filtros efectivos, el segundo vacío, sin encabezados", () => {
    expect(summary({ groups: [], totalSeconds: 0 })).toEqual([
      ["No hay horas en este período"],
    ]);
    expect(
      summary({ groups: [], filters: { ...NO_REPORT_FILTERS, withoutProject: true } }),
    ).toEqual([["Ninguna entrada coincide con los filtros"]]);
  });

  it("con el primer nivel cortado, la nota en lugar de las filas", () => {
    expect(summary({ groupBy: "description", levelsShown: 0, groups: [] })).toEqual([
      [
        "El primer nivel pasa de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá por otra cosa.",
      ],
    ]);
  });
});

describe("groupTextOf (D-R6-7)", () => {
  it.each<[string, ReportGroup, string]>([
    [
      "persona",
      { kind: "person", userId: ANA, name: "Ana", inactive: false, seconds: 0 },
      "Ana",
    ],
    [
      "persona inactiva",
      { kind: "person", userId: ANA, name: "Ana", inactive: true, seconds: 0 },
      "Ana (inactiva)",
    ],
    [
      "proyecto con cliente",
      { kind: "project", project: web, client: acme, seconds: 0 },
      "Web (ACME)",
    ],
    [
      "proyecto sin cliente",
      { kind: "project", project: web, client: null, seconds: 0 },
      "Web",
    ],
    [
      "sin proyecto",
      { kind: "project", project: null, client: null, seconds: 0 },
      "Sin proyecto",
    ],
    ["cliente", { kind: "client", client: acme, seconds: 0 }, "ACME"],
    ["sin cliente", { kind: "client", client: null, seconds: 0 }, "Sin cliente"],
    [
      "tarea con proyecto",
      { kind: "task", task: { id: T1, name: "Diseño" }, project: web, seconds: 0 },
      "Diseño (Web)",
    ],
    ["sin tarea", { kind: "task", task: null, project: null, seconds: 0 }, "Sin tarea"],
    [
      "etiqueta",
      { kind: "tag", tag: { id: G1, name: "Urgente" }, seconds: 0 },
      "Urgente",
    ],
    ["sin etiqueta", { kind: "tag", tag: null, seconds: 0 }, "Sin etiqueta"],
    [
      "fecha",
      { kind: "date", dayKey: "2025-09-15", label: "lun, 15/09/2025", seconds: 0 },
      "lun, 15/09/2025",
    ],
    [
      "semana entera",
      {
        kind: "week",
        weekStart: "2026-09-28",
        label: "28/09 – 04/10",
        partial: null,
        seconds: 0,
      },
      "28/09 – 04/10",
    ],
    [
      "semana cortada",
      {
        kind: "week",
        weekStart: "2026-09-28",
        label: "28/09 – 04/10",
        partial: "01/10 – 04/10",
        seconds: 0,
      },
      "28/09 – 04/10 solo 01/10 – 04/10",
    ],
    [
      "mes entero",
      {
        kind: "month",
        monthStart: "2026-09-01",
        label: "septiembre",
        partial: null,
        seconds: 0,
      },
      "septiembre",
    ],
    [
      "mes cortado",
      {
        kind: "month",
        monthStart: "2026-09-01",
        label: "septiembre",
        partial: "28/09 – 30/09",
        seconds: 0,
      },
      "septiembre solo 28/09 – 30/09",
    ],
    [
      "descripción entera",
      {
        kind: "description",
        description: { id: "0".repeat(32), text: "Reunión", truncated: false },
        seconds: 0,
      },
      "Reunión",
    ],
    [
      "descripción recortada",
      {
        kind: "description",
        description: {
          id: "1".repeat(32),
          text: "Una descripción larga",
          truncated: true,
        },
        seconds: 0,
      },
      "Una descripción larga…",
    ],
    [
      "sin descripción",
      { kind: "description", description: null, seconds: 0 },
      "Sin descripción",
    ],
  ])("%s", (_, group, expected) => {
    expect(groupTextOf(group)).toBe(expected);
  });
});

describe("exportDocumentOf: las entradas (D-R6-3)", () => {
  const full: ReportEntryRow = {
    id: "0e000000-0000-4000-8000-000000000001",
    startDay: "2026-09-30",
    startClock: "23:30",
    endDay: "2026-10-01",
    endClock: "01:00",
    person: { name: "Ana", inactive: false },
    project: "Web",
    client: "ACME",
    task: "Diseño",
    description: 'Revisión "final"; v2',
    tags: ["alfa", "Beta"],
    billable: true,
    seconds: 5399,
  };
  const bare: ReportEntryRow = {
    id: "0e000000-0000-4000-8000-000000000002",
    startDay: "2026-10-02",
    startClock: "09:00",
    endDay: "2026-10-02",
    endClock: "09:01",
    person: { name: "Carla", inactive: true },
    project: null,
    client: null,
    task: null,
    description: "",
    tags: [],
    billable: false,
    seconds: 60,
  };

  function entries(rest: Partial<Omit<ReportExportInput, "report">>) {
    return section(exportDocumentOf(input({}, rest), settings), "Entradas").rows;
  }

  it("los encabezados y una fila por entrada, en el orden en que llegan", () => {
    expect(texts(entries({ entries: { kind: "listed", rows: [full, bare] } }))).toEqual([
      [
        "Fecha de inicio",
        "Hora de inicio",
        "Fecha de fin",
        "Hora de fin",
        "Persona",
        "Cliente",
        "Proyecto",
        "Tarea",
        "Descripción",
        "Etiquetas",
        "Facturable",
        "Duración",
        "Horas",
      ],
      [
        "2026-09-30",
        "23:30",
        "2026-10-01",
        "01:00",
        "Ana",
        "ACME",
        "Web",
        "Diseño",
        'Revisión "final"; v2',
        "alfa, Beta",
        "Sí",
        "1:29",
        "1,48",
      ],
      [
        "2026-10-02",
        "09:00",
        "2026-10-02",
        "09:01",
        "Carla (inactiva)",
        "",
        "",
        "",
        "",
        "",
        "No",
        "0:01",
        "0,01",
      ],
    ]);
  });

  it("los días y las horas con su tipo; lo nulo y la descripción vacía, celdas vacías", () => {
    const [, , row] = entries({ entries: { kind: "listed", rows: [full, bare] } });
    expect(row).toEqual([
      { kind: "day", dayKey: "2026-10-02" },
      { kind: "clock", clock: "09:00" },
      { kind: "day", dayKey: "2026-10-02" },
      { kind: "clock", clock: "09:01" },
      { kind: "text", text: "Carla (inactiva)" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "text", text: "No" },
      { kind: "duration", seconds: 60 },
      { kind: "hours", minutes: 1 },
    ]);
  });

  it("la descripción entera, sin recortar", () => {
    const long = "x".repeat(3000);
    const [, row] = texts(
      entries({ entries: { kind: "listed", rows: [{ ...full, description: long }] } }),
    );
    expect(row[8]).toBe(long);
  });

  it("sin entradas en el período, solo los encabezados", () => {
    expect(entries({ entries: { kind: "listed", rows: [] } })).toHaveLength(1);
  });

  it("con `tooMany`, la nota y ninguna fila", () => {
    expect(texts(entries({ entries: { kind: "tooMany" } }))).toEqual([
      [
        "Las entradas no entran en el archivo: son más de 10\u00a0000 o pesan más de 4 MB. Acortá el período o filtrá.",
      ],
    ]);
  });

  it("las secciones son el resumen y las entradas, en ese orden", () => {
    expect(
      exportDocumentOf(input(), settings).sections.map(({ title }) => title),
    ).toEqual(["Resumen", "Entradas"]);
  });
});

describe("exportDocumentOf sin las entradas leídas (D-R7-3; criterio 5 de R7)", () => {
  it("una sola sección, «Resumen», y la misma cabecera que con entradas", () => {
    const withEntries = exportDocumentOf(input(), settings);
    const withoutEntries = exportDocumentOf(input({}, { entries: null }), settings);
    expect(withoutEntries.sections).toEqual([section(withEntries, "Resumen")]);
    expect(withoutEntries.header).toEqual(withEntries.header);
  });

  it("con el primer nivel cortado, el aviso del resumen y ninguna sección más", () => {
    const cut: Partial<ReportReadyState> = {
      groupBy: "description",
      levelsShown: 0,
      groups: [],
    };
    expect(exportDocumentOf(input(cut, { entries: null }), settings).sections).toEqual([
      section(exportDocumentOf(input(cut), settings), "Resumen"),
    ]);
  });
});

describe("exportDocumentOf: el gráfico (D-R7-12; criterio 16 de R7)", () => {
  const chart: ReportChart = {
    granularity: "date",
    bars: [
      {
        firstDay: "2026-09-28",
        label: "lun, 28/09",
        partial: null,
        tick: "28/09",
        seconds: 3599,
      },
      {
        firstDay: "2026-09-29",
        label: "mar, 29/09",
        partial: null,
        tick: "29/09",
        seconds: 0,
      },
    ],
  };

  it("es el del estado, el mismo valor, también `null`", () => {
    expect(exportDocumentOf(input({ chart }), settings).chart).toBe(chart);
    expect(exportDocumentOf(input({ chart }, { entries: null }), settings).chart).toBe(
      chart,
    );
    expect(exportDocumentOf(input(), settings).chart).toBeNull();
  });

  it("sigue con el primer nivel cortado, como la pantalla", () => {
    const cut: Partial<ReportReadyState> = {
      groupBy: "description",
      levelsShown: 0,
      groups: [],
      chart,
    };
    expect(exportDocumentOf(input(cut, { entries: null }), settings).chart).toBe(chart);
  });

  /** El documento con el gráfico y el mismo sin él. */
  function withAndWithout(): readonly [ExportDocument, ExportDocument] {
    const document = exportDocumentOf(input({ chart }), settings);
    return [document, { ...document, chart: null }];
  }

  it("el CSV no lo escribe: los mismos bytes con y sin gráfico", () => {
    const [withChart, withoutChart] = withAndWithout();
    expect(csvBytesOf(withChart)).toEqual(csvBytesOf(withoutChart));
  });

  /** Las hojas y los valores de sus celdas: los bytes llevan la fecha de creación. */
  async function cellsOf(document: ExportDocument) {
    const workbook = new Workbook();
    await workbook.xlsx.load((await xlsxBytesOf(document)).buffer);
    return workbook.worksheets.map((sheet) => {
      const rows: unknown[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const cells: unknown[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push([cell.address, cell.value, cell.numFmt]);
        });
        rows.push(cells);
      });
      return { name: sheet.name, rows };
    });
  }

  it("el Excel no lo escribe: las mismas hojas y celdas con y sin gráfico", async () => {
    const [withChart, withoutChart] = withAndWithout();
    const [cellsWith, cellsWithout] = await Promise.all([
      cellsOf(withChart),
      cellsOf(withoutChart),
    ]);
    expect(cellsWith.map(({ name }) => name)).toEqual(["Resumen", "Entradas"]);
    expect(cellsWith).toEqual(cellsWithout);
  });
});

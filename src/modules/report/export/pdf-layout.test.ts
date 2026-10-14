import { describe, expect, it } from "vitest";

import {
  NO_REPORT_FILTERS,
  type ReportChart,
  type ReportGroup,
  type ReportReadyState,
} from "@/modules/report/schema";
import type { TimeSettings } from "@/server/time";
import { octoberByDay } from "@/test/report";

import { exportDocumentOf, type ReportExportInput } from "./document";
import {
  pdfLayoutOf,
  pdfTextOf,
  type GlyphCoverage,
  type PdfChart,
  type PdfSection,
} from "./pdf-layout";
import type { ExportCell, ExportDocument } from "./types";

/** La cobertura de prueba: ASCII, Latin-1, «Ł» y U+FFFD. */
const covers: GlyphCoverage = (codePoint) =>
  (codePoint >= 0x20 && codePoint <= 0x7e) ||
  (codePoint >= 0xa0 && codePoint <= 0xff) ||
  codePoint === 0x141 ||
  codePoint === 0xfffd;

/** Una fuente que dice dibujarlo todo: lo que se reemplaza igual no depende de ella. */
const coversAll: GlyphCoverage = () => true;

const REPLACEMENT = "�";

describe("pdfTextOf (D-R7-5; criterio 6 de R7)", () => {
  it("deja lo que la fuente dibuja y reemplaza lo demás, un punto de código por vez", () => {
    expect(pdfTextOf("Łukasz", covers)).toBe("Łukasz");
    expect(pdfTextOf("Дмитрий", covers)).toBe(REPLACEMENT.repeat(7));
    expect(pdfTextOf("😀", covers)).toBe(REPLACEMENT);
    expect(pdfTextOf("a 😀 b", covers)).toBe(`a ${REPLACEMENT} b`);
  });

  it.each(["a\tb", "a\nb", "a\r\nb", "a\n\nb", "a\t\r\n\tb"])(
    "una corrida de tabulaciones y saltos es un solo espacio: %j",
    (text) => {
      expect(pdfTextOf(text, covers)).toBe("a b");
    },
  );

  it.each([
    ["un surrogate alto suelto", "\uD83D"],
    ["un surrogate bajo suelto", "\uDE00"],
    ["U+FFFE", "￾"],
    ["U+FFFF", "￿"],
    ["U+0000", "\u0000"],
    ["U+0007", "\u0007"],
    ["U+007F", "\u007F"],
    ["U+0085", "\u0085"],
  ])("%s es U+FFFD aunque la cobertura diga que sí", (_, char) => {
    expect(pdfTextOf(`a${char}b`, coversAll)).toBe(`a${REPLACEMENT}b`);
  });
});

const settings: TimeSettings = {
  timezone: "America/Argentina/Buenos_Aires",
  weekStart: 1,
  formats: { time: "24h", date: "dd/MM/yyyy" },
};

const ANA = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY";
const BRUNO = "Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx";
const CARLA = "9e0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const C1 = "c1000000-0000-4000-8000-000000000000";
const P1 = "f1000000-0000-4000-8000-000000000000";

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

function layoutOf(overrides: Partial<ReportReadyState>, covered = coversAll) {
  const input: ReportExportInput = {
    kind: "ready",
    report: { ...report, ...overrides },
    entries: null,
    // 14:05 en Buenos Aires.
    generatedAt: new Date("2026-10-12T17:05:00Z"),
    exporter: "Ana Pérez",
  };
  return pdfLayoutOf(exportDocumentOf(input, settings), covered);
}

function tableOf(section: PdfSection | undefined) {
  if (section?.kind !== "table") {
    throw new Error("La sección no es una tabla");
  }
  return section;
}

const tree: ReportGroup[] = [
  {
    kind: "person",
    userId: ANA,
    name: "Ana",
    inactive: false,
    seconds: 5400,
    children: [
      {
        kind: "project",
        project: { id: P1, name: "Web", color: "teal" },
        client: { id: C1, name: "ACME" },
        seconds: 5400,
        children: [
          { kind: "date", dayKey: "2026-09-28", label: "lun, 28/09", seconds: 5400 },
        ],
      },
    ],
  },
  {
    kind: "person",
    userId: CARLA,
    name: "Carla",
    inactive: true,
    seconds: 3600,
    children: [
      {
        kind: "project",
        project: null,
        client: null,
        seconds: 3600,
        children: [
          { kind: "date", dayKey: "2026-09-29", label: "mar, 29/09", seconds: 3600 },
        ],
      },
    ],
  },
];

const threeLevels: Partial<ReportReadyState> = {
  groupBy: "person",
  subgroups: ["project", "date"],
  levelsShown: 3,
  groups: tree,
};

describe("pdfLayoutOf (D-R7-6; criterio 7 de R7)", () => {
  it("el título es la primera fila de la cabecera y la cabecera, las demás", () => {
    const layout = layoutOf({});
    expect(layout.title).toBe("Reporte resumido");
    expect(layout.header).toEqual([
      ["Período", "28/09/2026 – 04/10/2026"],
      ["Zona horaria", "America/Argentina/Buenos_Aires"],
      ["Alcance", "Todas las personas del workspace"],
      ["Agrupado por", "Persona"],
      ["Total", "0:59", "0,98"],
      ["Facturable", "0:30", "0,50"],
      ["Generado", "12/10/2026 14:05"],
    ]);
  });

  it("el resumen de tres niveles: «Nivel», un nivel por columna, «Duración» y «Horas», con sus anchos", () => {
    const { sections } = layoutOf(threeLevels);
    expect(sections).toHaveLength(1);
    const table = tableOf(sections[0]);
    expect(table.title).toBe("Resumen");
    expect(table.columns.map(({ label, align }) => [label, align])).toEqual([
      ["Nivel", "right"],
      ["Persona", "left"],
      ["Proyecto", "left"],
      ["Fecha", "left"],
      ["Duración", "right"],
      ["Horas", "right"],
    ]);
    const widths = table.columns.map(({ width }) => width);
    [0.08, 0.7 / 3, 0.7 / 3, 0.7 / 3, 0.12, 0.1].forEach((expected, index) => {
      expect(widths[index]).toBeCloseTo(expected, 9);
    });
    const total = widths.reduce((sum, width) => sum + width, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });

  it("una fila sin horas de R9 como primera fila de datos no cambia los anchos", () => {
    const bruno: ReportGroup = {
      kind: "person",
      userId: BRUNO,
      name: "Bruno",
      inactive: false,
      seconds: 0,
    };
    const table = tableOf(
      layoutOf({ ...threeLevels, peopleWithoutTime: true, groups: [bruno, ...tree] })
        .sections[0],
    );
    expect(table.rows[0].cells.map(({ text }) => text)).toEqual([
      "1",
      "Bruno",
      "",
      "",
      "0:00",
      "0,00",
    ]);
    expect(table.columns).toEqual(tableOf(layoutOf(threeLevels).sections[0]).columns);
  });

  it("cada fila lleva su nivel; los rótulos de los antepasados van apagados y el propio, no", () => {
    const { rows } = tableOf(layoutOf(threeLevels).sections[0]);
    expect(rows.map(({ level }) => level)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(rows[0].cells).toEqual([
      { text: "1", muted: false },
      { text: "Ana", muted: false },
      { text: "", muted: false },
      { text: "", muted: false },
      { text: "1:30", muted: false },
      { text: "1,50", muted: false },
    ]);
    expect(rows[2].cells).toEqual([
      { text: "3", muted: false },
      { text: "Ana", muted: true },
      { text: "Web (ACME)", muted: true },
      { text: "lun, 28/09", muted: false },
      { text: "1:30", muted: false },
      { text: "1,50", muted: false },
    ]);
  });

  it("las celdas con el texto del CSV, sin el `'` de la inyección", () => {
    const { rows } = tableOf(layoutOf(threeLevels).sections[0]);
    expect(rows[4].cells.map(({ text }) => text)).toEqual([
      "2",
      "Carla (inactiva)",
      "Sin proyecto",
      "",
      "1:00",
      "1,00",
    ]);
    const described = tableOf(
      layoutOf({
        groupBy: "description",
        groups: [
          {
            kind: "description",
            description: { id: "0".repeat(32), text: "=1+1", truncated: false },
            seconds: 5400,
          },
        ],
      }).sections[0],
    );
    expect(described.rows[0].cells.map(({ text }) => text)).toEqual([
      "1",
      "=1+1",
      "1:30",
      "1,50",
    ]);
  });

  it.each<[string, Partial<ReportReadyState>, string]>([
    ["el vacío", { groups: [], totalSeconds: 0 }, "No hay horas en este período"],
    [
      "el segundo vacío",
      { groups: [], filters: { ...NO_REPORT_FILTERS, withoutProject: true } },
      "Ninguna entrada coincide con los filtros",
    ],
    [
      "el primer nivel cortado",
      { groupBy: "description", levelsShown: 0, groups: [] },
      "El primer nivel pasa de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá por otra cosa.",
    ],
  ])("%s es un aviso con su texto, no una tabla", (_, overrides, text) => {
    expect(layoutOf(overrides).sections).toEqual([
      { kind: "note", title: "Resumen", text },
    ]);
  });

  it("lo que la fuente no dibuja se reemplaza en el título, la cabecera, los encabezados, los rótulos y los avisos", () => {
    const text = (value: string): ExportCell => ({ kind: "text", text: value });
    const document: ExportDocument = {
      header: [
        [text("Reporte → resumido")],
        [text("Período"), text("28/09/2026 → 04/10/2026")],
      ],
      chart: null,
      sections: [
        {
          title: "Resumen →",
          rows: [
            [text("Nivel"), text("Persona →"), text("Duración"), text("Horas")],
            [
              { kind: "integer", value: 1 },
              text("Дмитрий"),
              { kind: "duration", minutes: 90 },
              { kind: "hours", minutes: 90 },
            ],
          ],
        },
        { title: "Aviso", rows: [[text("Sin horas 😀")]] },
      ],
    };
    const layout = pdfLayoutOf(document, covers);
    expect(layout.title).toBe(`Reporte ${REPLACEMENT} resumido`);
    expect(layout.header).toEqual([["Período", `28/09/2026 ${REPLACEMENT} 04/10/2026`]]);
    const table = tableOf(layout.sections[0]);
    expect(table.title).toBe(`Resumen ${REPLACEMENT}`);
    expect(table.columns[1].label).toBe(`Persona ${REPLACEMENT}`);
    expect(table.rows[0].cells[1].text).toBe(REPLACEMENT.repeat(7));
    expect(layout.sections[1]).toEqual({
      kind: "note",
      title: "Aviso",
      text: `Sin horas ${REPLACEMENT}`,
    });
  });

  it("una tabla que no es el resumen es un `RangeError`: el PDF no escribe las entradas", () => {
    const headings: ExportCell[] = [
      { kind: "text", text: "Fecha de inicio" },
      { kind: "text", text: "Horas" },
    ];
    const entries = (rows: ExportCell[][]): ExportDocument => ({
      header: [[{ kind: "text", text: "Reporte resumido" }]],
      chart: null,
      sections: [{ title: "Entradas", rows: [headings, ...rows] }],
    });
    expect(() =>
      pdfLayoutOf(
        entries([
          [
            { kind: "day", dayKey: "2026-09-28" },
            { kind: "hours", minutes: 90 },
          ],
        ]),
        covers,
      ),
    ).toThrow(RangeError);
    expect(() => pdfLayoutOf(entries([]), covers)).toThrow(RangeError);
  });

  it("una cabecera sin el título es un `RangeError`", () => {
    expect(() => pdfLayoutOf({ header: [], chart: null, sections: [] }, covers)).toThrow(
      RangeError,
    );
  });
});

function chartOf(chart: ReportChart, covered = coversAll): PdfChart {
  const layout = layoutOf({ ...threeLevels, chart }, covered);
  if (layout.chart === null) {
    throw new Error("El diseño no trae el gráfico");
  }
  return layout.chart;
}

describe("pdfLayoutOf: el gráfico (D-R7-12; criterio 17 de R7)", () => {
  it("la escala de 31 barras por día: cinco líneas de 0:00 a 2:00, de abajo arriba", () => {
    expect(chartOf(octoberByDay).scale).toEqual([
      { label: "0:00", height: 0 },
      { label: "0:30", height: 0.25 },
      { label: "1:00", height: 0.5 },
      { label: "1:30", height: 0.75 },
      { label: "2:00", height: 1 },
    ]);
  });

  it("el alto de cada barra es una fracción del techo, y una de pocos segundos tiene horas", () => {
    const { bars } = chartOf(octoberByDay);
    expect(bars).toHaveLength(31);
    expect(bars[12]?.height).toBeCloseTo(0.8333333333, 9);
    expect(bars[12]?.hasHours).toBe(true);
    expect(bars[3]?.height).toBeCloseTo(0.0041666666, 9);
    expect(bars[3]?.hasHours).toBe(true);
    expect([bars[0]?.height, bars[0]?.hasHours]).toEqual([0, false]);
  });

  it("siete marcas, cada cinco barras desde la primera; la primera al borde izquierdo y la última al derecho", () => {
    const { bars } = chartOf(octoberByDay);
    const marked = [0, 5, 10, 15, 20, 25, 30];
    expect(bars.map(({ tick }) => tick)).toEqual(
      bars.map((_, index) =>
        marked.includes(index) ? `${String(index + 1).padStart(2, "0")}/10` : null,
      ),
    );
    expect(marked.map((index) => [bars[index]?.tick, bars[index]?.tickAlign])).toEqual([
      ["01/10", "start"],
      ["06/10", "center"],
      ["11/10", "center"],
      ["16/10", "center"],
      ["21/10", "center"],
      ["26/10", "center"],
      ["31/10", "end"],
    ]);
  });

  it("una barra sola lleva su marca, centrada", () => {
    const [bar] = octoberByDay.bars;
    const { bars } = chartOf({ granularity: "date", bars: [{ ...bar, seconds: 5400 }] });
    expect(bars).toEqual([
      { height: 1, hasHours: true, tick: "01/10", tickAlign: "center" },
    ]);
  });

  it("la leyenda sale de la granularidad: por día y por semana", () => {
    expect(chartOf(octoberByDay).caption).toBe("Horas por día");
    const week: ReportChart = {
      granularity: "week",
      bars: [
        {
          firstDay: "2026-09-28",
          label: "28/09 – 04/10",
          partial: null,
          tick: "28/09",
          seconds: 3600,
        },
        {
          firstDay: "2026-10-05",
          label: "05/10 – 11/10",
          partial: null,
          tick: "05/10",
          seconds: 0,
        },
      ],
    };
    expect(chartOf(week).caption).toBe("Horas por semana");
  });

  it("una marca con lo que la fuente no dibuja sale con U+FFFD", () => {
    const [first, ...rest] = octoberByDay.bars;
    const { bars } = chartOf(
      { granularity: "date", bars: [{ ...first, tick: "01→10" }, ...rest] },
      covers,
    );
    expect(bars[0]?.tick).toBe(`01${REPLACEMENT}10`);
  });

  it("sin gráfico, `chart` es `null` y las secciones son las mismas que con gráfico", () => {
    const without = layoutOf(threeLevels);
    expect(without.chart).toBeNull();
    expect(layoutOf({ ...threeLevels, chart: octoberByDay }).sections).toEqual(
      without.sections,
    );
  });
});

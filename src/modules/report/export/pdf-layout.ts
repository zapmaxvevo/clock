import {
  barHeightPercent,
  chartScaleOf,
  tickAlignOf,
  tickIndexesOf,
  type TickAlign,
} from "@/modules/report/components/chart-model";
import { chartCaptions } from "@/modules/report/components/labels";
import type { ReportChart } from "@/modules/report/schema";

import { cellText } from "./cell-text";
import type { ExportCell, ExportDocument, ExportRow, ExportSection } from "./types";

/** D-R7-5: si la fuente del PDF dibuja un punto de código. */
export type GlyphCoverage = (codePoint: number) => boolean;

/** Una celda ya escrita; `muted`, el rótulo de un antepasado (D-R7-6). */
type PdfCell = { readonly text: string; readonly muted: boolean };

export type PdfColumn = {
  readonly label: string;
  /** Fracción del ancho de la tabla; las de una tabla suman 1. */
  readonly width: number;
  readonly align: "left" | "right";
};

export type PdfRow = {
  /** El nivel del resumen; las del 1 van sobre fondo (D-R7-6). */
  readonly level: number;
  readonly cells: readonly PdfCell[];
};

export type PdfSection =
  | {
      readonly kind: "table";
      readonly title: string;
      readonly columns: readonly PdfColumn[];
      readonly rows: readonly PdfRow[];
    }
  /** Un aviso en lugar de la tabla: los vacíos y el primer nivel cortado. */
  | { readonly kind: "note"; readonly title: string; readonly text: string };

/** R7b: una columna del gráfico (D-R7-12). */
type PdfChartBar = {
  /** El alto de la barra, de 0 a 1 del techo de la escala (D-R5-8). */
  readonly height: number;
  /** Con horas: la barra lleva el alto mínimo. */
  readonly hasHours: boolean;
  /** La marca, o `null` si esta columna no la muestra. */
  readonly tick: string | null;
  readonly tickAlign: TickAlign;
};

export type PdfChart = {
  /** La leyenda: «Horas por día». */
  readonly caption: string;
  /** Las líneas de la escala, de abajo arriba: el rótulo y su alto, de 0 a 1 del techo. */
  readonly scale: readonly { readonly label: string; readonly height: number }[];
  readonly bars: readonly PdfChartBar[];
};

export type PdfLayout = {
  readonly title: string;
  /** D-R6-8 sin el título: el nombre y uno o dos valores por fila. */
  readonly header: readonly (readonly string[])[];
  /** R7b: `null` si el documento no trae gráfico (D-R5-6). */
  readonly chart: PdfChart | null;
  readonly sections: readonly PdfSection[];
};

/** Una corrida de tabulaciones y saltos de línea: la pantalla la muestra como un espacio. */
const BLANK_RUN = /[\t\n\r]+/g;

/** U+FFFD, el carácter de reemplazo. */
const REPLACEMENT_CHARACTER = "�";

/** «Nivel», «Duración» y «Horas»: anchos fijos, a la derecha (D-R7-6). */
const FIXED_WIDTHS: Partial<Record<ExportCell["kind"], number>> = {
  integer: 0.08,
  duration: 0.12,
  hours: 0.1,
};

/** D-R7-5: el blanco, como un espacio; lo que no se dibuja, como U+FFFD. */
export function pdfTextOf(text: string, covers: GlyphCoverage): string {
  // `Array.from` recorre por punto de código: un emoji es un solo reemplazo.
  return Array.from(text.replace(BLANK_RUN, " "), (char) => {
    const codePoint = char.codePointAt(0);
    return codePoint !== undefined && drawable(codePoint, covers)
      ? char
      : REPLACEMENT_CHARACTER;
  }).join("");
}

/** Los controles, los no caracteres y los surrogates sueltos no se dibujan nunca. */
function drawable(codePoint: number, covers: GlyphCoverage): boolean {
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return false;
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return false;
  }
  if (codePoint === 0xfffe || codePoint === 0xffff) {
    return false;
  }
  return covers(codePoint);
}

/** D-R7-6: qué va en cada página, sin medidas de la biblioteca. Pura. */
export function pdfLayoutOf(document: ExportDocument, covers: GlyphCoverage): PdfLayout {
  const titleRow = document.header.at(0);
  // D-R6-8: la primera fila de la cabecera es el título, solo.
  if (titleRow?.length !== 1) {
    throw new RangeError("La cabecera del documento no empieza con el título.");
  }
  return {
    title: pdfCellText(titleRow[0], covers),
    header: document.header
      .slice(1)
      .map((row) => row.map((cell) => pdfCellText(cell, covers))),
    chart: document.chart === null ? null : chartOf(document.chart, covers),
    sections: document.sections.map((section) => sectionOf(section, covers)),
  };
}

/**
 * D-R7-12: lo que arma `ReportChart` de la pantalla, sin importar ese `.tsx`:
 * la escala, las alturas y las marcas salen de `chart-model.ts`; el rótulo de
 * cada línea es el texto de `durationLabel`, la duración truncada al minuto.
 */
function chartOf(chart: ReportChart, covers: GlyphCoverage): PdfChart {
  const scale = chartScaleOf(chart.bars);
  // Las siete de `tickIndexesOf`: el ancho del A4 alcanza, sin las de la pantalla angosta.
  const ticks = new Set(tickIndexesOf(chart.bars.length));
  return {
    caption: pdfTextOf(chartCaptions[chart.granularity], covers),
    scale: scale.lines.map((seconds) => ({
      label: pdfCellText({ kind: "duration", minutes: Math.floor(seconds / 60) }, covers),
      height: barHeightPercent(seconds, scale) / 100,
    })),
    bars: chart.bars.map((bar, index) => ({
      height: barHeightPercent(bar.seconds, scale) / 100,
      hasHours: bar.seconds > 0,
      tick: ticks.has(index) ? pdfTextOf(bar.tick, covers) : null,
      tickAlign: tickAlignOf(index, chart.bars.length),
    })),
  };
}

/** D-R7-6: el texto del CSV, sin el `'`, con lo que la fuente no dibuja reemplazado. */
function pdfCellText(cell: ExportCell, covers: GlyphCoverage): string {
  return pdfTextOf(cellText(cell), covers);
}

/** Una sola fila de una sola celda de texto es un aviso; lo demás, una tabla. */
function sectionOf(section: ExportSection, covers: GlyphCoverage): PdfSection {
  const title = pdfTextOf(section.title, covers);
  const only = section.rows.length === 1 ? section.rows[0] : undefined;
  if (only?.length === 1 && only[0].kind === "text") {
    return { kind: "note", title, text: pdfCellText(only[0], covers) };
  }
  const headings = section.rows.at(0);
  const rows = section.rows.slice(1);
  const first = rows.at(0);
  // D-R7-2: el PDF escribe solo el resumen, que empieza cada fila con su nivel.
  if (headings === undefined || first === undefined) {
    throw new RangeError(`La tabla «${section.title}» no tiene filas de datos.`);
  }
  return {
    kind: "table",
    title,
    columns: columnsOf(headings, first, covers),
    rows: rows.map((row) => rowOf(row, covers)),
  };
}

/**
 * Los anchos salen del tipo de cada celda de la primera fila de datos; las de
 * texto y las vacías se reparten lo que dejan las fijas.
 */
function columnsOf(
  headings: ExportRow,
  first: ExportRow,
  covers: GlyphCoverage,
): readonly PdfColumn[] {
  const fixed = headings.map((_, index) => {
    const cell = first.at(index);
    return cell === undefined ? undefined : FIXED_WIDTHS[cell.kind];
  });
  const fixedTotal = fixed.reduce<number>((total, width) => total + (width ?? 0), 0);
  const shared = (1 - fixedTotal) / fixed.filter((width) => width === undefined).length;
  return headings.map((heading, index) => {
    const width = fixed[index];
    return {
      label: pdfCellText(heading, covers),
      width: width ?? shared,
      align: width === undefined ? "left" : "right",
    };
  });
}

/** Los rótulos de las columnas 1 a `level - 1` son los antepasados (D-R7-6). */
function rowOf(row: ExportRow, covers: GlyphCoverage): PdfRow {
  const levelCell = row.at(0);
  if (levelCell?.kind !== "integer") {
    throw new RangeError("Una fila del resumen no empieza con su nivel.");
  }
  const level = levelCell.value;
  return {
    level,
    cells: row.map((cell, index) => ({
      text: pdfCellText(cell, covers),
      muted: cell.kind === "text" && index >= 1 && index < level,
    })),
  };
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { create } from "fontkit";
import PDFDocument from "pdfkit";

import { exportLabels } from "./labels";
import {
  pdfLayoutOf,
  type GlyphCoverage,
  type PdfColumn,
  type PdfLayout,
  type PdfRow,
  type PdfSection,
} from "./pdf-layout";
import type { ExportDocument } from "./types";

/** D-R7-6: las medidas, en puntos. */
const MARGIN = 36;
const BODY_SIZE = 9;
const SECTION_SIZE = 11;
const TITLE_SIZE = 14;
const CELL_PADDING = 3;
/** El blanco debajo del título y de cada bloque. */
const BLOCK_GAP = 8;
/** El nombre de cada fila de la cabecera; los valores van a su derecha. */
const HEADER_NAME_WIDTH = 130;
/** Entre los valores de una fila de la cabecera: «Total», la duración y las horas. */
const HEADER_VALUE_SEPARATOR = "   ";
/** El pie, dentro del margen inferior: cuánto baja desde el borde del margen. */
const FOOTER_OFFSET = 12;

/** D-R7-6: los colores. Los antepasados, en gris; el nivel 1 y los encabezados, sobre fondo. */
const TEXT_COLOR = "#000000";
const MUTED_COLOR = "#6b6b6b";
const HEADINGS_FILL = "#d9d9d9";
const LEVEL_ONE_FILL = "#eeeeee";

const FONT_NAME = "NotoSans";

type Font = { readonly bytes: Buffer; readonly covers: GlyphCoverage };

/**
 * D-R7-5: la fuente del repositorio y su cobertura, de los mismos bytes. La
 * ruta va literal en `join`: así Turbopack la sigue y la fuente entra al
 * trazado de la ruta.
 */
async function fontOf(): Promise<Font> {
  const bytes = await readFile(
    join(process.cwd(), "src/modules/report/export/fonts/NotoSans-Regular.ttf"),
  );
  const font = create(bytes);
  if ("fonts" in font) {
    throw new Error("La fuente del PDF es una colección y no un TTF.");
  }
  return { bytes, covers: (codePoint) => font.hasGlyphForCodePoint(codePoint) };
}

/** Dibuja el diseño en `doc`, de arriba abajo, con la paginación a mano (§4.6). */
function draw(doc: PDFKit.PDFDocument, layout: PdfLayout): void {
  const left = MARGIN;
  const width = doc.page.width - 2 * MARGIN;
  const top = doc.page.margins.top;
  const bottom = doc.page.height - doc.page.margins.bottom;
  let y = top;

  function newPage(): void {
    doc.addPage();
    y = top;
  }

  /** El texto en un recuadro; lo deja en `y + CELL_PADDING`, sin partir de página. */
  function drawCellText(
    text: string,
    x: number,
    cellWidth: number,
    align: PdfColumn["align"],
    color: string,
  ): void {
    if (text === "") {
      return;
    }
    doc.fillColor(color).text(text, x + CELL_PADDING, y + CELL_PADDING, {
      width: cellWidth - 2 * CELL_PADDING,
      align,
    });
  }

  function rowHeightOf(texts: readonly string[], columns: readonly PdfColumn[]): number {
    const heights = texts.map((text, index) =>
      text === ""
        ? 0
        : doc.heightOfString(text, {
            width: (columns[index]?.width ?? 0) * width - 2 * CELL_PADDING,
          }),
    );
    return Math.max(doc.currentLineHeight(), ...heights) + 2 * CELL_PADDING;
  }

  function drawRow(
    texts: readonly { readonly text: string; readonly color: string }[],
    columns: readonly PdfColumn[],
    height: number,
    fill: string | null,
  ): void {
    if (fill !== null) {
      doc.rect(left, y, width, height).fill(fill);
    }
    let x = left;
    columns.forEach((column, index) => {
      const cellWidth = column.width * width;
      const cell = texts[index];
      if (cell !== undefined) {
        drawCellText(cell.text, x, cellWidth, column.align, cell.color);
      }
      x += cellWidth;
    });
    y += height;
  }

  function drawHeadings(columns: readonly PdfColumn[], height: number): void {
    drawRow(
      columns.map(({ label }) => ({ text: label, color: TEXT_COLOR })),
      columns,
      height,
      HEADINGS_FILL,
    );
  }

  /** D-R6-8: el nombre y sus valores; un valor más largo que la página sigue en la otra. */
  function drawHeaderRow([name = "", ...values]: readonly string[]): void {
    const valueWidth = width - HEADER_NAME_WIDTH;
    const value = values.join(HEADER_VALUE_SEPARATOR);
    const height = Math.max(
      doc.heightOfString(name, { width: HEADER_NAME_WIDTH }),
      doc.heightOfString(value, { width: valueWidth }),
    );
    if (y + height > bottom && height <= bottom - top) {
      newPage();
    }
    const page = doc.page;
    doc.fillColor(MUTED_COLOR).text(name, left, y, { width: HEADER_NAME_WIDTH });
    const nameBottom = doc.y;
    doc.fillColor(TEXT_COLOR).text(value, left + HEADER_NAME_WIDTH, y, {
      width: valueWidth,
    });
    y = doc.page === page ? Math.max(nameBottom, doc.y) : doc.y;
  }

  function drawSectionTitle(title: string, keepWith: number): void {
    doc.fontSize(SECTION_SIZE);
    const height = doc.heightOfString(title, { width });
    if (y + height + keepWith > bottom) {
      newPage();
    }
    doc.fillColor(TEXT_COLOR).text(title, left, y, { width });
    y = doc.y + BLOCK_GAP / 2;
    doc.fontSize(BODY_SIZE);
  }

  function drawTable(section: Extract<PdfSection, { kind: "table" }>): void {
    const { columns, rows } = section;
    doc.fontSize(BODY_SIZE);
    const headingsHeight = rowHeightOf(
      columns.map(({ label }) => label),
      columns,
    );
    // El alto útil de una página nueva, debajo de los encabezados.
    const room = bottom - top - headingsHeight;
    const heightOf = (row: PdfRow) =>
      rowHeightOf(
        row.cells.map(({ text }) => text),
        columns,
      );
    const [first] = rows;
    drawSectionTitle(
      section.title,
      headingsHeight + (first === undefined ? 0 : heightOf(first)),
    );
    drawHeadings(columns, headingsHeight);
    for (const row of rows) {
      const height = heightOf(row);
      if (height > room) {
        throw new RangeError(
          `Una fila del resumen mide ${height} pt y una página tiene ${room} pt.`,
        );
      }
      // D-R7-6: la fila no se parte; pasa entera a la página siguiente.
      if (y + height > bottom) {
        newPage();
        drawHeadings(columns, headingsHeight);
      }
      drawRow(
        row.cells.map(({ text, muted }) => ({
          text,
          color: muted ? MUTED_COLOR : TEXT_COLOR,
        })),
        columns,
        height,
        row.level === 1 ? LEVEL_ONE_FILL : null,
      );
    }
  }

  function drawNote(section: Extract<PdfSection, { kind: "note" }>): void {
    doc.fontSize(BODY_SIZE);
    drawSectionTitle(section.title, doc.currentLineHeight());
    doc.fillColor(TEXT_COLOR).text(section.text, left, y, { width });
    y = doc.y;
  }

  doc.font(FONT_NAME).fontSize(TITLE_SIZE).fillColor(TEXT_COLOR);
  doc.text(layout.title, left, y, { width });
  y = doc.y + BLOCK_GAP;
  doc.fontSize(BODY_SIZE);
  for (const row of layout.header) {
    drawHeaderRow(row);
  }
  for (const section of layout.sections) {
    y += BLOCK_GAP;
    if (section.kind === "table") {
      drawTable(section);
    } else {
      drawNote(section);
    }
  }
}

/** D-R7-6: «Página n de N» abajo a la derecha, dentro del margen inferior. */
function drawFooters(doc: PDFKit.PDFDocument): void {
  const { start, count } = doc.bufferedPageRange();
  for (let index = 0; index < count; index++) {
    doc.switchToPage(start + index);
    // Con el margen inferior puesto, escribir debajo de él agrega una página.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(FONT_NAME)
      .fontSize(BODY_SIZE)
      .fillColor(MUTED_COLOR)
      .text(
        exportLabels.pageLabel(index + 1, count),
        MARGIN,
        doc.page.height - margin + FOOTER_OFFSET,
        { width: doc.page.width - 2 * MARGIN, align: "right", lineBreak: false },
      );
    doc.page.margins.bottom = margin;
  }
}

/**
 * D-R7-4 a D-R7-6: el PDF del documento, en A4 vertical, con la cabecera, el
 * resumen con sus encabezados en cada página y el número de página. Solo
 * escribe, con la fuente del repositorio: no pide nada a la red. Sin nada
 * guardado en el módulo: cada llamada lee la fuente y arma su documento.
 */
export async function pdfBytesOf(
  document: ExportDocument,
): Promise<Uint8Array<ArrayBuffer>> {
  const font = await fontOf();
  const layout = pdfLayoutOf(document, font.covers);
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    lang: "es",
    info: { Title: exportLabels.title },
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<void>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });
  doc.registerFont(FONT_NAME, font.bytes);
  draw(doc, layout);
  drawFooters(doc);
  doc.end();
  await finished;
  // Los fragmentos son vistas de Node: la copia es un `ArrayBuffer` propio.
  return new Uint8Array(Buffer.concat(chunks));
}

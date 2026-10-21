import { Workbook, type Worksheet } from "exceljs";

import {
  clockToMinutes,
  daysBetweenKeys,
  MINUTES_PER_DAY,
  truncatedHours,
  type DurationFormat,
} from "@/server/time";

import type { ExportCell, ExportDocument, ExportRow } from "./types";

/** El día 0 de los números de serie de Excel, con su 29/02/1900 que no existió. */
const EXCEL_EPOCH = "1899-12-30";

const TEXT_FORMAT = "@";
const DAY_FORMAT = "yyyy-mm-dd";
const CLOCK_FORMAT = "hh:mm";
const SECONDS_PER_DAY = MINUTES_PER_DAY * 60;
/**
 * El número de serie de una duración, la fracción de día, y su formato, que
 * pasa de 24 h: una duración no es una hora del día. La celda guarda lo que
 * muestra (D-R6-6): el compacto, los minutos truncados; el completo, los
 * segundos.
 */
const DURATION_CELLS: Record<
  DurationFormat,
  { readonly serialOf: (seconds: number) => number; readonly numFmt: string }
> = {
  compact: {
    serialOf: (seconds) => Math.floor(seconds / 60) / MINUTES_PER_DAY,
    numFmt: "[h]:mm",
  },
  full: { serialOf: (seconds) => seconds / SECONDS_PER_DAY, numFmt: "[hh]:mm:ss" },
};
/**
 * En caracteres: entra `99999:59:59`. Con el ancho por omisión, 8,43, Excel
 * muestra `####` en una duración que no entra, con el completo desde las mil
 * horas (D-WS2b-9).
 */
const DURATION_COLUMN_WIDTH = 13;
/** Excel lo muestra con el separador decimal de su configuración. */
const HOURS_FORMAT = "0.00";

/**
 * Lo que no es un carácter de XML 1.0: la biblioteca lo escribe tal cual y el
 * archivo queda ilegible. Con `u`, también los surrogates sueltos.
 */
const NOT_XML_CHAR = /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/** U+FFFD, el carácter de reemplazo. */
const REPLACEMENT_CHARACTER = "\uFFFD";

/** Un texto que entra en el XML del archivo; el CSV escribe el original. */
function xmlTextOf(text: string): string {
  return text.replace(NOT_XML_CHAR, REPLACEMENT_CHARACTER);
}

type XlsxValue = {
  readonly value: string | number | null;
  readonly numFmt?: string;
};

/** Los minutos del día de una hora de reloj; lanza si no es canónica. */
function clockMinutes(clock: string): number {
  const minutes = clockToMinutes(clock);
  if (minutes === null) {
    throw new RangeError(`Hora de reloj inválida: ${clock}.`);
  }
  return minutes;
}

/** D-R6-12: el valor y el formato de cada celda; ninguna es una fórmula. */
function valueOf(cell: ExportCell, durationFormat: DurationFormat): XlsxValue {
  switch (cell.kind) {
    case "text":
      return { value: xmlTextOf(cell.text), numFmt: TEXT_FORMAT };
    case "integer":
      return { value: cell.value };
    case "day":
      return { value: daysBetweenKeys(EXCEL_EPOCH, cell.dayKey), numFmt: DAY_FORMAT };
    case "clock":
      return { value: clockMinutes(cell.clock) / MINUTES_PER_DAY, numFmt: CLOCK_FORMAT };
    case "duration": {
      const { serialOf, numFmt } = DURATION_CELLS[durationFormat];
      return { value: serialOf(cell.seconds), numFmt };
    }
    case "hours":
      // Lo que se ve y lo que suma una planilla no pasan el total (D-R6-6).
      return { value: truncatedHours(cell.minutes), numFmt: HOURS_FORMAT };
    case "empty":
      return { value: null };
  }
}

function addRow(
  sheet: Worksheet,
  row: ExportRow,
  durationFormat: DurationFormat,
  bold = false,
): void {
  const added = sheet.addRow([]);
  row.forEach((cell, index) => {
    const { value, numFmt } = valueOf(cell, durationFormat);
    const target = added.getCell(index + 1);
    target.value = value;
    if (numFmt !== undefined) {
      target.numFmt = numFmt;
    }
    if (bold) {
      target.font = { bold: true };
    }
    if (cell.kind === "duration") {
      sheet.getColumn(index + 1).width = DURATION_COLUMN_WIDTH;
    }
  });
}

/**
 * D-R6-12: dos hojas, cada una con la cabecera, una fila vacía y su tabla,
 * con la primera fila de la tabla en negrita: sus encabezados o, si la
 * sección es un aviso, el aviso. Cada columna con una duración, con el ancho
 * que la deja entera. Solo escribe.
 */
export async function xlsxBytesOf(
  document: ExportDocument,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new Workbook();
  for (const section of document.sections) {
    const sheet = workbook.addWorksheet(section.title);
    for (const row of document.header) {
      addRow(sheet, row, document.durationFormat);
    }
    sheet.addRow([]);
    section.rows.forEach((row, index) =>
      addRow(sheet, row, document.durationFormat, index === 0),
    );
  }
  // `writeBuffer` da un `Buffer` de Node, que puede ser una vista de un
  // `ArrayBuffer` más grande: la copia es un `ArrayBuffer` propio.
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

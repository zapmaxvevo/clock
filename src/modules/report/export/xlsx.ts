import { Workbook, type Worksheet } from "exceljs";

import { clockToMinutes, daysBetweenKeys, MINUTES_PER_DAY } from "@/server/time";

import type { ExportCell, ExportDocument, ExportRow } from "./types";

/** El día 0 de los números de serie de Excel, con su 29/02/1900 que no existió. */
const EXCEL_EPOCH = "1899-12-30";

const TEXT_FORMAT = "@";
const DAY_FORMAT = "yyyy-mm-dd";
const CLOCK_FORMAT = "hh:mm";
/** Pasa de 24 h: una duración no es una hora del día. */
const DURATION_FORMAT = "[h]:mm";
/** Excel lo muestra con el separador decimal de su configuración. */
const HOURS_FORMAT = "0.00";

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
function valueOf(cell: ExportCell): XlsxValue {
  switch (cell.kind) {
    case "text":
      return { value: cell.text, numFmt: TEXT_FORMAT };
    case "integer":
      return { value: cell.value };
    case "day":
      return { value: daysBetweenKeys(EXCEL_EPOCH, cell.dayKey), numFmt: DAY_FORMAT };
    case "clock":
      return { value: clockMinutes(cell.clock) / MINUTES_PER_DAY, numFmt: CLOCK_FORMAT };
    case "duration":
      return { value: cell.minutes / MINUTES_PER_DAY, numFmt: DURATION_FORMAT };
    case "hours":
      return { value: cell.minutes / 60, numFmt: HOURS_FORMAT };
    case "empty":
      return { value: null };
  }
}

function addRow(sheet: Worksheet, row: ExportRow, bold = false): void {
  const added = sheet.addRow([]);
  row.forEach((cell, index) => {
    const { value, numFmt } = valueOf(cell);
    const target = added.getCell(index + 1);
    target.value = value;
    if (numFmt !== undefined) {
      target.numFmt = numFmt;
    }
    if (bold) {
      target.font = { bold: true };
    }
  });
}

/**
 * D-R6-12: dos hojas, cada una con la cabecera, una fila vacía y su tabla,
 * con la primera fila de la tabla en negrita: sus encabezados o, si la
 * sección es un aviso, el aviso. Solo escribe.
 */
export async function xlsxBytesOf(
  document: ExportDocument,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new Workbook();
  for (const section of document.sections) {
    const sheet = workbook.addWorksheet(section.title);
    for (const row of document.header) {
      addRow(sheet, row);
    }
    sheet.addRow([]);
    section.rows.forEach((row, index) => addRow(sheet, row, index === 0));
  }
  // `writeBuffer` da un `Buffer` de Node, que puede ser una vista de un
  // `ArrayBuffer` más grande: la copia es un `ArrayBuffer` propio.
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

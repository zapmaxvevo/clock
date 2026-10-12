import { formatDecimalHours, formatDuration } from "@/server/time";

import type { ExportCell, ExportDocument, ExportRow } from "./types";

/** RFC 4180: también al final de la última línea. */
const LINE_END = "\r\n";

const SEPARATOR = ";";

/** Sin él, Excel lee los acentos como Latin-1 (D-R6-9). */
const BYTE_ORDER_MARK = "\uFEFF";

/**
 * S2: lo mínimo que pesa una línea de «Entradas» sin sus textos. Las 13
 * celdas de `entryCellsOf` (`document.ts`) van entre comillas (26 bytes), con
 * 12 `;` y `\r\n` (2): 40. Las dos fechas, `yyyy-MM-dd` (20); las dos horas,
 * `HH:mm` (10); «No» (2) o «Sí» (3); «Duración» y «Horas», al menos «0:00» y
 * «0,00» (8). En total, 80.
 */
const ENTRY_LINE_FIXED_BYTES = 80;

/** S2: lo que `entryListSize` cuenta de las entradas de un archivo. */
export type CsvEntryTexts = {
  readonly entries: number;
  /** Descripción, persona, proyecto, cliente, tarea y nombres de etiquetas, en UTF-8. */
  readonly textBytes: number;
  readonly tagLinks: number;
  readonly taggedEntries: number;
};

/**
 * S1, S2: una cota inferior de los bytes de las líneas de «Entradas»: lo
 * fijo de cada una, sus textos y el «, » entre etiquetas, uno menos que las
 * que tiene cada entrada. El CSV escribe cada texto entero y le puede sumar
 * el `'`, comillas duplicadas o « (inactiva)», nunca restarle: la cota no pasa
 * el archivo escrito.
 */
export function csvEntriesMinBytes(texts: CsvEntryTexts): number {
  return (
    texts.entries * ENTRY_LINE_FIXED_BYTES +
    texts.textBytes +
    2 * (texts.tagLinks - texts.taggedEntries)
  );
}

/** OWASP: lo que hace que una planilla lea el campo como fórmula si va primero. */
const FORMULA_STARTS = ["=", "+", "-", "@", "\t", "\r"];

/** El texto de una celda, antes de las comillas. */
function cellText(cell: ExportCell): string {
  switch (cell.kind) {
    case "text":
      return cell.text;
    case "integer":
      return String(cell.value);
    case "day":
      return cell.dayKey;
    case "clock":
      return cell.clock;
    case "duration":
      return formatDuration(cell.minutes);
    case "hours":
      return formatDecimalHours(cell.minutes);
    case "empty":
      return "";
  }
}

/** Entre comillas, con las internas duplicadas y el `'` si empieza como una fórmula. */
function fieldOf(cell: ExportCell): string {
  const text = cellText(cell);
  const safe = FORMULA_STARTS.some((start) => text.startsWith(start)) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function lineOf(row: ExportRow): string {
  return row.map(fieldOf).join(SEPARATOR) + LINE_END;
}

/** D-R6-9: BOM, `;`, `\r\n`, todo entre comillas y el `'` de la inyección. */
export function csvBytesOf(document: ExportDocument): Uint8Array<ArrayBuffer> {
  const header = document.header.map(lineOf);
  // Cada sección, después de una línea vacía, sin campos: su título y sus filas.
  const sections = document.sections.flatMap(({ title, rows }) => [
    LINE_END,
    lineOf([{ kind: "text", text: title }]),
    ...rows.map(lineOf),
  ]);
  return new TextEncoder().encode(BYTE_ORDER_MARK + [...header, ...sections].join(""));
}

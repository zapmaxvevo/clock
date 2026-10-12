import { cellText } from "./cell-text";
import type { ExportCell, ExportDocument, ExportRow } from "./types";

/** RFC 4180: también al final de la última línea. */
const LINE_END = "\r\n";

const SEPARATOR = ";";

/** Sin él, Excel lee los acentos como Latin-1 (D-R6-9). */
const BYTE_ORDER_MARK = "\uFEFF";

/** OWASP: lo que hace que una planilla lea el campo como fórmula si va primero. */
const FORMULA_STARTS = ["=", "+", "-", "@", "\t", "\r"];

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

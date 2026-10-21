import { cellText } from "./cell-text";
import type { DurationFormat } from "@/server/time";

import type { ExportCell, ExportDocument, ExportRow } from "./types";

/** RFC 4180: también al final de la última línea. */
const LINE_END = "\r\n";

const SEPARATOR = ";";

/** Sin él, Excel lee los acentos como Latin-1 (D-R6-9). */
const BYTE_ORDER_MARK = "\uFEFF";

/** OWASP: lo que hace que una planilla lea el campo como fórmula si va primero. */
const FORMULA_STARTS = ["=", "+", "-", "@", "\t", "\r"];

/** Entre comillas, con las internas duplicadas y el `'` si empieza como una fórmula. */
function fieldOf(cell: ExportCell, durationFormat: DurationFormat): string {
  const text = cellText(cell, durationFormat);
  const safe = FORMULA_STARTS.some((start) => text.startsWith(start)) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function lineOf(row: ExportRow, durationFormat: DurationFormat): string {
  return row.map((cell) => fieldOf(cell, durationFormat)).join(SEPARATOR) + LINE_END;
}

/** D-R6-9: BOM, `;`, `\r\n`, todo entre comillas y el `'` de la inyección. */
export function csvBytesOf(document: ExportDocument): Uint8Array<ArrayBuffer> {
  const line = (row: ExportRow) => lineOf(row, document.durationFormat);
  const header = document.header.map(line);
  // Cada sección, después de una línea vacía, sin campos: su título y sus filas.
  const sections = document.sections.flatMap(({ title, rows }) => [
    LINE_END,
    line([{ kind: "text", text: title }]),
    ...rows.map(line),
  ]);
  return new TextEncoder().encode(BYTE_ORDER_MARK + [...header, ...sections].join(""));
}

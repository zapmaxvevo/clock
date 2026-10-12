import type { ExportDocument } from "./types";

/** D-R6-12: dos hojas, cada una con la cabecera y su tabla. Solo escribe. */
export async function xlsxBytesOf(
  document: ExportDocument,
): Promise<Uint8Array<ArrayBuffer>> {
  throw new Error(`R6b, paso 12: ${document.sections.length} secciones sin escribir.`);
}

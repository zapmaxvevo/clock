/**
 * S2: lo mínimo que pesa una línea de «Entradas» en CSV sin sus textos. Las
 * 13 celdas de `entryCellsOf` (`document.ts`) van entre comillas (26 bytes),
 * con 12 `;` y `\r\n` (2): 40. Las dos fechas, `yyyy-MM-dd` (20); las dos
 * horas, `HH:mm` (10); «No» (2) o «Sí» (3); «Duración» y «Horas», al menos
 * «0:00» y «0,00» (8). En total, 80. Con el completo, «Duración» es al menos
 * «00:00:00», más larga: la cota sigue debajo del CSV escrito.
 */
const ENTRY_LINE_FIXED_BYTES = 80;

/** S2: lo que `entryListSize` cuenta de las entradas de un documento. */
export type EntryTexts = {
  readonly entries: number;
  /** Descripción, persona, proyecto, cliente, tarea y nombres de etiquetas, en UTF-8. */
  readonly textBytes: number;
  readonly tagLinks: number;
  readonly taggedEntries: number;
};

/**
 * S1, S2: una cota inferior de los bytes de las líneas de «Entradas» en CSV:
 * lo fijo de cada una, sus textos y el «, » entre etiquetas, uno menos que
 * las que tiene cada entrada. El CSV escribe cada texto entero y le puede
 * sumar el `'`, comillas duplicadas o « (inactiva)», nunca restarle: la cota
 * no pasa el CSV escrito.
 *
 * B4: es el tope de las entradas del documento para todos los formatos, medido
 * como CSV, porque un `.xlsx` comprimido no tiene una cota inferior útil: si
 * las entradas no entran en el CSV, tampoco van en el Excel.
 */
export function entriesMinBytes(texts: EntryTexts): number {
  return (
    texts.entries * ENTRY_LINE_FIXED_BYTES +
    texts.textBytes +
    2 * (texts.tagLinks - texts.taggedEntries)
  );
}

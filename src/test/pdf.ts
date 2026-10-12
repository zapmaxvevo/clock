/**
 * El lector de los PDF de los tests (D-R7-10): con la fuente incrustada, el
 * texto del archivo son números de glifo, y solo un lector lo devuelve.
 */

export type PdfPageText = {
  /** Todos los fragmentos de la página en orden, con un espacio y el blanco colapsado. */
  readonly text: string;
  /** Las filas del resumen como en M9: del entero de «Nivel» a la siguiente, sin el pie. */
  readonly rows: readonly string[];
};

/** D-R7-6: los márgenes de la página y el ancho de «Nivel», la primera columna. */
const PAGE_MARGIN = 36;
const LEVEL_WIDTH = 0.08;

/** En puntos: dos fragmentos del mismo renglón o de la misma columna. */
const TOLERANCE = 1;

/** El entero de «Nivel», solo o junto con lo que pdfjs pegó del mismo renglón. */
const ROW_START = /^\d+(\s|$)/;

const HEADER_START = "Nivel";

/** Un fragmento con su lugar: `x` a la izquierda y `y` en la línea de base, desde abajo. */
type Fragment = {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
};

/**
 * Los fragmentos de cada fila, de la fila de encabezados para abajo y sin el
 * pie, que va dentro del margen inferior. Una fila empieza en un fragmento
 * que empieza con un entero dentro de la columna «Nivel».
 */
function rowFragmentsOf(fragments: readonly Fragment[], pageWidth: number): Fragment[][] {
  const header = fragments.find(({ text }) => text.startsWith(HEADER_START));
  if (header === undefined) {
    return [];
  }
  const levelRight = PAGE_MARGIN + LEVEL_WIDTH * (pageWidth - 2 * PAGE_MARGIN);
  const body = fragments.filter(({ y }) => y < header.y - TOLERANCE && y > PAGE_MARGIN);
  const starts = body
    .filter(({ text, x }) => ROW_START.test(text) && x < levelRight)
    .map(({ y }) => y)
    .sort((left, right) => right - left);
  const rows = starts.map((): Fragment[] => []);
  for (const fragment of body) {
    // La fila es la última que empieza en el renglón del fragmento o más arriba.
    const index = starts.findLastIndex((y) => y >= fragment.y - TOLERANCE);
    rows[index]?.push(fragment);
  }
  return rows;
}

/**
 * Por columna y renglón: los renglones de una celda, pegados; las celdas,
 * con un espacio. Un fragmento sigue la celda del anterior si empieza dentro
 * de él, como el segundo renglón de un rótulo partido.
 */
function rowTextOf(fragments: readonly Fragment[]): string {
  const ordered = [...fragments].sort((left, right) =>
    Math.abs(left.x - right.x) > TOLERANCE ? left.x - right.x : right.y - left.y,
  );
  let text = "";
  let previous: Fragment | null = null;
  for (const fragment of ordered) {
    const sameCell =
      previous !== null && fragment.x <= previous.x + previous.width - TOLERANCE;
    text += previous === null || sameCell ? fragment.text : ` ${fragment.text}`;
    previous = fragment;
  }
  return text;
}

/**
 * D-R7-10: el texto de cada página de un PDF, con `pdfjs-dist` 6.4.299
 * (`legacy`, sin worker, `disableFontFace: true`; esta versión ya no tiene
 * `isEvalSupported` ni evalúa código). En cada fila, los fragmentos por
 * columna y renglón, los renglones de una celda pegados y las celdas
 * separadas por un espacio.
 */
export async function pdfPageTexts(bytes: Uint8Array): Promise<readonly PdfPageText[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Una copia: pdfjs puede quedarse con el buffer que recibe.
  const loading = getDocument({ data: new Uint8Array(bytes), disableFontFace: true });
  try {
    const pdf = await loading.promise;
    const pages: PdfPageText[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      const fragments = items.flatMap((item): Fragment[] =>
        "str" in item && item.str.trim() !== ""
          ? [
              {
                text: item.str,
                x: Number(item.transform[4]),
                y: Number(item.transform[5]),
                width: item.width,
              },
            ]
          : [],
      );
      const pageWidth = page.getViewport({ scale: 1 }).width;
      pages.push({
        text: fragments
          .map(({ text }) => text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
        rows: rowFragmentsOf(fragments, pageWidth).map(rowTextOf),
      });
    }
    return pages;
  } finally {
    await loading.destroy();
  }
}

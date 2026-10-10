/**
 * Ayudantes de los tests de componentes que leen el HTML de
 * `renderToStaticMarkup`, sin DOM.
 */

/** Las celdas de cada fila del primer cuerpo de tabla de `markup`, sin etiquetas. */
export function bodyRows(markup: string): string[][] {
  const body = markup.slice(markup.indexOf("<tbody>"), markup.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map(([, cell]) =>
      cell.replace(/<[^>]+>/g, ""),
    ),
  );
}

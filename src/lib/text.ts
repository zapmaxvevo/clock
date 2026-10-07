/**
 * Postgres no guarda el carácter nulo en un `text`: sin este control, el texto
 * que lo trae llega a la base y vuelve como `unexpected`. Es el predicado del
 * `refine` de los esquemas de entrada, que también carga el navegador.
 */
export function noNullCharacter(value: string): boolean {
  return !value.includes("\u0000");
}

/**
 * TT-07: la búsqueda no distingue mayúsculas ni acentos. `NFD` separa cada
 * letra de su marca diacrítica, y la marca se descarta.
 */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

// Sin distinguir mayúsculas, como `lower(name)` en los índices de unicidad.
const byName = new Intl.Collator("es", { sensitivity: "accent" });

/**
 * El orden alfabético de clientes, proyectos, tareas y etiquetas, en el
 * servidor y en el navegador. Desempata por id: el collator iguala nombres que
 * `lower()` distingue («Ａna» en ancho completo y «Ana»), así que dos filas
 * distintas para el índice pueden empatar acá.
 */
export function compareNames(
  left: { readonly id: string; readonly name: string },
  right: { readonly id: string; readonly name: string },
): number {
  const byText = byName.compare(left.name, right.name);
  if (byText !== 0) {
    return byText;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}

/** Una copia de `rows` en el orden de `compareNames`. */
export function sortedByName<Row extends { readonly id: string; readonly name: string }>(
  rows: readonly Row[],
): Row[] {
  return [...rows].sort(compareNames);
}

/**
 * Lo que muestra el avatar sin foto (PF-44): la primera letra de cada una de
 * las dos primeras palabras del nombre, o la del correo si el nombre está vacío.
 */
export function initialsOf(name: string, email: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const source = words.length > 0 ? words.slice(0, 2) : [email.trim()];
  return source
    .map((word) => Array.from(word).at(0) ?? "")
    .join("")
    .toUpperCase();
}

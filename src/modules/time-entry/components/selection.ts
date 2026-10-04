/**
 * TT-62: la selección de entradas de la lista, como funciones puras. Es una
 * lista de ids en el orden en que se eligieron; la pantalla la guarda y estas
 * funciones la transforman.
 */
export type Selection = readonly string[];

export function toggleEntry(selection: Selection, id: string): Selection {
  return selection.includes(id)
    ? selection.filter((selected) => selected !== id)
    : [...selection, id];
}

/** Con todas las del día, las suelta; si no, suma las que faltan. */
export function toggleDay(selection: Selection, dayIds: readonly string[]): Selection {
  if (dayCheckState(selection, dayIds) === "all") {
    return withoutIds(selection, dayIds);
  }
  return [...selection, ...dayIds.filter((id) => !selection.includes(id))];
}

/** La casilla de un día: marcada con todas sus filas, mixta con algunas. */
export function dayCheckState(
  selection: Selection,
  dayIds: readonly string[],
): "none" | "some" | "all" {
  const chosen = dayIds.filter((id) => selection.includes(id)).length;
  if (chosen === 0) {
    return "none";
  }
  return chosen === dayIds.length ? "all" : "some";
}

/**
 * Una entrada que la lista deja de dibujar sale de la selección y no vuelve.
 * Devuelve la misma referencia si no quitó nada, así quien la guarda sabe si
 * tiene algo que guardar.
 */
export function keepVisible(
  selection: Selection,
  visibleIds: ReadonlySet<string>,
): Selection {
  const kept = selection.filter((id) => visibleIds.has(id));
  return kept.length === selection.length ? selection : kept;
}

export function withoutIds(selection: Selection, ids: readonly string[]): Selection {
  return selection.filter((id) => !ids.includes(id));
}

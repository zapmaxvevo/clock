/** Los ids de un conjunto de etiquetas, sin repetir y sin distinguir mayúsculas. */
function tagIdSet(ids: readonly string[]): ReadonlySet<string> {
  return new Set(ids.map((id) => id.toLowerCase()));
}

/**
 * Los dos conjuntos tienen las mismas etiquetas, sin importar orden ni
 * mayúsculas: la base iguala los ids. Lo usan el servidor y el navegador, que
 * tienen que coincidir en qué pedido no cambia nada.
 */
export function sameTagIds(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = tagIdSet(left);
  const rightSet = tagIdSet(right);
  return leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id));
}

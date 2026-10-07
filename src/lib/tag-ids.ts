/**
 * Los ids en minúsculas y sin repetir: la base los iguala, y repetir uno no
 * cambia lo pedido. Lo usan los esquemas de entrada, `sameTagIds` y
 * `assertTaggable`.
 */
export function normalizedIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))];
}

/**
 * Los dos conjuntos tienen las mismas etiquetas, sin importar orden ni
 * mayúsculas. Lo usan el servidor y el navegador, que tienen que coincidir en
 * qué pedido no cambia nada.
 */
export function sameTagIds(left: readonly string[], right: readonly string[]): boolean {
  const leftIds = normalizedIds(left);
  const rightIds = new Set(normalizedIds(right));
  return leftIds.length === rightIds.size && leftIds.every((id) => rightIds.has(id));
}

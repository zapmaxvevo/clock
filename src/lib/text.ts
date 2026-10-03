/**
 * Postgres no guarda el carácter nulo en un `text`: sin este control, el texto
 * que lo trae llega a la base y vuelve como `unexpected`. Es el predicado del
 * `refine` de los esquemas de entrada, que también carga el navegador.
 */
export function noNullCharacter(value: string): boolean {
  return !value.includes("\u0000");
}

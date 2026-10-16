/**
 * Utilidades de correo que comparten el ingreso, el módulo `workspace`, la
 * pantalla y el script de la variable (ADR 0024). Son puras.
 */

/** Recortado y en minúsculas: la forma con que se guarda y se compara (EQ-105). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** El dominio, sin la arroba; cadena vacía si no hay arroba. */
export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

/** La lista de la variable de entorno, separada por comas; la usa `env.ts` y el script de la variable. */
export function parseEmailList(value: string): string[] {
  return value
    .split(",")
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
}

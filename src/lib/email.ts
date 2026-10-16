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

/**
 * Si el correo es de uno de los dominios de la empresa: el corte entre la vía
 * del dominio y la externa (ADR 0024, decisión 3). Sin distinguir mayúsculas
 * ni blancos, ni en el correo ni en los dominios.
 */
export function isCompanyEmail(email: string, domains: readonly string[]): boolean {
  const domain = domainOf(normalizeEmail(email));
  return domains.some((candidate) => normalizeEmail(candidate) === domain);
}

/** La lista de la variable de entorno, separada por comas; la usa `env.ts` y el script de la variable. */
export function parseEmailList(value: string): string[] {
  return value
    .split(",")
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
}

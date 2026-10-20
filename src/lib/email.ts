/**
 * Utilidades de correo que comparten el ingreso, el módulo `workspace` y la
 * pantalla (ADR 0024). Son puras.
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

/**
 * Una lista de dominios separada por comas, recortados y en minúsculas; la usa
 * `env.ts` para `GOOGLE_WORKSPACE_DOMAINS`.
 */
export function parseDomainList(value: string): string[] {
  return value
    .split(",")
    .map(normalizeEmail)
    .filter((domain) => domain.length > 0);
}

/** D-E2b-9: el dominio de un correo liberado. `.invalid` no se resuelve (RFC 2606). */
export const RELEASED_EMAIL_DOMAIN = "liberado.invalid";

/** D-E2b-9: el correo que reemplaza al de `userId` al liberarlo: `<userId>@liberado.invalid`. */
export function releasedEmailOf(userId: string): string {
  return `${userId}@${RELEASED_EMAIL_DOMAIN}`;
}

/** D-E2b-9: si el correo es uno liberado, sin distinguir mayúsculas ni blancos. */
export function isReleasedEmail(email: string): boolean {
  return domainOf(normalizeEmail(email)) === RELEASED_EMAIL_DOMAIN;
}

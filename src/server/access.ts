/**
 * Regla de acceso al workspace. Es una función pura: la usan el login y los
 * tests, y no toca base de datos ni entorno.
 */

export type GoogleProfile = {
  readonly email?: string | null;
  readonly email_verified?: boolean | null;
  readonly hd?: string | null;
};

export type AccessPolicy = {
  /** Dominios de Google Workspace habilitados. */
  readonly domains: readonly string[];
  /** Emails externos al dominio con invitación vigente. */
  readonly invitedEmails: readonly string[];
};

export type AccessDenialReason =
  "sin_email" | "email_no_verificado" | "dominio_no_habilitado";

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AccessDenialReason };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

/**
 * Decide sobre el perfil de Google.
 *
 * La vía de dominio exige las dos cosas: que el email pertenezca a un dominio
 * habilitado y que el claim `hd` lo confirme. Exigir `hd` es el punto: una
 * cuenta de Google de consumo con un email del dominio —las «no gestionadas»,
 * creadas antes de que el dominio pasara a Workspace— no lo trae, y sin esa
 * comprobación entraría como si fuera del equipo. Quien no es del Workspace
 * entra solo por la lista de invitados.
 */
export function decideGoogleAccess(
  profile: GoogleProfile,
  policy: AccessPolicy,
): AccessDecision {
  const email =
    profile.email === null || profile.email === undefined ? "" : normalize(profile.email);
  if (email.length === 0) {
    return { allowed: false, reason: "sin_email" };
  }
  if (profile.email_verified !== true) {
    return { allowed: false, reason: "email_no_verificado" };
  }

  const domains = policy.domains.map(normalize);
  const hostedDomain =
    profile.hd === null || profile.hd === undefined ? "" : normalize(profile.hd);
  const belongsToDomain =
    domains.includes(domainOf(email)) && domains.includes(hostedDomain);

  if (belongsToDomain) {
    return { allowed: true };
  }
  if (policy.invitedEmails.map(normalize).includes(email)) {
    return { allowed: true };
  }
  return { allowed: false, reason: "dominio_no_habilitado" };
}

/**
 * Comprueba un email ya conocido contra la política. Se usa en cada inicio de
 * sesión, para que quitar a alguien de la lista le cierre el acceso.
 */
export function isAllowedEmail(email: string, policy: AccessPolicy): boolean {
  const normalized = normalize(email);
  return (
    policy.domains.map(normalize).includes(domainOf(normalized)) ||
    policy.invitedEmails.map(normalize).includes(normalized)
  );
}

export const accessDenialMessage: Record<AccessDenialReason, string> = {
  sin_email: "La cuenta de Google no expone un email.",
  email_no_verificado: "El email de la cuenta de Google no está verificado.",
  dominio_no_habilitado:
    "La cuenta no pertenece al dominio de la empresa ni tiene una invitación vigente.",
};

/** D-E1a-14: lo que ve `/login` con un código que no es un motivo propio. */
const UNKNOWN_LOGIN_ERROR = "No se pudo iniciar sesión. Volvé a intentar.";

function isAccessDenialReason(code: string): code is AccessDenialReason {
  return Object.hasOwn(accessDenialMessage, code);
}

/**
 * D-E1a-14: el texto de `/login` para el parámetro `error`. `null` sin
 * parámetro; el de `accessDenialMessage` para un motivo conocido; un texto
 * genérico para cualquier otro. Nunca devuelve el parámetro.
 */
export function loginErrorMessage(code: string | undefined): string | null {
  if (code === undefined) {
    return null;
  }
  return isAccessDenialReason(code) ? accessDenialMessage[code] : UNKNOWN_LOGIN_ERROR;
}

/**
 * Regla de acceso al workspace. Es una función pura: la usan el login y los
 * tests, y no toca base de datos ni entorno. Los hechos de la base y de la
 * variable los arma `src/server/entry.ts`.
 */

import { isCompanyEmail, normalizeEmail } from "@/lib/email";

export type GoogleProfile = {
  readonly email?: string | null;
  readonly email_verified?: boolean | null;
  readonly hd?: string | null;
};

export type AccessPolicy = {
  /** Dominios de Google Workspace habilitados. */
  readonly domains: readonly string[];
};

export type AccessDenialReason =
  "sin_email" | "email_no_verificado" | "dominio_no_habilitado";

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AccessDenialReason };

const denied = { allowed: false, reason: "dominio_no_habilitado" } as const;

/** La vía externa: un correo fuera de los dominios, invitado (ADR 0024, decisión 3). */
function isExternalInvited(email: string, domains: readonly string[], invited: boolean) {
  return invited && !isCompanyEmail(email, domains);
}

/**
 * Decide sobre el perfil de Google. `invited`: el correo tiene una invitación
 * `pending` o `accepted` en la base o, hasta E1b, está en la variable. Vale solo
 * para un correo fuera de los dominios (ADR 0024, decisión 3).
 *
 * La vía de dominio exige las dos cosas: que el email pertenezca a un dominio
 * habilitado y que el claim `hd` lo confirme. Exigir `hd` es el punto: una
 * cuenta de Google de consumo con un email del dominio —las «no gestionadas»,
 * creadas antes de que el dominio pasara a Workspace— no lo trae, y sin esa
 * comprobación entraría como si fuera del equipo. Por eso tampoco entra por la
 * vía externa, aunque tenga invitación.
 */
export function decideGoogleAccess(
  profile: GoogleProfile,
  policy: AccessPolicy,
  invited: boolean,
): AccessDecision {
  const email =
    profile.email === null || profile.email === undefined
      ? ""
      : normalizeEmail(profile.email);
  if (email.length === 0) {
    return { allowed: false, reason: "sin_email" };
  }
  if (profile.email_verified !== true) {
    return { allowed: false, reason: "email_no_verificado" };
  }

  const domains = policy.domains.map(normalizeEmail);
  const hostedDomain =
    profile.hd === null || profile.hd === undefined ? "" : normalizeEmail(profile.hd);
  const belongsToDomain =
    isCompanyEmail(email, policy.domains) && domains.includes(hostedDomain);

  if (belongsToDomain || isExternalInvited(email, policy.domains, invited)) {
    return { allowed: true };
  }
  return denied;
}

/**
 * El correo guardado, en cada inicio de sesión: por el sufijo, o externo e
 * invitado. Revocar la invitación de quien todavía no entró le cierra el acceso
 * entre las dos comprobaciones.
 */
export function decideStoredEmail(
  email: string,
  policy: AccessPolicy,
  invited: boolean,
): AccessDecision {
  if (
    isCompanyEmail(email, policy.domains) ||
    isExternalInvited(email, policy.domains, invited)
  ) {
    return { allowed: true };
  }
  return denied;
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

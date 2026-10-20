/**
 * Regla de acceso al workspace. Es una función pura: la usan el login y los
 * tests, y no toca base de datos ni entorno. La política y los hechos de la
 * base los arma `src/server/entry.ts`.
 */

import { isCompanyEmail, normalizeEmail } from "@/lib/email";
import type { InvitationStatus } from "@/server/db/schema";
import type { MembershipStatus } from "@/server/permissions";

export type GoogleProfile = {
  readonly email?: string | null;
  readonly email_verified?: boolean | null;
  readonly hd?: string | null;
};

export type AccessPolicy = {
  /** Dominios de Google Workspace habilitados. */
  readonly domains: readonly string[];
  /** `WORKSPACE_OWNER_EMAIL`: entra sin invitación solo si no hay workspace (EQ-30). */
  readonly bootstrapOwnerEmail: string;
};

/** D-E2b-11: los días que vale una vinculación desde que se pide. */
export const ACCOUNT_LINK_TTL_DAYS = 7;

/** Lo que la base sabe de un correo, en el workspace más viejo (ADR 0024, decisión 3). */
export type EntryFacts = {
  /** Todavía no hay workspace: el arranque (D-E1b-3). */
  readonly bootstrap: boolean;
  /** El estado de la invitación del correo, o `null` si no tiene fila. */
  readonly invitation: InvitationStatus | null;
  /**
   * El estado de la membresía del `user` con ese correo, o `null`, también si
   * más de una fila `user` tiene ese correo (§4.2). Solo `active` da acceso;
   * cualquier otro estado responde `membresia_inactiva` (D-E2-1, P-05).
   */
  readonly membership: MembershipStatus | null;
  /**
   * D-E2b-3: si la membresía de `membership` tiene una marca vigente
   * (D-E2b-11). `false` sin membresía o con más de una fila `user` con ese correo.
   */
  readonly accountLink: boolean;
};

/** Sin nada en la base. `entry.ts` lo pasa cuando el perfil no trae correo verificado y no consulta. */
export const NO_ENTRY_FACTS: EntryFacts = {
  bootstrap: false,
  invitation: null,
  membership: null,
  accountLink: false,
};

export type AccessDenialReason =
  | "sin_email"
  | "email_no_verificado"
  | "dominio_no_habilitado"
  | "sin_invitacion"
  | "membresia_inactiva";

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AccessDenialReason };

const allowed = { allowed: true } as const;

function deny(reason: AccessDenialReason): AccessDecision {
  return { allowed: false, reason };
}

/** El correo del perfil, normalizado, o el motivo por el que no sirve. */
export type VerifiedEmail =
  | { readonly verified: true; readonly email: string }
  | { readonly verified: false; readonly reason: "sin_email" | "email_no_verificado" };

/**
 * El paso de perfil de D-E1b-1: el correo, si viene y Google lo verificó. Es
 * lo único que se decide sin los hechos de la base: `entry.ts` no consulta
 * cuando no hay correo verificado.
 */
export function verifiedEmailOf(profile: GoogleProfile): VerifiedEmail {
  const email =
    profile.email === null || profile.email === undefined
      ? ""
      : normalizeEmail(profile.email);
  if (email.length === 0) {
    return { verified: false, reason: "sin_email" };
  }
  if (profile.email_verified !== true) {
    return { verified: false, reason: "email_no_verificado" };
  }
  return { verified: true, email };
}

/**
 * Si el correo es el de `WORKSPACE_OWNER_EMAIL`, sin distinguir mayúsculas ni
 * blancos. Solo vale para arrancar un workspace que no existe (D-E1b-3).
 */
export function isBootstrapOwner(email: string, bootstrapOwnerEmail: string): boolean {
  return normalizeEmail(email) === normalizeEmail(bootstrapOwnerEmail);
}

/** La vía externa: una invitación `pending` o `accepted` (ADR 0024, decisión 3). */
function hasOpenInvitation(facts: EntryFacts): boolean {
  return facts.invitation === "pending" || facts.invitation === "accepted";
}

/**
 * D-E2-1, el paso de acceso: una membresía activa, una invitación pendiente
 * sin membresía, o el arranque con el correo configurado (D-E1b-3). La
 * membresía gana sobre la invitación: una en cualquier otro estado, también
 * `invited`, no entra aunque haya una pendiente (EQ-92). Una aceptada sola no
 * alcanza: es la de alguien a quien se quitó (EQ-51).
 */
function decideAccess(
  email: string,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision {
  if (facts.membership !== null) {
    return facts.membership === "active" ? allowed : deny("membresia_inactiva");
  }
  if (facts.invitation === "pending") {
    return allowed;
  }
  if (facts.bootstrap && isBootstrapOwner(email, policy.bootstrapOwnerEmail)) {
    return allowed;
  }
  return deny("sin_invitacion");
}

/**
 * D-E1b-1: perfil, identidad por vía y acceso, en ese orden. Sin correo o sin
 * verificar responde sin leer `facts`: `entry.ts` no consulta en esos casos.
 *
 * La vía de dominio exige las dos cosas: que el email pertenezca a un dominio
 * habilitado y que el claim `hd` lo confirme. Exigir `hd` es el punto: una
 * cuenta de Google de consumo con un email del dominio —las «no gestionadas»,
 * creadas antes de que el dominio pasara a Workspace— no lo trae, y sin esa
 * comprobación entraría como si fuera del equipo. Por eso tampoco entra por la
 * vía externa, ni por una invitación o una membresía: ninguna lo arregla.
 */
export function decideGoogleAccess(
  profile: GoogleProfile,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision {
  const verified = verifiedEmailOf(profile);
  if (!verified.verified) {
    return deny(verified.reason);
  }
  const { email } = verified;

  if (isCompanyEmail(email, policy.domains)) {
    const domains = policy.domains.map(normalizeEmail);
    const hostedDomain =
      profile.hd === null || profile.hd === undefined ? "" : normalizeEmail(profile.hd);
    if (!domains.includes(hostedDomain)) {
      return deny("dominio_no_habilitado");
    }
  } else if (!hasOpenInvitation(facts)) {
    return deny("sin_invitacion");
  }
  return decideAccess(email, policy, facts);
}

/**
 * D-E2-2: solo la identidad del correo guardado: el sufijo de un dominio, o
 * una invitación `pending` o `accepted`. La usa `entry.ts` en cada pedido de
 * una sesión abierta; el acceso lo decide `ensureWorkspaceContext`.
 */
export function decideStoredIdentity(
  email: string,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision {
  if (!isCompanyEmail(email, policy.domains) && !hasOpenInvitation(facts)) {
    return deny("sin_invitacion");
  }
  return allowed;
}

/**
 * Identidad (`decideStoredIdentity`) y acceso, en cada inicio de sesión.
 * Revocar la invitación de quien todavía no entró le cierra la entrada entre
 * las dos comprobaciones.
 */
export function decideStoredEmail(
  email: string,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision {
  const identity = decideStoredIdentity(email, policy, facts);
  return identity.allowed ? decideAccess(email, policy, facts) : identity;
}

/**
 * D-E2b-3: si el ingreso intenta usar la vinculación: la regla deja entrar por
 * una membresía activa con una marca vigente.
 */
export function usesAccountLink(decision: AccessDecision, facts: EntryFacts): boolean {
  return decision.allowed && facts.membership === "active" && facts.accountLink;
}

export const accessDenialMessage: Record<AccessDenialReason, string> = {
  sin_email: "La cuenta de Google no expone un email.",
  email_no_verificado: "El email de la cuenta de Google no está verificado.",
  dominio_no_habilitado: "La cuenta no es la de Google Workspace de la empresa.",
  sin_invitacion:
    "Tu cuenta no tiene una invitación a Clock. Pedísela a quien administra el equipo.",
  membresia_inactiva:
    "Tu acceso al workspace está desactivado. Pedile a quien administra el equipo que te vuelva a activar.",
};

/**
 * D-E2b-10: los códigos del callback de Better Auth que `/login` explica. No son
 * motivos de la regla de ingreso.
 */
export const callbackErrorMessage: Readonly<Record<"account_not_linked", string>> = {
  account_not_linked:
    "Ya hay una persona en Clock con ese correo. Pedile a quien administra el equipo que revise tu acceso.",
};

/** D-E1a-14: lo que ve `/login` con un código que no es un motivo propio. */
const UNKNOWN_LOGIN_ERROR = "No se pudo iniciar sesión. Volvé a intentar.";

function isAccessDenialReason(code: string): code is AccessDenialReason {
  return Object.hasOwn(accessDenialMessage, code);
}

function isCallbackErrorCode(code: string): code is keyof typeof callbackErrorMessage {
  return Object.hasOwn(callbackErrorMessage, code);
}

/**
 * D-E1a-14, D-E2b-10: el texto de `/login` para el parámetro `error`. `null` sin
 * parámetro; el de `accessDenialMessage` para un motivo conocido; el de
 * `callbackErrorMessage` para un código del callback que se explica; un texto
 * genérico para cualquier otro, también `vinculacion_fallida`. Nunca devuelve el
 * parámetro.
 */
export function loginErrorMessage(code: string | undefined): string | null {
  if (code === undefined) {
    return null;
  }
  if (isAccessDenialReason(code)) {
    return accessDenialMessage[code];
  }
  return isCallbackErrorCode(code) ? callbackErrorMessage[code] : UNKNOWN_LOGIN_ERROR;
}

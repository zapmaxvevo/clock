import { APIError } from "better-auth/api";

import { isCompanyEmail, normalizeEmail } from "@/lib/email";
import { entryFactsOf } from "@/modules/workspace/service";
import {
  accessDenialMessage,
  decideGoogleAccess,
  decideStoredEmail,
  NO_ENTRY_FACTS,
  type AccessDecision,
  type AccessDenialReason,
  type AccessPolicy,
  type GoogleProfile,
  verifiedEmailOf,
} from "@/server/access";
import { env } from "@/server/env";

/**
 * El ingreso (ADR 0024, decisión 4): arma la decisión pura de `access.ts` con
 * la política del entorno y los hechos de la base que lee el service de
 * `workspace`. `auth.ts` solo traduce lo que devuelve.
 */

function policy(): AccessPolicy {
  const config = env();
  return {
    domains: config.GOOGLE_WORKSPACE_DOMAINS,
    bootstrapOwnerEmail: config.WORKSPACE_OWNER_EMAIL,
  };
}

/**
 * D-E1b-1: el ingreso desde el perfil de Google. Sin correo o sin verificar,
 * la decisión no lee los hechos y no se consulta la base.
 */
export async function decideProfileEntry(
  profile: GoogleProfile,
): Promise<AccessDecision> {
  const verified = verifiedEmailOf(profile);
  const facts = verified.verified ? await entryFactsOf(verified.email) : NO_ENTRY_FACTS;
  return decideGoogleAccess(profile, policy(), facts);
}

/** En cada inicio de sesión, con el correo guardado. */
export async function decideStoredEmailEntry(email: string): Promise<AccessDecision> {
  const facts = await entryFactsOf(normalizeEmail(email));
  return decideStoredEmail(email, policy(), facts);
}

/**
 * En cada pedido de una sesión abierta, la identidad de un correo fuera de los
 * dominios vuelve a decidirse con el correo guardado: si su dominio sale de la
 * política, quien entró sin invitación queda afuera aunque tenga membresía, y
 * quien tiene una `accepted` sigue como externa (D-E1b-13). Un correo de los
 * dominios no suma una consulta: su acceso lo decide `ensureWorkspaceContext`.
 */
export async function decideSessionIdentity(email: string): Promise<AccessDecision> {
  if (isCompanyEmail(email, policy().domains)) {
    return { allowed: true };
  }
  return decideStoredEmailEntry(email);
}

/** D-E1a-14: `<BETTER_AUTH_URL>/login?error=<motivo>`, absoluta. */
export function loginErrorUrl(reason: AccessDenialReason): string {
  const url = new URL("/login", env().BETTER_AUTH_URL);
  url.searchParams.set("error", reason);
  return url.toString();
}

/**
 * D-E1a-14: el error que lanza el gancho de sesión. El callback de Better Auth
 * redirige a `onAPIError.errorURL` solo si el error trae `body.code`.
 */
export function sessionEntryError(reason: AccessDenialReason): APIError {
  return new APIError("FORBIDDEN", {
    message: accessDenialMessage[reason],
    code: reason,
  });
}

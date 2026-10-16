import { APIError } from "better-auth/api";

import { normalizeEmail } from "@/lib/email";
import { hasOpenInvitation } from "@/modules/workspace/service";
import {
  accessDenialMessage,
  decideGoogleAccess,
  decideStoredEmail,
  type AccessDecision,
  type AccessDenialReason,
  type AccessPolicy,
  type GoogleProfile,
} from "@/server/access";
import { env } from "@/server/env";

/**
 * El ingreso (ADR 0024, decisión 4): arma la decisión pura de `access.ts` con
 * la variable y los hechos de la base que lee el service de `workspace`.
 * `auth.ts` solo traduce lo que devuelve.
 */

function policy(): AccessPolicy {
  return { domains: env().GOOGLE_WORKSPACE_DOMAINS };
}

/**
 * D-E1a-4: invitado por la variable, que se lee hasta E1b, o por una invitación
 * `pending` o `accepted` de la base. Normaliza una vez, para las dos.
 */
async function isInvited(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  return (
    env().EXTERNAL_INVITE_EMAILS.includes(normalized) ||
    (await hasOpenInvitation(normalized))
  );
}

/**
 * Decide primero sin la invitación: solo un correo que no entra por su dominio
 * la necesita, así que un correo del dominio con `hd` no consulta la base.
 */
async function decideWithInvitation(
  email: string,
  decide: (invited: boolean) => AccessDecision,
): Promise<AccessDecision> {
  const withoutInvitation = decide(false);
  if (withoutInvitation.allowed || withoutInvitation.reason !== "dominio_no_habilitado") {
    return withoutInvitation;
  }
  return decide(await isInvited(email));
}

/** D-E1a-4: el ingreso desde el perfil de Google. Lee la variable y la invitación. */
export async function decideProfileEntry(
  profile: GoogleProfile,
): Promise<AccessDecision> {
  return decideWithInvitation(profile.email ?? "", (invited) =>
    decideGoogleAccess(profile, policy(), invited),
  );
}

/** En cada inicio de sesión, con el correo guardado. */
export async function decideStoredEmailEntry(email: string): Promise<AccessDecision> {
  return decideWithInvitation(email, (invited) =>
    decideStoredEmail(email, policy(), invited),
  );
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

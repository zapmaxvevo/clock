import { APIError } from "better-auth/api";

import { isCompanyEmail, normalizeEmail } from "@/lib/email";
import { entryFactsOf, entryMembershipStatusLocked } from "@/modules/workspace/service";
import {
  accessDenialMessage,
  decideGoogleAccess,
  decideStoredEmail,
  decideStoredIdentity,
  NO_ENTRY_FACTS,
  type AccessDecision,
  type AccessDenialReason,
  type AccessPolicy,
  type GoogleProfile,
  verifiedEmailOf,
} from "@/server/access";
import { deleteSession } from "@/server/auth-records";
import { db } from "@/server/db";
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
 * En cada pedido de una sesión abierta se decide solo la identidad (D-E2-2): la
 * de un correo fuera de los dominios vuelve a decidirse con el correo guardado.
 * Si su dominio sale de la política, quien entró sin invitación queda afuera
 * aunque tenga membresía, y quien tiene una `accepted` sigue como externa
 * (D-E1b-13). Un correo de los dominios no suma una consulta. El acceso lo
 * decide `ensureWorkspaceContext`: una membresía inactiva recibe su contexto y
 * la pantalla queda en solo lectura (TT-92).
 */
export async function decideSessionIdentity(email: string): Promise<AccessDecision> {
  if (isCompanyEmail(email, policy().domains)) {
    return { allowed: true };
  }
  const facts = await entryFactsOf(normalizeEmail(email));
  return decideStoredIdentity(email, policy(), facts);
}

/**
 * D-E2-2: cierra la carrera de un ingreso con una desactivación. La llama el gancho
 * `session.create.after`, con la fila de `session` ya confirmada: en una transacción,
 * lee `for share` la membresía de `session.userId` —espera a una desactivación en
 * curso— y, si existe y no está activa, borra la sesión. No lanza por eso. Devuelve
 * si la borró.
 */
export async function dropSessionOfInactive(session: {
  readonly id: string;
  readonly userId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const status = await entryMembershipStatusLocked(tx, session.userId);
    if (status === null || status === "active") {
      return false;
    }
    await deleteSession(tx, session.id);
    return true;
  });
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

/**
 * Lo que la aplicación lee y escribe de las tablas de Better Auth fuera del
 * login (ADR 0025): `user`, `account`, `session` y `verification` son del
 * código de `src/server/` que configura el ingreso. Cada función recibe la
 * transacción de quien llama y no abre otra.
 */

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { releasedEmailOf } from "@/lib/email";
import { auditActorOf, recordAudit } from "@/server/audit";
import { db, type Transaction } from "@/server/db";
import { account, session, user } from "@/server/db/schema";
import { deleteGrantsOf } from "@/server/oauth-records";
import type { Actor } from "@/server/permissions";

/** El `providerId` de Better Auth para Google. */
const GOOGLE_PROVIDER_ID = "google";

/**
 * EQ-41, D-E2-5: borra todas las sesiones de `userId` y, si borró alguna, deja
 * `session.revokeAll` con `actor` como autor (`entity: "user"`, `entityId:
 * userId`, `previousValue: { sessions: n }`). No toca `account`. No consulta
 * permisos: la usa `changeStatus` de `team`, que ya los decidió. Devuelve
 * cuántas borró.
 */
export async function deleteSessionsOf(
  tx: Transaction,
  actor: Actor,
  userId: string,
): Promise<number> {
  const deleted = await tx
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  if (deleted.length === 0) {
    return 0;
  }
  // Solo la cantidad: la constancia nunca guarda tokens ni ids de sesión.
  await recordAudit(tx, {
    ...auditActorOf(actor),
    action: "session.revokeAll",
    entity: "user",
    entityId: userId,
    previousValue: { sessions: deleted.length },
  });
  return deleted.length;
}

/**
 * D-E2-2: borra la sesión `sessionId`, sin constancia: ningún pedido la usó, porque
 * la cookie sale con la respuesta del callback, después del gancho que la borra.
 */
export async function deleteSession(tx: Transaction, sessionId: string): Promise<void> {
  await tx.delete(session).where(eq(session.id, sessionId));
}

/** D-E2-7: si `userId` tiene alguna fila de `account`. Solo lee (ADR 0010). */
export async function hasAccount(tx: Transaction, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: account.id })
    .from(account)
    .where(eq(account.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/** D-E2b-3: el `user_id` dueño de la cuenta de Google `sub`, o `null`. Solo lee. */
export async function googleAccountOwnerOf(
  tx: Transaction,
  sub: string,
): Promise<string | null> {
  const rows = await tx
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, GOOGLE_PROVIDER_ID), eq(account.accountId, sub)))
    .limit(1);
  return rows.at(0)?.userId ?? null;
}

/** Borra las filas de `account` de `userId` y devuelve cuántas borró. */
async function deleteAccountsOf(tx: Transaction, userId: string): Promise<number> {
  const deleted = await tx
    .delete(account)
    .where(eq(account.userId, userId))
    .returning({ id: account.id });
  return deleted.length;
}

/**
 * D-E2b-3, ADR 0025: deja la cuenta de Google `sub` como la única de
 * `person.userId`. Borra sus otras filas de `account`, sus sesiones
 * (`deleteSessionsOf`) y después sus autorizaciones (`deleteGrantsOf`, D-MCP-5:
 * un asistente que conectó la cuenta vieja no sigue con la nueva), las dos con
 * `person` como autor; inserta la de `sub` sin tokens —los escribe Better Auth
 * en el mismo ingreso— y deja `account.link` (`entity: "user"`, `entityId:
 * userId`, `previousValue: { accounts: n }`) con `person` como autor. No
 * consulta permisos: la usa `bindRequestedAccount`, con la membresía ya
 * bloqueada.
 */
export async function bindGoogleAccount(
  tx: Transaction,
  person: Actor,
  sub: string,
): Promise<void> {
  const previous = await deleteAccountsOf(tx, person.userId);
  await deleteSessionsOf(tx, person, person.userId);
  await deleteGrantsOf(tx, person, person.userId);
  // `updated_at` no tiene valor por omisión en la tabla de Better Auth.
  const now = new Date();
  await tx.insert(account).values({
    id: randomUUID(),
    providerId: GOOGLE_PROVIDER_ID,
    accountId: sub,
    userId: person.userId,
    createdAt: now,
    updatedAt: now,
  });
  // Solo la cantidad: la constancia nunca guarda tokens ni ids de cuenta.
  await recordAudit(tx, {
    ...auditActorOf(person),
    action: "account.link",
    entity: "user",
    entityId: person.userId,
    previousValue: { accounts: previous },
  });
}

/** D-E2b-6, D-E2b-9: el correo guardado de `userId`, tal como está. Solo lee. */
export async function userEmailOf(tx: Transaction, userId: string): Promise<string> {
  const rows = await tx
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const row = rows.at(0);
  if (row === undefined) {
    // La membresía bloqueada de quien llama la garantiza (`on delete cascade`).
    throw new Error(`No existe la fila user ${userId}.`);
  }
  return row.email;
}

/**
 * D-E2b-9, ADR 0025: cambia el correo de `userId`, `previousEmail` tal como lo
 * leyó quien llama con `userEmailOf`, por `releasedEmailOf(userId)`, borra sus
 * filas de `account`, sus sesiones (`deleteSessionsOf`) y después sus
 * autorizaciones (`deleteGrantsOf`, D-MCP-5), y deja `user.releaseEmail`
 * (`entity: "user"`, `previousValue: { email, accounts: n }`, `nextValue:
 * { email: <liberado> }`) con `actor` como autor. No consulta permisos: la usa
 * `releaseEmail` de `team`, que ya los decidió.
 */
export async function releaseEmailOf(
  tx: Transaction,
  actor: Actor,
  userId: string,
  previousEmail: string,
): Promise<void> {
  const released = releasedEmailOf(userId);
  await tx.update(user).set({ email: released }).where(eq(user.id, userId));
  const accounts = await deleteAccountsOf(tx, userId);
  await deleteSessionsOf(tx, actor, userId);
  await deleteGrantsOf(tx, actor, userId);
  await recordAudit(tx, {
    ...auditActorOf(actor),
    action: "user.releaseEmail",
    entity: "user",
    entityId: userId,
    previousValue: { email: previousEmail, accounts },
    nextValue: { email: released },
  });
}

/**
 * D-MCP-3, paso 5: la persona de un token, como la guarda `user`, o `undefined`
 * si la fila ya no existe. Solo lee, sin transacción.
 */
export async function findSessionUser(userId: string): Promise<
  | {
      readonly id: string;
      readonly email: string;
      readonly name: string;
      readonly image: string | null;
    }
  | undefined
> {
  const rows = await db
    .select({ id: user.id, email: user.email, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows.at(0);
}

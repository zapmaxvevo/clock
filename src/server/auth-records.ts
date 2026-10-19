/**
 * Lo que la aplicación lee y escribe de las tablas de Better Auth fuera del
 * login (ADR 0025): `user`, `account`, `session` y `verification` son del
 * código de `src/server/` que configura el ingreso. Cada función recibe la
 * transacción de quien llama y no abre otra.
 */

import { eq } from "drizzle-orm";

import { recordAudit } from "@/server/audit";
import type { Transaction } from "@/server/db";
import { account, session } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";

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
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
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

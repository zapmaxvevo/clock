/**
 * Lo que la aplicación lee y escribe de las tablas del servidor de autorización
 * fuera de sus endpoints (ADR 0025, ADR 0026): son de Better Auth y de este
 * código. Cada función que escribe recibe la transacción de quien llama.
 */

import { and, eq } from "drizzle-orm";

import { auditActorOf, recordAudit } from "@/server/audit";
import { db, type Transaction } from "@/server/db";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "@/server/db/schema";
import type { Actor } from "@/server/permissions";

/** Una autorización vigente de la persona, por cliente. */
export type GrantRow = {
  readonly clientId: string;
  /** `client_name` del registro: lo declara el cliente, no se confía en él. */
  readonly clientName: string | null;
  readonly redirectUris: readonly string[];
  /** El consentimiento más viejo del cliente. */
  readonly grantedAt: Date;
};

const CLIENT_ENTITY = "oauth_client";
const USER_ENTITY = "user";

function sortedUnion(lists: readonly (readonly string[])[]): string[] {
  return [...new Set(lists.flat())].sort();
}

/**
 * D-MCP-5: las autorizaciones de `userId`, **una por cliente**: `oauthConsent` no
 * tiene índice único por persona y cliente, así que se agrupa. La más nueva
 * primero. Solo lee.
 */
export async function listGrantsOf(
  tx: Transaction,
  userId: string,
): Promise<readonly GrantRow[]> {
  const rows = await tx
    .select({
      clientId: oauthConsent.clientId,
      createdAt: oauthConsent.createdAt,
      clientName: oauthClient.name,
      redirectUris: oauthClient.redirectUris,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId));
  const byClient = new Map<string, GrantRow>();
  for (const row of rows) {
    const current = byClient.get(row.clientId);
    byClient.set(row.clientId, {
      clientId: row.clientId,
      clientName: row.clientName,
      redirectUris: row.redirectUris,
      grantedAt:
        current === undefined || row.createdAt < current.grantedAt
          ? row.createdAt
          : current.grantedAt,
    });
  }
  return [...byClient.values()].sort(
    (left, right) =>
      right.grantedAt.getTime() - left.grantedAt.getTime() ||
      left.clientId.localeCompare(right.clientId),
  );
}

/** D-MCP-3, paso 4: si queda algún consentimiento del par. Sin transacción: una lectura por índice. */
export async function hasGrant(userId: string, clientId: string): Promise<boolean> {
  const rows = await db
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
    .limit(1);
  return rows.length > 0;
}

/** D-MCP-15: el nombre que declaró el cliente, para la pantalla. `undefined` si no existe. */
export async function findClientName(
  clientId: string,
): Promise<{ readonly name: string | null } | undefined> {
  const rows = await db
    .select({ name: oauthClient.name })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return rows.at(0);
}

/**
 * D-MCP-5: borra los consentimientos y los tokens de acceso y de refresh del par
 * y, si borró algo, deja `mcp.revoke` (`entity: "oauth_client"`, `entityId:
 * clientId`, `previousValue: { scopes }`) con `auditActorOf(actor)`. No consulta
 * permisos: la usa `revokeGrant` de `mcp`, que ya los decidió. Filtra por
 * `actor.userId`: nunca borra lo de otra persona. Devuelve si borró.
 */
export async function deleteGrant(
  tx: Transaction,
  actor: Actor,
  clientId: string,
): Promise<boolean> {
  const access = await tx
    .delete(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.userId, actor.userId),
        eq(oauthAccessToken.clientId, clientId),
      ),
    )
    .returning({ id: oauthAccessToken.id });
  const refresh = await tx
    .delete(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.userId, actor.userId),
        eq(oauthRefreshToken.clientId, clientId),
      ),
    )
    .returning({ id: oauthRefreshToken.id });
  const consents = await tx
    .delete(oauthConsent)
    .where(
      and(eq(oauthConsent.userId, actor.userId), eq(oauthConsent.clientId, clientId)),
    )
    .returning({ scopes: oauthConsent.scopes });
  if (access.length + refresh.length + consents.length === 0) {
    return false;
  }
  // Solo el cliente y los alcances: la constancia nunca guarda tokens.
  await recordAudit(tx, {
    ...auditActorOf(actor),
    action: "mcp.revoke",
    entity: CLIENT_ENTITY,
    entityId: clientId,
    previousValue: { scopes: sortedUnion(consents.map((consent) => consent.scopes)) },
  });
  return true;
}

/**
 * D-MCP-6: borra los consentimientos y los tokens de `userId` y, si borró alguno,
 * deja `mcp.revokeAll` (`entity: "user"`, `entityId: userId`, `previousValue:
 * { clients: n }`). La usan `writeStatus` de `team` al desactivar y, con E2b,
 * `bindGoogleAccount` y `releaseEmailOf`. Devuelve cuántos clientes.
 */
export async function deleteGrantsOf(
  tx: Transaction,
  actor: Actor,
  userId: string,
): Promise<number> {
  const access = await tx
    .delete(oauthAccessToken)
    .where(eq(oauthAccessToken.userId, userId))
    .returning({ clientId: oauthAccessToken.clientId });
  const refresh = await tx
    .delete(oauthRefreshToken)
    .where(eq(oauthRefreshToken.userId, userId))
    .returning({ clientId: oauthRefreshToken.clientId });
  const consents = await tx
    .delete(oauthConsent)
    .where(eq(oauthConsent.userId, userId))
    .returning({ clientId: oauthConsent.clientId });
  const clients = new Set([...access, ...refresh, ...consents].map((row) => row.clientId))
    .size;
  if (clients === 0) {
    return 0;
  }
  // Solo la cantidad: la constancia nunca guarda tokens ni clientes.
  await recordAudit(tx, {
    ...auditActorOf(actor),
    action: "mcp.revokeAll",
    entity: USER_ENTITY,
    entityId: userId,
    previousValue: { clients },
  });
  return clients;
}

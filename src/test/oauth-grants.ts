import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "@/server/db/schema";

/**
 * Las filas del servidor de autorización sembradas por SQL, para los tests de
 * las funciones que las leen y las borran. El recorrido con tokens reales es
 * el de `src/test/mcp.ts`.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Un cliente registrado, como lo deja `/oauth2/register`. Devuelve su `client_id`. */
export async function seedOAuthClient(
  values: {
    readonly name?: string | null;
    readonly redirectUris?: readonly string[];
  } = {},
): Promise<string> {
  const clientId = randomUUID();
  await db.insert(oauthClient).values({
    id: randomUUID(),
    clientId,
    name: values.name === undefined ? "Asistente de prueba" : values.name,
    redirectUris: [...(values.redirectUris ?? ["http://127.0.0.1:4000/callback"])],
    tokenEndpointAuthMethod: "none",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return clientId;
}

/**
 * Una autorización de `userId` con `clientId`: el consentimiento, un refresh y
 * un token de acceso colgado de él, atados a `sessionId` si viene.
 */
export async function seedGrant(
  userId: string,
  clientId: string,
  values: {
    readonly scopes?: readonly string[];
    readonly createdAt?: Date;
    readonly sessionId?: string;
  } = {},
): Promise<void> {
  const createdAt = values.createdAt ?? new Date();
  const scopes = [...(values.scopes ?? ["clock", "offline_access"])];
  const sessionId = values.sessionId ?? null;
  await db.insert(oauthConsent).values({
    id: randomUUID(),
    clientId,
    userId,
    scopes,
    createdAt,
    updatedAt: createdAt,
  });
  const refreshId = randomUUID();
  await db.insert(oauthRefreshToken).values({
    id: refreshId,
    token: randomUUID(),
    clientId,
    userId,
    sessionId,
    scopes,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 30 * 24 * HOUR_MS),
  });
  await db.insert(oauthAccessToken).values({
    id: randomUUID(),
    token: randomUUID(),
    clientId,
    userId,
    sessionId,
    refreshId,
    scopes,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + HOUR_MS),
  });
}

/** Cuántas filas de consentimiento, refresh y acceso le quedan a `userId`. */
export async function grantRowsOf(userId: string) {
  const [consents, refresh, access] = await Promise.all([
    db.select().from(oauthConsent).where(eq(oauthConsent.userId, userId)),
    db.select().from(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId)),
    db.select().from(oauthAccessToken).where(eq(oauthAccessToken.userId, userId)),
  ]);
  return { consents: consents.length, refresh: refresh.length, access: access.length };
}

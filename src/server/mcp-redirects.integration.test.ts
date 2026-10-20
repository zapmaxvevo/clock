import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { oauthClient, oauthClientResource, oauthConsent } from "@/server/db/schema";
import { mcpResourceUrl } from "@/server/mcp-auth";
import { seedMember, seedWorkspace } from "@/test/factories";
import {
  appOrigin,
  authorize,
  pkcePair,
  registerClient,
  registrations,
  signInCookie,
} from "@/test/mcp";
import { restoreEnv } from "@/test/mcp-env";

/**
 * D-MCP-2: un esquema propio de una app nativa con host y camino, que el plugin
 * acepta como redirección registrable desde 1.7.10
 * (`isNativePrivateUseRedirectUri`), no pasa la lista: ni al registrar ni al
 * autorizar, aunque el cliente lo tenga registrado.
 */
const savedEnv = await vi.hoisted(async () => {
  const { MCP_ON_ENV, replaceEnv } = await import("@/test/mcp-env");
  return replaceEnv(MCP_ON_ENV);
});

afterAll(() => {
  restoreEnv(savedEnv);
});

const NATIVE = "cursor://anysphere.cursor-mcp/oauth/callback";
const LOOPBACK = "http://127.0.0.1:4100/callback";

/**
 * Un cliente nativo con las dos redirecciones registradas, como lo dejaría un
 * registro sin el gancho: el estado que `validateRedirectUri` tiene que cortar.
 */
async function seedNativeClient(): Promise<string> {
  const clientId = randomUUID();
  await db.insert(oauthClient).values({
    id: randomUUID(),
    clientId,
    name: "App nativa",
    redirectUris: [NATIVE, LOOPBACK],
    applicationType: "native",
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    scopes: ["clock", "offline_access"],
    requirePKCE: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(oauthClientResource).values({
    id: randomUUID(),
    clientId,
    resourceId: mcpResourceUrl(),
    createdAt: new Date(),
  });
  return clientId;
}

async function signedInPerson(): Promise<string> {
  const { workspaceId } = await seedWorkspace();
  const email = `${randomUUID()}@empresa.com`;
  await seedMember(workspaceId, "member", "active", { email });
  return signInCookie(email);
}

describe("un esquema propio fuera de la lista", () => {
  it("al registrar responde 400 invalid_redirect_uri sin crear la fila", async () => {
    const before = await db.select().from(oauthClient);

    const response = await registerClient({
      ...registrations.claudeCode(),
      application_type: "native",
      redirect_uris: [NATIVE],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_redirect_uri" });
    expect(await db.select().from(oauthClient)).toEqual(before);
  });

  it("al autorizar no se acepta aunque el cliente lo haya registrado; su loopback sí", async () => {
    const clientId = await seedNativeClient();
    const cookie = await signedInPerson();
    const { challenge } = pkcePair();

    const native = await authorize({ clientId, redirectUri: NATIVE, challenge }, cookie);
    const loopback = await authorize(
      { clientId, redirectUri: LOOPBACK, challenge },
      cookie,
    );

    // Sin un destino validado, el plugin manda a la página de error: `/login`.
    const nativeTarget = new URL(native.headers.get("location") ?? "", appOrigin());
    expect(nativeTarget.origin).toBe(appOrigin());
    expect(nativeTarget.pathname).toBe("/login");
    expect(nativeTarget.searchParams.get("error")).toBe("invalid_redirect");
    expect(new URL(loopback.headers.get("location") ?? "", appOrigin()).pathname).toBe(
      "/conectar",
    );
    expect(
      await db.select().from(oauthConsent).where(eq(oauthConsent.clientId, clientId)),
    ).toEqual([]);
  });
});

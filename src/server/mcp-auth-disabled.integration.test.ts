import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { handleMcpRequest } from "@/modules/mcp/handler";
import { db } from "@/server/db";
import { oauthClient } from "@/server/db/schema";
import { seedMember, seedWorkspace } from "@/test/factories";
import {
  appOrigin,
  authGet,
  authPostJson,
  browserPostJson,
  mcpRequest,
  pkcePair,
  registrations,
  rpc,
  signInCookie,
} from "@/test/mcp";
import { restoreEnv } from "@/test/mcp-env";
import { GET as protectedResourceRoot } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as protectedResourceOfMcp } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as authServerRoot } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as authServerOfIssuer } from "@/app/.well-known/oauth-authorization-server/api/auth/route";

/**
 * D-MCP-14, criterio 16: con `MCP_ENABLED` sin declarar al importar `auth.ts`, el
 * plugin está cargado y todo lo del MCP responde 404. El resto del ingreso, igual.
 */
const savedEnv = await vi.hoisted(async () => {
  const { MCP_OFF_ENV, replaceEnv } = await import("@/test/mcp-env");
  return replaceEnv(MCP_OFF_ENV);
});

afterAll(() => {
  restoreEnv(savedEnv);
});

async function signedInPerson() {
  const { workspaceId } = await seedWorkspace();
  const email = `${randomUUID()}@empresa.com`;
  await seedMember(workspaceId, "member", "active", { email });
  return { email, cookie: await signInCookie(email) };
}

describe("el interruptor apagado (criterio 16)", () => {
  it("/api/mcp responde 404, también sin token", async () => {
    for (const token of [null, "cualquiera"]) {
      const response = await handleMcpRequest(mcpRequest(token, rpc.initialize()));
      expect(response.status).toBe(404);
    }
  });

  it.each([
    ["oauth-protected-resource", () => protectedResourceRoot()],
    ["oauth-protected-resource/api/mcp", () => protectedResourceOfMcp()],
    ["oauth-authorization-server", (url: string) => authServerRoot(new Request(url))],
    [
      "oauth-authorization-server/api/auth",
      (url: string) => authServerOfIssuer(new Request(url)),
    ],
  ])("los metadatos de /.well-known/%s responden 404", async (path, route) => {
    const response = await route(`${appOrigin()}/.well-known/${path}`);

    expect(response.status).toBe(404);
  });

  it("las cinco rutas OAuth y /jwks responden 404, y el registro no crea la fila", async () => {
    const { cookie } = await signedInPerson();
    const clientsBefore = (await db.select().from(oauthClient)).length;
    const { challenge } = pkcePair();
    const authorizeQuery = new URLSearchParams({
      response_type: "code",
      client_id: "cualquiera",
      redirect_uri: "http://127.0.0.1:4000/callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const responses = [
      await authGet(`/oauth2/authorize?${authorizeQuery.toString()}`, cookie),
      await authPostJson("/oauth2/register", registrations.claudeCode()),
      await authPostJson("/oauth2/token", {
        grant_type: "authorization_code",
        code: "x",
      }),
      await browserPostJson(
        "/oauth2/consent",
        { accept: true, oauth_query: "a=b" },
        cookie,
      ),
      await authPostJson("/oauth2/revoke", { token: "x" }),
      await authGet("/jwks"),
      await authGet("/token", cookie),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404, 404, 404, 404,
    ]);
    expect(await db.select().from(oauthClient)).toHaveLength(clientsBefore);
  });

  it("get-session responde la sesión sin set-auth-jwt", async () => {
    const { email, cookie } = await signedInPerson();

    const response = await authGet("/get-session", cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { email } });
    expect(response.headers.get("set-auth-jwt")).toBeNull();
  });
});

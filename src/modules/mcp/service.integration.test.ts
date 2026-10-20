import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { mcpCallWindow, membership, oauthClient } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { ForbiddenError } from "@/server/permissions";
import { readUserContext, type SessionContext } from "@/server/user-context";
import { seedMember, seedWorkspace } from "@/test/factories";
import {
  appOrigin,
  authorize,
  pkcePair,
  registeredClient,
  registrations,
  signInCookie,
  signedQueryOf,
  type RegisteredClient,
} from "@/test/mcp";
import { replaceEnv, restoreEnv } from "@/test/mcp-env";
import { grantRowsOf, seedGrant, seedOAuthClient } from "@/test/oauth-grants";
import { auditFor } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import { MCP_CALLS_PER_MINUTE, mcpMessages, mcpViewTexts } from "./schema";
import {
  consumeCall,
  decideConsent,
  getConsentView,
  getGrantsView,
  revokeGrant,
} from "./service";

/** §9.2, `mcp/service.integration`: las vistas, desconectar, consentir y el límite. */
const savedEnv = await vi.hoisted(async () => {
  const { MCP_ON_ENV, replaceEnv: replace } = await import("@/test/mcp-env");
  return replace(MCP_ON_ENV);
});

afterAll(() => {
  restoreEnv(savedEnv);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Una persona con membresía activa, entrada con la sesión de prueba. */
async function seedPerson() {
  const seeded = await seedWorkspace();
  const email = `${randomUUID()}@empresa.com`;
  const userId = await seedMember(seeded.workspaceId, "member", "active", { email });
  return { seeded, userId, email, actor: actorIn(seeded.workspaceId, userId) };
}

async function contextOf(userId: string, email: string): Promise<SessionContext> {
  const read = await readUserContext({ id: userId, email, name: "Persona de prueba" });
  if (read.kind !== "ready") {
    throw new Error(`Sin contexto: ${read.kind}`);
  }
  return read.context;
}

/** Los parámetros como los recibe una página: los repetidos, en un arreglo. */
function pageParamsOf(query: string): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const [name, value] of new URLSearchParams(query)) {
    const current = params[name];
    params[name] =
      current === undefined
        ? value
        : [...(Array.isArray(current) ? current : [current]), value];
  }
  return params;
}

/** La consulta firmada con que el plugin manda a `/conectar`. */
async function signedConsentQuery(
  email: string,
  client: RegisteredClient,
  extra: string = "",
): Promise<{ readonly query: string; readonly cookie: string }> {
  const cookie = await signInCookie(email);
  const { challenge } = pkcePair();
  const response = await authorize(
    { clientId: client.clientId, redirectUri: client.redirectUri, challenge },
    cookie,
  );
  const location = new URL(response.headers.get("location") ?? "", appOrigin());
  if (location.pathname !== "/conectar") {
    throw new Error(`Se esperaba /conectar y llegó ${location.toString()}`);
  }
  return { query: signedQueryOf(response) + extra, cookie };
}

describe("getGrantsView (§5.3)", () => {
  it("apagado, disabled", async () => {
    const { userId, email } = await seedPerson();
    const saved = replaceEnv({ MCP_ENABLED: undefined });
    try {
      expect(await getGrantsView(await contextOf(userId, email))).toEqual({
        kind: "disabled",
      });
    } finally {
      restoreEnv(saved);
    }
  });

  it("una fila por cliente, con el nombre declarado o el genérico, adónde vuelve y el día", async () => {
    const { userId, email } = await seedPerson();
    const claude = await seedOAuthClient({
      name: "  Claude  ",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    const local = await seedOAuthClient({ name: null });
    await seedGrant(userId, claude, { createdAt: new Date("2026-10-01T02:00:00Z") });
    await seedGrant(userId, claude, { createdAt: new Date("2026-10-05T12:00:00Z") });
    await seedGrant(userId, local, { createdAt: new Date("2026-10-10T12:00:00Z") });

    const view = await getGrantsView(await contextOf(userId, email));

    expect(view).toEqual({
      kind: "ready",
      serverUrl: `${appOrigin()}/api/mcp`,
      canRevoke: true,
      grants: [
        {
          clientId: local,
          name: mcpViewTexts.unnamedClient,
          returnsTo: mcpViewTexts.loopback,
          grantedOn: "10/10/2026",
        },
        {
          clientId: claude,
          name: "Claude",
          returnsTo: "claude.ai",
          // 2026-10-01T02:00Z es el 30 de septiembre en Buenos Aires.
          grantedOn: "30/09/2026",
        },
      ],
    });
  });

  it("con la membresía inactiva, la lista sin poder desconectar", async () => {
    const { userId, email } = await seedPerson();
    await seedGrant(userId, await seedOAuthClient());
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(eq(membership.userId, userId));

    const view = await getGrantsView(await contextOf(userId, email));

    expect(view).toMatchObject({ kind: "ready", canRevoke: false });
  });
});

describe("revokeGrant (criterio 12, D-MCP-5)", () => {
  it("borra el par y deja mcp.revoke; el otro cliente sigue; otra vez, éxito sin constancia", async () => {
    const { userId, actor } = await seedPerson();
    const revoked = await seedOAuthClient();
    const kept = await seedOAuthClient();
    await seedGrant(userId, revoked);
    await seedGrant(userId, revoked);
    await seedGrant(userId, kept);

    expect(await revokeGrant(actor, { clientId: revoked })).toEqual({
      clientId: revoked,
    });
    expect(await revokeGrant(actor, { clientId: revoked })).toEqual({
      clientId: revoked,
    });

    expect(await grantRowsOf(userId)).toEqual({ consents: 1, refresh: 1, access: 1 });
    const audits = await auditFor("oauth_client", revoked);
    expect(audits.map((row) => [row.action, row.actorId])).toEqual([
      ["mcp.revoke", userId],
    ]);
  });

  it("el clientId de otra persona no borra nada", async () => {
    const { seeded, actor } = await seedPerson();
    const other = await seedMember(seeded.workspaceId, "member");
    const client = await seedOAuthClient();
    await seedGrant(other, client);

    expect(await revokeGrant(actor, { clientId: client })).toEqual({ clientId: client });

    expect(await grantRowsOf(other)).toEqual({ consents: 1, refresh: 1, access: 1 });
    expect(await auditFor("oauth_client")).toEqual([]);
  });

  it("con la membresía inactiva, forbidden sin borrar", async () => {
    const { userId, seeded } = await seedPerson();
    const client = await seedOAuthClient();
    await seedGrant(userId, client);

    await expect(
      revokeGrant(actorIn(seeded.workspaceId, userId, { status: "inactive" }), {
        clientId: client,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await grantRowsOf(userId)).toEqual({ consents: 1, refresh: 1, access: 1 });
  });
});

describe("getConsentView (§5.1, D-MCP-15)", () => {
  it("ready: el nombre declarado, adónde vuelve el redirect_uri firmado y el correo", async () => {
    const { userId, email } = await seedPerson();
    const client = await registeredClient(registrations.claudeAi());
    const { query } = await signedConsentQuery(email, client);

    const view = await getConsentView(
      await contextOf(userId, email),
      pageParamsOf(query),
    );

    expect(view).toEqual({
      kind: "ready",
      oauthQuery: query,
      clientName: "Claude",
      returnsTo: "claude.ai",
      email,
    });
  });

  it("con loopback, vuelve a esta computadora", async () => {
    const { userId, email } = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const { query } = await signedConsentQuery(email, client);

    const view = await getConsentView(
      await contextOf(userId, email),
      pageParamsOf(query),
    );

    expect(view).toMatchObject({ kind: "ready", returnsTo: mcpViewTexts.loopback });
  });

  it("la consulta tal como llegó, con un parámetro repetido, sigue verificando", async () => {
    const { userId, email } = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const { query } = await signedConsentQuery(email, client);
    const params = pageParamsOf(query);
    const repeated = Object.entries(params).find(([, value]) => Array.isArray(value));

    const view = await getConsentView(await contextOf(userId, email), params);

    expect(view.kind).toBe("ready");
    // `ba_param` lista cada parámetro firmado: viene repetido.
    expect(repeated?.[0]).toBe("ba_param");
    if (view.kind === "ready") {
      expect(new URLSearchParams(view.oauthQuery).getAll("ba_param")).toEqual(
        repeated?.[1],
      );
    }
  });

  it.each([
    ["sin consulta", () => ""],
    [
      "con la firma alterada",
      (query: string) => query.replace(/sig=[^&]+/, "sig=alterada"),
    ],
    [
      "con otro redirect_uri",
      (query: string) =>
        query.replace(
          /redirect_uri=[^&]+/,
          `redirect_uri=${encodeURIComponent("https://evil.example/cb")}`,
        ),
    ],
  ])("invalid %s", async (_case, alter) => {
    const { userId, email } = await seedPerson();
    const client = await registeredClient(registrations.claudeAi());
    const { query } = await signedConsentQuery(email, client);

    const view = await getConsentView(
      await contextOf(userId, email),
      pageParamsOf(alter(query)),
    );

    expect(view).toEqual({ kind: "invalid" });
  });

  it("invalid vencida", async () => {
    const { userId, email } = await seedPerson();
    const client = await registeredClient(registrations.claudeAi());
    const { query } = await signedConsentQuery(email, client);
    const context = await contextOf(userId, email);
    const exp = Number(new URLSearchParams(query).get("exp"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((exp + 1) * 1000);

    expect(await getConsentView(context, pageParamsOf(query))).toEqual({
      kind: "invalid",
    });
  });

  it("invalid si el cliente ya no existe", async () => {
    const { userId, email } = await seedPerson();
    const client = await registeredClient(registrations.claudeAi());
    const { query } = await signedConsentQuery(email, client);
    await db.delete(oauthClient).where(eq(oauthClient.clientId, client.clientId));

    expect(
      await getConsentView(await contextOf(userId, email), pageParamsOf(query)),
    ).toEqual({
      kind: "invalid",
    });
  });

  it("forbidden sin mcp.connect, con la consulta para cancelar", async () => {
    const { userId, email } = await seedPerson();
    const client = await registeredClient(registrations.claudeAi());
    const { query } = await signedConsentQuery(email, client);
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(eq(membership.userId, userId));

    expect(
      await getConsentView(await contextOf(userId, email), pageParamsOf(query)),
    ).toEqual({
      kind: "forbidden",
      oauthQuery: query,
    });
  });
});

describe("decideConsent (D-MCP-15)", () => {
  it("aceptar devuelve el callback con el código y el emisor; cancelar, access_denied", async () => {
    const { email } = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const accepted = await signedConsentQuery(email, client);
    const cancelled = await signedConsentQuery(email, client);

    const accept = await decideConsent(new Headers({ cookie: accepted.cookie }), {
      oauthQuery: accepted.query,
      accept: true,
    });
    const cancel = await decideConsent(new Headers({ cookie: cancelled.cookie }), {
      oauthQuery: cancelled.query,
      accept: false,
    });

    const code = new URL(accept.redirectTo);
    expect(`${code.origin}${code.pathname}`).toBe(client.redirectUri);
    expect(code.searchParams.get("code")).not.toBeNull();
    expect(code.searchParams.get("iss")).toBe(`${appOrigin()}/api/auth`);
    const denied = new URL(cancel.redirectTo);
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("code")).toBeNull();
  });

  it("una consulta alterada o con el MCP apagado responde consent_expired", async () => {
    const { email } = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const { query, cookie } = await signedConsentQuery(email, client);
    const headers = new Headers({ cookie });

    const altered = decideConsent(headers, {
      oauthQuery: query.replace(/sig=[^&]+/, "sig=alterada"),
      accept: true,
    });
    await expect(altered).rejects.toBeInstanceOf(DomainError);
    await expect(altered).rejects.toMatchObject({
      code: "consent_expired",
      message: mcpMessages.consentExpired,
    });

    const saved = replaceEnv({ MCP_ENABLED: undefined });
    try {
      await expect(
        decideConsent(headers, { oauthQuery: query, accept: true }),
      ).rejects.toMatchObject({ code: "consent_expired" });
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("consumeCall (criterio 14, D-MCP-13)", () => {
  it(`deja pasar ${MCP_CALLS_PER_MINUTE} pedidos por minuto y persona, y reinicia el minuto siguiente`, async () => {
    const { userId, seeded } = await seedPerson();
    const other = await seedMember(seeded.workspaceId, "member");

    const results = [];
    for (let call = 0; call < MCP_CALLS_PER_MINUTE + 1; call++) {
      results.push(await consumeCall(userId));
    }

    expect(results.filter(Boolean)).toHaveLength(MCP_CALLS_PER_MINUTE);
    expect(results.at(-1)).toBe(false);
    expect(await consumeCall(other)).toBe(true);

    await db
      .update(mcpCallWindow)
      .set({ windowStart: sql`date_trunc('minute', now()) - interval '1 minute'` })
      .where(eq(mcpCallWindow.userId, userId));

    expect(await consumeCall(userId)).toBe(true);
    const [row] = await db
      .select()
      .from(mcpCallWindow)
      .where(eq(mcpCallWindow.userId, userId));
    expect(row.calls).toBe(1);
  });
});

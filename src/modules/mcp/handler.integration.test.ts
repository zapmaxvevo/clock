import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { changeStatus } from "@/modules/team/service";
import { db } from "@/server/db";
import {
  auditLog,
  invitation,
  membership,
  oauthConsent,
  oauthRefreshToken,
  session,
  timeEntry,
} from "@/server/db/schema";
import { mcpIssuer, mcpResourceUrl } from "@/server/mcp-auth";
import { seedAccount, seedInvitation, seedMember, seedWorkspace } from "@/test/factories";
import {
  appOrigin,
  browserPostJson,
  callMcp,
  decodeJwt,
  issueTestGrant,
  refreshRequest,
  registrations,
  resignToken,
  rpc,
  tamperSignature,
  type TestGrant,
} from "@/test/mcp";
import { replaceEnv, restoreEnv } from "@/test/mcp-env";
import { membershipOf } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import { handleMcpRequest } from "./handler";
import { MCP_CALLS_PER_MINUTE, mcpMessages } from "./schema";
import { revokeGrant } from "./service";
import { DELETE, GET } from "@/app/api/mcp/route";
import { GET as protectedResourceRoot } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as protectedResourceOfMcp } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as authServerRoot } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as authServerOfIssuer } from "@/app/.well-known/oauth-authorization-server/api/auth/route";

/**
 * §9.2, `handler.integration`: el recurso con tokens reales que emite el plugin
 * por `issueTestGrant`. Criterios 1, 10, 11, 14 y 15, y el corte en el pedido
 * siguiente de 12 (desconectar) y 13 (desactivar).
 */
const savedEnv = await vi.hoisted(async () => {
  const { MCP_ON_ENV, replaceEnv: replace } = await import("@/test/mcp-env");
  return replace(MCP_ON_ENV);
});

afterAll(() => {
  restoreEnv(savedEnv);
});

const RESOURCE_METADATA = `${appOrigin()}/.well-known/oauth-protected-resource/api/mcp`;

/** D-MCP-8: las ocho herramientas que anuncia `tools/list`. */
const MCP_TOOL_NAMES = [
  "get_context",
  "list_projects",
  "list_entries",
  "create_entry",
  "update_entry",
  "delete_entry",
  "start_timer",
  "stop_timer",
];

/** Una persona del dominio con membresía activa en un workspace nuevo. */
async function seedPerson(email = `${randomUUID()}@empresa.com`) {
  const { workspaceId, ownerId } = await seedWorkspace();
  return { workspaceId, ownerId, ...(await seedPersonIn(workspaceId, email)) };
}

/**
 * Otra persona del dominio en `workspaceId`. El acceso se decide en el workspace
 * más viejo: una de un workspace nuevo no entraría.
 */
async function seedPersonIn(workspaceId: string, email = `${randomUUID()}@empresa.com`) {
  const userId = await seedMember(workspaceId, "member", "active", { email });
  return { userId, email };
}

/** Un día y unas horas válidos para `create_entry`: la escritura que no tiene que llegar. */
const ENTRY_ARGS = { date: "2026-10-14", start: "09:00", end: "10:00" };

/** Lo que una herramienta escribe; vacío si el pedido no pasó. */
async function writes() {
  const [entries, audits] = await Promise.all([
    db.select({ id: timeEntry.id }).from(timeEntry),
    db.select({ id: auditLog.id }).from(auditLog),
  ]);
  return { entries: entries.length, audits: audits.length };
}

/**
 * `tools/call` de `create_entry` con `token`: responde 401 con `invalid_token` y
 * no escribe ni una entrada ni una constancia.
 */
async function expectRejectedWithoutWriting(token: string) {
  const before = await writes();
  const response = await callMcp(token, rpc.toolsCall("create_entry", ENTRY_ARGS));
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  expect(await writes()).toEqual(before);
}

async function expectAccepted(token: string) {
  const response = await callMcp(token, rpc.toolsList());
  expect(response.status).toBe(200);
}

describe("descubrimiento (criterio 1)", () => {
  it("sin token responde 401 con los metadatos del recurso y los dos alcances, sin error", async () => {
    const response = await callMcp(null, rpc.initialize());

    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(`resource_metadata="${RESOURCE_METADATA}"`);
    expect(challenge).toContain('scope="clock offline_access"');
    expect(challenge).not.toContain("error=");
  });

  it("otro esquema que Bearer responde 401 como sin token", async () => {
    const response = await callMcp(null, rpc.initialize(), {
      headers: { authorization: "Basic dXN1YXJpbzpjbGF2ZQ==" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${RESOURCE_METADATA}"`,
    );
  });

  it.each([
    ["la dirección del recurso", protectedResourceOfMcp],
    ["la raíz", protectedResourceRoot],
  ])(
    "los metadatos del recurso en %s anuncian el recurso, el emisor y los dos alcances",
    async (_where, route) => {
      const response = route();

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(await response.json()).toEqual({
        resource: `${appOrigin()}/api/mcp`,
        authorization_servers: [`${appOrigin()}/api/auth`],
        scopes_supported: ["clock", "offline_access"],
        bearer_methods_supported: ["header"],
      });
    },
  );

  it.each([
    [
      "la del emisor",
      authServerOfIssuer,
      `${appOrigin()}/.well-known/oauth-authorization-server/api/auth`,
    ],
    ["la raíz", authServerRoot, `${appOrigin()}/.well-known/oauth-authorization-server`],
  ])(
    "los metadatos del servidor en %s anuncian el registro, PKCE S256, los dos alcances y dos concesiones",
    async (_where, route, url) => {
      const response = await route(new Request(url));

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      const metadata = (await response.json()) as Record<string, unknown>;
      expect(metadata.issuer).toBe(mcpIssuer());
      expect(metadata.registration_endpoint).toBe(
        `${appOrigin()}/api/auth/oauth2/register`,
      );
      expect(metadata.code_challenge_methods_supported).toContain("S256");
      expect(metadata.scopes_supported).toEqual(["clock", "offline_access"]);
      expect(metadata.grant_types_supported).toEqual([
        "authorization_code",
        "refresh_token",
      ]);
    },
  );
});

describe("el token de acceso (criterio 3)", () => {
  it("es un JWT at+jwt con la persona, el cliente, el recurso y el emisor, y sirve para las ocho herramientas", async () => {
    const person = await seedPerson();
    const grant = await issueTestGrant(person.email);

    const { header, payload } = decodeJwt(grant.accessToken);
    expect(header.typ).toBe("at+jwt");
    expect(payload).toMatchObject({
      sub: person.userId,
      azp: grant.clientId,
      client_id: grant.clientId,
      aud: mcpResourceUrl(),
      iss: mcpIssuer(),
    });
    expect(String(payload.scope).split(" ")).toEqual(
      expect.arrayContaining(["clock", "offline_access"]),
    );
    expect(grant.refreshToken.length).toBeGreaterThan(0);

    const initialized = await callMcp(grant.accessToken, rpc.initialize());
    expect(initialized.status).toBe(200);
    expect(await initialized.json()).toMatchObject({ result: { serverInfo: {} } });

    const listed = await callMcp(grant.accessToken, rpc.toolsList());
    expect(listed.status).toBe(200);
    const { result } = (await listed.json()) as { result: { tools: { name: string }[] } };
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(
      [...MCP_TOOL_NAMES].sort(),
    );
  });
});

describe("el token no depende de la sesión web (criterio 10)", () => {
  it("con la sesión vencida y después de cerrarla, el token sigue y el refresh emite uno que también", async () => {
    const person = await seedPerson();
    const grant = await issueTestGrant(person.email);

    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(session.userId, person.userId));
    await expectAccepted(grant.accessToken);

    const signOut = await browserPostJson("/sign-out", {}, grant.cookie);
    expect(signOut.status).toBe(200);
    expect(
      await db.select().from(session).where(eq(session.userId, person.userId)),
    ).toEqual([]);
    await expectAccepted(grant.accessToken);

    const refreshed = await refreshRequest(grant.client, grant.refreshToken);
    expect(refreshed.status).toBe(200);
    const { access_token: renewed } = (await refreshed.json()) as {
      access_token: string;
    };
    expect(renewed).not.toBe(grant.accessToken);
    await expectAccepted(renewed);
  });
});

describe("nunca más que una sesión (criterio 11)", () => {
  async function grantOfNewPerson(): Promise<TestGrant & { userId: string }> {
    const person = await seedPerson();
    return { ...(await issueTestGrant(person.email)), userId: person.userId };
  }

  it("el mismo token firmado otra vez con las claves del servidor pasa: el control de los casos de firma", async () => {
    const grant = await grantOfNewPerson();

    await expectAccepted(await resignToken(grant.accessToken));
  });

  it.each([
    [
      "vencido",
      () => {
        const now = Math.floor(Date.now() / 1000);
        return { payload: { iat: now - 7200, exp: now - 3600 } };
      },
    ],
    ["de otro emisor", () => ({ payload: { iss: "https://otro.example/api/auth" } })],
    ["de otra audiencia", () => ({ payload: { aud: "https://otro.example/api/mcp" } })],
    ["con las mismas claves y otro typ", () => ({ header: { typ: "JWT" } })],
    ["con las mismas claves y sin typ", () => ({ header: { typ: undefined } })],
    ["firmado con otra clave y el mismo kid", () => ({ signer: "foreign" as const })],
  ])("un token %s responde 401 sin escribir", async (_case, changes) => {
    const grant = await grantOfNewPerson();

    await expectRejectedWithoutWriting(await resignToken(grant.accessToken, changes()));
  });

  it("un token con la firma alterada responde 401 sin escribir", async () => {
    const grant = await grantOfNewPerson();

    await expectRejectedWithoutWriting(tamperSignature(grant.accessToken));
  });

  it("con el consentimiento borrado por SQL responde 401 sin escribir", async () => {
    const grant = await grantOfNewPerson();

    await db.delete(oauthConsent).where(eq(oauthConsent.userId, grant.userId));

    await expectRejectedWithoutWriting(grant.accessToken);
  });

  it("con la membresía pasada a inactive por SQL responde 401 sin escribir", async () => {
    const grant = await grantOfNewPerson();

    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(eq(membership.userId, grant.userId));

    await expectRejectedWithoutWriting(grant.accessToken);
  });

  it("un externo con la invitación revocada responde 401 sin escribir", async () => {
    const email = `${randomUUID()}@externa.example`;
    const { workspaceId } = await seedWorkspace();
    await seedMember(workspaceId, "member", "active", { email });
    const invited = await seedInvitation({ workspaceId, email, status: "accepted" });
    const grant = await issueTestGrant(email);
    await expectAccepted(grant.accessToken);

    await db
      .update(invitation)
      .set({ status: "revoked", acceptedAt: null, revokedAt: new Date() })
      .where(eq(invitation.id, invited.id));

    await expectRejectedWithoutWriting(grant.accessToken);
  });

  it("un correo cuyo dominio salió de GOOGLE_WORKSPACE_DOMAINS, sin invitación, responde 401 sin escribir", async () => {
    const grant = await grantOfNewPerson();
    const saved = replaceEnv({ GOOGLE_WORKSPACE_DOMAINS: "otra-empresa.example" });
    try {
      await expectRejectedWithoutWriting(grant.accessToken);
    } finally {
      restoreEnv(saved);
    }
    await expectAccepted(grant.accessToken);
  });

  it("sin el alcance clock responde 403 insufficient_scope y pide los dos alcances, sin escribir", async () => {
    const person = await seedPerson();
    const grant = await issueTestGrant(person.email, { scope: "offline_access" });
    expect(grant.scope.split(" ")).not.toContain("clock");

    const before = await writes();
    const response = await callMcp(
      grant.accessToken,
      rpc.toolsCall("create_entry", ENTRY_ARGS),
    );

    expect(response.status).toBe(403);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="clock offline_access"');
    expect(await writes()).toEqual(before);
  });
});

describe("desconectar corta en el pedido siguiente (criterio 12)", () => {
  it("el token y el refresh del cliente desconectado dejan de servir; los del otro cliente siguen", async () => {
    const person = await seedPerson();
    const disconnected = await issueTestGrant(person.email);
    const other = await issueTestGrant(person.email, {
      registration: registrations.chatgpt(),
      cookie: disconnected.cookie,
    });
    await expectAccepted(disconnected.accessToken);

    await revokeGrant(actorIn(person.workspaceId, person.userId), {
      clientId: disconnected.clientId,
    });

    await expectRejectedWithoutWriting(disconnected.accessToken);
    const refreshed = await refreshRequest(
      disconnected.client,
      disconnected.refreshToken,
    );
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toMatchObject({ error: "invalid_grant" });

    await expectAccepted(other.accessToken);
    expect((await refreshRequest(other.client, other.refreshToken)).status).toBe(200);
  });
});

describe("desactivar corta en el pedido siguiente (criterio 13)", () => {
  async function connectedTwice() {
    const person = await seedPerson();
    const first = await issueTestGrant(person.email);
    const second = await issueTestGrant(person.email, {
      registration: registrations.chatgpt(),
      cookie: first.cookie,
    });
    const { id: membershipId } = await membershipOf(person.workspaceId, person.userId);
    const owner = actorIn(person.workspaceId, person.ownerId, { role: "owner" });
    return { person, first, second, membershipId, owner };
  }

  it("los tokens y los refresh de los dos clientes dejan de servir, y reactivar no los devuelve", async () => {
    const { person, first, second, membershipId, owner } = await connectedTwice();

    await changeStatus(owner, { membershipId, status: "inactive" });

    for (const grant of [first, second]) {
      await expectRejectedWithoutWriting(grant.accessToken);
      expect((await refreshRequest(grant.client, grant.refreshToken)).status).toBe(400);
    }

    // D-E2-7: reactivar pide una cuenta de Google; la sesión de prueba no la deja.
    await seedAccount(person.userId);
    await changeStatus(owner, { membershipId, status: "active" });

    for (const grant of [first, second]) {
      await expectRejectedWithoutWriting(grant.accessToken);
    }
  });

  it("un refresh insertado después de desactivar emite un token que responde 401", async () => {
    const { person, first, membershipId, owner } = await connectedTwice();
    const [stray] = await db
      .select()
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.clientId, first.clientId));

    await changeStatus(owner, { membershipId, status: "inactive" });
    // La renovación cruzada de D-MCP-6: el plugin inserta el refresh nuevo después
    // de que la desactivación confirmó. La sesión ya no existe: `set null`.
    await db.insert(oauthRefreshToken).values({ ...stray, sessionId: null });

    const renewed = await refreshRequest(first.client, first.refreshToken);
    expect(renewed.status).toBe(200);
    const { access_token: token } = (await renewed.json()) as { access_token: string };
    expect(decodeJwt(token).payload.sub).toBe(person.userId);

    await expectRejectedWithoutWriting(token);
  });
});

/**
 * El límite cuenta por el minuto de `now()` de la base. Si el minuto cambia en
 * medio de la ráfaga, la ventana se reinicia y el test no puede afirmar nada:
 * vuelve a empezar, con las ventanas borradas, ya lejos del borde.
 */
async function withinOneMinute<T>(userIds: readonly string[], work: () => Promise<T>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await db.execute(
      sql`delete from mcp_call_window where user_id in (${sql.join(
        userIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    const before = await currentMinute();
    const result = await work();
    if ((await currentMinute()) === before) {
      return result;
    }
  }
  throw new Error("La ráfaga cruzó dos cambios de minuto seguidos.");
}

async function currentMinute(): Promise<string> {
  const result = await db.execute(
    sql`select date_trunc('minute', now())::text as minute`,
  );
  return (result.rows[0] as { minute: string }).minute;
}

describe("el límite por persona (criterio 14)", () => {
  it("el pedido 121 del minuto, repartido entre dos clientes, responde 429; otra persona no se entera; el minuto siguiente pasa", async () => {
    const person = await seedPerson();
    const first = await issueTestGrant(person.email);
    const second = await issueTestGrant(person.email, {
      registration: registrations.chatgpt(),
      cookie: first.cookie,
    });
    const other = await seedPersonIn(person.workspaceId);
    const otherGrant = await issueTestGrant(other.email);

    const { statuses, limited } = await withinOneMinute([person.userId], async () => {
      const results: number[] = [];
      for (let call = 0; call < MCP_CALLS_PER_MINUTE; call += 1) {
        const grant = call % 2 === 0 ? first : second;
        results.push((await callMcp(grant.accessToken, rpc.toolsList(call))).status);
      }
      return {
        statuses: results,
        limited: await callMcp(second.accessToken, rpc.toolsList()),
      };
    });

    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32000, message: mcpMessages.rateLimited },
    });

    await expectAccepted(otherGrant.accessToken);

    await db.execute(
      sql`update mcp_call_window set window_start = window_start - interval '1 minute' where user_id = ${person.userId}`,
    );
    await expectAccepted(first.accessToken);
  }, 60_000);
});

describe("el transporte (criterio 15)", () => {
  it("GET y DELETE responden 405 con Allow: POST", async () => {
    for (const handler of [GET, DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });

  it("un cuerpo de 70 KiB responde 413 sin escribir", async () => {
    const person = await seedPerson();
    const grant = await issueTestGrant(person.email);
    const before = await writes();

    const response = await handleMcpRequest(
      new Request(`${appOrigin()}/api/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${grant.accessToken}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(
          rpc.toolsCall("create_entry", {
            ...ENTRY_ARGS,
            description: "x".repeat(70 * 1024),
          }),
        ),
      }),
    );

    expect(response.status).toBe(413);
    expect(await writes()).toEqual(before);
  });

  it("un Origin ajeno responde 403; uno de MCP_ALLOWED_ORIGINS, el propio y ninguno pasan; ninguna respuesta lleva Mcp-Session-Id", async () => {
    const person = await seedPerson();
    const grant = await issueTestGrant(person.email);

    const evil = await callMcp(grant.accessToken, rpc.initialize(), {
      origin: "https://evil.example",
    });
    expect(evil.status).toBe(403);

    const allowed = await Promise.all(
      ["https://claude.ai", "https://chatgpt.com", appOrigin(), undefined].map((origin) =>
        callMcp(grant.accessToken, rpc.initialize(), { origin }),
      ),
    );
    for (const response of [evil, ...allowed]) {
      expect(response.headers.get("mcp-session-id")).toBeNull();
    }
    expect(allowed.map((response) => response.status)).toEqual([200, 200, 200, 200]);
  });
});

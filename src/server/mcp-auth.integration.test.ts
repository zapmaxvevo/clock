import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  invitation,
  membership,
  oauthClient,
  oauthConsent,
  session,
} from "@/server/db/schema";
import { mcpResourceUrl } from "@/server/mcp-auth";
import { seedInvitation, seedMember, seedWorkspace } from "@/test/factories";
import {
  appOrigin,
  authGet,
  authorize,
  browserPostJson,
  callMcp,
  consent,
  cookieOf,
  exchangeCode,
  locationOf,
  pkcePair,
  redirectUrlOf,
  registerClient,
  registeredClient,
  registrations,
  resumeWithTestSession,
  rpc,
  signInCookie,
  signedQueryOf,
  tokenRequest,
  type RegisteredClient,
} from "@/test/mcp";
import { replaceEnv, restoreEnv } from "@/test/mcp-env";

/**
 * §9.2, `mcp-auth.integration`: el servidor de autorización por `auth.handler`.
 * Criterios 2 a 5, 16 y 17, con la sesión de prueba y tokens reales.
 */
const savedEnv = await vi.hoisted(async () => {
  const { MCP_ON_ENV, replaceEnv: replace } = await import("@/test/mcp-env");
  return replace(MCP_ON_ENV);
});

afterAll(() => {
  restoreEnv(savedEnv);
});

const CLAUDE_AI = "https://claude.ai/api/mcp/auth_callback";
const CHATGPT = "https://chatgpt.com/connector_platform_oauth_redirect";

/** Una persona del dominio con membresía activa en un workspace nuevo. */
async function seedPerson(email = `${randomUUID()}@empresa.com`) {
  const { workspaceId } = await seedWorkspace();
  const userId = await seedMember(workspaceId, "member", "active", { email });
  return { workspaceId, userId, email };
}

/** Un externo con la invitación aceptada y la membresía activa. */
async function seedExternal(email = `${randomUUID()}@externa.example`) {
  const { workspaceId } = await seedWorkspace();
  const userId = await seedMember(workspaceId, "member", "active", { email });
  const invited = await seedInvitation({ workspaceId, email, status: "accepted" });
  return { workspaceId, userId, email, invitationId: invited.id };
}

/**
 * Los clientes registrados. `oauth_client` no tiene clave hacia `user` cuando el
 * registro es anónimo y `truncateAll` no la vacía: se cuenta antes y después.
 */
async function clientCount(): Promise<number> {
  return (await db.select({ clientId: oauthClient.clientId }).from(oauthClient)).length;
}

async function clientExists(clientId: string): Promise<boolean> {
  const rows = await db
    .select({ clientId: oauthClient.clientId })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId));
  return rows.length === 1;
}

/** Los consentimientos de `clientId`. */
async function consentsOf(clientId: string) {
  return db
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(eq(oauthConsent.clientId, clientId));
}

/** Adónde manda una respuesta del plugin: la `Location` de un 3xx o el `url` de `{ redirect, url }`. */
async function destinationOf(response: Response): Promise<URL> {
  return response.status >= 300 && response.status < 400
    ? locationOf(response)
    : redirectUrlOf(response);
}

/** Los parámetros de una autorización del recorrido normal para `client`. */
function authorizeParamsOf(client: RegisteredClient) {
  const { verifier, challenge } = pkcePair();
  return {
    verifier,
    params: { clientId: client.clientId, redirectUri: client.redirectUri, challenge },
  };
}

describe("el registro con lista (criterio 2)", () => {
  it.each([
    ["Claude Code, sin application_type y con loopback", registrations.claudeCode()],
    ["claude.ai", registrations.claudeAi()],
    ["ChatGPT", registrations.chatgpt()],
  ])("el cuerpo de %s se crea", async (_client, body) => {
    expect(body).not.toHaveProperty("application_type");

    const response = await registerClient(body);

    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      client_id: string;
      redirect_uris: string[];
    };
    expect(created.redirect_uris).toEqual(body.redirect_uris);
    expect(await clientExists(created.client_id)).toBe(true);
  });

  it.each([
    ["una dirección fuera de la lista", ["https://evil.example/cb"]],
    [
      "una lista que mezcla una permitida y una no",
      [CLAUDE_AI, "https://evil.example/cb"],
    ],
    [
      "un subdominio que imita a uno de la lista",
      ["https://chatgpt.com.evil.example/cb"],
    ],
    ["https sobre loopback", ["https://127.0.0.1:4000/callback"]],
  ])(
    "%s responde 400 invalid_redirect_uri sin crear la fila",
    async (_case, redirectUris) => {
      const before = await clientCount();

      const response = await registerClient({
        ...registrations.claudeAi(),
        redirect_uris: redirectUris,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_redirect_uri" });
      expect(await clientCount()).toBe(before);
    },
  );

  it("el sexto registro en 60 segundos desde la misma IP responde 429; otra IP sigue registrando", async () => {
    // El limitador de Better Auth corre solo con NODE_ENV=production; en la tanda
    // se enciende en el contexto, como en producción.
    const context = await auth.$context;
    const enabled = context.rateLimit.enabled;
    context.rateLimit.enabled = true;
    const before = await clientCount();
    try {
      const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await registerClient(registrations.claudeCode(), {
          "x-forwarded-for": ip,
        });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
      expect(await clientCount()).toBe(before + 5);

      const elsewhere = await registerClient(registrations.claudeCode(), {
        "x-forwarded-for": "203.0.113.9",
      });
      expect(elsewhere.status).toBe(201);
    } finally {
      context.rateLimit.enabled = enabled;
    }
  });

  it("un registro con client_credentials se rechaza sin crear la fila", async () => {
    const before = await clientCount();

    const response = await registerClient({
      ...registrations.chatgpt(),
      grant_types: ["client_credentials"],
      response_types: [],
    });

    expect(response.status).toBe(400);
    expect(await clientCount()).toBe(before);
  });
});

describe("el recorrido completo (criterio 3)", () => {
  it("sin sesión: /login con la consulta firmada, el ingreso la retoma, /conectar, el código y un token que sirve", async () => {
    const person = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const { verifier, params } = authorizeParamsOf(client);

    const anonymous = await authorize({ ...params, state: "estado-1" });
    const login = locationOf(anonymous);
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("sig")).not.toBeNull();
    expect(login.searchParams.get("client_id")).toBe(client.clientId);

    const resumed = await resumeWithTestSession(person.email, signedQueryOf(anonymous));
    const consentPage = await destinationOf(resumed);
    expect(consentPage.pathname).toBe("/conectar");
    expect(consentPage.searchParams.get("redirect_uri")).toBe(client.redirectUri);
    expect(consentPage.searchParams.get("resource")).toBe(mcpResourceUrl());

    const accepted = await redirectUrlOf(
      await consent(cookieOf(resumed), consentPage.search.slice(1), true),
    );
    expect(`${accepted.origin}${accepted.pathname}`).toBe(client.redirectUri);
    expect(accepted.searchParams.get("state")).toBe("estado-1");
    const code = accepted.searchParams.get("code");
    expect(code).not.toBeNull();

    const tokens = await exchangeCode(client, code ?? "", verifier);
    expect(tokens.refresh_token).toBeDefined();
    const response = await callMcp(tokens.access_token, rpc.toolsCall("get_context"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { structuredContent: { user: { email: person.email } } },
    });
  });

  it.each([
    ["claude.ai, público", registrations.claudeAi()],
    ["ChatGPT, confidencial", registrations.chatgpt()],
  ])("con el cuerpo de %s, el canje emite un token que sirve", async (_client, body) => {
    const person = await seedPerson();
    const client = await registeredClient(body);
    const cookie = await signInCookie(person.email);
    const { verifier, params } = authorizeParamsOf(client);

    const consentPage = locationOf(await authorize(params, cookie));
    expect(consentPage.pathname).toBe("/conectar");
    const accepted = await redirectUrlOf(
      await consent(cookie, consentPage.search.slice(1), true),
    );
    const tokens = await exchangeCode(
      client,
      accepted.searchParams.get("code") ?? "",
      verifier,
    );

    expect((await callMcp(tokens.access_token, rpc.toolsList())).status).toBe(200);
  });
});

describe("cancelar (criterio 4)", () => {
  it("el cliente recibe access_denied con su state y no queda autorización", async () => {
    const person = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const cookie = await signInCookie(person.email);
    const { params } = authorizeParamsOf(client);

    const consentPage = locationOf(
      await authorize({ ...params, state: "estado-2" }, cookie),
    );
    const denied = await redirectUrlOf(
      await consent(cookie, consentPage.search.slice(1), false),
    );

    expect(`${denied.origin}${denied.pathname}`).toBe(client.redirectUri);
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("state")).toBe("estado-2");
    expect(denied.searchParams.get("code")).toBeNull();
    expect(await consentsOf(client.clientId)).toEqual([]);
  });
});

/**
 * Las tres personas que pierden el acceso con la sesión viva (D-MCP-4): cada una
 * se siembra con acceso, entra, y después se le quita.
 */
const losesAccess = [
  {
    name: "un externo con la invitación revocada",
    reason: "sin_invitacion",
    seed: seedExternal,
    revoke: async (person: { invitationId?: string; userId: string }) => {
      await db
        .update(invitation)
        .set({ status: "revoked", acceptedAt: null, revokedAt: new Date() })
        .where(eq(invitation.id, person.invitationId ?? ""));
      return () => {};
    },
  },
  {
    name: "un correo cuyo dominio salió de GOOGLE_WORKSPACE_DOMAINS",
    reason: "sin_invitacion",
    seed: seedPerson,
    revoke: async () => {
      const saved = replaceEnv({ GOOGLE_WORKSPACE_DOMAINS: "otra-empresa.example" });
      return () => restoreEnv(saved);
    },
  },
  {
    name: "una membresía pasada a inactive por SQL",
    reason: "membresia_inactiva",
    seed: seedPerson,
    revoke: async (person: { userId: string }) => {
      await db
        .update(membership)
        .set({ status: "inactive" })
        .where(eq(membership.userId, person.userId));
      return () => {};
    },
  },
] as const;

describe("autorizar exige acceso (criterio 5)", () => {
  it.each(losesAccess)(
    "con sesión viva, $name termina en /login?error=$reason sin código",
    async ({ seed, revoke, reason }) => {
      const person = await seed();
      const client = await registeredClient(registrations.claudeCode());
      const cookie = await signInCookie(person.email);
      const { params } = authorizeParamsOf(client);

      const restore = await revoke(person);
      try {
        const response = await authorize(params, cookie);

        const target = locationOf(response);
        expect(target.origin).toBe(appOrigin());
        expect(target.pathname).toBe("/login");
        expect(target.searchParams.get("error")).toBe(reason);
        expect(target.searchParams.get("code")).toBeNull();
        expect(await consentsOf(client.clientId)).toEqual([]);
      } finally {
        restore();
      }
    },
  );

  it.each(losesAccess)(
    "POST /oauth2/consent de $name responde 403 sin consentimiento",
    async ({ seed, revoke, reason }) => {
      const person = await seed();
      const client = await registeredClient(registrations.claudeCode());
      const cookie = await signInCookie(person.email);
      const { params } = authorizeParamsOf(client);
      const consentPage = locationOf(await authorize(params, cookie));
      expect(consentPage.pathname).toBe("/conectar");

      const restore = await revoke(person);
      try {
        const response = await consent(cookie, consentPage.search.slice(1), true);

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: reason });
        expect(await consentsOf(client.clientId)).toEqual([]);
      } finally {
        restore();
      }
    },
  );

  it("la retoma de una persona sin acceso no entra ni deja código", async () => {
    const { workspaceId } = await seedWorkspace();
    const email = `${randomUUID()}@empresa.com`;
    await seedMember(workspaceId, "member", "inactive", { email });
    const client = await registeredClient(registrations.claudeCode());
    const { params } = authorizeParamsOf(client);

    const resumed = await resumeWithTestSession(
      email,
      signedQueryOf(await authorize(params)),
    );

    expect(resumed.status).toBe(403);
    expect(JSON.stringify(await resumed.json())).not.toContain("code=");
    expect(await consentsOf(client.clientId)).toEqual([]);
  });

  it("la retoma corta en el gancho aunque el ingreso haya pasado: el acceso se perdió entre los dos", async () => {
    // Una carrera determinista: la invitación se revoca en la misma sentencia que
    // inserta la sesión, después de que `session.create.before` la leyó vigente.
    const email = `retoma-${randomUUID().slice(0, 8)}@externa.example`;
    await seedExternal(email);
    const client = await registeredClient(registrations.claudeCode());
    const { params } = authorizeParamsOf(client);
    const signedQuery = signedQueryOf(await authorize(params));

    await db.execute(
      sql.raw(`
        create or replace function test_revoke_on_session() returns trigger as $$
        begin
          update invitation set status = 'revoked', accepted_at = null, revoked_at = now()
          where email = '${email}';
          return new;
        end $$ language plpgsql;
        create trigger test_revoke_on_session after insert on session
        for each row execute function test_revoke_on_session();
      `),
    );
    try {
      const resumed = await resumeWithTestSession(email, signedQuery);

      expect(await db.select({ id: session.id }).from(session)).toHaveLength(1);
      const target = await destinationOf(resumed);
      expect(target.pathname).toBe("/login");
      expect(target.searchParams.get("error")).toBe("sin_invitacion");
      expect(target.searchParams.get("code")).toBeNull();
      expect(await consentsOf(client.clientId)).toEqual([]);
    } finally {
      await db.execute(
        sql.raw(`
          drop trigger if exists test_revoke_on_session on session;
          drop function if exists test_revoke_on_session();
        `),
      );
    }
  });

  it("una autorización sin resource responde 400 invalid_request sin redirigir", async () => {
    const person = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const cookie = await signInCookie(person.email);
    const { params } = authorizeParamsOf(client);

    const response = await authorize({ ...params, resource: null }, cookie);

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  it("una autorización con otro resource recibe invalid_target del plugin, sin código", async () => {
    const person = await seedPerson();
    const client = await registeredClient(registrations.claudeCode());
    const cookie = await signInCookie(person.email);
    const { params } = authorizeParamsOf(client);

    const target = locationOf(
      await authorize({ ...params, resource: "https://otro.example/api/mcp" }, cookie),
    );

    expect(`${target.origin}${target.pathname}`).toBe(client.redirectUri);
    expect(target.searchParams.get("error")).toBe("invalid_target");
    expect(target.searchParams.get("code")).toBeNull();
  });

  it("una dirección de la lista que el cliente no registró no se acepta", async () => {
    const person = await seedPerson();
    const client = await registeredClient(registrations.claudeAi());
    const cookie = await signInCookie(person.email);
    const { params } = authorizeParamsOf(client);

    const target = locationOf(
      await authorize({ ...params, redirectUri: CHATGPT }, cookie),
    );

    expect(target.origin).toBe(appOrigin());
    expect(target.pathname).not.toBe("/conectar");
    expect(target.searchParams.get("code")).toBeNull();
  });

  it("una redirección que salió de MCP_REDIRECT_URIS después de registrar el cliente no se acepta", async () => {
    const person = await seedPerson();
    const client = await registeredClient(registrations.claudeAi());
    const cookie = await signInCookie(person.email);
    const { params } = authorizeParamsOf(client);

    const saved = replaceEnv({ MCP_REDIRECT_URIS: CHATGPT });
    try {
      const target = locationOf(await authorize(params, cookie));

      expect(target.origin).toBe(appOrigin());
      expect(target.pathname).not.toBe("/conectar");
      expect(target.searchParams.get("code")).toBeNull();
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("el plugin cargado no cambia la sesión web (criterio 16)", () => {
  it("get-session no trae set-auth-jwt", async () => {
    const person = await seedPerson();
    const cookie = await signInCookie(person.email);

    const response = await authGet("/get-session", cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { email: person.email } });
    expect(response.headers.get("set-auth-jwt")).toBeNull();
  });
});

/** D-MCP-2: la lista fija, con su método; cerrada con el MCP encendido y apagado. */
const CLOSED_PATHS = [
  ["POST", "/oauth2/create-client"],
  ["GET", "/oauth2/get-client"],
  ["GET", "/oauth2/get-clients"],
  ["POST", "/oauth2/update-client"],
  ["POST", "/oauth2/delete-client"],
  ["POST", "/oauth2/client/rotate-secret"],
  ["POST", "/oauth2/client/rotate-keys"],
  ["GET", "/oauth2/public-client"],
  ["POST", "/oauth2/public-client-prelogin"],
  ["GET", "/oauth2/get-consent"],
  ["GET", "/oauth2/get-consents"],
  ["POST", "/oauth2/update-consent"],
  ["POST", "/oauth2/delete-consent"],
  ["GET", "/oauth2/userinfo"],
  ["GET", "/oauth2/end-session"],
  ["POST", "/oauth2/end-session/confirm"],
  ["POST", "/oauth2/introspect"],
  ["POST", "/oauth2/continue"],
  ["POST", "/admin/oauth2/create-client"],
  ["POST", "/admin/oauth2/update-client"],
  ["GET", "/token"],
] as const;

describe("los endpoints cerrados (criterio 17)", () => {
  it.each(CLOSED_PATHS)(
    "%s %s responde 404 a una sesión válida",
    async (method, path) => {
      const person = await seedPerson();
      const cookie = await signInCookie(person.email);

      const response =
        method === "GET"
          ? await authGet(path, cookie)
          : await browserPostJson(
              path,
              { client_id: "x", redirect_uris: [CLAUDE_AI] },
              cookie,
            );

      expect(response.status).toBe(404);
    },
  );

  it("los recursos por la API del servidor responden el rechazo de los privilegios", async () => {
    const person = await seedPerson();
    const cookie = await signInCookie(person.email);
    const headers = new Headers({ cookie });
    const identifier = encodeURIComponent(mcpResourceUrl());

    await expect(
      auth.api.adminCreateOAuthResource({
        headers,
        body: { identifier: "https://otro.example/api" },
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(auth.api.adminListOAuthResources({ headers })).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      auth.api.adminGetOAuthResource({ headers, params: { identifier } }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      auth.api.adminDeleteOAuthResource({ headers, params: { identifier } }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("los recursos por HTTP no existen", async () => {
    const person = await seedPerson();
    const cookie = await signInCookie(person.email);
    const identifier = encodeURIComponent(mcpResourceUrl());

    for (const response of [
      await authGet("/admin/oauth2/resources", cookie),
      await authGet(`/admin/oauth2/resources/${identifier}`, cookie),
      await browserPostJson(
        "/admin/oauth2/resources",
        { identifier: "https://otro.example" },
        cookie,
      ),
    ]) {
      expect(response.status).toBe(404);
    }
  });

  it("un pedido de token con client_credentials se rechaza", async () => {
    const client = await registeredClient(registrations.chatgpt());

    const response = await tokenRequest({
      grant_type: "client_credentials",
      client_id: client.clientId,
      client_secret: client.clientSecret ?? "",
      resource: mcpResourceUrl(),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported_grant_type" });
  });
});

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership, oauthConsent } from "@/server/db/schema";
import { seedMember, seedWorkspace } from "@/test/factories";
import {
  appOrigin,
  authorize,
  pkcePair,
  registeredClient,
  registrations,
  signInCookie,
  signedQueryOf,
} from "@/test/mcp";
import { restoreEnv } from "@/test/mcp-env";
import { grantRowsOf, seedGrant, seedOAuthClient } from "@/test/oauth-grants";
import { auditFor } from "@/test/queries";

import { mcpMessages } from "./schema";

/**
 * Las actions del módulo con las puertas de Next reemplazadas y Better Auth de
 * verdad: la sesión sale de la cookie de la sesión de prueba, como en el
 * navegador, y el consentimiento llega al plugin.
 */
const savedEnv = await vi.hoisted(async () => {
  const { MCP_ON_ENV, replaceEnv } = await import("@/test/mcp-env");
  return replaceEnv(MCP_ON_ENV);
});

const mocks = vi.hoisted(() => ({
  cookie: null as string | null,
  revalidated: [] as string[],
  redirects: [] as string[],
}));

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      mocks.cookie === null ? {} : { cookie: mocks.cookie, origin: appOrigin() },
    ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    mocks.revalidated.push(path);
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirects.push(path);
    throw new RedirectError(path);
  },
}));

const actions = await import("./actions");

afterAll(() => {
  restoreEnv(savedEnv);
});

beforeEach(() => {
  mocks.cookie = null;
  mocks.revalidated.length = 0;
  mocks.redirects.length = 0;
});

/** Una persona con membresía activa y su sesión de prueba puesta en la cookie del pedido. */
async function signIn() {
  const seeded = await seedWorkspace();
  const email = `${randomUUID()}@empresa.com`;
  const userId = await seedMember(seeded.workspaceId, "member", "active", { email });
  mocks.cookie = await signInCookie(email);
  return { userId, email };
}

async function deactivateBySql(userId: string) {
  await db
    .update(membership)
    .set({ status: "inactive" })
    .where(eq(membership.userId, userId));
}

/** La consulta firmada con que el plugin manda a `/conectar`, con la cookie del pedido. */
async function signedConsentQuery(): Promise<string> {
  const client = await registeredClient(registrations.claudeCode());
  const { challenge } = pkcePair();
  const response = await authorize(
    { clientId: client.clientId, redirectUri: client.redirectUri, challenge },
    mocks.cookie ?? undefined,
  );
  return signedQueryOf(response);
}

describe("sin sesión", () => {
  it("las dos mandan a /login sin escribir", async () => {
    const client = await seedOAuthClient();

    await expect(actions.revokeGrant({ clientId: client })).rejects.toBeInstanceOf(
      RedirectError,
    );
    await expect(
      actions.decideConsent({ oauthQuery: "client_id=x&sig=y", accept: true }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(mocks.redirects).toEqual(["/login", "/login"]);
    expect(await auditFor("oauth_client")).toEqual([]);
  });
});

describe("revokeGrant", () => {
  it("desconecta, responde el cliente y revalida /perfil", async () => {
    const { userId } = await signIn();
    const client = await seedOAuthClient();
    await seedGrant(userId, client);

    const result = await actions.revokeGrant({ clientId: client });

    expect(result).toEqual({ ok: true, data: { clientId: client } });
    expect(await grantRowsOf(userId)).toEqual({ consents: 0, refresh: 0, access: 0 });
    expect(mocks.revalidated).toEqual(["/perfil"]);
  });

  it("con la membresía inactiva responde forbidden con su texto, sin borrar", async () => {
    const { userId } = await signIn();
    const client = await seedOAuthClient();
    await seedGrant(userId, client);
    await deactivateBySql(userId);

    const result = await actions.revokeGrant({ clientId: client });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: mcpMessages.grantForbidden,
    });
    expect(await grantRowsOf(userId)).toEqual({ consents: 1, refresh: 1, access: 1 });
  });

  it("un clientId vacío responde validation", async () => {
    await signIn();

    expect(await actions.revokeGrant({ clientId: "" })).toMatchObject({
      ok: false,
      code: "validation",
    });
  });
});

describe("decideConsent", () => {
  it("Conectar devuelve el callback con el código y deja el consentimiento", async () => {
    const { userId } = await signIn();
    const oauthQuery = await signedConsentQuery();

    const result = await actions.decideConsent({ oauthQuery, accept: true });

    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(new URL(result.data.redirectTo).searchParams.get("code")).not.toBeNull();
    expect(
      await db.select().from(oauthConsent).where(eq(oauthConsent.userId, userId)),
    ).toHaveLength(1);
    expect(mocks.revalidated).toEqual([]);
  });

  it("Cancelar devuelve access_denied sin consentimiento", async () => {
    const { userId } = await signIn();
    const oauthQuery = await signedConsentQuery();

    const result = await actions.decideConsent({ oauthQuery, accept: false });

    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(new URL(result.data.redirectTo).searchParams.get("error")).toBe(
      "access_denied",
    );
    expect(await grantRowsOf(userId)).toEqual({ consents: 0, refresh: 0, access: 0 });
  });

  it("sin mcp.connect, Conectar responde forbidden y Cancelar sigue", async () => {
    const { userId } = await signIn();
    const oauthQuery = await signedConsentQuery();
    await deactivateBySql(userId);

    const accept = await actions.decideConsent({ oauthQuery, accept: true });
    const cancel = await actions.decideConsent({ oauthQuery, accept: false });

    expect(accept).toEqual({
      ok: false,
      code: "forbidden",
      message: mcpMessages.consentForbidden,
    });
    expect(cancel.ok).toBe(true);
    expect(await grantRowsOf(userId)).toEqual({ consents: 0, refresh: 0, access: 0 });
  });

  it("una consulta alterada responde consent_expired con su texto", async () => {
    await signIn();
    const oauthQuery = (await signedConsentQuery()).replace(/sig=[^&]+/, "sig=alterada");

    expect(await actions.decideConsent({ oauthQuery, accept: true })).toEqual({
      ok: false,
      code: "consent_expired",
      message: mcpMessages.consentExpired,
    });
  });
});

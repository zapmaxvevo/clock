import { randomUUID } from "node:crypto";

import { handleOAuthUserInfo } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { account, session, user } from "@/server/db/schema";
import { seedUser } from "@/test/factories";

/**
 * El handler real de Better Auth. La sesión de prueba se habilita antes de
 * importarlo para entrar con una cookie válida: así el 404 no puede venir de
 * que falte la sesión.
 */
const secret = "un-secreto-de-prueba-de-al-menos-32-caracteres";
const original = {
  allow: process.env.ALLOW_TEST_SESSION,
  secret: process.env.E2E_TEST_SESSION_SECRET,
};
process.env.ALLOW_TEST_SESSION = "true";
process.env.E2E_TEST_SESSION_SECRET = secret;
const { auth } = await import("./auth");

afterAll(() => {
  for (const [name, value] of [
    ["ALLOW_TEST_SESSION", original.allow],
    ["E2E_TEST_SESSION_SECRET", original.secret],
  ] as const) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/** Entra con la sesión de prueba y devuelve la cookie y el id de la persona. */
async function signIn() {
  const response = await post(
    "/test-session/sign-in",
    { email: "ana@empresa.com", name: "Ana López" },
    { "x-test-session": secret },
  );
  expect(response.status).toBe(200);
  const { userId } = (await response.json()) as { userId: string };
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { userId, cookie };
}

describe("la identidad no se edita por la API de Better Auth (PF-09)", () => {
  it("/update-user responde 404 a una sesión válida y no cambia el nombre ni la foto", async () => {
    const { userId, cookie } = await signIn();

    const response = await post(
      "/update-user",
      { name: "Otro nombre", image: "https://example.com/foto.png" },
      { cookie },
    );

    expect(response.status).toBe(404);
    const [row] = await db
      .select({ name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, userId));
    expect(row).toEqual({ name: "Ana López", image: null });
  });
});

async function userRow(id: string) {
  const [row] = await db
    .select({ name: user.name, email: user.email, image: user.image })
    .from(user)
    .where(eq(user.id, id));
  return row;
}

describe("el ingreso por Google actualiza el nombre y la foto, nunca el correo (criterio 7: PF-06, PF-45)", () => {
  it("overrideUserInfoOnSignIn está puesto en el proveedor de Google, donde lo lee el callback", async () => {
    const context = await auth.$context;
    const google = context.socialProviders.find((provider) => provider.id === "google");
    expect(google?.options?.overrideUserInfoOnSignIn).toBe(true);
  });

  it("updateUser con otro correo cambia el nombre y la foto y conserva el correo", async () => {
    const email = `${randomUUID()}@empresa.com`;
    const id = await seedUser(email);
    const { internalAdapter } = await auth.$context;

    await internalAdapter.updateUser(id, {
      name: "Nombre de Google",
      image: "https://lh3.googleusercontent.com/a/nueva",
      email: `${randomUUID()}@empresa.com`,
    });

    expect(await userRow(id)).toEqual({
      name: "Nombre de Google",
      email,
      image: "https://lh3.googleusercontent.com/a/nueva",
    });
  });
});

describe("una cuenta de Google se enlaza solo a la fila que creó (criterio 16)", () => {
  /** El `userInfo` y la cuenta como los arma el callback de Google para ese `sub`. */
  function googleSignIn(sub: string, email: string) {
    return {
      userInfo: {
        id: sub,
        email,
        emailVerified: true,
        name: "Nombre de Google",
        image: "https://lh3.googleusercontent.com/a/nueva",
      },
      account: { providerId: "google", accountId: sub },
      // Como lo pasa el callback con `overrideUserInfoOnSignIn` (`callback.mjs:182`).
      overrideUserInfo: true,
    };
  }

  async function seedGoogleAccount(userId: string, sub: string) {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: sub,
      providerId: "google",
      userId,
      updatedAt: new Date(),
    });
  }

  async function accountsOf(userId: string) {
    const rows = await db
      .select({ accountId: account.accountId })
      .from(account)
      .where(eq(account.userId, userId));
    return rows.map((row) => row.accountId);
  }

  /**
   * `handleOAuthUserInfo` solo lee `c.context`, y fuera de un pedido el de
   * `auth` alcanza. El tipo de `auth.$context` lleva las opciones exactas de
   * `auth.ts` y la función pide el de `BetterAuthOptions` en general.
   */
  async function endpointContext() {
    const context = await auth.$context;
    return { context } as unknown as Parameters<typeof handleOAuthUserInfo>[0];
  }

  async function sessionsOf(userId: string) {
    return db.select().from(session).where(eq(session.userId, userId));
  }

  it("un sub nuevo con el correo de una fila existente no se enlaza ni entra", async () => {
    const email = `${randomUUID()}@empresa.com`;
    const id = await seedUser(email);
    const originalSub = randomUUID();
    await seedGoogleAccount(id, originalSub);
    const newSub = randomUUID();

    const result = await handleOAuthUserInfo(
      await endpointContext(),
      googleSignIn(newSub, email),
    );

    expect(result).toMatchObject({ error: "account not linked", data: null });
    expect(await db.select().from(account).where(eq(account.accountId, newSub))).toEqual(
      [],
    );
    expect(await accountsOf(id)).toEqual([originalSub]);
    expect(await sessionsOf(id)).toEqual([]);
    expect(await userRow(id)).toEqual({ name: "Persona de prueba", email, image: null });
  });

  it("la cuenta que creó la fila entra con el correo de otra fila: cambia el nombre y la foto y conserva el correo", async () => {
    const email = `${randomUUID()}@empresa.com`;
    const id = await seedUser(email);
    const sub = randomUUID();
    await seedGoogleAccount(id, sub);
    const otherEmail = `${randomUUID()}@empresa.com`;
    await seedUser(otherEmail);

    const result = await handleOAuthUserInfo(
      await endpointContext(),
      googleSignIn(sub, otherEmail),
    );

    expect(result.error).toBeNull();
    expect(result.data?.session.userId).toBe(id);
    expect(await sessionsOf(id)).toHaveLength(1);
    expect(await userRow(id)).toEqual({
      name: "Nombre de Google",
      email,
      image: "https://lh3.googleusercontent.com/a/nueva",
    });
    expect(await accountsOf(id)).toEqual([sub]);
  });
});

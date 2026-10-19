import { randomUUID } from "node:crypto";

import { handleOAuthUserInfo } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { workspaceRepository } from "@/modules/workspace/repository";
import { db } from "@/server/db";
import { account, membership, session, user } from "@/server/db/schema";
import { queueBehindBarrier } from "@/test/concurrency";
import {
  seedAccount,
  seedInvitation,
  seedMember,
  seedUser,
  seedWorkspace,
} from "@/test/factories";

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

/** Una persona con ese correo y su membresía en un workspace nuevo: lo que el ingreso pide. */
async function seedPerson(email: string): Promise<string> {
  const { workspaceId } = await seedWorkspace();
  return seedMember(workspaceId, "member", "active", { email });
}

function testSessionSignIn(email: string) {
  return post(
    "/test-session/sign-in",
    { email, name: "Ana López" },
    { "x-test-session": secret },
  );
}

/**
 * Entra con la sesión de prueba y devuelve la cookie y el id de la persona.
 * Siembra el workspace y la membresía: sin ellos, el gancho la rechaza (D-E1b-8).
 */
async function signIn() {
  await seedPerson("ana@empresa.com");
  const response = await testSessionSignIn("ana@empresa.com");
  expect(response.status).toBe(200);
  const { userId } = (await response.json()) as { userId: string };
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { userId, cookie };
}

describe("la sesión de prueba pasa por el gancho (D-E1b-8, criterio 16)", () => {
  it("una persona del dominio sin membresía ni invitación recibe 403 y no queda sesión", async () => {
    await seedWorkspace();

    const response = await testSessionSignIn("nadie@empresa.com");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "sin_invitacion" });
    expect(await db.select().from(session)).toEqual([]);
  });
});

describe("el ingreso por id_token del cliente está apagado", () => {
  it("/sign-in/social con un idToken responde 404 sin crear nada", async () => {
    await seedWorkspace();

    const response = await post("/sign-in/social", {
      provider: "google",
      idToken: { token: "cabecera.cuerpo.firma" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "ID_TOKEN_NOT_SUPPORTED" });
    expect(await db.select().from(session)).toEqual([]);
  });
});

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
    // El de la fila sembrada: la sesión de prueba no reescribe una que ya existe.
    expect(row).toEqual({ name: "Persona de prueba", image: null });
  });
});

describe("las cuentas no se enlazan ni se desenlazan por la API de Better Auth (S2)", () => {
  async function accountIdsOf(userId: string) {
    const rows = await db
      .select({ accountId: account.accountId })
      .from(account)
      .where(eq(account.userId, userId));
    return rows.map((row) => row.accountId).sort();
  }

  it("/link-social responde 404 a una sesión válida y no empieza ningún enlace", async () => {
    const { userId, cookie } = await signIn();

    const response = await post(
      "/link-social",
      { provider: "google", callbackURL: "/" },
      { cookie },
    );

    expect(response.status).toBe(404);
    expect(await accountIdsOf(userId)).toEqual([]);
  });

  it("/unlink-account responde 404 a una sesión válida y no quita la cuenta", async () => {
    const { userId, cookie } = await signIn();
    // Dos cuentas: con una sola, Better Auth rechazaría el pedido por ser la última.
    const subs = [randomUUID(), randomUUID()].sort();
    for (const sub of subs) {
      await db.insert(account).values({
        id: randomUUID(),
        accountId: sub,
        providerId: "google",
        userId,
        updatedAt: new Date(),
      });
    }

    const response = await post(
      "/unlink-account",
      { providerId: "google", accountId: subs[0] },
      { cookie },
    );

    expect(response.status).toBe(404);
    expect(await accountIdsOf(userId)).toEqual(subs);
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
    const id = await seedPerson(email);
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
    // El gancho decide con el correo guardado, que tiene membresía.
    const id = await seedPerson(email);
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

describe("el callback de Google termina en /login con el motivo (criterio 25, D-E1a-14)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** La parte `nombre=valor` de cada `set-cookie`, como la manda el navegador. */
  function cookiesOf(response: Response): string {
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }

  function base64url(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  /**
   * Un `id_token` sin firmar: el callback lo decodifica sin verificar la firma
   * (`google.mjs:119`). Si una versión nueva la verifica, este test falla.
   */
  function idToken(claims: Record<string, unknown>): string {
    const now = Math.floor(Date.now() / 1000);
    return [
      base64url({ alg: "RS256", typ: "JWT", kid: "prueba" }),
      base64url({
        iss: "https://accounts.google.com",
        aud: process.env.GOOGLE_CLIENT_ID,
        iat: now,
        exp: now + 3600,
        email_verified: true,
        name: "Nombre de Google",
        ...claims,
      }),
      "firma",
    ].join(".");
  }

  /**
   * El recorrido entero por `auth.handler`: el pedido de ingreso, y el callback
   * con el `state` y la cookie que dejó, con el endpoint de token de Google
   * simulado. Es el único I/O externo del camino.
   */
  async function signInWithGoogle(claims: { email: string; sub: string; hd?: string }) {
    const started = await post("/sign-in/social", {
      provider: "google",
      callbackURL: "/",
    });
    expect(started.status).toBe(200);
    const { url } = (await started.json()) as { url: string };
    const authorization = new URL(url);
    const state = authorization.searchParams.get("state");
    const nonce = authorization.searchParams.get("nonce");
    expect(state).not.toBeNull();

    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const target = input instanceof Request ? input.url : String(input);
      if (!target.startsWith("https://oauth2.googleapis.com/token")) {
        return realFetch(input, init);
      }
      return Response.json({
        access_token: "token-de-prueba",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid email profile",
        id_token: idToken({ ...claims, ...(nonce === null ? {} : { nonce }) }),
      });
    });

    return auth.handler(
      new Request(
        `${origin}/api/auth/callback/google?code=codigo&state=${encodeURIComponent(state ?? "")}`,
        { headers: { cookie: cookiesOf(started) } },
      ),
    );
  }

  function deniedLocation(reason: string) {
    return `${new URL("/login", origin).toString()}?error=${reason}`;
  }

  async function usersWith(email: string) {
    return db.select({ id: user.id }).from(user).where(eq(user.email, email));
  }

  async function sessionsWith(email: string) {
    const [created] = await usersWith(email);
    return db.select().from(session).where(eq(session.userId, created.id));
  }

  it("un externo sin invitación recibe 302 a /login con sin_invitacion y no queda fila user", async () => {
    await seedWorkspace();
    const email = `${randomUUID()}@gmail.com`;

    const response = await signInWithGoogle({ email, sub: randomUUID() });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(deniedLocation("sin_invitacion"));
    expect(await usersWith(email)).toEqual([]);
  });

  it("un correo del dominio con hd y sin invitación recibe lo mismo (criterio 1)", async () => {
    await seedWorkspace();
    const email = `${randomUUID()}@empresa.com`;

    const response = await signInWithGoogle({
      email,
      sub: randomUUID(),
      hd: "empresa.com",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(deniedLocation("sin_invitacion"));
    expect(await usersWith(email)).toEqual([]);
  });

  it("un correo del dominio con hd e invitación pendiente recibe 302 a / con la cookie", async () => {
    const { workspaceId } = await seedWorkspace();
    const email = `${randomUUID()}@empresa.com`;
    await seedInvitation({ workspaceId, email });

    const response = await signInWithGoogle({
      email,
      sub: randomUUID(),
      hd: "empresa.com",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(cookiesOf(response)).toMatch(/better-auth\.session_token=/);
    expect(await sessionsWith(email)).toHaveLength(1);
  });

  it("un correo del dominio sin hd, con invitación, recibe dominio_no_habilitado (criterio 5)", async () => {
    const { workspaceId } = await seedWorkspace();
    const email = `${randomUUID()}@empresa.com`;
    await seedInvitation({ workspaceId, email });

    const response = await signInWithGoogle({ email, sub: randomUUID() });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      deniedLocation("dominio_no_habilitado"),
    );
    expect(await usersWith(email)).toEqual([]);
  });

  it("el rechazo del gancho de sesión recibe 302 a /login con sin_invitacion, con user y account y sin sesión (criterio 14)", async () => {
    const { workspaceId } = await seedWorkspace();
    const email = `${randomUUID()}@gmail.com`;
    const sub = randomUUID();
    // Invitada al pasar `mapProfileToUser`, revocada al llegar al gancho.
    vi.spyOn(workspaceRepository, "entryFacts")
      .mockResolvedValueOnce({ workspaceId, invitation: "pending", membership: null })
      .mockResolvedValueOnce({ workspaceId, invitation: "revoked", membership: null });

    const response = await signInWithGoogle({ email, sub });

    expect(response.status).toBe(302);
    // El callback suma `error_description`, que `/login` no muestra.
    const location = new URL(response.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(
      new URL("/login", origin).toString(),
    );
    expect(location.searchParams.get("error")).toBe("sin_invitacion");
    const [created] = await usersWith(email);
    expect(created).toBeDefined();
    expect(
      await db.select().from(account).where(eq(account.accountId, sub)),
    ).toHaveLength(1);
    expect(await sessionsWith(email)).toEqual([]);
  });

  /** Una persona del dominio con su membresía en el estado pedido y su cuenta de Google. */
  async function seedGooglePerson(status: "active" | "inactive") {
    const { workspaceId } = await seedWorkspace();
    const email = `${randomUUID()}@empresa.com`;
    const id = await seedMember(workspaceId, "member", status, { email });
    const sub = await seedAccount(id);
    return { id, email, sub };
  }

  it("una persona del dominio con cuenta y la membresía inactiva recibe 302 a /login con membresia_inactiva, sin sesión (criterio 10)", async () => {
    const person = await seedGooglePerson("inactive");

    const response = await signInWithGoogle({
      email: person.email,
      sub: person.sub,
      hd: "empresa.com",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(deniedLocation("membresia_inactiva"));
    expect(await sessionsWith(person.email)).toEqual([]);
  });

  it("el gancho de sesión rechaza con membresia_inactiva si la membresía se desactivó después de mapProfileToUser (criterio 10)", async () => {
    const person = await seedGooglePerson("active");
    // `mapProfileToUser` lee la membresía activa; antes del gancho, pasa a inactiva.
    const entryFacts = workspaceRepository.entryFacts.bind(workspaceRepository);
    vi.spyOn(workspaceRepository, "entryFacts").mockImplementationOnce(async (email) => {
      const facts = await entryFacts(email);
      await db
        .update(membership)
        .set({ status: "inactive" })
        .where(eq(membership.userId, person.id));
      return facts;
    });

    const response = await signInWithGoogle({
      email: person.email,
      sub: person.sub,
      hd: "empresa.com",
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(
      new URL("/login", origin).toString(),
    );
    expect(location.searchParams.get("error")).toBe("membresia_inactiva");
    expect(await sessionsWith(person.email)).toEqual([]);
  });

  it("un externo invitado recibe 302 a / con la cookie de sesión", async () => {
    const { workspaceId } = await seedWorkspace();
    const email = `${randomUUID()}@gmail.com`;
    await seedInvitation({ workspaceId, email });

    const response = await signInWithGoogle({ email, sub: randomUUID() });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(cookiesOf(response)).toMatch(/better-auth\.session_token=/);
    expect(await sessionsWith(email)).toHaveLength(1);
  });
});

describe("el gancho session.create.after cierra la carrera con una desactivación (D-E2-2, criterio 26)", () => {
  it("la sesión que pasó el before con la membresía activa se borra cuando la desactivación confirma", async () => {
    const email = `${randomUUID()}@empresa.com`;
    const personId = await seedPerson(email);
    const ofPerson = eq(membership.userId, personId);

    const [deactivation, signInAttempt] = await queueBehindBarrier(
      // La barrera solo bloquea, como una desactivación en curso: se suelta con
      // `rollback`, así que lo que tiene que confirmar no puede escribirlo ella.
      (tx) => tx.select().from(membership).where(ofPerson).for("no key update"),
      [
        // Confirma solo. No es `changeStatus`: su `delete from session` correría
        // después de abrir la barrera y vería la sesión ya insertada, y el test
        // pasaría sin el gancho.
        () =>
          db.transaction(async (tx) => {
            await tx.update(membership).set({ status: "inactive" }).where(ofPerson);
          }),
        // Pasa el `before` con lo confirmado —activa—, inserta la sesión y queda
        // en el `for share` del `after`, en la cola detrás de la desactivación.
        () => testSessionSignIn(email),
      ],
    );

    expect([deactivation.status, signInAttempt.status]).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    // El ingreso no se entera: responde con la cookie de una sesión que ya no está.
    expect((signInAttempt as PromiseFulfilledResult<Response>).value.status).toBe(200);
    const [row] = await db
      .select({ status: membership.status })
      .from(membership)
      .where(ofPerson);
    expect(row.status).toBe("inactive");
    expect(await db.select().from(session).where(eq(session.userId, personId))).toEqual(
      [],
    );
  });
});

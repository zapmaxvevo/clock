import { randomUUID } from "node:crypto";

import { handleOAuthUserInfo } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { sql } from "drizzle-orm";

import { changeStatus, releaseEmail, setAccountLink } from "@/modules/team/service";
import { workspaceRepository } from "@/modules/workspace/repository";
import { inviteMembers } from "@/modules/workspace/service";
import * as authRecords from "@/server/auth-records";
import { releasedEmailOf } from "@/lib/email";
import { db } from "@/server/db";
import {
  account,
  auditLog,
  invitation,
  membership,
  session,
  timeEntry,
  user,
} from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import {
  fulfilledValue,
  holdBarrier,
  queueBehindBarrier,
  waitForBlockedBackends,
} from "@/test/concurrency";
import {
  seedAccount,
  seedAccountLink,
  seedInvitation,
  seedMember,
  seedSession,
  seedTimeEntry,
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
      await seedAccount(userId, sub);
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
    await seedAccount(id, originalSub);
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
    await seedAccount(id, sub);
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
 * (`decodeJwt` en `getUserInfo` de `google.mjs`). Si una versión nueva la
 * verifica, este test falla.
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
 * El `id_token` que responde el endpoint de token simulado para cada `code`. Lo
 * llena `signInWithGoogle` y se vacía después de cada test.
 */
const idTokensByCode = new Map<string, string>();

afterEach(() => {
  vi.restoreAllMocks();
  idTokensByCode.clear();
});

/**
 * Un solo reemplazo de `fetch` por test, que responde el `id_token` según el
 * `code` del pedido al endpoint de token: dos ingresos a la vez no se pisan
 * (§9.2 de E2b). Es el único I/O externo del camino.
 */
function mockGoogleTokenEndpoint() {
  if (vi.isMockFunction(globalThis.fetch)) {
    return;
  }
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target = input instanceof Request ? input.url : String(input);
    if (!target.startsWith("https://oauth2.googleapis.com/token")) {
      return realFetch(input, init);
    }
    const code = new URLSearchParams(String(init?.body ?? "")).get("code") ?? "";
    const token = idTokensByCode.get(code);
    if (token === undefined) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    return Response.json({
      access_token: "token-de-prueba",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email profile",
      id_token: token,
    });
  });
}

/**
 * El recorrido entero por `auth.handler`: el pedido de ingreso, y el callback
 * con el `state` y la cookie que dejó, con su propio `code`.
 */
async function signInWithGoogle(claims: {
  readonly email: string;
  readonly sub: string;
  readonly hd?: string;
  readonly email_verified?: boolean;
}) {
  mockGoogleTokenEndpoint();
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
  const code = randomUUID();
  idTokensByCode.set(code, idToken({ ...claims, ...(nonce === null ? {} : { nonce }) }));

  return auth.handler(
    new Request(
      `${origin}/api/auth/callback/google?code=${code}&state=${encodeURIComponent(state ?? "")}`,
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

describe("el callback de Google termina en /login con el motivo (criterio 25, D-E1a-14)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      .mockResolvedValueOnce({
        workspaceId,
        invitation: "pending",
        membership: null,
        accountLink: false,
      })
      .mockResolvedValueOnce({
        workspaceId,
        invitation: "revoked",
        membership: null,
        accountLink: false,
      });

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
    vi.spyOn(workspaceRepository, "entryFacts").mockImplementationOnce(
      async (email, linkTtlDays) => {
        const facts = await entryFacts(email, linkTtlDays);
        await db
          .update(membership)
          .set({ status: "inactive" })
          .where(eq(membership.userId, person.id));
        return facts;
      },
    );

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
    const response = fulfilledValue(signInAttempt);
    expect(response instanceof Response && response.status).toBe(200);
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

describe("la vinculación por el callback de Google (E2b, D-E2b-3)", () => {
  /** Una persona en el workspace del ingreso, con o sin cuenta, y la membresía. */
  async function seedLinkable(
    options: {
      readonly role?: "member" | "admin";
      readonly status?: "active" | "inactive";
      readonly email?: string;
      readonly withAccount?: boolean;
    } = {},
  ) {
    const { workspaceId, ownerId } = await seedWorkspace();
    const email = options.email ?? `${randomUUID()}@empresa.com`;
    const userId = await seedMember(
      workspaceId,
      options.role ?? "member",
      options.status ?? "active",
      { email },
    );
    const sub = options.withAccount === true ? await seedAccount(userId) : null;
    const [row] = await db.select().from(membership).where(eq(membership.userId, userId));
    const owner: Actor = {
      userId: ownerId,
      workspaceId,
      role: "owner",
      status: "active",
    };
    return { workspaceId, ownerId, owner, userId, email, sub, membershipId: row.id };
  }

  const hd = (email: string) =>
    email.endsWith("@empresa.com") ? "empresa.com" : undefined;

  function signInAs(email: string, sub: string) {
    return signInWithGoogle({ email, sub, hd: hd(email) });
  }

  async function accountIdsOf(userId: string) {
    const rows = await db
      .select({ accountId: account.accountId })
      .from(account)
      .where(eq(account.userId, userId));
    return rows.map((row) => row.accountId);
  }

  async function sessionUsersOf(userId: string) {
    return db.select().from(session).where(eq(session.userId, userId));
  }

  async function markOf(membershipId: string) {
    const [row] = await db
      .select({
        requestedAt: membership.accountLinkRequestedAt,
        requestedById: membership.accountLinkRequestedById,
      })
      .from(membership)
      .where(eq(membership.id, membershipId));
    return row;
  }

  async function auditActions() {
    const rows = await db
      .select({
        actorId: auditLog.actorId,
        action: auditLog.action,
        entityId: auditLog.entityId,
        previousValue: auditLog.previousValue,
        nextValue: auditLog.nextValue,
      })
      .from(auditLog);
    return rows.sort((left, right) => left.action.localeCompare(right.action));
  }

  it("la cuenta de siempre sigue entrando con una marca pedida, y la marca queda (criterio 1)", async () => {
    const person = await seedLinkable({ withAccount: true });
    await setAccountLink(person.owner, { membershipId: person.membershipId, link: true });
    const mark = await markOf(person.membershipId);

    const response = await signInAs(person.email, person.sub ?? "");

    expect([response.status, response.headers.get("location")]).toEqual([302, "/"]);
    expect(await accountIdsOf(person.userId)).toEqual([person.sub]);
    expect(await markOf(person.membershipId)).toEqual(mark);
  });

  it("un sub nuevo con una marca vigente entra a la fila: una sola cuenta, sin sesiones viejas, la marca limpia y sus constancias (criterio 2)", async () => {
    const person = await seedLinkable({ withAccount: true });
    const oldSession = await seedSession(person.userId);
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const newSub = randomUUID();

    const response = await signInAs(person.email, newSub);

    expect([response.status, response.headers.get("location")]).toEqual([302, "/"]);
    expect(cookiesOf(response)).toMatch(/better-auth\.session_token=/);
    expect(await accountIdsOf(person.userId)).toEqual([newSub]);
    const sessions = await sessionUsersOf(person.userId);
    expect(sessions.map((row) => row.id)).not.toContain(oldSession);
    expect(sessions).toHaveLength(1);
    expect(await markOf(person.membershipId)).toEqual({
      requestedAt: null,
      requestedById: null,
    });
    expect(await auditActions()).toEqual([
      {
        actorId: person.userId,
        action: "account.link",
        entityId: person.userId,
        previousValue: JSON.stringify({ accounts: 1 }),
        nextValue: null,
      },
      {
        actorId: person.userId,
        action: "membership.linkUse",
        entityId: person.membershipId,
        previousValue: null,
        nextValue: JSON.stringify({ requestedById: person.ownerId }),
      },
      {
        actorId: person.userId,
        action: "session.revokeAll",
        entityId: person.userId,
        previousValue: JSON.stringify({ sessions: 1 }),
        nextValue: null,
      },
    ]);
    const [stored] = await db.select().from(user).where(eq(user.id, person.userId));
    expect(stored.email).toBe(person.email);
  });

  it("la regla va primero: sin hd o sin verificar no vincula y la marca queda (criterio 3)", async () => {
    const person = await seedLinkable();
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const mark = await markOf(person.membershipId);

    const withoutHd = await signInWithGoogle({ email: person.email, sub: randomUUID() });
    const unverified = await signInWithGoogle({
      email: person.email,
      sub: randomUUID(),
      hd: "empresa.com",
      email_verified: false,
    });

    expect([
      withoutHd.headers.get("location"),
      unverified.headers.get("location"),
    ]).toEqual([
      deniedLocation("dominio_no_habilitado"),
      deniedLocation("email_no_verificado"),
    ]);
    expect(await db.select().from(account)).toEqual([]);
    expect(await markOf(person.membershipId)).toEqual(mark);
  });

  it("reactivar sin cuenta deja entrar a un sub cualquiera con ese correo, con sus entradas (criterio 4)", async () => {
    const person = await seedLinkable({ role: "admin", status: "inactive" });
    await seedTimeEntry({
      workspaceId: person.workspaceId,
      userId: person.userId,
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await changeStatus(person.owner, {
      membershipId: person.membershipId,
      status: "active",
    });
    const sub = randomUUID();

    const response = await signInAs(person.email, sub);

    expect([response.status, response.headers.get("location")]).toEqual([302, "/"]);
    expect(await accountIdsOf(person.userId)).toEqual([sub]);
    expect(await sessionUsersOf(person.userId)).toHaveLength(1);
    expect(await usersWith(person.email)).toEqual([{ id: person.userId }]);
    expect(
      await db.select().from(timeEntry).where(eq(timeEntry.userId, person.userId)),
    ).toHaveLength(1);
  });

  it.each([
    ["una activa sin cuenta y sin marca", false],
    ["una activa con cuenta y sin marca", true],
  ])(
    "%s con un sub nuevo termina en account_not_linked, sin cuenta ni sesión nuevas (criterio 5)",
    async (_label, withAccount) => {
      const person = await seedLinkable({ withAccount });
      const before = await accountIdsOf(person.userId);

      const response = await signInAs(person.email, randomUUID());

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.searchParams.get("error")).toBe("account_not_linked");
      expect(await accountIdsOf(person.userId)).toEqual(before);
      expect(await sessionUsersOf(person.userId)).toEqual([]);
    },
  );

  it("una marca de hace ocho días no se usa y queda; una de hace seis se usa (criterio 6)", async () => {
    const expired = await seedLinkable();
    await seedAccountLink(expired.membershipId, expired.ownerId, "8 days");
    const mark = await markOf(expired.membershipId);

    const denied = await signInAs(expired.email, randomUUID());

    expect(new URL(denied.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "account_not_linked",
    );
    expect(await accountIdsOf(expired.userId)).toEqual([]);
    expect(await markOf(expired.membershipId)).toEqual(mark);

    await db
      .update(membership)
      .set({
        accountLinkRequestedAt: sql`now() - interval '6 days'`,
      })
      .where(eq(membership.id, expired.membershipId));
    const sub = randomUUID();
    const allowed = await signInAs(expired.email, sub);

    expect([allowed.status, allowed.headers.get("location")]).toEqual([302, "/"]);
    expect(await accountIdsOf(expired.userId)).toEqual([sub]);
  });

  it("una marca que vence mientras el ingreso espera el bloqueo no se usa (criterio 6)", async () => {
    const person = await seedLinkable();
    await seedAccountLink(person.membershipId, person.ownerId, "7 days -5 seconds");
    const mark = await markOf(person.membershipId);
    const ofPerson = eq(membership.id, person.membershipId);

    // La barrera toma la membresía sin escribir, como una desactivación en curso.
    const barrier = await holdBarrier((tx) =>
      tx.select().from(membership).where(ofPerson).for("no key update"),
    );
    const signIn = signInAs(person.email, randomUUID());
    try {
      await waitForBlockedBackends({ count: 1 });
      // Se suelta recién cuando la marca venció, sin una espera fija.
      const deadline = Date.now() + 10_000;
      for (;;) {
        const result = await db.execute<{ expired: boolean }>(sql`
          select account_link_requested_at <= clock_timestamp() - interval '7 days' as expired
          from membership where id = ${person.membershipId}
        `);
        if (result.rows[0]?.expired === true) {
          break;
        }
        if (Date.now() > deadline) {
          throw new Error("La marca no venció a tiempo.");
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally {
      await barrier.open();
    }
    const response = await signIn;

    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get("error"),
    ).toBe("account_not_linked");
    expect(await db.select().from(account)).toEqual([]);
    expect(await markOf(person.membershipId)).toEqual(mark);
  });

  it("un sub con cuenta no se vincula: el de la fila entra y la marca queda; el de otra fila no se inserta (criterio 12)", async () => {
    const person = await seedLinkable({ withAccount: true });
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const mark = await markOf(person.membershipId);
    const otherId = await seedMember(person.workspaceId, "member", "active");
    const otherSub = await seedAccount(otherId);

    const own = await signInAs(person.email, person.sub ?? "");
    const foreign = await signInAs(person.email, otherSub);

    expect([own.headers.get("location"), foreign.headers.get("location")]).toEqual([
      "/",
      "/",
    ]);
    expect(await accountIdsOf(person.userId)).toEqual([person.sub]);
    expect(await accountIdsOf(otherId)).toEqual([otherSub]);
    expect(await markOf(person.membershipId)).toEqual(mark);
  });

  it("dos ingresos a la vez con dos sub: uno vincula y el otro termina en account_not_linked; queda una cuenta (criterio 13)", async () => {
    const person = await seedLinkable();
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const ofPerson = eq(membership.id, person.membershipId);

    const outcomes = await queueBehindBarrier(
      (tx) => tx.select().from(membership).where(ofPerson).for("no key update"),
      [
        () => signInAs(person.email, randomUUID()),
        () => signInAs(person.email, randomUUID()),
      ],
    );

    const responses = outcomes.map((outcome) => {
      const response = fulfilledValue(outcome);
      return response instanceof Response
        ? [response.status, response.headers.get("location")]
        : "sin respuesta";
    });
    expect(responses).toEqual([
      [302, "/"],
      [302, deniedLocation("account_not_linked")],
    ]);
    expect(await accountIdsOf(person.userId)).toHaveLength(1);
  });

  it("si la desactivación bloquea primero, el ingreso no vincula y termina en membresia_inactiva (criterio 14)", async () => {
    const person = await seedLinkable();
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const ofPerson = eq(membership.id, person.membershipId);

    const [deactivation, signIn] = await queueBehindBarrier(
      (tx) => tx.select().from(membership).where(ofPerson).for("no key update"),
      [
        () =>
          changeStatus(person.owner, {
            membershipId: person.membershipId,
            status: "inactive",
          }),
        () => signInAs(person.email, randomUUID()),
      ],
    );

    expect(deactivation.status).toBe("fulfilled");
    const response = fulfilledValue(signIn);
    expect(response instanceof Response && response.headers.get("location")).toBe(
      deniedLocation("membresia_inactiva"),
    );
    expect(await db.select().from(account)).toEqual([]);
    expect(await sessionUsersOf(person.userId)).toEqual([]);
  });

  it("si el ingreso bloquea primero, vincula; la desactivación espera y confirma, y la persona termina sin sesión (criterio 14)", async () => {
    const person = await seedLinkable();
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const ofPerson = eq(membership.id, person.membershipId);
    const sub = randomUUID();

    const [signIn, deactivation] = await queueBehindBarrier(
      (tx) => tx.select().from(membership).where(ofPerson).for("no key update"),
      [
        () => signInAs(person.email, sub),
        () =>
          changeStatus(person.owner, {
            membershipId: person.membershipId,
            status: "inactive",
          }),
      ],
    );

    expect([signIn.status, deactivation.status]).toEqual(["fulfilled", "fulfilled"]);
    expect(await accountIdsOf(person.userId)).toEqual([sub]);
    const [row] = await db
      .select({ status: membership.status })
      .from(membership)
      .where(ofPerson);
    expect(row.status).toBe("inactive");
    expect(await sessionUsersOf(person.userId)).toEqual([]);
  });

  it("un externo con la vinculación pedida queda registrado, entra por el callback y vincula (criterio 15)", async () => {
    const person = await seedLinkable({ email: `${randomUUID()}@gmail.com` });
    await setAccountLink(person.owner, { membershipId: person.membershipId, link: true });
    const sub = randomUUID();

    const response = await signInAs(person.email, sub);

    expect([response.status, response.headers.get("location")]).toEqual([302, "/"]);
    expect(await accountIdsOf(person.userId)).toEqual([sub]);
    const [registered] = await db
      .select({ status: invitation.status })
      .from(invitation)
      .where(eq(invitation.email, person.email));
    expect(registered.status).toBe("accepted");
  });

  it("un externo activo con cuenta y la invitación revocada entra con su cuenta apenas se pide la vinculación, y sigue después de cancelarla (criterio 15)", async () => {
    const person = await seedLinkable({
      email: `${randomUUID()}@gmail.com`,
      withAccount: true,
    });
    await seedInvitation({
      workspaceId: person.workspaceId,
      email: person.email,
      status: "revoked",
    });
    const sub = person.sub ?? "";

    const before = await signInAs(person.email, sub);
    await setAccountLink(person.owner, { membershipId: person.membershipId, link: true });
    const requested = await signInAs(person.email, sub);
    await setAccountLink(person.owner, {
      membershipId: person.membershipId,
      link: false,
    });
    const cancelled = await signInAs(person.email, sub);

    expect([
      before.headers.get("location"),
      requested.headers.get("location"),
      cancelled.headers.get("location"),
    ]).toEqual([deniedLocation("sin_invitacion"), "/", "/"]);
    const [registered] = await db
      .select({ status: invitation.status })
      .from(invitation)
      .where(eq(invitation.email, person.email));
    expect(registered.status).toBe("accepted");
  });

  it("el correo liberado se invita y entra otra persona con una fila nueva; la liberada no cambia (criterio 17)", async () => {
    const person = await seedLinkable({
      email: `${randomUUID()}@gmail.com`,
      status: "inactive",
      withAccount: true,
    });
    await releaseEmail(person.owner, { membershipId: person.membershipId });
    const invited = await inviteMembers(person.owner, { emails: [person.email] });
    expect(invited.outcomes.map((outcome) => outcome.result)).toEqual(["invited"]);

    const response = await signInAs(person.email, randomUUID());

    expect([response.status, response.headers.get("location")]).toEqual([302, "/"]);
    const users = await usersWith(person.email);
    expect(users).toHaveLength(1);
    expect(users[0]?.id).not.toBe(person.userId);
    const [released] = await db.select().from(user).where(eq(user.id, person.userId));
    expect(released.email).toBe(releasedEmailOf(person.userId));
    expect(await accountIdsOf(person.userId)).toEqual([]);
  });

  it("si la vinculación falla, el callback redirige a vinculacion_fallida sin escribir nada; el reintento vincula (criterio 21)", async () => {
    const person = await seedLinkable();
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const mark = await markOf(person.membershipId);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bind = vi
      .spyOn(authRecords, "bindGoogleAccount")
      .mockRejectedValueOnce(new Error("Fallo inyectado al vincular."));
    const sub = randomUUID();

    const failed = await signInAs(person.email, sub);

    expect(bind).toHaveBeenCalledOnce();
    expect([failed.status, failed.headers.get("location")]).toEqual([
      302,
      deniedLocation("vinculacion_fallida"),
    ]);
    expect(await db.select().from(account)).toEqual([]);
    expect(await sessionUsersOf(person.userId)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
    expect(await markOf(person.membershipId)).toEqual(mark);

    const retried = await signInAs(person.email, sub);

    expect(retried.headers.get("location")).toBe("/");
    expect(await accountIdsOf(person.userId)).toEqual([sub]);
  });

  it("un fallo después de bindGoogleAccount deja las cuentas, las sesiones, la marca y las constancias como estaban (criterio 22)", async () => {
    const person = await seedLinkable({ withAccount: true });
    const sessionId = await seedSession(person.userId);
    await seedAccountLink(person.membershipId, person.ownerId, "1 day");
    const mark = await markOf(person.membershipId);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const realBind = authRecords.bindGoogleAccount;
    const bind = vi
      .spyOn(authRecords, "bindGoogleAccount")
      .mockImplementationOnce(async (...args) => {
        await realBind(...args);
        throw new Error("Fallo inyectado después de vincular.");
      });

    const failed = await signInAs(person.email, randomUUID());

    expect(bind).toHaveBeenCalledOnce();
    expect([failed.status, failed.headers.get("location")]).toEqual([
      302,
      deniedLocation("vinculacion_fallida"),
    ]);
    expect(await accountIdsOf(person.userId)).toEqual([person.sub]);
    expect((await sessionUsersOf(person.userId)).map((row) => row.id)).toEqual([
      sessionId,
    ]);
    expect(await markOf(person.membershipId)).toEqual(mark);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { releasedEmailOf } from "@/lib/email";
import { db } from "@/server/db";
import { account, auditLog, membership, session, user } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { seedAccount, seedMember, seedSession, seedWorkspace } from "@/test/factories";
import { grantRowsOf, seedGrant, seedOAuthClient } from "@/test/oauth-grants";

import {
  bindGoogleAccount,
  deleteSession,
  deleteSessionsOf,
  googleAccountOwnerOf,
  hasAccount,
  releaseEmailOf,
  userEmailOf,
} from "./auth-records";

/**
 * Las tablas de Better Auth fuera del login (ADR 0025, D-E2-2, D-E2-5, D-E2-7,
 * D-E2b-3, D-E2b-9), con las autorizaciones de los asistentes que borran
 * (D-MCP-5).
 */

let workspaceId: string;
let actor: Actor;

beforeEach(async () => {
  let ownerId: string;
  ({ workspaceId, ownerId } = await seedWorkspace());
  actor = { userId: ownerId, workspaceId, role: "owner", status: "active" };
});

async function sessionIdsOf(userId: string) {
  const rows = await db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.userId, userId));
  return rows.map((row) => row.id).sort();
}

async function audits() {
  return db
    .select({
      workspaceId: auditLog.workspaceId,
      actorId: auditLog.actorId,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      previousValue: auditLog.previousValue,
      nextValue: auditLog.nextValue,
    })
    .from(auditLog);
}

describe("deleteSessionsOf (EQ-41, D-E2-5)", () => {
  it("borra las de la persona, no las de otra, y deja session.revokeAll con la cantidad", async () => {
    const person = await seedMember(workspaceId, "member");
    const other = await seedMember(workspaceId, "member");
    await seedSession(person);
    await seedSession(person);
    const kept = await seedSession(other);

    const deleted = await db.transaction((tx) => deleteSessionsOf(tx, actor, person));

    expect(deleted).toBe(2);
    expect(await sessionIdsOf(person)).toEqual([]);
    expect(await sessionIdsOf(other)).toEqual([kept]);
    expect(await audits()).toEqual([
      {
        workspaceId,
        actorId: actor.userId,
        action: "session.revokeAll",
        entity: "user",
        entityId: person,
        previousValue: JSON.stringify({ sessions: 2 }),
        nextValue: null,
      },
    ]);
  });

  it("sin sesiones no escribe nada", async () => {
    const person = await seedMember(workspaceId, "member");

    const deleted = await db.transaction((tx) => deleteSessionsOf(tx, actor, person));

    expect(deleted).toBe(0);
    expect(await audits()).toEqual([]);
  });

  it("no toca account: sin ella la persona no podría volver a entrar (PF-47)", async () => {
    const person = await seedMember(workspaceId, "member");
    const sub = await seedAccount(person);
    await seedSession(person);

    await db.transaction((tx) => deleteSessionsOf(tx, actor, person));

    expect(
      await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(eq(account.userId, person)),
    ).toEqual([{ accountId: sub }]);
  });
});

describe("deleteSession (D-E2-2)", () => {
  it("borra solo la fila pedida y no deja constancia", async () => {
    const person = await seedMember(workspaceId, "member");
    const dropped = await seedSession(person);
    const kept = await seedSession(person);

    await db.transaction((tx) => deleteSession(tx, dropped));

    expect(await sessionIdsOf(person)).toEqual([kept]);
    expect(await audits()).toEqual([]);
  });
});

describe("hasAccount (D-E2-7)", () => {
  it("con una fila de account, true; sin ella, false", async () => {
    const withAccount = await seedMember(workspaceId, "member");
    await seedAccount(withAccount);
    const withoutAccount = await seedMember(workspaceId, "member");

    expect(
      await db.transaction(async (tx) => [
        await hasAccount(tx, withAccount),
        await hasAccount(tx, withoutAccount),
      ]),
    ).toEqual([true, false]);
  });
});

function accountsOf(userId: string) {
  return db.select().from(account).where(eq(account.userId, userId));
}

describe("googleAccountOwnerOf (D-E2b-3)", () => {
  it("el dueño de la cuenta de Google con ese sub, o null", async () => {
    const person = await seedMember(workspaceId, "member");
    const sub = await seedAccount(person);

    expect(
      await db.transaction(async (tx) => [
        await googleAccountOwnerOf(tx, sub),
        await googleAccountOwnerOf(tx, "otro-sub"),
      ]),
    ).toEqual([person, null]);
  });

  it("no cuenta una fila de otro proveedor con el mismo accountId", async () => {
    const person = await seedMember(workspaceId, "member");
    await db.insert(account).values({
      id: "otra-cuenta",
      accountId: "sub-compartido",
      providerId: "github",
      userId: person,
      updatedAt: new Date(),
    });

    expect(
      await db.transaction((tx) => googleAccountOwnerOf(tx, "sub-compartido")),
    ).toBeNull();
  });
});

describe("bindGoogleAccount (D-E2b-3)", () => {
  it("borra las otras cuentas y las sesiones de la persona, no las de otra; inserta la nueva sin tokens y con updated_at; deja account.link y session.revokeAll con la persona como autora", async () => {
    const personId = await seedMember(workspaceId, "member");
    const person: Actor = {
      userId: personId,
      workspaceId,
      role: "member",
      status: "active",
    };
    const other = await seedMember(workspaceId, "member");
    await seedAccount(personId);
    await seedAccount(personId);
    await seedSession(personId);
    const otherSub = await seedAccount(other);
    const otherSession = await seedSession(other);

    await db.transaction((tx) => bindGoogleAccount(tx, person, "sub-nuevo"));

    const [bound, ...rest] = await accountsOf(personId);
    expect(rest).toEqual([]);
    expect(bound).toMatchObject({
      providerId: "google",
      accountId: "sub-nuevo",
      accessToken: null,
      refreshToken: null,
      idToken: null,
      password: null,
    });
    expect(bound?.updatedAt).toBeInstanceOf(Date);
    expect(await sessionIdsOf(personId)).toEqual([]);
    expect((await accountsOf(other)).map((row) => row.accountId)).toEqual([otherSub]);
    expect(await sessionIdsOf(other)).toEqual([otherSession]);
    expect(
      (await audits()).sort((left, right) => left.action.localeCompare(right.action)),
    ).toEqual([
      {
        workspaceId,
        actorId: personId,
        action: "account.link",
        entity: "user",
        entityId: personId,
        previousValue: JSON.stringify({ accounts: 2 }),
        nextValue: null,
      },
      {
        workspaceId,
        actorId: personId,
        action: "session.revokeAll",
        entity: "user",
        entityId: personId,
        previousValue: JSON.stringify({ sessions: 1 }),
        nextValue: null,
      },
    ]);
  });

  it("sin cuenta ni sesiones deja solo account.link con cero cuentas", async () => {
    const personId = await seedMember(workspaceId, "member");
    const person: Actor = {
      userId: personId,
      workspaceId,
      role: "member",
      status: "active",
    };

    await db.transaction((tx) => bindGoogleAccount(tx, person, "sub-nuevo"));

    expect((await accountsOf(personId)).map((row) => row.accountId)).toEqual([
      "sub-nuevo",
    ]);
    expect((await audits()).map((row) => [row.action, row.previousValue])).toEqual([
      ["account.link", JSON.stringify({ accounts: 0 })],
    ]);
  });

  it("borra los tokens y los consentimientos del plugin de la persona, no los de otra, y deja mcp.revokeAll con la persona como autora (D-MCP-5)", async () => {
    const personId = await seedMember(workspaceId, "member");
    const person: Actor = {
      userId: personId,
      workspaceId,
      role: "member",
      status: "active",
    };
    const other = await seedMember(workspaceId, "member");
    const clientId = await seedOAuthClient();
    await seedGrant(personId, clientId, { sessionId: await seedSession(personId) });
    await seedGrant(personId, await seedOAuthClient());
    await seedGrant(other, clientId);

    await db.transaction((tx) => bindGoogleAccount(tx, person, "sub-nuevo"));

    expect(await grantRowsOf(personId)).toEqual({ consents: 0, refresh: 0, access: 0 });
    expect(await grantRowsOf(other)).toEqual({ consents: 1, refresh: 1, access: 1 });
    expect((await audits()).filter((row) => row.action === "mcp.revokeAll")).toEqual([
      {
        workspaceId,
        actorId: personId,
        action: "mcp.revokeAll",
        entity: "user",
        entityId: personId,
        previousValue: JSON.stringify({ clients: 2 }),
        nextValue: null,
      },
    ]);
  });
});

describe("userEmailOf (D-E2b-6, D-E2b-9)", () => {
  it("el correo guardado tal como está, y lanza sin la fila", async () => {
    const person = await seedMember(workspaceId, "member", "active", {
      email: " Ana@Empresa.com",
    });

    expect(await db.transaction((tx) => userEmailOf(tx, person))).toBe(
      " Ana@Empresa.com",
    );
    await expect(db.transaction((tx) => userEmailOf(tx, "nadie"))).rejects.toThrow();
  });
});

describe("releaseEmailOf (D-E2b-9)", () => {
  it("cambia el correo por el liberado, borra cuentas y sesiones, no las de otra ni la membresía, y deja user.releaseEmail con quien actúa", async () => {
    const person = await seedMember(workspaceId, "member", "inactive", {
      email: "ana@empresa.com",
    });
    const other = await seedMember(workspaceId, "member");
    await seedAccount(person);
    await seedSession(person);
    const otherSub = await seedAccount(other);
    const otherSession = await seedSession(other);
    const memberships = await db.select().from(membership).orderBy(membership.id);

    await db.transaction((tx) => releaseEmailOf(tx, actor, person, "ana@empresa.com"));

    const [released] = await db.select().from(user).where(eq(user.id, person));
    expect(released?.email).toBe(releasedEmailOf(person));
    expect(await accountsOf(person)).toEqual([]);
    expect(await sessionIdsOf(person)).toEqual([]);
    expect((await accountsOf(other)).map((row) => row.accountId)).toEqual([otherSub]);
    expect(await sessionIdsOf(other)).toEqual([otherSession]);
    expect(await db.select().from(membership).orderBy(membership.id)).toEqual(
      memberships,
    );
    expect(
      (await audits()).sort((left, right) => left.action.localeCompare(right.action)),
    ).toEqual([
      {
        workspaceId,
        actorId: actor.userId,
        action: "session.revokeAll",
        entity: "user",
        entityId: person,
        previousValue: JSON.stringify({ sessions: 1 }),
        nextValue: null,
      },
      {
        workspaceId,
        actorId: actor.userId,
        action: "user.releaseEmail",
        entity: "user",
        entityId: person,
        previousValue: JSON.stringify({ email: "ana@empresa.com", accounts: 1 }),
        nextValue: JSON.stringify({ email: releasedEmailOf(person) }),
      },
    ]);
  });

  it("borra los tokens y los consentimientos del plugin de la persona, no los de otra, y deja mcp.revokeAll con quien actúa (D-MCP-5)", async () => {
    const person = await seedMember(workspaceId, "member", "inactive", {
      email: "ana@empresa.com",
    });
    const other = await seedMember(workspaceId, "member");
    const clientId = await seedOAuthClient();
    await seedGrant(person, clientId, { sessionId: await seedSession(person) });
    await seedGrant(other, clientId);

    await db.transaction((tx) => releaseEmailOf(tx, actor, person, "ana@empresa.com"));

    expect(await grantRowsOf(person)).toEqual({ consents: 0, refresh: 0, access: 0 });
    expect(await grantRowsOf(other)).toEqual({ consents: 1, refresh: 1, access: 1 });
    expect((await audits()).filter((row) => row.action === "mcp.revokeAll")).toEqual([
      {
        workspaceId,
        actorId: actor.userId,
        action: "mcp.revokeAll",
        entity: "user",
        entityId: person,
        previousValue: JSON.stringify({ clients: 1 }),
        nextValue: null,
      },
    ]);
  });
});

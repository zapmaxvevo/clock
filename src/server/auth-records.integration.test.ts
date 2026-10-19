import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { account, auditLog, session } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { seedAccount, seedMember, seedSession, seedWorkspace } from "@/test/factories";

import { deleteSession, deleteSessionsOf, hasAccount } from "./auth-records";

/** Las tablas de Better Auth fuera del login (ADR 0025, D-E2-2, D-E2-5, D-E2-7). */

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

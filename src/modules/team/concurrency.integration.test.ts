import { and, asc, eq, inArray, sql, TransactionRollbackError } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, type Transaction } from "@/server/db";
import { membership, timeEntry } from "@/server/db/schema";
import type { Actor, Role } from "@/server/permissions";
import {
  queueBehindBarrier,
  raceThroughBarrier,
  waitForBlockedBackends,
} from "@/test/concurrency";
import { seedMember, seedWorkspace } from "@/test/factories";
import { auditFor } from "@/test/queries";

import { changeRole, TeamError } from "./service";

/**
 * Criterios 11 a 13 de R8 (D-R8-7): la autoridad se lee bajo el mismo bloqueo
 * que la membresía pedida, dos cambios de la misma membresía se ponen en fila y
 * el bloqueo no choca con el `for key share` de un alta de horas.
 */

let workspaceId: string;
let ownerId: string;

beforeEach(async () => {
  ({ workspaceId, ownerId } = await seedWorkspace());
});

/** El actor de la sesión, armado como lo arma `ensureWorkspaceContext`. */
function actorFor(userId: string, role: Role): Actor {
  return { userId, workspaceId, role, status: "active" };
}

/** El id de la membresía de la persona: `seedMember` devuelve el del usuario. */
async function membershipIdOf(userId: string): Promise<string> {
  const [row] = await db
    .select({ id: membership.id })
    .from(membership)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)));
  return row.id;
}

async function roleOf(membershipId: string) {
  const [row] = await db
    .select({ role: membership.role })
    .from(membership)
    .where(eq(membership.id, membershipId));
  return row.role;
}

/** Lo que terminó la operación: su resultado o su error, sin lanzar. */
function settle(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    (value) => ({ value }),
    (error: unknown) => error,
  );
}

/** `for no key update` sobre las membresías, como el bloqueo de D-R8-7. */
function holdMemberships(...ids: string[]) {
  return (tx: Transaction) =>
    tx
      .select({ id: membership.id })
      .from(membership)
      .where(inArray(membership.id, ids))
      .orderBy(asc(membership.id))
      .for("no key update");
}

/**
 * Lo que termina `work` mientras otra transacción sostiene lo que toma `hold`,
 * o `"blocked"` si se trabó esperándolo. Al final la otra transacción se
 * descarta, para que lo que haya escrito no quede.
 */
async function outcomeWhileHeld(
  hold: (tx: Transaction) => Promise<unknown>,
  work: () => Promise<unknown>,
) {
  let holding = () => {};
  const held = new Promise<void>((resolve) => {
    holding = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = db
    .transaction(async (tx) => {
      await hold(tx);
      holding();
      await released;
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) {
        throw error;
      }
    });
  await Promise.race([held, holder]);
  const running = work().then(
    () => "resolved",
    (error: unknown) => error,
  );
  const waiting = new AbortController();
  try {
    return await Promise.race([
      running,
      waitForBlockedBackends({ count: 1, signal: waiting.signal }).then(() => "blocked"),
    ]);
  } finally {
    waiting.abort();
    release();
    await holder;
    await running;
  }
}

describe("dos admins que se bajan uno al otro a la vez (criterio 11)", () => {
  it("gana uno y el otro recibe forbidden: quedan un admin, un member y una sola auditoría", async () => {
    const a = await seedMember(workspaceId, "admin");
    const b = await seedMember(workspaceId, "admin");
    const aMembership = await membershipIdOf(a);
    const bMembership = await membershipIdOf(b);

    const outcomes = await raceThroughBarrier(holdMemberships(aMembership, bMembership), [
      () =>
        settle(
          changeRole(actorFor(a, "admin"), { membershipId: bMembership, role: "member" }),
        ),
      () =>
        settle(
          changeRole(actorFor(b, "admin"), { membershipId: aMembership, role: "member" }),
        ),
    ]);

    const succeeded = outcomes.filter((outcome) => !(outcome instanceof Error));
    const failed = outcomes.filter((outcome) => outcome instanceof Error);
    expect(succeeded).toHaveLength(1);
    expect(failed).toEqual([expect.any(TeamError)]);
    expect(failed[0]).toMatchObject({
      code: "forbidden",
      message: "No tenés permiso para cambiar roles.",
    });

    // El ganador es quien sigue admin; el otro quedó member.
    const winner = outcomes[0] === succeeded[0] ? a : b;
    const loserMembership = winner === a ? bMembership : aMembership;
    expect(succeeded[0]).toEqual({
      value: { membershipId: loserMembership, role: "member" },
    });
    expect([await roleOf(aMembership), await roleOf(bMembership)]).toEqual(
      winner === a ? ["admin", "member"] : ["member", "admin"],
    );
    expect(await auditFor("membership")).toEqual([
      expect.objectContaining({
        workspaceId,
        actorId: winner,
        action: "membership.changeRole",
        entityId: loserMembership,
        previousValue: JSON.stringify({ role: "admin" }),
        nextValue: JSON.stringify({ role: "member" }),
      }),
    ]);
  });
});

describe("dos cambios de la misma membresía (criterio 12)", () => {
  it("se ponen en fila: gana el último y la auditoría encadena el rol anterior", async () => {
    const d = await seedMember(workspaceId, "admin");
    const m = await seedMember(workspaceId, "member");
    const mMembership = await membershipIdOf(m);

    const outcomes = await queueBehindBarrier(holdMemberships(mMembership), [
      () =>
        changeRole(actorFor(ownerId, "owner"), {
          membershipId: mMembership,
          role: "admin",
        }),
      () =>
        changeRole(actorFor(d, "admin"), { membershipId: mMembership, role: "member" }),
    ]);

    expect(outcomes).toEqual([
      { status: "fulfilled", value: { membershipId: mMembership, role: "admin" } },
      { status: "fulfilled", value: { membershipId: mMembership, role: "member" } },
    ]);
    expect(await roleOf(mMembership)).toBe("member");

    const rows = await auditFor("membership", mMembership);
    const first = rows.find((row) => row.actorId === ownerId);
    const second = rows.find((row) => row.actorId === d);
    expect(rows).toHaveLength(2);
    expect(first).toMatchObject({
      workspaceId,
      action: "membership.changeRole",
      previousValue: JSON.stringify({ role: "member" }),
      nextValue: JSON.stringify({ role: "admin" }),
    });
    expect(second).toMatchObject({
      workspaceId,
      action: "membership.changeRole",
      previousValue: JSON.stringify({ role: "admin" }),
      nextValue: JSON.stringify({ role: "member" }),
    });
  });
});

describe("el bloqueo no espera a las horas (criterio 13)", () => {
  /** Un alta de horas de la persona sin confirmar: sostiene `for key share` sobre su membresía. */
  function holdEntryInsert(userId: string) {
    return (tx: Transaction) =>
      tx.insert(timeEntry).values({
        workspaceId,
        userId,
        startedAt: new Date("2026-10-13T12:00:00Z"),
        endedAt: new Date("2026-10-13T13:00:00Z"),
      });
  }

  it("la barrera sí traba un for update sobre la membresía: el alta sostiene el bloqueo", async () => {
    const m = await seedMember(workspaceId, "member");
    const mMembership = await membershipIdOf(m);

    const outcome = await outcomeWhileHeld(holdEntryInsert(m), () =>
      db.transaction((tx) =>
        tx.execute(sql`select id from membership where id = ${mMembership} for update`),
      ),
    );

    expect(outcome).toBe("blocked");
  });

  it("cambiar el rol de una persona con un alta de horas en curso termina sin trabarse", async () => {
    const m = await seedMember(workspaceId, "member");
    const mMembership = await membershipIdOf(m);

    const outcome = await outcomeWhileHeld(holdEntryInsert(m), () =>
      changeRole(actorFor(ownerId, "owner"), {
        membershipId: mMembership,
        role: "admin",
      }),
    );

    expect(outcome).toBe("resolved");
    expect(await roleOf(mMembership)).toBe("admin");
    expect(await auditFor("membership", mMembership)).toHaveLength(1);
  });
});

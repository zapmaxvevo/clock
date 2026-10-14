import { asc, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, type Transaction } from "@/server/db";
import { membership, timeEntry } from "@/server/db/schema";
import type { Role } from "@/server/permissions";
import {
  outcomeWhileHeld,
  queueBehindBarrier,
  raceThroughBarrier,
} from "@/test/concurrency";
import { seedMember, seedWorkspace } from "@/test/factories";
import { auditFor, membershipById, membershipOf } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import { teamMessages } from "./schema";
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

/** El actor de la sesión, activo y con el rol de su membresía. */
function actorFor(userId: string, role: Role) {
  return actorIn(workspaceId, userId, { role });
}

/** El id de la membresía de la persona: `seedMember` devuelve el del usuario. */
async function membershipIdOf(userId: string): Promise<string> {
  return (await membershipOf(workspaceId, userId)).id;
}

async function roleOf(membershipId: string) {
  return (await membershipById(membershipId))?.role;
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

describe("la autoridad bajo el bloqueo (criterio 11)", () => {
  it("el owner baja a A mientras A asciende a M: A decide con el rol que leyó bajo el bloqueo", async () => {
    const a = await seedMember(workspaceId, "admin");
    const m = await seedMember(workspaceId, "member");
    const aMembership = await membershipIdOf(a);
    const mMembership = await membershipIdOf(m);

    const outcomes = await queueBehindBarrier(holdMemberships(aMembership), [
      () =>
        changeRole(actorFor(ownerId, "owner"), {
          membershipId: aMembership,
          role: "member",
        }),
      () =>
        changeRole(actorFor(a, "admin"), { membershipId: mMembership, role: "admin" }),
    ]);

    expect(outcomes).toEqual([
      { status: "fulfilled", value: { membershipId: aMembership, role: "member" } },
      { status: "rejected", reason: expect.any(TeamError) },
    ]);
    expect(outcomes[1]).toMatchObject({
      reason: { code: "forbidden", message: teamMessages.forbidden },
    });
    expect([await roleOf(aMembership), await roleOf(mMembership)]).toEqual([
      "member",
      "member",
    ]);
    expect(await auditFor("membership")).toEqual([
      expect.objectContaining({
        workspaceId,
        actorId: ownerId,
        action: "membership.changeRole",
        entityId: aMembership,
        previousValue: JSON.stringify({ role: "admin" }),
        nextValue: JSON.stringify({ role: "member" }),
      }),
    ]);
  });

  it("dos admins que se piden admin uno al otro: los dos responden éxito sin escribir, sin esperarse en círculo", async () => {
    const a = await seedMember(workspaceId, "admin");
    const b = await seedMember(workspaceId, "admin");
    const aMembership = await membershipIdOf(a);
    const bMembership = await membershipIdOf(b);
    const before = [await membershipById(aMembership), await membershipById(bMembership)];

    const outcomes = await raceThroughBarrier(holdMemberships(aMembership, bMembership), [
      () =>
        settle(
          changeRole(actorFor(a, "admin"), { membershipId: bMembership, role: "admin" }),
        ),
      () =>
        settle(
          changeRole(actorFor(b, "admin"), { membershipId: aMembership, role: "admin" }),
        ),
    ]);

    expect(outcomes).toEqual([
      { value: { membershipId: bMembership, role: "admin" } },
      { value: { membershipId: aMembership, role: "admin" } },
    ]);
    expect([
      await membershipById(aMembership),
      await membershipById(bMembership),
    ]).toEqual(before);
    expect(await auditFor("membership")).toEqual([]);
  });
});

describe("dos cambios de la misma membresía (criterio 12)", () => {
  it("se ponen en fila: gana el último y la auditoría encadena el rol anterior", async () => {
    const d = await seedMember(workspaceId, "admin");
    const m = await seedMember(workspaceId, "member");
    const mMembership = await membershipIdOf(m);

    const outcomes = await queueBehindBarrier(holdMemberships(mMembership), [
      () =>
        changeRole(actorFor(d, "admin"), { membershipId: mMembership, role: "admin" }),
      () =>
        changeRole(actorFor(ownerId, "owner"), {
          membershipId: mMembership,
          role: "member",
        }),
    ]);

    expect(outcomes).toEqual([
      { status: "fulfilled", value: { membershipId: mMembership, role: "admin" } },
      { status: "fulfilled", value: { membershipId: mMembership, role: "member" } },
    ]);
    expect(await roleOf(mMembership)).toBe("member");

    const rows = await auditFor("membership", mMembership);
    const first = rows.find((row) => row.actorId === d);
    const second = rows.find((row) => row.actorId === ownerId);
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

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, type Transaction } from "@/server/db";
import { membership, timeEntry } from "@/server/db/schema";
import type { Role } from "@/server/permissions";
import {
  fulfilledValue,
  outcomeWhileHeld,
  queueBehindBarrier,
  raceThroughBarrier,
} from "@/test/concurrency";
import { seedMember, seedSession, seedTimeEntry, seedWorkspace } from "@/test/factories";
import { auditFor, membershipById, membershipOf, timeEntriesOf } from "@/test/queries";
import { actorIn, lockRow, workspaceOf } from "@/test/time-entry";
import { timeEntryMessages } from "@/modules/time-entry/schema";
import { startTimer, stopTimer, TimeEntryError } from "@/modules/time-entry/service";

import { teamRepository } from "./repository";
import { teamMessages } from "./schema";
import { changeRole, changeStatus, TeamError } from "./service";

/**
 * Criterios 11 a 13 de R8 (D-R8-7): la autoridad se lee bajo el mismo bloqueo
 * que la membresía pedida, dos cambios de la misma membresía se ponen en fila y
 * el bloqueo no choca con el `for key share` de un alta de horas. Criterios 13
 * a 16 de E2 (D-E2-6): desactivar contra abrir y detener un timer, dos cambios
 * de estado de la misma fila y lo que espera y lo que no.
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

/** El estado de la membresía. */
async function statusOf(membershipId: string) {
  return (await membershipById(membershipId))?.status;
}

/** Los timers abiertos de la persona. */
async function runningOf(userId: string) {
  return db
    .select({ id: timeEntry.id })
    .from(timeEntry)
    .where(and(eq(timeEntry.userId, userId), isNull(timeEntry.endedAt)));
}

function deactivateAs(userId: string, role: Role, membershipId: string) {
  return changeStatus(actorFor(userId, role), { membershipId, status: "inactive" });
}

function startTimerOf(userId: string) {
  return startTimer(actorFor(userId, "member"), workspaceOf("UTC"), {
    projectId: null,
    taskId: null,
    tagIds: [],
    id: randomUUID(),
    description: "arranque",
  });
}

describe("desactivar contra abrir un timer (criterio 13, D-E2-6)", () => {
  it("si la desactivación bloquea primero, el arranque responde forbidden con TT-79 y no deja entrada", async () => {
    const p = await seedMember(workspaceId, "member");
    const pMembership = await membershipIdOf(p);

    const outcomes = await queueBehindBarrier(holdMemberships(pMembership), [
      () => deactivateAs(ownerId, "owner", pMembership),
      () => startTimerOf(p),
    ]);

    expect(outcomes).toEqual([
      {
        status: "fulfilled",
        value: { membershipId: pMembership, status: "inactive", linkRequested: false },
      },
      { status: "rejected", reason: expect.any(TimeEntryError) },
    ]);
    expect(outcomes[1]).toMatchObject({
      reason: { code: "forbidden", message: timeEntryMessages.forbidden },
    });
    expect(await timeEntriesOf(workspaceId, p)).toEqual([]);
    expect(await statusOf(pMembership)).toBe("inactive");
  });

  it("si el arranque lee primero, la desactivación espera y cierra el timer que abrió", async () => {
    const p = await seedMember(workspaceId, "member");
    const pMembership = await membershipIdOf(p);

    // La barrera es un timer de P sin confirmar: el arranque, que ya tomó la
    // membresía `for share`, se traba en el índice de un solo timer abierto.
    const outcomes = await queueBehindBarrier(
      (tx) =>
        tx.insert(timeEntry).values({
          workspaceId,
          userId: p,
          startedAt: new Date("2026-10-13T12:00:00Z"),
        }),
      [() => startTimerOf(p), () => deactivateAs(ownerId, "owner", pMembership)],
    );

    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
    // La barrera se soltó con `rollback`: la única entrada de P es la que abrió el arranque.
    const [started] = await timeEntriesOf(workspaceId, p);
    expect(fulfilledValue(outcomes[0])).toMatchObject({ running: { id: started.id } });
    expect(await statusOf(pMembership)).toBe("inactive");
    expect(await runningOf(p)).toEqual([]);
    expect(await auditFor("time_entry", started.id)).toEqual([
      expect.objectContaining({ action: "timeEntry.start", actorId: p }),
      expect.objectContaining({ action: "timeEntry.stop", actorId: ownerId }),
    ]);
  });
});

describe("desactivar contra detener (criterio 14, D-E2-6)", () => {
  it("con la persona deteniendo su timer bajo su bloqueo, la desactivación termina y queda un solo timeEntry.stop", async () => {
    const p = await seedMember(workspaceId, "member");
    const pMembership = await membershipIdOf(p);
    const running = await seedTimeEntry({
      workspaceId,
      userId: p,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const outcomes = await queueBehindBarrier(lockRow(running.id), [
      () => stopTimer(actorFor(p, "member"), workspaceOf("UTC"), { id: running.id }),
      () => deactivateAs(ownerId, "owner", pMembership),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await statusOf(pMembership)).toBe("inactive");
    expect(await runningOf(p)).toEqual([]);
    expect(await auditFor("time_entry", running.id)).toEqual([
      expect.objectContaining({ action: "timeEntry.stop", actorId: p }),
    ]);
  });
});

describe("dos sobre la misma fila (criterio 15, EQ-98)", () => {
  it("dos desactivaciones a la vez: una escribe y la otra responde éxito sin escribir", async () => {
    const admin = await seedMember(workspaceId, "admin");
    const m = await seedMember(workspaceId, "member");
    const mMembership = await membershipIdOf(m);
    await seedSession(m);

    const outcomes = await queueBehindBarrier(holdMemberships(mMembership), [
      () => deactivateAs(ownerId, "owner", mMembership),
      () => deactivateAs(admin, "admin", mMembership),
    ]);

    const done = { membershipId: mMembership, status: "inactive", linkRequested: false };
    expect(outcomes).toEqual([
      { status: "fulfilled", value: done },
      { status: "fulfilled", value: done },
    ]);
    expect(await auditFor("membership", mMembership)).toEqual([
      expect.objectContaining({ action: "membership.deactivate", actorId: ownerId }),
    ]);
    expect(await auditFor("user", m)).toEqual([
      expect.objectContaining({ action: "session.revokeAll", actorId: ownerId }),
    ]);
  });

  it("el owner baja a la admin A mientras A desactiva a M: A decide con el rol que leyó bajo el bloqueo", async () => {
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
      () => deactivateAs(a, "admin", mMembership),
    ]);

    expect(outcomes).toEqual([
      { status: "fulfilled", value: { membershipId: aMembership, role: "member" } },
      { status: "rejected", reason: expect.any(TeamError) },
    ]);
    expect(outcomes[1]).toMatchObject({
      reason: { code: "forbidden", message: teamMessages.forbiddenAction },
    });
    expect(await statusOf(mMembership)).toBe("active");
    expect(await auditFor("membership", mMembership)).toEqual([]);
  });
});

describe("lo que espera y lo que no (criterio 16, D-E2-6)", () => {
  /** Un alta de horas cerrada de la persona sin confirmar: `for key share` sobre su membresía. */
  function holdClosedEntryInsert(userId: string) {
    return (tx: Transaction) =>
      tx.insert(timeEntry).values({
        workspaceId,
        userId,
        startedAt: new Date("2026-10-13T12:00:00Z"),
        endedAt: new Date("2026-10-13T13:00:00Z"),
      });
  }

  it("desactivar no espera a un alta de una entrada cerrada en curso de esa persona", async () => {
    const m = await seedMember(workspaceId, "member");
    const mMembership = await membershipIdOf(m);

    const outcome = await outcomeWhileHeld(holdClosedEntryInsert(m), () =>
      deactivateAs(ownerId, "owner", mMembership),
    );

    expect(outcome).toBe("resolved");
    expect(await statusOf(mMembership)).toBe("inactive");
  });

  it("un arranque de timer espera a una desactivación o a un cambio de rol en curso de esa membresía", async () => {
    const m = await seedMember(workspaceId, "member");
    const mMembership = await membershipIdOf(m);

    // El bloqueo que toman `changeStatus` y `changeRole`.
    const outcome = await outcomeWhileHeld(
      (tx) => teamRepository.lockForChange(tx, workspaceId, mMembership, ownerId),
      () => startTimerOf(m),
    );

    expect(outcome).toBe("blocked");
  });
});

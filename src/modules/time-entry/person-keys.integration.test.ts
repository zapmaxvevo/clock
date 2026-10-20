import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { and, eq, sql, TransactionRollbackError } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, type Transaction } from "@/server/db";
import {
  constraintOf,
  FOREIGN_KEY_VIOLATION,
  hasCode,
  RESTRICT_VIOLATION,
} from "@/server/db/constraint-error";
import {
  auditLog,
  membership,
  projectMember,
  timeEntry,
  timeEntryTag,
  user,
  userPreference,
  workspace,
  workspaceSettings,
} from "@/server/db/schema";
import {
  seedMember,
  seedPreferences,
  seedProject,
  seedTag,
  seedTimeEntry,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { timeEntryById } from "@/test/queries";

/**
 * Las claves de R1 del núcleo de reportes (P-09, ADR 0020): a una persona con
 * horas no se la borra ni se le quita la membresía. La base, escrita de forma
 * directa: no hay camino de la aplicación que borre personas.
 *
 * Las personas que se borran son de `seedMember` y nunca el owner, cuya clave
 * desde `workspace` ya es `restrict`.
 */

type MembershipRow = typeof membership.$inferSelect;
type AuditRow = typeof auditLog.$inferSelect;

const membershipKey = "time_entry_membership_fk";
const userKey = "time_entry_user_id_user_id_fk";
const backfillTag = "0013_time_entry_people_backfill";
const restrictTag = "0014_time_entry_people_restrict";

/** El error de una escritura que la base tiene que rechazar. */
async function rejection(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("La base aceptó la escritura.");
}

/** Las sentencias de una migración, leída del archivo que nombra el diario. */
async function migrationStatements(migrationTag: string): Promise<string[]> {
  const journal = JSON.parse(
    await readFile(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const entry = journal.entries.find((candidate) => candidate.tag === migrationTag);
  if (entry === undefined) {
    throw new Error(`El diario no tiene la migración ${migrationTag}.`);
  }
  const migration = await readFile(
    join(process.cwd(), "drizzle", `${entry.tag}.sql`),
    "utf8",
  );
  return migration.split("--> statement-breakpoint");
}

/** La única sentencia de la 0013. */
async function backfillStatement(): Promise<string> {
  const statements = await migrationStatements(backfillTag);
  if (statements.length !== 1) {
    throw new Error(`La ${backfillTag} tiene ${statements.length} sentencias y no una.`);
  }
  return statements[0];
}

/** La sentencia de la 0014 que crea la clave compuesta. */
async function membershipKeyStatement(): Promise<string> {
  const statements = (await migrationStatements(restrictTag)).filter((statement) =>
    statement.includes(`ADD CONSTRAINT "${membershipKey}"`),
  );
  if (statements.length !== 1) {
    throw new Error(
      `La ${restrictTag} crea ${statements.length} veces la clave y no una.`,
    );
  }
  return statements[0];
}

async function membershipOf(workspaceId: string, userId: string) {
  const rows = await db
    .select()
    .from(membership)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)));
  return rows.at(0);
}

async function userById(id: string) {
  const rows = await db.select().from(user).where(eq(user.id, id));
  return rows.at(0);
}

async function preferenceOf(userId: string) {
  const rows = await db
    .select()
    .from(userPreference)
    .where(eq(userPreference.userId, userId));
  return rows.at(0);
}

async function seedClosedOf(workspaceId: string, userId: string) {
  return seedTimeEntry({
    workspaceId,
    userId,
    startedAt: "2026-10-01T13:00:00Z",
    endedAt: "2026-10-01T14:00:00Z",
  });
}

let ours: SeededWorkspace;

beforeEach(async () => {
  ours = await seedWorkspace();
});

describe("borrar una persona (criterios 1 y 2, P-09)", () => {
  it("borrar un usuario con horas falla, y el usuario, su membresía, su entrada y sus preferencias siguen", async () => {
    const personId = await seedMember(ours.workspaceId, "member");
    await seedPreferences(personId, { timeFormat: "12h" });
    const entry = await seedClosedOf(ours.workspaceId, personId);

    const error = await rejection(db.delete(user).where(eq(user.id, personId)));

    expect(hasCode(error, RESTRICT_VIOLATION)).toBe(true);
    expect(await userById(personId)).toBeDefined();
    expect(await membershipOf(ours.workspaceId, personId)).toBeDefined();
    expect(await timeEntryById(entry.id)).toBeDefined();
    expect(await preferenceOf(personId)).toBeDefined();
  });

  it("borrar un usuario sin horas se lleva el usuario, su membresía y sus preferencias", async () => {
    const personId = await seedMember(ours.workspaceId, "member");
    await seedPreferences(personId, { timeFormat: "12h" });

    await db.delete(user).where(eq(user.id, personId));

    expect(await userById(personId)).toBeUndefined();
    expect(await membershipOf(ours.workspaceId, personId)).toBeUndefined();
    expect(await preferenceOf(personId)).toBeUndefined();
  });
});

describe("quitar una membresía (criterios 3 y 4, P-09)", () => {
  function deleteMembership(workspaceId: string, userId: string) {
    return db
      .delete(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)));
  }

  it("borrar una membresía con horas falla, y la membresía y la entrada siguen", async () => {
    const personId = await seedMember(ours.workspaceId, "member");
    const entry = await seedClosedOf(ours.workspaceId, personId);

    const error = await rejection(deleteMembership(ours.workspaceId, personId));

    expect(hasCode(error, RESTRICT_VIOLATION)).toBe(true);
    expect(await membershipOf(ours.workspaceId, personId)).toBeDefined();
    expect(await timeEntryById(entry.id)).toBeDefined();
  });

  it("borrar una membresía sin horas anda, y sus filas de project_member se van en cascada", async () => {
    const personId = await seedMember(ours.workspaceId, "member");
    const web = await seedProject({
      workspaceId: ours.workspaceId,
      members: [{ userId: personId }],
    });

    await deleteMembership(ours.workspaceId, personId);

    expect(await membershipOf(ours.workspaceId, personId)).toBeUndefined();
    expect(
      await db.select().from(projectMember).where(eq(projectMember.projectId, web.id)),
    ).toEqual([]);
  });
});

describe("borrar el workspace (criterio 5, R1-D4)", () => {
  it("con horas, se lleva el workspace, sus membresías, sus entradas con sus etiquetas, su configuración y sus constancias", async () => {
    const personId = await seedMember(ours.workspaceId, "member");
    const urgent = await seedTag({ workspaceId: ours.workspaceId });
    await seedTimeEntry({
      workspaceId: ours.workspaceId,
      userId: personId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
      tagIds: [urgent.id],
    });
    await seedClosedOf(ours.workspaceId, ours.ownerId);
    await db.insert(auditLog).values({
      workspaceId: ours.workspaceId,
      actorId: personId,
      action: "timeEntry.create",
      entity: "timeEntry",
      entityId: "x",
    });

    await db.delete(workspace).where(eq(workspace.id, ours.workspaceId));

    const workspaceId = ours.workspaceId;
    expect(
      await db.select().from(workspace).where(eq(workspace.id, workspaceId)),
    ).toEqual([]);
    expect(
      await db.select().from(membership).where(eq(membership.workspaceId, workspaceId)),
    ).toEqual([]);
    expect(
      await db.select().from(timeEntry).where(eq(timeEntry.workspaceId, workspaceId)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(timeEntryTag)
        .where(eq(timeEntryTag.workspaceId, workspaceId)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(workspaceSettings)
        .where(eq(workspaceSettings.workspaceId, workspaceId)),
    ).toEqual([]);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.workspaceId, workspaceId)),
    ).toEqual([]);
  });
});

describe("la entrada y la membresía de su persona (criterios 6 y 7)", () => {
  it("una entrada no se inserta en un workspace donde su persona no tiene membresía", async () => {
    const theirs = await seedWorkspace();
    const personId = await seedMember(theirs.workspaceId, "member");

    const error = await rejection(seedClosedOf(ours.workspaceId, personId));

    expect(constraintOf(error, FOREIGN_KEY_VIOLATION)).toBe(membershipKey);
  });

  it.each(["inactive", "invited"] as const)(
    "el estado no es parte de la clave: con la membresía %s la entrada se inserta",
    async (status) => {
      const personId = await seedMember(ours.workspaceId, "member");
      await db.update(membership).set({ status }).where(eq(membership.userId, personId));

      const entry = await seedClosedOf(ours.workspaceId, personId);

      expect(await timeEntryById(entry.id)).toBeDefined();
    },
  );
});

describe("el relleno de la 0013 (criterio 8, R1-D3)", () => {
  /** Lo que la transacción lee después de cada corrida de la sentencia. */
  type Reading = {
    readonly memberships: MembershipRow[];
    readonly audits: AuditRow[];
  };

  async function readWith(tx: Transaction): Promise<Reading> {
    return {
      memberships: await tx.select().from(membership),
      audits: await tx
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "membership.backfill")),
    };
  }

  function membershipIn(
    rows: readonly MembershipRow[],
    workspaceId: string,
    userId: string,
  ) {
    const found = rows.find(
      (row) => row.workspaceId === workspaceId && row.userId === userId,
    );
    if (found === undefined) {
      throw new Error(`No hay membresía de ${userId} en ${workspaceId}.`);
    }
    return found;
  }

  it("crea las membresías que faltan, con su constancia, sin tocar las que hay, una sola vez", async () => {
    const backfill = await backfillStatement();
    const addKey = await membershipKeyStatement();
    // Antes del `begin`, con las fábricas: adentro esperarían el bloqueo de la
    // clave quitada.
    const a = ours;
    const b = await seedWorkspace();
    const u = await seedUser();
    const v = await seedUser();
    await db.insert(membership).values({ workspaceId: b.workspaceId, userId: u });
    await db.insert(membership).values({ workspaceId: a.workspaceId, userId: v });
    await seedClosedOf(a.workspaceId, v);
    await db
      .delete(membership)
      .where(
        and(eq(membership.workspaceId, a.workspaceId), eq(membership.userId, a.ownerId)),
      );
    const untouched = [
      await membershipOf(b.workspaceId, u),
      await membershipOf(a.workspaceId, v),
    ];
    const before = await db.select().from(membership);

    const readings: Reading[] = [];
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`ALTER TABLE "time_entry" DROP CONSTRAINT "${membershipKey}"`),
        );
        for (const userId of [u, a.ownerId]) {
          await tx.insert(timeEntry).values({
            workspaceId: a.workspaceId,
            userId,
            startedAt: new Date("2026-10-01T13:00:00Z"),
            endedAt: new Date("2026-10-01T14:00:00Z"),
          });
        }
        await tx.execute(sql.raw(backfill));
        readings.push(await readWith(tx));
        await tx.execute(sql.raw(backfill));
        readings.push(await readWith(tx));
        await tx.execute(sql.raw(addKey));
        tx.rollback();
      }),
    ).rejects.toBeInstanceOf(TransactionRollbackError);

    const [first, second] = readings;
    const forU = membershipIn(first.memberships, a.workspaceId, u);
    const forOwner = membershipIn(first.memberships, a.workspaceId, a.ownerId);
    expect(first.memberships).toHaveLength(before.length + 2);
    expect(forU).toMatchObject({
      role: "member",
      status: "inactive",
      weekStart: 1,
    });
    expect(forOwner).toMatchObject({
      role: "owner",
      status: "active",
      weekStart: 1,
    });

    const byEntity = (left: { entityId: string }, right: { entityId: string }) =>
      left.entityId.localeCompare(right.entityId);
    expect(
      first.audits
        .map((row) => ({
          workspaceId: row.workspaceId,
          actorId: row.actorId,
          entity: row.entity,
          entityId: row.entityId,
          nextValue: JSON.parse(row.nextValue ?? "null") as unknown,
        }))
        .sort(byEntity),
    ).toEqual(
      [forU, forOwner]
        .map((row) => ({
          workspaceId: a.workspaceId,
          actorId: null,
          entity: "membership",
          entityId: row.id,
          nextValue: { userId: row.userId, role: row.role, status: row.status },
        }))
        .sort(byEntity),
    );

    expect([
      membershipIn(first.memberships, b.workspaceId, u),
      membershipIn(first.memberships, a.workspaceId, v),
    ]).toEqual(untouched);

    expect(second.memberships).toEqual(first.memberships);
    expect(second.audits).toEqual(first.audits);

    const kept = await db.execute(
      sql`select 1 from pg_constraint where conname = ${membershipKey}`,
    );
    expect(kept.rows).toHaveLength(1);
  });
});

describe("las claves, en la base (criterio 9)", () => {
  it("las dos claves están validadas y en restrict", async () => {
    const result = await db.execute(
      sql`select conname, convalidated, confdeltype from pg_constraint
          where conname in (${membershipKey}, ${userKey}) order by conname`,
    );
    expect(result.rows).toEqual([
      { conname: membershipKey, convalidated: true, confdeltype: "r" },
      { conname: userKey, convalidated: true, confdeltype: "r" },
    ]);
  });
});

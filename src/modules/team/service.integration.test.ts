import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as AuthRecords from "@/server/auth-records";
import { db } from "@/server/db";
import {
  account,
  auditLog,
  membership,
  projectMember,
  session,
  taskAssignee,
  timeEntry,
  user,
} from "@/server/db/schema";
import { can, type Actor, type MembershipStatus, type Role } from "@/server/permissions";
import {
  seedAccount,
  seedMember,
  seedPreferences,
  seedProject,
  seedSession,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { auditFor, membershipById, membershipOf, timeEntryById } from "@/test/queries";
import { actorIn, failureOf } from "@/test/time-entry";
import { ensureWorkspaceContext, listWorkspacePeople } from "@/modules/workspace/service";

import { teamRepository } from "./repository";
import {
  teamMessages,
  type ChangeableRole,
  type MemberStatus,
  type TeamMember,
} from "./schema";
import { changeRole, changeStatus, getTeamView } from "./service";

/**
 * Criterio 17: un fallo después de borrar las sesiones, cuando `failAfterSessions`
 * está puesto. El resto de los tests usa la función real.
 */
const injected = vi.hoisted(() => ({ failAfterSessions: false }));

vi.mock("@/server/auth-records", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthRecords>();
  return {
    ...actual,
    deleteSessionsOf: async (...args: Parameters<typeof actual.deleteSessionsOf>) => {
      const deleted = await actual.deleteSessionsOf(...args);
      if (injected.failAfterSessions) {
        throw new Error("Fallo inyectado después de borrar las sesiones.");
      }
      return deleted;
    },
  };
});

/**
 * Una persona del workspace con la membresía en un instante viejo: así
 * `updated_at` avanza aunque el cambio caiga en el mismo milisegundo que el
 * alta.
 */
async function seedPerson(
  workspaceId: string,
  role: Role,
  status: MembershipStatus = "active",
) {
  const userId = await seedMember(workspaceId, role, status);
  await db
    .update(membership)
    .set({ updatedAt: new Date("2026-01-01T00:00:00Z") })
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)));
  const row = await membershipOf(workspaceId, userId);
  return {
    userId,
    membershipId: row.id,
    actor: actorIn(workspaceId, userId, { role, status }),
  };
}

function ownerOf(seeded: SeededWorkspace) {
  return actorIn(seeded.workspaceId, seeded.ownerId, { role: "owner" });
}

afterEach(() => {
  vi.restoreAllMocks();
  injected.failAfterSessions = false;
});

describe("changeRole: ascender y bajar (criterio 3)", () => {
  it("el owner pasa a un member a admin, con la fila, el resultado y la auditoría", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const before = await membershipById(target.membershipId);

    const result = await changeRole(ownerOf(seeded), {
      membershipId: target.membershipId,
      role: "admin",
    });

    expect(result).toEqual({ membershipId: target.membershipId, role: "admin" });
    const after = await membershipById(target.membershipId);
    expect(after?.role).toBe("admin");
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0);
    const audit = await auditFor("membership");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      workspaceId: seeded.workspaceId,
      actorId: seeded.ownerId,
      action: "membership.changeRole",
      entity: "membership",
      entityId: target.membershipId,
      previousValue: JSON.stringify({ role: "member" }),
      nextValue: JSON.stringify({ role: "admin" }),
    });
  });

  it("un admin pasa a un member a admin, con el admin como actor", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const target = await seedPerson(seeded.workspaceId, "member");

    const result = await changeRole(admin.actor, {
      membershipId: target.membershipId,
      role: "admin",
    });

    expect(result).toEqual({ membershipId: target.membershipId, role: "admin" });
    expect((await membershipById(target.membershipId))?.role).toBe("admin");
    const audit = await auditFor("membership");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      workspaceId: seeded.workspaceId,
      actorId: admin.userId,
      entityId: target.membershipId,
      previousValue: JSON.stringify({ role: "member" }),
      nextValue: JSON.stringify({ role: "admin" }),
    });
  });

  it("el owner pasa a un admin a member, con la fila y la auditoría", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "admin");
    const before = await membershipById(target.membershipId);

    const result = await changeRole(ownerOf(seeded), {
      membershipId: target.membershipId,
      role: "member",
    });

    expect(result).toEqual({ membershipId: target.membershipId, role: "member" });
    const after = await membershipById(target.membershipId);
    expect(after?.role).toBe("member");
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0);
    const audit = await auditFor("membership");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      workspaceId: seeded.workspaceId,
      actorId: seeded.ownerId,
      action: "membership.changeRole",
      entity: "membership",
      entityId: target.membershipId,
      previousValue: JSON.stringify({ role: "admin" }),
      nextValue: JSON.stringify({ role: "member" }),
    });
  });
});

describe("changeRole: sin efecto (criterio 4)", () => {
  it.each(["member", "admin"] as const)(
    "pedir %s a quien ya lo tiene responde éxito sin escribir ni auditar",
    async (role) => {
      const seeded = await seedWorkspace();
      const target = await seedPerson(seeded.workspaceId, role);
      const before = await membershipById(target.membershipId);

      const result = await changeRole(ownerOf(seeded), {
        membershipId: target.membershipId,
        role,
      });

      expect(result).toEqual({ membershipId: target.membershipId, role });
      expect(await membershipById(target.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );

  it.each([
    ["admin para quien ya es admin, el reintento de su ascenso", "admin"],
    ["member para quien ya es member", "member"],
  ] as const)(
    "un admin que pide %s responde éxito sin escribir ni auditar (D-R8-13)",
    async (_label, role) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const target = await seedPerson(seeded.workspaceId, role);
      const before = await membershipById(target.membershipId);

      const result = await changeRole(admin.actor, {
        membershipId: target.membershipId,
        role,
      });

      expect(result).toEqual({ membershipId: target.membershipId, role });
      expect(await membershipById(target.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );
});

describe("changeRole: el owner y el rol de admin (criterio 5)", () => {
  it.each(["member", "admin"] as const)(
    "el owner sobre la suya con %s responde role_locked y no cambia nada",
    async (role) => {
      const seeded = await seedWorkspace();
      const own = await membershipOf(seeded.workspaceId, seeded.ownerId);

      const error = await failureOf(
        changeRole(ownerOf(seeded), { membershipId: own.id, role }),
      );

      expect(error.code).toBe("role_locked");
      expect(error.message).toBe(teamMessages.ownerLocked);
      expect(await membershipById(own.id)).toEqual(own);
      expect(await auditFor("membership")).toEqual([]);
    },
  );

  it.each(["member", "admin"] as const)(
    "un admin sobre la del owner con %s responde forbidden",
    async (role) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const own = await membershipOf(seeded.workspaceId, seeded.ownerId);

      const error = await failureOf(
        changeRole(admin.actor, { membershipId: own.id, role }),
      );

      expect(error.code).toBe("forbidden");
      expect(error.message).toBe(teamMessages.forbidden);
      expect(await membershipById(own.id)).toEqual(own);
      expect(await auditFor("membership")).toEqual([]);
    },
  );

  it.each([
    ["para otro admin", "other", "active"],
    ["para sí mismo", "self", "active"],
    ["para un admin inactive: el acceso va antes que el estado", "other", "inactive"],
  ] as const)(
    "un admin responde adminOwnerOnly al pedir member %s (D-R8-5)",
    async (_label, whom, status) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const target =
        whom === "self" ? admin : await seedPerson(seeded.workspaceId, "admin", status);
      const before = await membershipById(target.membershipId);

      const error = await failureOf(
        changeRole(admin.actor, { membershipId: target.membershipId, role: "member" }),
      );

      expect(error.code).toBe("forbidden");
      expect(error.message).toBe(teamMessages.adminOwnerOnly);
      expect(await membershipById(target.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );
});

describe("changeRole: los otros roles (criterio 6)", () => {
  it.each([
    ["project_manager", "member"],
    ["project_manager", "admin"],
    ["team_manager", "member"],
    ["team_manager", "admin"],
  ] as const)(
    "una membresía %s con %s responde role_locked y no cambia nada",
    async (current, role) => {
      const seeded = await seedWorkspace();
      const target = await seedPerson(seeded.workspaceId, current);
      const before = await membershipById(target.membershipId);

      const error = await failureOf(
        changeRole(ownerOf(seeded), { membershipId: target.membershipId, role }),
      );

      expect(error.code).toBe("role_locked");
      expect(error.message).toBe(teamMessages.roleLocked);
      expect(await membershipById(target.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );
});

describe("changeRole: inactivas e invitadas (criterio 7)", () => {
  it.each([
    ["inactive", "member"],
    ["inactive", "admin"],
    ["invited", "member"],
    ["invited", "admin"],
  ] as const)(
    "una membresía %s con %s responde inactive_membership y no cambia nada",
    async (status, role) => {
      const seeded = await seedWorkspace();
      const target = await seedPerson(seeded.workspaceId, "member", status);
      const before = await membershipById(target.membershipId);

      const error = await failureOf(
        changeRole(ownerOf(seeded), { membershipId: target.membershipId, role }),
      );

      expect(error.code).toBe("inactive_membership");
      expect(error.message).toBe(teamMessages.inactive);
      expect(await membershipById(target.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );
});

describe("changeRole: ajenas e inexistentes (criterio 8)", () => {
  it("un uuid que no existe responde not_found", async () => {
    const seeded = await seedWorkspace();

    const error = await failureOf(
      changeRole(ownerOf(seeded), { membershipId: randomUUID(), role: "admin" }),
    );

    expect(error.code).toBe("not_found");
    expect(error.message).toBe(teamMessages.notFound);
    expect(await auditFor("membership")).toEqual([]);
  });

  it.each(["admin", "member"] as const)(
    "la membresía de otro workspace con %s responde not_found y no cambia",
    async (role) => {
      const seeded = await seedWorkspace();
      const other = await seedWorkspace();
      const foreign = await seedPerson(other.workspaceId, "member");
      const before = await membershipById(foreign.membershipId);

      const error = await failureOf(
        changeRole(ownerOf(seeded), { membershipId: foreign.membershipId, role }),
      );

      expect(error.code).toBe("not_found");
      expect(error.message).toBe(teamMessages.notFound);
      expect(await membershipById(foreign.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );
});

describe("changeRole: sin permiso (criterio 9)", () => {
  it.each([
    ["project_manager", "active"],
    ["team_manager", "active"],
    ["member", "active"],
    ["admin", "inactive"],
    ["admin", "invited"],
    ["owner", "inactive"],
  ] as const)(
    "%s %s responde forbidden sin abrir la transacción",
    async (role, status) => {
      const seeded = await seedWorkspace();
      const actor = await seedPerson(seeded.workspaceId, role, status);
      const target = await seedPerson(seeded.workspaceId, "member");
      const before = await membershipById(target.membershipId);
      const transaction = vi.spyOn(db, "transaction");

      const error = await failureOf(
        changeRole(actor.actor, { membershipId: target.membershipId, role: "admin" }),
      );

      expect(error.code).toBe("forbidden");
      expect(error.message).toBe(teamMessages.forbidden);
      expect(transaction).not.toHaveBeenCalled();
      expect(await membershipById(target.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );
});

describe("changeRole: la autoridad fresca (criterio 10)", () => {
  it.each([
    ["dice member", "member", "active"],
    ["dice admin e inactive", "admin", "inactive"],
    ["dice admin e invited", "admin", "invited"],
  ] as const)(
    "un actor admin y activo cuya fila %s responde forbidden",
    async (_label, role, status) => {
      const seeded = await seedWorkspace();
      const stale = await seedPerson(seeded.workspaceId, role, status);
      const target = await seedPerson(seeded.workspaceId, "member");
      const before = await membershipById(target.membershipId);
      const sessionActor = actorIn(seeded.workspaceId, stale.userId, {
        role: "admin",
        status: "active",
      });

      const error = await failureOf(
        changeRole(sessionActor, { membershipId: target.membershipId, role: "admin" }),
      );

      expect(error.code).toBe("forbidden");
      expect(await membershipById(target.membershipId)).toEqual(before);
      expect(await auditFor("membership")).toEqual([]);
    },
  );

  it("un actor sin membresía en el workspace responde forbidden", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const ghost = actorIn(seeded.workspaceId, randomUUID(), { role: "admin" });

    const error = await failureOf(
      changeRole(ghost, { membershipId: target.membershipId, role: "admin" }),
    );

    expect(error.code).toBe("forbidden");
    expect((await membershipById(target.membershipId))?.role).toBe("member");
  });
});

/** Cambia el nombre de Google que sembró `seedUser`. */
async function nameAccount(userId: string, name: string) {
  await db.update(user).set({ name }).where(eq(user.id, userId));
}

function expectedRow(
  overrides: Pick<TeamMember, "membershipId" | "name" | "role" | "change"> &
    Partial<TeamMember> & { readonly userId: string },
): TeamMember {
  const { userId, ...rest } = overrides;
  return {
    email: `${userId}@empresa.com`,
    isSelf: false,
    status: "active",
    hasAccount: false,
    statusChange: "deactivate",
    ...rest,
  };
}

describe("getTeamView: la lista (criterio 14)", () => {
  async function seedTeam() {
    const seeded = await seedWorkspace();
    const workspaceId = seeded.workspaceId;
    await nameAccount(seeded.ownerId, "Zoe Propietaria");
    const owner = await membershipOf(workspaceId, seeded.ownerId);
    const admin = await seedPerson(workspaceId, "admin");
    await nameAccount(admin.userId, "Bruno Admin");
    const secondAdmin = await seedPerson(workspaceId, "admin");
    await nameAccount(secondAdmin.userId, "Beatriz Admin");
    const edited = await seedPerson(workspaceId, "member");
    await nameAccount(edited.userId, "Zulema Cuenta");
    await seedPreferences(edited.userId, { displayName: "Ana Editada" });
    const google = await seedPerson(workspaceId, "member");
    await nameAccount(google.userId, "Carla Google");
    const projectManager = await seedPerson(workspaceId, "project_manager");
    await nameAccount(projectManager.userId, "Diego Proyectos");
    const teamManager = await seedPerson(workspaceId, "team_manager");
    await nameAccount(teamManager.userId, "Elena Equipo");
    const inactive = await seedPerson(workspaceId, "admin", "inactive");
    await nameAccount(inactive.userId, "Aarón Inactivo");
    const reactivable = await seedPerson(workspaceId, "member", "inactive");
    await nameAccount(reactivable.userId, "Carmen Inactiva");
    await seedAccount(reactivable.userId);
    const withoutAccount = await seedPerson(workspaceId, "member", "inactive");
    await nameAccount(withoutAccount.userId, "Fabián Sin Cuenta");
    const invited = await seedPerson(workspaceId, "member", "invited");
    await nameAccount(invited.userId, "Abel Invitado");
    const other = await seedWorkspace();
    const foreign = await seedPerson(other.workspaceId, "member");
    await nameAccount(foreign.userId, "Abril Ajena");

    // Las filas como las ve el owner.
    const rows = {
      inactiveAdmin: expectedRow({
        userId: inactive.userId,
        membershipId: inactive.membershipId,
        name: "Aarón Inactivo",
        role: "admin",
        change: null,
        status: "inactive",
        statusChange: null,
      }),
      reactivable: expectedRow({
        userId: reactivable.userId,
        membershipId: reactivable.membershipId,
        name: "Carmen Inactiva",
        role: "member",
        change: null,
        status: "inactive",
        hasAccount: true,
        statusChange: "reactivate",
      }),
      withoutAccount: expectedRow({
        userId: withoutAccount.userId,
        membershipId: withoutAccount.membershipId,
        name: "Fabián Sin Cuenta",
        role: "member",
        change: null,
        status: "inactive",
        statusChange: null,
      }),
      edited: expectedRow({
        userId: edited.userId,
        membershipId: edited.membershipId,
        name: "Ana Editada",
        role: "member",
        change: "promote",
      }),
      admin: expectedRow({
        userId: admin.userId,
        membershipId: admin.membershipId,
        name: "Bruno Admin",
        role: "admin",
        change: "demote",
      }),
      secondAdmin: expectedRow({
        userId: secondAdmin.userId,
        membershipId: secondAdmin.membershipId,
        name: "Beatriz Admin",
        role: "admin",
        change: "demote",
      }),
      google: expectedRow({
        userId: google.userId,
        membershipId: google.membershipId,
        name: "Carla Google",
        role: "member",
        change: "promote",
      }),
      projectManager: expectedRow({
        userId: projectManager.userId,
        membershipId: projectManager.membershipId,
        name: "Diego Proyectos",
        role: "project_manager",
        change: null,
      }),
      teamManager: expectedRow({
        userId: teamManager.userId,
        membershipId: teamManager.membershipId,
        name: "Elena Equipo",
        role: "team_manager",
        change: null,
      }),
      owner: expectedRow({
        userId: seeded.ownerId,
        membershipId: owner.id,
        name: "Zoe Propietaria",
        role: "owner",
        change: null,
        statusChange: null,
      }),
    };
    return { seeded, admin, inactive, rows };
  }

  it("para el owner: las activas y las inactivas del workspace, con estado, cuenta y controles, en orden (criterio 18)", async () => {
    const { seeded, rows } = await seedTeam();

    const view = await getTeamView(ownerOf(seeded));

    expect(view).toEqual({
      kind: "ready",
      members: [
        rows.inactiveAdmin,
        rows.edited,
        rows.secondAdmin,
        rows.admin,
        rows.google,
        rows.reactivable,
        rows.projectManager,
        rows.teamManager,
        rows.withoutAccount,
        { ...rows.owner, isSelf: true },
      ],
    });
  });

  it("para un admin: asciende a los members y no quita el rol a ningún admin, tampoco al suyo (D-R8-5); no desactiva ni reactiva a un admin (D-E2-4)", async () => {
    const { admin, rows } = await seedTeam();

    const view = await getTeamView(admin.actor);

    expect(view.kind === "ready" && view.members).toEqual([
      rows.inactiveAdmin,
      rows.edited,
      { ...rows.secondAdmin, change: null, statusChange: null },
      { ...rows.admin, isSelf: true, change: null, statusChange: null },
      rows.google,
      rows.reactivable,
      rows.projectManager,
      rows.teamManager,
      rows.withoutAccount,
      rows.owner,
    ]);
  });

  it("dos nombres iguales desempatan por el id de la membresía", async () => {
    const seeded = await seedWorkspace();
    await nameAccount(seeded.ownerId, "Ana");
    const twin = await seedPerson(seeded.workspaceId, "member");
    await nameAccount(twin.userId, "ana");
    const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);

    const view = await getTeamView(ownerOf(seeded));

    const expected = [owner.id, twin.membershipId].sort();
    expect(view.kind === "ready" && view.members.map((row) => row.membershipId)).toEqual(
      expected,
    );
  });

  it.each([
    ["un member", "member", "active", "role"],
    ["un project_manager", "project_manager", "active", "role"],
    ["un team_manager", "team_manager", "active", "role"],
    ["un admin inactive", "admin", "inactive", "inactive"],
    ["un admin invited", "admin", "invited", "inactive"],
  ] as const)(
    "para %s: forbidden, sin leer la lista",
    async (_label, role, status, reason) => {
      const seeded = await seedWorkspace();
      const viewer = await seedPerson(seeded.workspaceId, role, status);
      const list = vi.spyOn(teamRepository, "listMembers");

      const view = await getTeamView(viewer.actor);

      expect(view).toEqual({ kind: "forbidden", reason });
      expect(list).not.toHaveBeenCalled();
    },
  );
});

describe("la sesión siguiente decide con el rol nuevo (criterio 16)", () => {
  async function othersViewOf(userId: string) {
    const context = await ensureWorkspaceContext({
      id: userId,
      email: `${userId}@empresa.com`,
    });
    if (context === null) {
      throw new Error(`${userId} no tiene acceso.`);
    }
    return {
      role: context.actor.role,
      seesOthers: can(context.actor, "timeEntry.others.view", {
        kind: "workspace",
        workspaceId: context.actor.workspaceId,
      }),
    };
  }

  async function change(
    seeded: SeededWorkspace,
    membershipId: string,
    role: ChangeableRole,
  ) {
    await changeRole(ownerOf(seeded), { membershipId, role });
  }

  it("ascendida ve las horas de todos y bajada deja de verlas", async () => {
    // Un solo workspace: `ensureWorkspaceContext` toma el más viejo.
    const seeded = await seedWorkspace();
    const person = await seedPerson(seeded.workspaceId, "member");

    expect(await othersViewOf(person.userId)).toEqual({
      role: "member",
      seesOthers: false,
    });
    await change(seeded, person.membershipId, "admin");
    expect(await othersViewOf(person.userId)).toEqual({
      role: "admin",
      seesOthers: true,
    });
    await change(seeded, person.membershipId, "member");
    expect(await othersViewOf(person.userId)).toEqual({
      role: "member",
      seesOthers: false,
    });
  });
});

/** Todo lo que `changeStatus` puede escribir, para afirmar que no escribió. */
async function statusWrites() {
  return {
    memberships: await db.select().from(membership).orderBy(membership.id),
    entries: await db.select().from(timeEntry).orderBy(timeEntry.id),
    sessions: await db.select().from(session).orderBy(session.id),
    accounts: await db.select().from(account).orderBy(account.id),
    audits: await db.select().from(auditLog).orderBy(auditLog.id),
  };
}

/** Las constancias, sin ids ni instantes. */
async function auditTrail() {
  const rows = await db.select().from(auditLog);
  return rows
    .map((row) => ({
      actorId: row.actorId,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      previousValue: row.previousValue,
      nextValue: row.nextValue,
    }))
    .sort((left, right) => left.action.localeCompare(right.action));
}

function sessionsOf(userId: string) {
  return db.select().from(session).where(eq(session.userId, userId));
}

async function statusOf(membershipId: string) {
  const row = await membershipById(membershipId);
  return row === undefined ? undefined : { role: row.role, status: row.status };
}

function deactivate(actor: Actor, membershipId: string) {
  return changeStatus(actor, { membershipId, status: "inactive" });
}

function reactivate(actor: Actor, membershipId: string) {
  return changeStatus(actor, { membershipId, status: "active" });
}

describe("changeStatus: desactivar (criterio 1, EQ-39, EQ-41, EQ-43)", () => {
  it("el owner desactiva a un member con timer y dos sesiones: membresía, timer y sesiones en una transacción, con tres constancias", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const sub = await seedAccount(target.userId);
    await seedSession(target.userId);
    await seedSession(target.userId);
    const running = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: target.userId,
      description: "en curso",
      startedAt: "2026-10-02T11:00:00Z",
      billable: true,
    });
    const projectRow = await seedProject({
      workspaceId: seeded.workspaceId,
      members: [{ userId: target.userId }],
    });
    const taskRow = await seedTask({
      workspaceId: seeded.workspaceId,
      projectId: projectRow.id,
    });
    await db.insert(taskAssignee).values({
      workspaceId: seeded.workspaceId,
      taskId: taskRow.id,
      userId: target.userId,
    });
    const otherSession = await seedSession(seeded.ownerId);

    const result = await deactivate(ownerOf(seeded), target.membershipId);

    expect(result).toEqual({ membershipId: target.membershipId, status: "inactive" });
    expect(await statusOf(target.membershipId)).toEqual({
      role: "member",
      status: "inactive",
    });
    const [stopAudit] = await auditFor("time_entry", running.id);
    const stopped = await timeEntryById(running.id);
    // El `now()` de la transacción: el mismo de la constancia.
    expect(stopped?.endedAt).toEqual(stopAudit.createdAt);
    expect(stopped).toEqual({
      ...running,
      endedAt: stopped?.endedAt,
      updatedAt: stopped?.updatedAt,
    });
    expect(await sessionsOf(target.userId)).toEqual([]);
    expect(
      (await db.select({ id: session.id }).from(session)).map((row) => row.id),
    ).toEqual([otherSession]);
    expect(await db.select({ accountId: account.accountId }).from(account)).toEqual([
      { accountId: sub },
    ]);
    expect(
      await db
        .select({ userId: projectMember.userId })
        .from(projectMember)
        .where(eq(projectMember.projectId, projectRow.id)),
    ).toEqual([{ userId: target.userId }]);
    expect(await db.select({ userId: taskAssignee.userId }).from(taskAssignee)).toEqual([
      { userId: target.userId },
    ]);
    expect(await auditTrail()).toEqual([
      {
        actorId: seeded.ownerId,
        action: "membership.deactivate",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: JSON.stringify({ status: "active" }),
        nextValue: JSON.stringify({ status: "inactive" }),
      },
      {
        actorId: seeded.ownerId,
        action: "session.revokeAll",
        entity: "user",
        entityId: target.userId,
        previousValue: JSON.stringify({ sessions: 2 }),
        nextValue: null,
      },
      {
        actorId: seeded.ownerId,
        action: "timeEntry.stop",
        entity: "time_entry",
        entityId: running.id,
        previousValue: JSON.stringify({ endedAt: null }),
        nextValue: JSON.stringify({ endedAt: stopped?.endedAt }),
      },
    ]);
  });

  it("sin timer ni sesiones escribe solo la membresía y membership.deactivate (criterio 2)", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const closed = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: target.userId,
      startedAt: "2026-10-01T12:00:00Z",
      endedAt: "2026-10-01T13:00:00Z",
    });

    await deactivate(ownerOf(seeded), target.membershipId);

    expect((await statusOf(target.membershipId))?.status).toBe("inactive");
    expect(await timeEntryById(closed.id)).toEqual(closed);
    expect((await auditTrail()).map((row) => row.action)).toEqual([
      "membership.deactivate",
    ]);
  });
});

describe("changeStatus: reactivar (criterio 3, EQ-37, EQ-47)", () => {
  it("una admin inactiva con cuenta vuelve active y admin, sin timer nuevo ni tocar sus sesiones, con membership.reactivate", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "admin", "inactive");
    await seedAccount(target.userId);
    // Una sesión que quedó de un estado escrito por SQL (D-E2-2): reactivar no la toca.
    await seedSession(target.userId);
    const sessions = await sessionsOf(target.userId);

    const result = await reactivate(ownerOf(seeded), target.membershipId);

    expect(result).toEqual({ membershipId: target.membershipId, status: "active" });
    expect(await statusOf(target.membershipId)).toEqual({
      role: "admin",
      status: "active",
    });
    expect(await db.select().from(timeEntry)).toEqual([]);
    expect(await sessionsOf(target.userId)).toEqual(sessions);
    expect(await auditTrail()).toEqual([
      {
        actorId: seeded.ownerId,
        action: "membership.reactivate",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: JSON.stringify({ status: "inactive" }),
        nextValue: JSON.stringify({ status: "active" }),
      },
    ]);
  });
});

describe("changeStatus: idempotente por el estado pedido (criterio 4, EQ-97, EQ-98)", () => {
  it.each([
    ["desactivar a una inactiva", "inactive"],
    ["reactivar a una activa", "active"],
  ] as const)("%s responde éxito sin escribir", async (_label, status: MemberStatus) => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", status);
    await seedAccount(target.userId);
    await seedSession(target.userId);
    const before = await statusWrites();

    const result = await changeStatus(ownerOf(seeded), {
      membershipId: target.membershipId,
      status,
    });

    expect(result).toEqual({ membershipId: target.membershipId, status });
    expect(await statusWrites()).toEqual(before);
  });

  it("reactivar a una activa sin account responde éxito sin escribir: el paso 7 va antes del 8", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const before = await statusWrites();

    const result = await reactivate(ownerOf(seeded), target.membershipId);

    expect(result).toEqual({ membershipId: target.membershipId, status: "active" });
    expect(await statusWrites()).toEqual(before);
  });
});

describe("changeStatus: quién (criterio 5, EQ-38, EQ-39, P-07)", () => {
  it.each(["member", "project_manager", "team_manager"] as const)(
    "un admin desactiva y reactiva a una %s",
    async (role) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const target = await seedPerson(seeded.workspaceId, role);
      await seedAccount(target.userId);

      await deactivate(admin.actor, target.membershipId);
      expect(await statusOf(target.membershipId)).toEqual({ role, status: "inactive" });

      await reactivate(admin.actor, target.membershipId);
      expect(await statusOf(target.membershipId)).toEqual({ role, status: "active" });
      expect((await auditTrail()).map((row) => row.actorId)).toEqual([
        admin.userId,
        admin.userId,
      ]);
    },
  );

  it.each([
    ["desactivar", "active", "inactive"],
    ["reactivar", "inactive", "active"],
  ] as const)(
    "un admin sobre otro admin, para %s, responde forbidden con EQ-85 sin escribir",
    async (_label, from, to) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const target = await seedPerson(seeded.workspaceId, "admin", from);
      await seedAccount(target.userId);
      const before = await statusWrites();

      const error = await failureOf(
        changeStatus(admin.actor, { membershipId: target.membershipId, status: to }),
      );

      expect([error.code, error.message]).toEqual([
        "forbidden",
        teamMessages.adminStatusOwnerOnly,
      ]);
      expect(await statusWrites()).toEqual(before);
    },
  );

  it("el owner desactiva y reactiva a un admin", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "admin");
    await seedAccount(target.userId);

    await deactivate(ownerOf(seeded), target.membershipId);
    expect(await statusOf(target.membershipId)).toEqual({
      role: "admin",
      status: "inactive",
    });
    await reactivate(ownerOf(seeded), target.membershipId);
    expect(await statusOf(target.membershipId)).toEqual({
      role: "admin",
      status: "active",
    });
  });

  it.each(["member", "project_manager", "team_manager"] as const)(
    "una %s responde forbidden con EQ-90 sin escribir",
    async (role) => {
      const seeded = await seedWorkspace();
      const actor = await seedPerson(seeded.workspaceId, role);
      const target = await seedPerson(seeded.workspaceId, "member");
      const before = await statusWrites();

      const error = await failureOf(deactivate(actor.actor, target.membershipId));

      expect([error.code, error.message]).toEqual([
        "forbidden",
        teamMessages.forbiddenAction,
      ]);
      expect(await statusWrites()).toEqual(before);
    },
  );
});

describe("changeStatus: la autoridad bajo el bloqueo (criterio 6, EQ-98)", () => {
  it.each([
    ["perdió el rol", { role: "member" as const }],
    ["quedó inactiva", { status: "inactive" as const }],
  ])(
    "un admin cuya membresía %s entre la sesión y el bloqueo recibe forbidden sin escribir",
    async (_label, change) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const target = await seedPerson(seeded.workspaceId, "member");
      await db
        .update(membership)
        .set(change)
        .where(eq(membership.id, admin.membershipId));
      const before = await statusWrites();

      const error = await failureOf(deactivate(admin.actor, target.membershipId));

      expect([error.code, error.message]).toEqual([
        "forbidden",
        teamMessages.forbiddenAction,
      ]);
      expect(await statusWrites()).toEqual(before);
    },
  );

  it("un actor sin membresía en el workspace recibe forbidden", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const ghost = actorIn(seeded.workspaceId, randomUUID(), { role: "admin" });

    const error = await failureOf(deactivate(ghost, target.membershipId));

    expect([error.code, error.message]).toEqual([
      "forbidden",
      teamMessages.forbiddenAction,
    ]);
    expect((await statusOf(target.membershipId))?.status).toBe("active");
  });
});

describe("changeStatus: la propia y la del owner (criterio 7, EQ-40)", () => {
  it.each([
    ["el owner", "owner"],
    ["un admin", "admin"],
  ] as const)(
    "%s sobre la propia responde status_locked con EQ-84",
    async (_label, role) => {
      const seeded = await seedWorkspace();
      const self =
        role === "owner"
          ? {
              actor: ownerOf(seeded),
              membershipId: (await membershipOf(seeded.workspaceId, seeded.ownerId)).id,
            }
          : await seedPerson(seeded.workspaceId, role);
      const before = await statusWrites();

      const error = await failureOf(deactivate(self.actor, self.membershipId));

      expect([error.code, error.message]).toEqual([
        "status_locked",
        teamMessages.selfStatusLocked,
      ]);
      expect(await statusWrites()).toEqual(before);
    },
  );

  it("un admin sobre la del owner responde status_locked con EQ-83, para desactivar y para reactivar", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);
    const before = await statusWrites();

    for (const status of ["inactive", "active"] as const) {
      const error = await failureOf(
        changeStatus(admin.actor, { membershipId: owner.id, status }),
      );
      expect([status, error.code, error.message]).toEqual([
        status,
        "status_locked",
        teamMessages.ownerStatusLocked,
      ]);
    }
    expect(await statusWrites()).toEqual(before);
  });
});

describe("changeStatus: lo que no está (criterio 8, EQ-82)", () => {
  it("un id que no existe, uno de otro workspace y una membresía invited responden not_found", async () => {
    const seeded = await seedWorkspace();
    const invited = await seedPerson(seeded.workspaceId, "member", "invited");
    const other = await seedWorkspace();
    const foreign = await seedPerson(other.workspaceId, "member");
    const before = await statusWrites();

    for (const membershipId of [
      randomUUID(),
      foreign.membershipId,
      invited.membershipId,
    ]) {
      const error = await failureOf(deactivate(ownerOf(seeded), membershipId));
      expect([error.code, error.message]).toEqual(["not_found", teamMessages.notFound]);
    }
    expect(await statusWrites()).toEqual(before);
  });
});

describe("changeStatus: sin cuenta (criterio 9, D-E2-7)", () => {
  it("reactivar a una inactiva sin account responde no_account sin escribir; con seedAccount, reactiva", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", "inactive");
    const before = await statusWrites();

    const error = await failureOf(reactivate(ownerOf(seeded), target.membershipId));

    expect([error.code, error.message]).toEqual(["no_account", teamMessages.noAccount]);
    expect(await statusWrites()).toEqual(before);

    await seedAccount(target.userId);
    await reactivate(ownerOf(seeded), target.membershipId);
    expect((await statusOf(target.membershipId))?.status).toBe("active");
  });

  it("desactivar a quien no tiene account no la pide", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");

    await deactivate(ownerOf(seeded), target.membershipId);

    expect((await statusOf(target.membershipId))?.status).toBe("inactive");
  });
});

describe("changeStatus: todo o nada (criterio 17, ADR 0025)", () => {
  it("un fallo después de borrar las sesiones deja la membresía, el timer, las sesiones y las constancias como estaban", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedSession(target.userId);
    await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: target.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const before = await statusWrites();
    injected.failAfterSessions = true;

    await expect(deactivate(ownerOf(seeded), target.membershipId)).rejects.toThrow(
      "Fallo inyectado después de borrar las sesiones.",
    );

    expect(await statusWrites()).toEqual(before);
  });
});

describe("el catálogo del reporte después de desactivar (criterio 23, EQ-101)", () => {
  it("listWorkspacePeople con la transacción de un reporte la devuelve inactive", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");

    await deactivate(ownerOf(seeded), target.membershipId);

    const people = await db.transaction((tx) => listWorkspacePeople(tx, ownerOf(seeded)));
    expect(people.find((person) => person.userId === target.userId)?.status).toBe(
      "inactive",
    );
  });
});

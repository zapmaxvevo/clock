import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership, user } from "@/server/db/schema";
import { can, type MembershipStatus, type Role } from "@/server/permissions";
import {
  seedMember,
  seedPreferences,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { auditFor } from "@/test/queries";
import { actorIn, failureOf } from "@/test/time-entry";
import { ensureWorkspaceContext } from "@/modules/workspace/service";

import { teamRepository } from "./repository";
import { teamMessages, type ChangeableRole, type TeamMember } from "./schema";
import { changeRole, getTeamView } from "./service";

/**
 * `seedMember` devuelve el id del usuario; `changeRole` recibe el de la
 * membresía (contrato de R8, §6).
 */
async function membershipOf(workspaceId: string, userId: string) {
  const rows = await db
    .select()
    .from(membership)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)));
  const row = rows.at(0);
  if (row === undefined) {
    throw new Error(`Sin membresía de ${userId} en ${workspaceId}.`);
  }
  return row;
}

async function membershipById(id: string) {
  const rows = await db.select().from(membership).where(eq(membership.id, id));
  return rows.at(0);
}

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

  it("un admin baja a otro admin a member, con el admin como actor", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const target = await seedPerson(seeded.workspaceId, "admin");

    const result = await changeRole(admin.actor, {
      membershipId: target.membershipId,
      role: "member",
    });

    expect(result).toEqual({ membershipId: target.membershipId, role: "member" });
    expect((await membershipById(target.membershipId))?.role).toBe("member");
    expect((await membershipById(admin.membershipId))?.role).toBe("admin");
    const audit = await auditFor("membership");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      workspaceId: seeded.workspaceId,
      actorId: admin.userId,
      entityId: target.membershipId,
      previousValue: JSON.stringify({ role: "admin" }),
      nextValue: JSON.stringify({ role: "member" }),
    });
  });

  it("un admin se baja a sí mismo (D-R8-5)", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");

    const result = await changeRole(admin.actor, {
      membershipId: admin.membershipId,
      role: "member",
    });

    expect(result).toEqual({ membershipId: admin.membershipId, role: "member" });
    expect((await membershipById(admin.membershipId))?.role).toBe("member");
    expect(await auditFor("membership", admin.membershipId)).toHaveLength(1);
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
});

describe("changeRole: el owner (criterio 5)", () => {
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
  return { email: `${userId}@empresa.com`, isSelf: false, ...rest };
}

describe("getTeamView: la lista (criterio 14)", () => {
  async function seedTeam() {
    const seeded = await seedWorkspace();
    const workspaceId = seeded.workspaceId;
    await nameAccount(seeded.ownerId, "Zoe Propietaria");
    const owner = await membershipOf(workspaceId, seeded.ownerId);
    const admin = await seedPerson(workspaceId, "admin");
    await nameAccount(admin.userId, "Bruno Admin");
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
    const invited = await seedPerson(workspaceId, "member", "invited");
    await nameAccount(invited.userId, "Abel Invitado");
    const other = await seedWorkspace();
    const foreign = await seedPerson(other.workspaceId, "member");
    await nameAccount(foreign.userId, "Abril Ajena");

    const rows = {
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
      }),
    };
    return { seeded, admin, inactive, rows };
  }

  it("para el owner: las activas del workspace, con nombre, email y control, en orden", async () => {
    const { seeded, rows } = await seedTeam();

    const view = await getTeamView(ownerOf(seeded));

    expect(view).toEqual({
      kind: "ready",
      members: [
        rows.edited,
        rows.admin,
        rows.google,
        rows.projectManager,
        rows.teamManager,
        { ...rows.owner, isSelf: true },
      ],
    });
  });

  it("para un admin: su fila es la propia, con demote", async () => {
    const { admin, rows } = await seedTeam();

    const view = await getTeamView(admin.actor);

    expect(view.kind === "ready" && view.members).toEqual([
      rows.edited,
      { ...rows.admin, isSelf: true },
      rows.google,
      rows.projectManager,
      rows.teamManager,
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
      const list = vi.spyOn(teamRepository, "listActiveMembers");

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

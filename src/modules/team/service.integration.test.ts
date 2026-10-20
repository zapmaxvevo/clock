import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { releasedEmailOf } from "@/lib/email";
import type * as AuthRecords from "@/server/auth-records";
import type * as OAuthRecords from "@/server/oauth-records";
import type * as WorkspaceService from "@/modules/workspace/service";
import { db } from "@/server/db";
import {
  account,
  auditLog,
  invitation,
  membership,
  oauthAccessToken,
  oauthConsent,
  oauthRefreshToken,
  projectMember,
  session,
  taskAssignee,
  timeEntry,
  user,
} from "@/server/db/schema";
import { can, type Actor, type MembershipStatus, type Role } from "@/server/permissions";
import {
  seedAccount,
  seedAccountLink,
  seedInvitation,
  seedMember,
  seedPreferences,
  seedProject,
  seedSession,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { grantRowsOf, seedGrant, seedOAuthClient } from "@/test/oauth-grants";
import {
  auditFor,
  invitationOf,
  membershipById,
  membershipOf,
  timeEntryById,
} from "@/test/queries";
import { actorIn, failureOf } from "@/test/time-entry";
import {
  ensureWorkspaceContext,
  inviteMembers,
  listWorkspacePeople,
} from "@/modules/workspace/service";

import { teamRepository } from "./repository";
import {
  teamMessages,
  type ChangeableRole,
  type MemberStatus,
  type TeamMember,
} from "./schema";
import {
  changeRole,
  changeStatus,
  claimAccountLink,
  getTeamView,
  releaseEmail,
  setAccountLink,
} from "./service";

/**
 * Criterio 17: un fallo después de borrar las sesiones, cuando `failAfterSessions`
 * está puesto, o después de borrar las autorizaciones (D-MCP-6), con
 * `failAfterGrants`. El resto de los tests usa las funciones reales.
 */
const injected = vi.hoisted(() => ({
  failAfterSessions: false,
  failAfterRelease: false,
  failAfterRegister: false,
  failAfterGrants: false,
}));

vi.mock("@/server/oauth-records", async (importOriginal) => {
  const actual = await importOriginal<typeof OAuthRecords>();
  return {
    ...actual,
    deleteGrantsOf: async (...args: Parameters<typeof actual.deleteGrantsOf>) => {
      const clients = await actual.deleteGrantsOf(...args);
      if (injected.failAfterGrants) {
        throw new Error("Fallo inyectado después de borrar las autorizaciones.");
      }
      return clients;
    },
  };
});

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
    // Criterio 22 de E2b: un fallo después de liberar el correo.
    releaseEmailOf: async (...args: Parameters<typeof actual.releaseEmailOf>) => {
      await actual.releaseEmailOf(...args);
      if (injected.failAfterRelease) {
        throw new Error("Fallo inyectado después de liberar el correo.");
      }
    },
  };
});

// Criterio 22 de E2b: un fallo después de registrar al externo.
vi.mock("@/modules/workspace/service", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceService>();
  return {
    ...actual,
    registerExternalMember: async (
      ...args: Parameters<typeof actual.registerExternalMember>
    ) => {
      const registered = await actual.registerExternalMember(...args);
      if (injected.failAfterRegister) {
        throw new Error("Fallo inyectado después de registrar al externo.");
      }
      return registered;
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
  email?: string,
) {
  const userId = await seedMember(workspaceId, role, status, { email });
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
  injected.failAfterRelease = false;
  injected.failAfterRegister = false;
  injected.failAfterGrants = false;
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
    link: null,
    linkActions: [],
    registersExternal: false,
    canReleaseEmail: false,
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

    // D-E2b-4: el owner pide la vinculación en toda activa, también la suya, y
    // libera el correo de toda inactiva; reactiva sin cuenta, también a un admin.
    const request = { linkActions: ["request"] } as const;
    const release = { canReleaseEmail: true } as const;
    expect(view).toEqual({
      kind: "ready",
      linkTtlDays: 7,
      members: [
        { ...rows.inactiveAdmin, ...release, statusChange: "reactivate" },
        { ...rows.edited, ...request },
        { ...rows.secondAdmin, ...request },
        { ...rows.admin, ...request },
        { ...rows.google, ...request },
        { ...rows.reactivable, ...release },
        { ...rows.projectManager, ...request },
        { ...rows.teamManager, ...request },
        { ...rows.withoutAccount, ...release, statusChange: "reactivate" },
        { ...rows.owner, ...request, isSelf: true },
      ],
    });
  });

  it("para un admin: asciende a los members y no quita el rol a ningún admin, tampoco al suyo (D-R8-5); no desactiva ni reactiva a un admin (D-E2-4); no vincula ni libera a un admin ni al owner (D-E2b-4)", async () => {
    const { admin, rows } = await seedTeam();

    const view = await getTeamView(admin.actor);

    // D-E2b-4: un admin vincula y libera solo en las filas que no son `admin` ni
    // del owner; reactiva a un member sin cuenta (D-E2b-5).
    const request = { linkActions: ["request"] } as const;
    const release = { canReleaseEmail: true } as const;
    expect(view.kind === "ready" && view.members).toEqual([
      rows.inactiveAdmin,
      { ...rows.edited, ...request },
      { ...rows.secondAdmin, change: null, statusChange: null },
      { ...rows.admin, isSelf: true, change: null, statusChange: null },
      { ...rows.google, ...request },
      { ...rows.reactivable, ...release },
      { ...rows.projectManager, ...request },
      { ...rows.teamManager, ...request },
      { ...rows.withoutAccount, ...release, statusChange: "reactivate" },
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
    consents: await db.select().from(oauthConsent).orderBy(oauthConsent.id),
    refreshTokens: await db
      .select()
      .from(oauthRefreshToken)
      .orderBy(oauthRefreshToken.id),
    accessTokens: await db.select().from(oauthAccessToken).orderBy(oauthAccessToken.id),
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

    expect(result).toEqual({
      membershipId: target.membershipId,
      status: "inactive",
      linkRequested: false,
    });
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

    expect(result).toEqual({
      membershipId: target.membershipId,
      status: "active",
      linkRequested: false,
    });
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

    expect(result).toEqual({
      membershipId: target.membershipId,
      status,
      linkRequested: false,
    });
    expect(await statusWrites()).toEqual(before);
  });

  it("reactivar a una activa sin account responde éxito sin escribir ni pedir la vinculación: el paso 7 va antes del 8", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const before = await statusWrites();

    const result = await reactivate(ownerOf(seeded), target.membershipId);

    expect(result).toEqual({
      membershipId: target.membershipId,
      status: "active",
      linkRequested: false,
    });
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

describe("changeStatus: desactivar revoca los asistentes (criterio 13 del MCP, D-MCP-6)", () => {
  it("borra los consentimientos y los tokens de sus dos clientes y deja mcp.revokeAll", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const sessionId = await seedSession(target.userId);
    const first = await seedOAuthClient();
    const second = await seedOAuthClient();
    await seedGrant(target.userId, first, { sessionId });
    await seedGrant(target.userId, second);
    await seedGrant(seeded.ownerId, first);

    await deactivate(ownerOf(seeded), target.membershipId);

    expect(await grantRowsOf(target.userId)).toEqual({
      consents: 0,
      refresh: 0,
      access: 0,
    });
    expect(await grantRowsOf(seeded.ownerId)).toEqual({
      consents: 1,
      refresh: 1,
      access: 1,
    });
    const audits = await auditFor("user", target.userId);
    expect(audits.map((row) => [row.action, row.actorId, row.previousValue])).toEqual([
      ["session.revokeAll", seeded.ownerId, JSON.stringify({ sessions: 1 })],
      ["mcp.revokeAll", seeded.ownerId, JSON.stringify({ clients: 2 })],
    ]);
  });

  it("sin asistentes no deja mcp.revokeAll", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");

    await deactivate(ownerOf(seeded), target.membershipId);

    expect((await auditFor("user", target.userId)).map((row) => row.action)).toEqual([]);
  });

  it("reactivar no devuelve las autorizaciones", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccount(target.userId);
    await seedGrant(target.userId, await seedOAuthClient());

    await deactivate(ownerOf(seeded), target.membershipId);
    await reactivate(ownerOf(seeded), target.membershipId);

    expect(await grantRowsOf(target.userId)).toEqual({
      consents: 0,
      refresh: 0,
      access: 0,
    });
  });

  it("un fallo después de borrar las autorizaciones deja todo como estaba, también el set null de los tokens", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    const sessionId = await seedSession(target.userId);
    await seedGrant(target.userId, await seedOAuthClient(), { sessionId });
    const before = await statusWrites();
    injected.failAfterGrants = true;

    await expect(deactivate(ownerOf(seeded), target.membershipId)).rejects.toThrow(
      "Fallo inyectado después de borrar las autorizaciones.",
    );

    expect(await statusWrites()).toEqual(before);
    expect(before.accessTokens.map((row) => row.sessionId)).toEqual([sessionId]);
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

/** Todo lo que vincular o liberar puede escribir, para afirmar que no escribió. */
async function accountWrites() {
  return {
    ...(await statusWrites()),
    users: await db.select().from(user).orderBy(user.id),
    invitations: await db.select().from(invitation).orderBy(invitation.id),
  };
}

/** La marca de la membresía: cuándo y quién la pidió. */
async function markOf(membershipId: string) {
  const row = await membershipById(membershipId);
  return {
    requestedAt: row?.accountLinkRequestedAt ?? null,
    requestedById: row?.accountLinkRequestedById ?? null,
  };
}

function requestLink(actor: Actor, membershipId: string) {
  return setAccountLink(actor, { membershipId, link: true });
}

function cancelLink(actor: Actor, membershipId: string) {
  return setAccountLink(actor, { membershipId, link: false });
}

function release(actor: Actor, membershipId: string) {
  return releaseEmail(actor, { membershipId });
}

/** La fila de la vista de `actor` con ese id. */
async function viewRowOf(actor: Actor, membershipId: string) {
  const view = await getTeamView(actor);
  if (view.kind !== "ready") {
    throw new Error("La vista no está lista.");
  }
  return view.members.find((row) => row.membershipId === membershipId);
}

describe("setAccountLink: pedir (criterio 1 de E2b, D-E2b-6)", () => {
  it("el owner la pide para una activa con cuenta: la marca con la fecha de la base y el owner, y membership.linkRequest; nada más cambia", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccount(target.userId);
    await seedSession(target.userId);
    const before = await accountWrites();

    const result = await requestLink(ownerOf(seeded), target.membershipId);

    expect(result).toEqual({ membershipId: target.membershipId, linkPending: true });
    const mark = await markOf(target.membershipId);
    expect(mark.requestedById).toBe(seeded.ownerId);
    expect(mark.requestedAt).toBeInstanceOf(Date);
    expect(await auditTrail()).toEqual([
      {
        actorId: seeded.ownerId,
        action: "membership.linkRequest",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: JSON.stringify({ linkRequestedAt: null }),
        nextValue: JSON.stringify({ linkRequestedAt: mark.requestedAt }),
      },
    ]);
    const after = await accountWrites();
    expect([after.accounts, after.sessions, after.users, after.invitations]).toEqual([
      before.accounts,
      before.sessions,
      before.users,
      before.invitations,
    ]);
    expect((await statusOf(target.membershipId))?.status).toBe("active");
  });

  it("una vigente se ve en la fila con su vencimiento a los siete días y solo se ofrece cancelarla", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");

    await requestLink(ownerOf(seeded), target.membershipId);

    const { requestedAt } = await markOf(target.membershipId);
    const row = await viewRowOf(ownerOf(seeded), target.membershipId);
    expect([row?.link, row?.linkActions]).toEqual([
      {
        requestedAt,
        expiresAt: new Date((requestedAt?.getTime() ?? 0) + 7 * 24 * 60 * 60 * 1000),
        expired: false,
      },
      ["cancel"],
    ]);
  });
});

describe("setAccountLink: vencida (criterio 6 de E2b, D-E2b-11)", () => {
  it("una de hace ocho días se ve vencida, ofrece pedirla y cancelarla, y pedirla la renueva con la fecha anterior en la constancia", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccountLink(target.membershipId, seeded.ownerId, "8 days");
    const old = await markOf(target.membershipId);

    const row = await viewRowOf(ownerOf(seeded), target.membershipId);
    expect([row?.link?.expired, row?.linkActions]).toEqual([true, ["request", "cancel"]]);

    const result = await requestLink(ownerOf(seeded), target.membershipId);

    expect(result).toEqual({ membershipId: target.membershipId, linkPending: true });
    const renewed = await markOf(target.membershipId);
    expect(renewed.requestedAt?.getTime()).toBeGreaterThan(
      old.requestedAt?.getTime() ?? 0,
    );
    expect(await auditTrail()).toEqual([
      {
        actorId: seeded.ownerId,
        action: "membership.linkRequest",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: JSON.stringify({ linkRequestedAt: old.requestedAt }),
        nextValue: JSON.stringify({ linkRequestedAt: renewed.requestedAt }),
      },
    ]);
    const after = await viewRowOf(ownerOf(seeded), target.membershipId);
    expect([after?.link?.expired, after?.linkActions]).toEqual([false, ["cancel"]]);
  });
});

describe("la marca solo en una activa (criterio 7 de E2b, D-E2b-2, P-05)", () => {
  it("la base rechaza poner la marca en una inactiva", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", "inactive");

    await expect(
      db
        .update(membership)
        .set({ accountLinkRequestedAt: new Date() })
        .where(eq(membership.id, target.membershipId)),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: "membership_account_link_active" }),
    });
  });

  it("la base rechaza pasar a inactiva una membresía con la marca", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccountLink(target.membershipId, seeded.ownerId);

    await expect(
      db
        .update(membership)
        .set({ status: "inactive" })
        .where(eq(membership.id, target.membershipId)),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: "membership_account_link_active" }),
    });
  });

  it("pedirla para una inactiva responde inactive_membership con EQ-118, sin escribir", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", "inactive");
    await seedAccount(target.userId);
    const before = await accountWrites();

    const error = await failureOf(requestLink(ownerOf(seeded), target.membershipId));

    expect([error.code, error.message]).toEqual([
      "inactive_membership",
      teamMessages.linkInactive,
    ]);
    expect(await accountWrites()).toEqual(before);
  });
});

describe("setAccountLink: cancelar (criterio 8 de E2b, D-E2b-6)", () => {
  it.each([
    ["vigente", "1 day"],
    ["vencida", "8 days"],
  ])("limpia una %s con membership.linkCancel", async (_label, age) => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccountLink(target.membershipId, seeded.ownerId, age);
    const { requestedAt } = await markOf(target.membershipId);

    const result = await cancelLink(admin.actor, target.membershipId);

    expect(result).toEqual({ membershipId: target.membershipId, linkPending: false });
    expect(await markOf(target.membershipId)).toEqual({
      requestedAt: null,
      requestedById: null,
    });
    expect(await auditTrail()).toEqual([
      {
        actorId: admin.userId,
        action: "membership.linkCancel",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: JSON.stringify({ linkRequestedAt: requestedAt }),
        nextValue: JSON.stringify({ linkRequestedAt: null }),
      },
    ]);
  });
});

describe("desactivar cancela la marca (criterio 9 de E2b, D-E2b-7)", () => {
  it("la limpia con membership.linkCancel de quien desactiva, antes del estado, y hace lo de D-E2-5", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccount(target.userId);
    await seedSession(target.userId);
    await seedAccountLink(target.membershipId, seeded.ownerId);
    const { requestedAt } = await markOf(target.membershipId);

    await deactivate(admin.actor, target.membershipId);

    expect(await markOf(target.membershipId)).toEqual({
      requestedAt: null,
      requestedById: null,
    });
    expect((await statusOf(target.membershipId))?.status).toBe("inactive");
    expect(await sessionsOf(target.userId)).toEqual([]);
    expect(await auditTrail()).toEqual([
      {
        actorId: admin.userId,
        action: "membership.deactivate",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: JSON.stringify({ status: "active" }),
        nextValue: JSON.stringify({ status: "inactive" }),
      },
      {
        actorId: admin.userId,
        action: "membership.linkCancel",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: JSON.stringify({ linkRequestedAt: requestedAt }),
        nextValue: JSON.stringify({ linkRequestedAt: null }),
      },
      {
        actorId: admin.userId,
        action: "session.revokeAll",
        entity: "user",
        entityId: target.userId,
        previousValue: JSON.stringify({ sessions: 1 }),
        nextValue: null,
      },
    ]);
  });

  it("reactivarla con cuenta no devuelve la marca", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccount(target.userId);
    await seedAccountLink(target.membershipId, seeded.ownerId);

    await deactivate(ownerOf(seeded), target.membershipId);
    await reactivate(ownerOf(seeded), target.membershipId);

    expect((await markOf(target.membershipId)).requestedAt).toBeNull();
  });
});

describe("reactivar sin cuenta (criterio 4 de E2b, D-E2b-5)", () => {
  it.each([
    ["el owner reactiva a una admin", "owner", "admin"],
    ["un admin reactiva a un member", "admin", "member"],
  ] as const)(
    "%s: active con la marca, membership.reactivate y membership.linkRequest",
    async (_label, actorRole, targetRole) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const actor = actorRole === "owner" ? ownerOf(seeded) : admin.actor;
      const target = await seedPerson(seeded.workspaceId, targetRole, "inactive");
      await seedTimeEntry({
        workspaceId: seeded.workspaceId,
        userId: target.userId,
        startedAt: "2026-10-02T11:00:00Z",
        endedAt: "2026-10-02T12:00:00Z",
      });

      const result = await reactivate(actor, target.membershipId);

      expect(result).toEqual({
        membershipId: target.membershipId,
        status: "active",
        linkRequested: true,
      });
      expect(await statusOf(target.membershipId)).toEqual({
        role: targetRole,
        status: "active",
      });
      const mark = await markOf(target.membershipId);
      expect(mark.requestedById).toBe(actor.userId);
      expect(await auditTrail()).toEqual([
        {
          actorId: actor.userId,
          action: "membership.linkRequest",
          entity: "membership",
          entityId: target.membershipId,
          previousValue: JSON.stringify({ linkRequestedAt: null }),
          nextValue: JSON.stringify({ linkRequestedAt: mark.requestedAt }),
        },
        {
          actorId: actor.userId,
          action: "membership.reactivate",
          entity: "membership",
          entityId: target.membershipId,
          previousValue: JSON.stringify({ status: "inactive" }),
          nextValue: JSON.stringify({ status: "active" }),
        },
      ]);
      expect(await db.select().from(timeEntry)).toHaveLength(1);
    },
  );

  it("reactivar con cuenta no pide la vinculación", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", "inactive");
    await seedAccount(target.userId);

    await reactivate(ownerOf(seeded), target.membershipId);

    expect((await markOf(target.membershipId)).requestedAt).toBeNull();
    expect((await auditTrail()).map((row) => row.action)).toEqual([
      "membership.reactivate",
    ]);
  });
});

describe("quién vincula y libera (criterio 10 de E2b, D-E2b-4)", () => {
  it("un admin sobre un member: pide, renueva, cancela, reactiva sin cuenta y libera el correo", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const active = await seedPerson(seeded.workspaceId, "member");
    const inactive = await seedPerson(seeded.workspaceId, "member", "inactive");
    const releasable = await seedPerson(seeded.workspaceId, "member", "inactive");

    await requestLink(admin.actor, active.membershipId);
    await db
      .update(membership)
      .set({ accountLinkRequestedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(membership.id, active.membershipId));
    await requestLink(admin.actor, active.membershipId);
    expect((await markOf(active.membershipId)).requestedAt?.getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
    await cancelLink(admin.actor, active.membershipId);
    await reactivate(admin.actor, inactive.membershipId);
    await release(admin.actor, releasable.membershipId);

    expect((await auditTrail()).map((row) => row.action)).toEqual([
      "membership.linkCancel",
      "membership.linkRequest",
      "membership.linkRequest",
      "membership.linkRequest",
      "membership.reactivate",
      "user.releaseEmail",
    ]);
  });

  it.each([
    ["sobre otro admin", "other"],
    ["sobre sí mismo", "self"],
    ["sobre el owner", "owner"],
  ] as const)(
    "un admin %s: pedir o cancelar responde EQ-117, sin escribir",
    async (_label, which) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const other = await seedPerson(seeded.workspaceId, "admin");
      const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);
      const targetId = {
        other: other.membershipId,
        self: admin.membershipId,
        owner: owner.id,
      }[which];
      await seedAccountLink(targetId, seeded.ownerId);
      const before = await accountWrites();

      for (const work of [requestLink, cancelLink]) {
        const error = await failureOf(work(admin.actor, targetId));
        expect([error.code, error.message]).toEqual([
          "forbidden",
          teamMessages.linkAdminOwnerOnly,
        ]);
      }
      expect(await accountWrites()).toEqual(before);
    },
  );

  it.each([
    ["sobre otro admin inactivo", "other"],
    ["sobre sí mismo", "self"],
    ["sobre el owner", "owner"],
  ] as const)(
    "un admin %s: liberar responde EQ-119, sin escribir",
    async (_label, which) => {
      const seeded = await seedWorkspace();
      const admin = await seedPerson(seeded.workspaceId, "admin");
      const other = await seedPerson(seeded.workspaceId, "admin", "inactive");
      const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);
      const targetId = {
        other: other.membershipId,
        self: admin.membershipId,
        owner: owner.id,
      }[which];
      const before = await accountWrites();

      const error = await failureOf(release(admin.actor, targetId));

      expect([error.code, error.message]).toEqual([
        "forbidden",
        teamMessages.releaseAdminOwnerOnly,
      ]);
      expect(await accountWrites()).toEqual(before);
    },
  );

  it("un admin que reactiva a un admin sin cuenta recibe EQ-85, sin escribir", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const target = await seedPerson(seeded.workspaceId, "admin", "inactive");
    const before = await accountWrites();

    const error = await failureOf(reactivate(admin.actor, target.membershipId));

    expect([error.code, error.message]).toEqual([
      "forbidden",
      teamMessages.adminStatusOwnerOnly,
    ]);
    expect(await accountWrites()).toEqual(before);
  });

  it("el owner actúa sobre un admin y pide la vinculación de su propia fila", async () => {
    const seeded = await seedWorkspace();
    const activeAdmin = await seedPerson(seeded.workspaceId, "admin");
    const inactiveAdmin = await seedPerson(seeded.workspaceId, "admin", "inactive");
    const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);

    await requestLink(ownerOf(seeded), activeAdmin.membershipId);
    await cancelLink(ownerOf(seeded), activeAdmin.membershipId);
    await release(ownerOf(seeded), inactiveAdmin.membershipId);
    await requestLink(ownerOf(seeded), owner.id);

    expect((await markOf(owner.id)).requestedById).toBe(seeded.ownerId);
    expect((await auditTrail()).map((row) => row.action)).toEqual([
      "membership.linkCancel",
      "membership.linkRequest",
      "membership.linkRequest",
      "user.releaseEmail",
    ]);
  });

  it("el owner que libera su propio correo recibe active_membership con EQ-120, sin escribir", async () => {
    const seeded = await seedWorkspace();
    const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);
    const before = await accountWrites();

    const error = await failureOf(release(ownerOf(seeded), owner.id));

    expect([error.code, error.message]).toEqual([
      "active_membership",
      teamMessages.releaseActive,
    ]);
    expect(await accountWrites()).toEqual(before);
  });

  it.each(["member", "project_manager", "team_manager"] as const)(
    "un %s recibe EQ-90 al pedir, cancelar y liberar, sin escribir",
    async (role) => {
      const seeded = await seedWorkspace();
      const viewer = await seedPerson(seeded.workspaceId, role);
      const active = await seedPerson(seeded.workspaceId, "member");
      const inactive = await seedPerson(seeded.workspaceId, "member", "inactive");
      const before = await accountWrites();

      for (const work of [
        requestLink(viewer.actor, active.membershipId),
        cancelLink(viewer.actor, active.membershipId),
        release(viewer.actor, inactive.membershipId),
      ]) {
        const error = await failureOf(work);
        expect([error.code, error.message]).toEqual([
          "forbidden",
          teamMessages.forbiddenAction,
        ]);
      }
      expect(await accountWrites()).toEqual(before);
    },
  );

  it("un admin que perdió el rol entre la sesión y el bloqueo recibe EQ-90 al pedir y al liberar, sin escribir", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const active = await seedPerson(seeded.workspaceId, "member");
    const inactive = await seedPerson(seeded.workspaceId, "member", "inactive");
    // El `Actor` de la sesión de A sigue diciendo admin.
    await changeRole(ownerOf(seeded), {
      membershipId: admin.membershipId,
      role: "member",
    });
    const before = await accountWrites();

    for (const work of [
      requestLink(admin.actor, active.membershipId),
      release(admin.actor, inactive.membershipId),
    ]) {
      const error = await failureOf(work);
      expect([error.code, error.message]).toEqual([
        "forbidden",
        teamMessages.forbiddenAction,
      ]);
    }
    expect(await accountWrites()).toEqual(before);
  });

  it("un id que no existe, uno de otro workspace y una invited responden not_found con EQ-82", async () => {
    const seeded = await seedWorkspace();
    const other = await seedWorkspace();
    const foreign = await seedPerson(other.workspaceId, "member");
    const invited = await seedPerson(seeded.workspaceId, "member", "invited");
    const before = await accountWrites();

    for (const membershipId of [
      randomUUID(),
      foreign.membershipId,
      invited.membershipId,
    ]) {
      for (const work of [requestLink, cancelLink, release]) {
        const error = await failureOf(work(ownerOf(seeded), membershipId));
        expect([error.code, error.message]).toEqual(["not_found", teamMessages.notFound]);
      }
    }
    expect(await accountWrites()).toEqual(before);
  });
});

describe("idempotencia (criterio 11 de E2b, EQ-97)", () => {
  it("pedir con una vigente, cancelar sin marca y liberar un correo liberado no escriben ninguna fila", async () => {
    const seeded = await seedWorkspace();
    const pending = await seedPerson(seeded.workspaceId, "member");
    await seedAccountLink(pending.membershipId, seeded.ownerId, "1 day");
    const unmarked = await seedPerson(seeded.workspaceId, "member");
    const released = await seedPerson(seeded.workspaceId, "member", "inactive");
    await release(ownerOf(seeded), released.membershipId);
    const before = await accountWrites();

    expect(await requestLink(ownerOf(seeded), pending.membershipId)).toEqual({
      membershipId: pending.membershipId,
      linkPending: true,
    });
    expect(await cancelLink(ownerOf(seeded), unmarked.membershipId)).toEqual({
      membershipId: unmarked.membershipId,
      linkPending: false,
    });
    expect(await release(ownerOf(seeded), released.membershipId)).toEqual({
      membershipId: released.membershipId,
    });
    expect(await accountWrites()).toEqual(before);
  });
});

describe("el externo (criterio 15 de E2b, D-E2b-8)", () => {
  it("pedir la vinculación de un externo sin invitación deja una accepted con invitation.register; la vista pasa de registersExternal a no", async () => {
    const seeded = await seedWorkspace();
    const email = `${randomUUID()}@gmail.com`;
    const target = await seedPerson(seeded.workspaceId, "member", "active", email);
    expect(
      (await viewRowOf(ownerOf(seeded), target.membershipId))?.registersExternal,
    ).toBe(true);

    await requestLink(ownerOf(seeded), target.membershipId);

    const registered = await invitationOf(seeded.workspaceId, email);
    expect(registered).toMatchObject({
      status: "accepted",
      invitedById: seeded.ownerId,
      revokedAt: null,
    });
    expect(registered?.acceptedAt).toBeInstanceOf(Date);
    expect(await auditFor("invitation")).toMatchObject([
      {
        actorId: seeded.ownerId,
        action: "invitation.register",
        entityId: registered?.id,
        previousValue: null,
        nextValue: JSON.stringify({ status: "accepted" }),
      },
    ]);
    expect(
      (await viewRowOf(ownerOf(seeded), target.membershipId))?.registersExternal,
    ).toBe(false);
  });

  it("reactivar sin cuenta a un externo con una revocada la pasa a accepted, y la registra", async () => {
    const seeded = await seedWorkspace();
    const email = `${randomUUID()}@gmail.com`;
    const target = await seedPerson(seeded.workspaceId, "member", "inactive", email);
    const revoked = await seedInvitation({
      workspaceId: seeded.workspaceId,
      email,
      status: "revoked",
    });

    await reactivate(ownerOf(seeded), target.membershipId);

    expect(await invitationOf(seeded.workspaceId, email)).toMatchObject({
      id: revoked.id,
      status: "accepted",
      revokedAt: null,
      revokedById: null,
    });
    expect(await auditFor("invitation")).toMatchObject([
      {
        action: "invitation.register",
        entityId: revoked.id,
        previousValue: JSON.stringify({ status: "revoked" }),
        nextValue: JSON.stringify({ status: "accepted" }),
      },
    ]);
  });

  it.each([
    ["con una accepted", `${randomUUID()}@gmail.com`, "accepted"],
    ["con una pending", `${randomUUID()}@gmail.com`, "pending"],
    ["un correo de los dominios", `${randomUUID()}@empresa.com`, undefined],
  ] as const)("%s no escribe la invitación", async (_label, email, status) => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", "active", email);
    if (status !== undefined) {
      await seedInvitation({ workspaceId: seeded.workspaceId, email, status });
    }
    const before = await invitationOf(seeded.workspaceId, email);

    await requestLink(ownerOf(seeded), target.membershipId);

    expect(await invitationOf(seeded.workspaceId, email)).toEqual(before);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("el registro queda al cancelar la vinculación", async () => {
    const seeded = await seedWorkspace();
    const email = `${randomUUID()}@gmail.com`;
    const target = await seedPerson(seeded.workspaceId, "member", "active", email);

    await requestLink(ownerOf(seeded), target.membershipId);
    await cancelLink(ownerOf(seeded), target.membershipId);

    expect((await invitationOf(seeded.workspaceId, email))?.status).toBe("accepted");
  });
});

describe("liberar el correo (criterio 16 de E2b, D-E2b-9)", () => {
  it("un admin libera a un member inactivo: el correo liberado, sin cuentas ni sesiones, user.releaseEmail; la membresía, las horas y los proyectos quedan", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const target = await seedPerson(seeded.workspaceId, "member", "inactive");
    const previousEmail = `${target.userId}@empresa.com`;
    await seedAccount(target.userId);
    await seedSession(target.userId);
    await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: target.userId,
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedProject({
      workspaceId: seeded.workspaceId,
      members: [{ userId: target.userId }],
    });
    const before = await accountWrites();
    const projectRows = await db.select().from(projectMember);

    const result = await release(admin.actor, target.membershipId);

    expect(result).toEqual({ membershipId: target.membershipId });
    const [released] = await db.select().from(user).where(eq(user.id, target.userId));
    expect(released?.email).toBe(releasedEmailOf(target.userId));
    expect(
      await db.select().from(account).where(eq(account.userId, target.userId)),
    ).toEqual([]);
    expect(await sessionsOf(target.userId)).toEqual([]);
    expect(await auditTrail()).toEqual([
      {
        actorId: admin.userId,
        action: "session.revokeAll",
        entity: "user",
        entityId: target.userId,
        previousValue: JSON.stringify({ sessions: 1 }),
        nextValue: null,
      },
      {
        actorId: admin.userId,
        action: "user.releaseEmail",
        entity: "user",
        entityId: target.userId,
        previousValue: JSON.stringify({ email: previousEmail, accounts: 1 }),
        nextValue: JSON.stringify({ email: releasedEmailOf(target.userId) }),
      },
    ]);
    const after = await accountWrites();
    expect([after.memberships, after.entries]).toEqual([
      before.memberships,
      before.entries,
    ]);
    expect(await db.select().from(projectMember)).toEqual(projectRows);

    const row = await viewRowOf(ownerOf(seeded), target.membershipId);
    expect(row).toMatchObject({
      email: null,
      status: "inactive",
      statusChange: null,
      linkActions: [],
      canReleaseEmail: false,
      registersExternal: false,
    });
  });
});

describe("el correo liberado (criterio 17 de E2b, D-E2b-9)", () => {
  it("se invita como un correo nuevo, y reactivar o pedir la vinculación de la liberada responde email_released con EQ-121", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", "inactive");
    const previousEmail = `${target.userId}@empresa.com`;
    await seedAccount(target.userId);
    await release(ownerOf(seeded), target.membershipId);

    const invited = await inviteMembers(ownerOf(seeded), { emails: [previousEmail] });

    expect(invited.outcomes).toEqual([
      { email: previousEmail, result: "invited", external: false },
    ]);
    const before = await accountWrites();
    for (const work of [
      reactivate(ownerOf(seeded), target.membershipId),
      requestLink(ownerOf(seeded), target.membershipId),
    ]) {
      const error = await failureOf(work);
      expect([error.code, error.message]).toEqual([
        "email_released",
        teamMessages.emailReleased,
      ]);
    }
    expect(await accountWrites()).toEqual(before);
  });
});

describe("la vista de la vinculación (criterio 18 de E2b)", () => {
  it("la marca vigente y la vencida, el externo y la liberada, para el owner y para un admin", async () => {
    const seeded = await seedWorkspace();
    const admin = await seedPerson(seeded.workspaceId, "admin");
    const pending = await seedPerson(seeded.workspaceId, "member");
    await seedAccountLink(pending.membershipId, seeded.ownerId, "1 day");
    const expired = await seedPerson(seeded.workspaceId, "member");
    await seedAccountLink(expired.membershipId, seeded.ownerId, "8 days");
    const external = await seedPerson(
      seeded.workspaceId,
      "member",
      "inactive",
      `${randomUUID()}@gmail.com`,
    );
    const pendingAdmin = await seedPerson(seeded.workspaceId, "admin");
    await seedAccountLink(pendingAdmin.membershipId, seeded.ownerId, "1 day");
    const released = await seedPerson(seeded.workspaceId, "member", "inactive");
    await release(ownerOf(seeded), released.membershipId);

    const pick = async (actor: Actor, membershipId: string) => {
      const row = await viewRowOf(actor, membershipId);
      return {
        expired: row?.link?.expired ?? null,
        linkActions: row?.linkActions,
        registersExternal: row?.registersExternal,
        canReleaseEmail: row?.canReleaseEmail,
        statusChange: row?.statusChange,
        email: row?.email === null ? null : "visible",
      };
    };
    const rows = [
      pending.membershipId,
      expired.membershipId,
      external.membershipId,
      pendingAdmin.membershipId,
      released.membershipId,
    ];
    const owner = await Promise.all(rows.map((id) => pick(ownerOf(seeded), id)));
    const byAdmin = await Promise.all(rows.map((id) => pick(admin.actor, id)));

    const base = {
      expired: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
      statusChange: "deactivate",
      email: "visible",
    };
    const ownerRows = [
      { ...base, expired: false, linkActions: ["cancel"] },
      { ...base, expired: true, linkActions: ["request", "cancel"] },
      {
        ...base,
        registersExternal: true,
        canReleaseEmail: true,
        statusChange: "reactivate",
      },
      { ...base, expired: false, linkActions: ["cancel"] },
      { ...base, statusChange: null, email: null },
    ];
    expect(owner).toEqual(ownerRows);
    expect(byAdmin).toEqual([
      ownerRows[0],
      ownerRows[1],
      ownerRows[2],
      { ...base, expired: false, statusChange: null },
      ownerRows[4],
    ]);
  });
});

describe("todo o nada (criterio 22 de E2b, ADR 0025)", () => {
  it("un fallo después de liberar el correo deja el correo, las cuentas y las sesiones como estaban", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member", "inactive");
    await seedAccount(target.userId);
    await seedSession(target.userId);
    const before = await accountWrites();
    injected.failAfterRelease = true;

    await expect(release(ownerOf(seeded), target.membershipId)).rejects.toThrow(
      "Fallo inyectado después de liberar el correo.",
    );

    expect(await accountWrites()).toEqual(before);
  });

  it("un fallo después de registrar al externo deja la invitación y la marca como estaban", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(
      seeded.workspaceId,
      "member",
      "active",
      `${randomUUID()}@gmail.com`,
    );
    const before = await accountWrites();
    injected.failAfterRegister = true;

    await expect(requestLink(ownerOf(seeded), target.membershipId)).rejects.toThrow(
      "Fallo inyectado después de registrar al externo.",
    );

    expect(await accountWrites()).toEqual(before);
  });
});

describe("claimAccountLink y consumeAccountLink (D-E2b-3)", () => {
  it.each([
    ["vigente", "1 day", true],
    ["vencida", "8 days", false],
    ["que vence en este instante", "7 days", false],
  ] as const)("consumeAccountLink con una %s", async (_label, age, consumed) => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");
    await seedAccountLink(target.membershipId, seeded.ownerId, age);
    const before = await markOf(target.membershipId);

    const result = await db.transaction((tx) =>
      teamRepository.consumeAccountLink(tx, target.membershipId),
    );

    expect(result).toEqual(consumed ? { requestedById: seeded.ownerId } : undefined);
    expect(await markOf(target.membershipId)).toEqual(
      consumed ? { requestedAt: null, requestedById: null } : before,
    );
  });

  it("consumeAccountLink sin marca no limpia nada", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "member");

    const result = await db.transaction((tx) =>
      teamRepository.consumeAccountLink(tx, target.membershipId),
    );

    expect(result).toBeUndefined();
  });

  it("claimAccountLink toma la marca vigente con membership.linkUse de la persona y devuelve su Actor", async () => {
    const seeded = await seedWorkspace();
    const target = await seedPerson(seeded.workspaceId, "admin");
    await seedAccountLink(target.membershipId, seeded.ownerId, "1 day");

    const claimed = await db.transaction((tx) =>
      claimAccountLink(tx, ` ${target.userId}@EMPRESA.com`.trim().toLowerCase()),
    );

    expect(claimed).toEqual({
      kind: "claimed",
      person: {
        userId: target.userId,
        workspaceId: seeded.workspaceId,
        role: "admin",
        status: "active",
      },
    });
    expect(await auditTrail()).toEqual([
      {
        actorId: target.userId,
        action: "membership.linkUse",
        entity: "membership",
        entityId: target.membershipId,
        previousValue: null,
        nextValue: JSON.stringify({ requestedById: seeded.ownerId }),
      },
    ]);
  });

  it("una inactiva responde inactive y una sin marca, none, sin escribir", async () => {
    const seeded = await seedWorkspace();
    const inactive = await seedPerson(seeded.workspaceId, "member", "inactive");
    const unmarked = await seedPerson(seeded.workspaceId, "member");
    const before = await accountWrites();

    const results = await db.transaction(async (tx) => [
      await claimAccountLink(tx, `${inactive.userId}@empresa.com`),
      await claimAccountLink(tx, `${unmarked.userId}@empresa.com`),
      await claimAccountLink(tx, "nadie@empresa.com"),
    ]);

    expect(results).toEqual([{ kind: "inactive" }, { kind: "none" }, { kind: "none" }]);
    expect(await accountWrites()).toEqual(before);
  });
});

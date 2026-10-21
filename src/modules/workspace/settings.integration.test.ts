import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { startTimer } from "@/modules/time-entry/service";
import { db, type Transaction } from "@/server/db";
import { membership, workspace, workspaceSettings } from "@/server/db/schema";
import { ForbiddenError, type MembershipStatus, type Role } from "@/server/permissions";
import { fulfilledValue, outcomeWhileHeld, queueBehindBarrier } from "@/test/concurrency";
import {
  buenosAires,
  seedMember,
  seedWorkspace,
  setDurationFormat,
} from "@/test/factories";
import { auditFor } from "@/test/queries";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { workspaceRepository } from "./repository";
import {
  ensureWorkspaceContext,
  getWorkspaceSettingsView,
  inviteMembers,
  updateWorkspaceName,
  updateWorkspaceSetting,
} from "./service";

/**
 * El nombre del workspace (contrato de WS1, §4.3 y §9.2): renombrar, el mismo
 * nombre, quién (criterios 1, 2 y 4), la vista (criterio 9), la autoridad bajo
 * el bloqueo (criterio 5, D-WS1-2), dos renombres en fila (criterio 6) y lo
 * que no espera al bloqueo del workspace (criterio 7, D-WS1-3). El formato de
 * duración (contrato de WS2b, §4.3 y §9.2), con los criterios 1 a 8 de WS2b.
 */

let workspaceId: string;
let ownerId: string;

beforeEach(async () => {
  ({ workspaceId, ownerId } = await seedWorkspace());
});

function actorFor(userId: string, role: Role, status: MembershipStatus = "active") {
  return actorIn(workspaceId, userId, { role, status });
}

async function workspaceRow() {
  const [row] = await db.select().from(workspace).where(eq(workspace.id, workspaceId));
  return row;
}

/** Las constancias del nombre del workspace, en orden. */
async function nameAudits() {
  return (await auditFor("workspace", workspaceId)).filter(
    (row) => row.action === "workspace.updateName",
  );
}

/** El contexto de la persona como lo arma la sesión. */
async function contextOf(userId: string) {
  const context = await ensureWorkspaceContext({
    id: userId,
    email: `${userId}@empresa.com`,
  });
  if (context === null) {
    throw new Error("La persona no tiene contexto.");
  }
  return context;
}

/** El bloqueo del workspace que toma `updateWorkspaceName` (D-WS1-3). */
function holdWorkspace(tx: Transaction) {
  return workspaceRepository.lockWorkspaceName(tx, workspaceId);
}

/** `for no key update` sobre la membresía de la persona: lo que toma un cambio de rol. */
function holdMembership(userId: string) {
  return (tx: Transaction) =>
    tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
      .for("no key update");
}

describe("renombrar (criterio 1, WS-05)", () => {
  it.each(["owner", "admin"] as const)(
    "un %s renombra: queda el recortado, avanza updated_at y deja la constancia",
    async (role) => {
      const userId = role === "owner" ? ownerId : await seedMember(workspaceId, role);
      const before = await workspaceRow();

      const result = await updateWorkspaceName(actorFor(userId, role), {
        name: "Estudio Norte",
      });

      expect(result).toEqual({ name: "Estudio Norte" });
      const after = await workspaceRow();
      expect(after.name).toBe("Estudio Norte");
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      expect(await nameAudits()).toEqual([
        expect.objectContaining({
          workspaceId,
          actorId: userId,
          entity: "workspace",
          entityId: workspaceId,
          previousValue: JSON.stringify({ name: before.name }),
          nextValue: JSON.stringify({ name: "Estudio Norte" }),
        }),
      ]);
    },
  );
});

describe("el mismo nombre (criterio 2, WS-04, WS-71)", () => {
  it("responde éxito sin tocar la fila y sin constancia", async () => {
    await updateWorkspaceName(actorFor(ownerId, "owner"), { name: "Estudio Norte" });
    const saved = await workspaceRow();

    const result = await updateWorkspaceName(actorFor(ownerId, "owner"), {
      name: "Estudio Norte",
    });

    expect(result).toEqual({ name: "Estudio Norte" });
    expect(await workspaceRow()).toEqual(saved);
    expect(await nameAudits()).toHaveLength(1);
  });
});

describe("quién (criterio 4, WS-02, WS-49, WS-51)", () => {
  it.each([
    ["un project_manager", "project_manager", "active"],
    ["un team_manager", "team_manager", "active"],
    ["un member", "member", "active"],
    ["un owner inactivo", "owner", "inactive"],
    ["un admin inactivo", "admin", "inactive"],
  ] as const)("%s recibe ForbiddenError sin escribir", async (_case, role, status) => {
    const userId = await seedMember(workspaceId, role, status);
    const before = await workspaceRow();

    await expect(
      updateWorkspaceName(actorFor(userId, role, status), { name: "Estudio Norte" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await workspaceRow()).toEqual(before);
    expect(await auditFor("workspace", workspaceId)).toEqual([]);
  });

  it("un member recibe ForbiddenError sin esperar a una membresía tomada (§4.3, paso 1)", async () => {
    const memberId = await seedMember(workspaceId, "member");

    const outcome = await outcomeWhileHeld(holdMembership(memberId), () =>
      updateWorkspaceName(actorFor(memberId, "member"), { name: "Estudio Norte" }),
    );

    expect(outcome).toBeInstanceOf(ForbiddenError);
    expect(await auditFor("workspace", workspaceId)).toEqual([]);
  });

  it("sin membresía en el workspace del actor recibe ForbiddenError sin escribir en ninguno", async () => {
    const other = await seedWorkspace();
    const before = await workspaceRow();
    const [otherBefore] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.id, other.workspaceId));

    await expect(
      updateWorkspaceName(actorIn(other.workspaceId, ownerId, { role: "owner" }), {
        name: "Estudio Norte",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await workspaceRow()).toEqual(before);
    expect(
      await db.select().from(workspace).where(eq(workspace.id, other.workspaceId)),
    ).toEqual([otherBefore]);
    expect(await auditFor("workspace")).toEqual([]);
  });
});

describe("la vista (criterio 9, D-WS1-5, WS-63)", () => {
  it.each(["owner", "admin"] as const)(
    "un %s activo ve ready con el nombre de la sesión",
    async (role) => {
      const userId = role === "owner" ? ownerId : await seedMember(workspaceId, role);
      await db
        .update(workspace)
        .set({ name: "Estudio Norte" })
        .where(eq(workspace.id, workspaceId));

      expect(await getWorkspaceSettingsView(await contextOf(userId))).toEqual({
        kind: "ready",
        name: "Estudio Norte",
        durationFormat: "compact",
      });
    },
  );

  it.each(["project_manager", "team_manager", "member"] as const)(
    "un %s activo ve forbidden por rol",
    async (role) => {
      const userId = await seedMember(workspaceId, role);

      expect(await getWorkspaceSettingsView(await contextOf(userId))).toEqual({
        kind: "forbidden",
        reason: "role",
      });
    },
  );

  it.each(["owner", "admin", "project_manager", "team_manager", "member"] as const)(
    "un %s inactivo ve forbidden por membresía inactiva",
    async (role) => {
      const userId = await seedMember(workspaceId, role, "inactive");

      expect(await getWorkspaceSettingsView(await contextOf(userId))).toEqual({
        kind: "forbidden",
        reason: "inactive",
      });
    },
  );
});

describe("la autoridad bajo el bloqueo (criterio 5, D-WS1-2, WS-52)", () => {
  it.each([
    ["le quitan el rol", { role: "member" as const }],
    ["lo desactivan", { status: "inactive" as const }],
  ])(
    "un admin al que %s mientras renombra recibe ForbiddenError sin escribir",
    async (_case, change) => {
      const adminId = await seedMember(workspaceId, "admin");
      const before = await workspaceRow();

      const [changed, renamed] = await queueBehindBarrier(holdMembership(adminId), [
        () =>
          db.transaction((tx) =>
            tx
              .update(membership)
              .set(change)
              .where(
                and(
                  eq(membership.workspaceId, workspaceId),
                  eq(membership.userId, adminId),
                ),
              ),
          ),
        () => updateWorkspaceName(actorFor(adminId, "admin"), { name: "Estudio Norte" }),
      ]);

      expect(changed.status).toBe("fulfilled");
      expect(renamed).toMatchObject({ status: "rejected" });
      expect(renamed.status === "rejected" && renamed.reason).toBeInstanceOf(
        ForbiddenError,
      );
      expect((await workspaceRow()).name).toBe(before.name);
      expect(await auditFor("workspace", workspaceId)).toEqual([]);
    },
  );
});

describe("dos renombres a la vez (criterio 6, WS-65, D-WS1-3)", () => {
  it("quedan en fila: gana el segundo y las constancias se encadenan", async () => {
    const before = await workspaceRow();
    const owner = actorFor(ownerId, "owner");

    const outcomes = await queueBehindBarrier(holdWorkspace, [
      () => updateWorkspaceName(owner, { name: "A" }),
      () => updateWorkspaceName(owner, { name: "B" }),
    ]);

    expect(outcomes.map(fulfilledValue)).toEqual([{ name: "A" }, { name: "B" }]);
    expect((await workspaceRow()).name).toBe("B");
    const audits = await nameAudits();
    expect(audits.map((row) => [row.previousValue, row.nextValue]).sort()).toEqual(
      [
        [JSON.stringify({ name: before.name }), JSON.stringify({ name: "A" })],
        [JSON.stringify({ name: "A" }), JSON.stringify({ name: "B" })],
      ].sort(),
    );
  });
});

describe("lo que no espera al bloqueo del workspace (criterio 7, D-WS1-3)", () => {
  it.each([
    ["ensureWorkspaceContext", () => contextOf(ownerId)],
    [
      "una invitación nueva",
      () => inviteMembers(actorFor(ownerId, "owner"), { emails: ["ana@gmail.com"] }),
    ],
    [
      "un alta de horas",
      () =>
        startTimer(actorFor(ownerId, "owner"), workspaceOf(buenosAires), {
          id: randomUUID(),
          description: "trabajo",
          projectId: null,
          taskId: null,
          tagIds: [],
        }),
    ],
  ])("%s termina sin esperar", async (_case, work) => {
    expect(await outcomeWhileHeld(holdWorkspace, work)).toBe("resolved");
  });
});

/** La fila de ajustes del workspace, o `undefined` si falta (WS-73). */
async function settingsRow() {
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId));
  return row;
}

/** Las constancias del formato de duración, en orden. */
async function settingAudits() {
  return (await auditFor("workspace_settings", workspaceId)).filter(
    (row) => row.action === "workspace.updateSetting",
  );
}

/** El bloqueo de la fila de ajustes que toma `updateWorkspaceSetting` (D-WS2b-3). */
function holdSettings(tx: Transaction) {
  return workspaceRepository.lockWorkspaceSettings(tx, workspaceId);
}

async function deleteSettings() {
  await db
    .delete(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId));
}

describe("cambiar el formato (criterio 1 de WS2b, WS-14, WS-04)", () => {
  it.each(["owner", "admin"] as const)(
    "un %s pasa a completo: la fila queda en full, avanza updated_at y deja la constancia",
    async (role) => {
      const userId = role === "owner" ? ownerId : await seedMember(workspaceId, role);
      const before = await settingsRow();

      const result = await updateWorkspaceSetting(actorFor(userId, role), {
        key: "durationFormat",
        value: "full",
      });

      expect(result).toEqual({ settings: { durationFormat: "full" } });
      const after = await settingsRow();
      expect(after?.durationFormat).toBe("full");
      expect(after?.updatedAt.getTime()).toBeGreaterThan(
        before?.updatedAt.getTime() ?? Infinity,
      );
      expect(await auditFor("workspace_settings")).toEqual([
        expect.objectContaining({
          workspaceId,
          actorId: userId,
          action: "workspace.updateSetting",
          entity: "workspace_settings",
          entityId: workspaceId,
          previousValue: '{"durationFormat":"compact"}',
          nextValue: '{"durationFormat":"full"}',
        }),
      ]);
    },
  );

  it("no toca el nombre ni la fila de ajustes de otro workspace", async () => {
    const other = await seedWorkspace();
    const name = (await workspaceRow()).name;

    await updateWorkspaceSetting(actorFor(ownerId, "owner"), {
      key: "durationFormat",
      value: "full",
    });

    expect((await workspaceRow()).name).toBe(name);
    const [otherSettings] = await db
      .select({ durationFormat: workspaceSettings.durationFormat })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, other.workspaceId));
    expect(otherSettings).toEqual({ durationFormat: "compact" });
  });
});

describe("el mismo formato (criterio 2 de WS2b, WS-04)", () => {
  it("con full guardado, pedir full responde éxito sin tocar la fila y sin constancia", async () => {
    await setDurationFormat(workspaceId, "full");
    const saved = await settingsRow();

    const result = await updateWorkspaceSetting(actorFor(ownerId, "owner"), {
      key: "durationFormat",
      value: "full",
    });

    expect(result).toEqual({ settings: { durationFormat: "full" } });
    expect(await settingsRow()).toEqual(saved);
    expect(await settingAudits()).toEqual([]);
  });
});

describe("quién cambia el formato (criterio 4 de WS2b, WS-14, WS-50, WS-58)", () => {
  it.each([
    ["un project_manager", "project_manager", "active"],
    ["un team_manager", "team_manager", "active"],
    ["un member", "member", "active"],
    ["un owner inactivo", "owner", "inactive"],
    ["un admin inactivo", "admin", "inactive"],
  ] as const)("%s recibe ForbiddenError sin escribir", async (_case, role, status) => {
    const userId = await seedMember(workspaceId, role, status);
    const before = await settingsRow();

    await expect(
      updateWorkspaceSetting(actorFor(userId, role, status), {
        key: "durationFormat",
        value: "full",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await settingsRow()).toEqual(before);
    expect(await auditFor("workspace_settings")).toEqual([]);
  });

  it("un member recibe ForbiddenError sin esperar a una membresía tomada (§4.3, paso 1)", async () => {
    const memberId = await seedMember(workspaceId, "member");

    const outcome = await outcomeWhileHeld(holdMembership(memberId), () =>
      updateWorkspaceSetting(actorFor(memberId, "member"), {
        key: "durationFormat",
        value: "full",
      }),
    );

    expect(outcome).toBeInstanceOf(ForbiddenError);
    expect(await auditFor("workspace_settings")).toEqual([]);
  });

  it("sin membresía en el workspace del actor recibe ForbiddenError sin escribir en ninguno", async () => {
    const other = await seedWorkspace();

    await expect(
      updateWorkspaceSetting(actorIn(other.workspaceId, ownerId, { role: "owner" }), {
        key: "durationFormat",
        value: "full",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(
      await db
        .select({ durationFormat: workspaceSettings.durationFormat })
        .from(workspaceSettings),
    ).toEqual([{ durationFormat: "compact" }, { durationFormat: "compact" }]);
    expect(await auditFor("workspace_settings")).toEqual([]);
  });
});

describe("la autoridad bajo el bloqueo, con el formato (criterio 5 de WS2b, D-WS2b-1, WS-52)", () => {
  it.each([
    ["le quitan el rol", { role: "member" as const }],
    ["lo desactivan", { status: "inactive" as const }],
  ])(
    "un admin al que %s mientras cambia el formato recibe ForbiddenError sin escribir",
    async (_case, change) => {
      const adminId = await seedMember(workspaceId, "admin");
      const before = await settingsRow();

      const [changed, updated] = await queueBehindBarrier(holdMembership(adminId), [
        () =>
          db.transaction((tx) =>
            tx
              .update(membership)
              .set(change)
              .where(
                and(
                  eq(membership.workspaceId, workspaceId),
                  eq(membership.userId, adminId),
                ),
              ),
          ),
        () =>
          updateWorkspaceSetting(actorFor(adminId, "admin"), {
            key: "durationFormat",
            value: "full",
          }),
      ]);

      expect(changed.status).toBe("fulfilled");
      expect(updated).toMatchObject({ status: "rejected" });
      expect(updated.status === "rejected" && updated.reason).toBeInstanceOf(
        ForbiddenError,
      );
      expect(await settingsRow()).toEqual(before);
      expect(await auditFor("workspace_settings")).toEqual([]);
    },
  );
});

describe("dos cambios a la vez (criterio 6 de WS2b, WS-65, D-WS2b-3)", () => {
  it("quedan en fila detrás de la fila de ajustes: gana el segundo y las constancias se encadenan", async () => {
    const owner = actorFor(ownerId, "owner");

    const outcomes = await queueBehindBarrier(holdSettings, [
      () => updateWorkspaceSetting(owner, { key: "durationFormat", value: "full" }),
      () => updateWorkspaceSetting(owner, { key: "durationFormat", value: "compact" }),
    ]);

    expect(outcomes.map(fulfilledValue)).toEqual([
      { settings: { durationFormat: "full" } },
      { settings: { durationFormat: "compact" } },
    ]);
    expect((await settingsRow())?.durationFormat).toBe("compact");
    const audits = await settingAudits();
    expect(audits.map((row) => [row.previousValue, row.nextValue]).sort()).toEqual(
      [
        ['{"durationFormat":"compact"}', '{"durationFormat":"full"}'],
        ['{"durationFormat":"full"}', '{"durationFormat":"compact"}'],
      ].sort(),
    );
  });

  it("un cambio de nombre y uno de formato a la vez quedan los dos, con sus dos constancias", async () => {
    const owner = actorFor(ownerId, "owner");
    const before = await workspaceRow();

    const outcomes = await queueBehindBarrier(holdMembership(ownerId), [
      () => updateWorkspaceName(owner, { name: "Estudio Norte" }),
      () => updateWorkspaceSetting(owner, { key: "durationFormat", value: "full" }),
    ]);

    expect(outcomes.map(fulfilledValue)).toEqual([
      { name: "Estudio Norte" },
      { settings: { durationFormat: "full" } },
    ]);
    expect((await workspaceRow()).name).toBe("Estudio Norte");
    expect((await settingsRow())?.durationFormat).toBe("full");
    expect((await nameAudits()).map((row) => [row.previousValue, row.nextValue])).toEqual(
      [[JSON.stringify({ name: before.name }), '{"name":"Estudio Norte"}']],
    );
    expect(
      (await settingAudits()).map((row) => [row.previousValue, row.nextValue]),
    ).toEqual([['{"durationFormat":"compact"}', '{"durationFormat":"full"}']]);
  });
});

describe("lo que no espera al bloqueo de la fila de ajustes (criterio 7 de WS2b, D-WS2b-3)", () => {
  it.each([
    ["ensureWorkspaceContext", () => contextOf(ownerId)],
    [
      "un alta de horas",
      () =>
        startTimer(actorFor(ownerId, "owner"), workspaceOf(buenosAires), {
          id: randomUUID(),
          description: "trabajo",
          projectId: null,
          taskId: null,
          tagIds: [],
        }),
    ],
  ])("%s termina sin esperar", async (_case, work) => {
    expect(await outcomeWhileHeld(holdSettings, work)).toBe("resolved");
  });
});

describe("la vista lee la fila de ajustes (D-WS2b-4, WS-61, WS-63)", () => {
  it.each(["owner", "admin"] as const)(
    "un %s ve el formato guardado en la fila",
    async (role) => {
      const userId = role === "owner" ? ownerId : await seedMember(workspaceId, role);
      await setDurationFormat(workspaceId, "full");

      expect(await getWorkspaceSettingsView(await contextOf(userId))).toEqual({
        kind: "ready",
        name: (await workspaceRow()).name,
        durationFormat: "full",
      });
    },
  );
});

describe("sin la fila de ajustes (criterio 8 de WS2b, WS-73)", () => {
  it("updateWorkspaceSetting lanza un error inesperado y no crea la fila", async () => {
    await deleteSettings();

    const error = await updateWorkspaceSetting(actorFor(ownerId, "owner"), {
      key: "durationFormat",
      value: "full",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ForbiddenError);
    expect(await settingsRow()).toBeUndefined();
    expect(await auditFor("workspace_settings")).toEqual([]);
  });

  it.each(["owner", "admin"] as const)(
    "la vista lanza para un %s, aunque la sesión lea el compacto",
    async (role) => {
      const userId = role === "owner" ? ownerId : await seedMember(workspaceId, role);
      await deleteSettings();
      const context = await contextOf(userId);

      expect(context.settings).toEqual({ durationFormat: "compact" });
      await expect(getWorkspaceSettingsView(context)).rejects.toThrow(
        "Falta la fila de ajustes del workspace.",
      );
      expect(await settingsRow()).toBeUndefined();
    },
  );

  it("un member ve forbidden sin que la vista consulte la fila", async () => {
    const memberId = await seedMember(workspaceId, "member");
    await deleteSettings();

    expect(await getWorkspaceSettingsView(await contextOf(memberId))).toEqual({
      kind: "forbidden",
      reason: "role",
    });
  });
});

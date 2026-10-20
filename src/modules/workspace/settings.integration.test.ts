import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { startTimer } from "@/modules/time-entry/service";
import { db, type Transaction } from "@/server/db";
import { membership, workspace } from "@/server/db/schema";
import { ForbiddenError, type MembershipStatus, type Role } from "@/server/permissions";
import { fulfilledValue, outcomeWhileHeld, queueBehindBarrier } from "@/test/concurrency";
import { buenosAires, seedMember, seedWorkspace } from "@/test/factories";
import { auditFor } from "@/test/queries";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { workspaceRepository } from "./repository";
import {
  ensureWorkspaceContext,
  getWorkspaceSettingsView,
  inviteMembers,
  updateWorkspaceName,
} from "./service";

/**
 * El nombre del workspace (contrato de WS1, §4.3 y §9.2): renombrar, el mismo
 * nombre, quién (criterios 1, 2 y 4), la vista (criterio 9), la autoridad bajo
 * el bloqueo (criterio 5, D-WS1-2), dos renombres en fila (criterio 6) y lo
 * que no espera al bloqueo del workspace (criterio 7, D-WS1-3).
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

      expect(getWorkspaceSettingsView(await contextOf(userId))).toEqual({
        kind: "ready",
        name: "Estudio Norte",
      });
    },
  );

  it.each(["project_manager", "team_manager", "member"] as const)(
    "un %s activo ve forbidden por rol",
    async (role) => {
      const userId = await seedMember(workspaceId, role);

      expect(getWorkspaceSettingsView(await contextOf(userId))).toEqual({
        kind: "forbidden",
        reason: "role",
      });
    },
  );

  it.each(["owner", "admin", "project_manager", "team_manager", "member"] as const)(
    "un %s inactivo ve forbidden por membresía inactiva",
    async (role) => {
      const userId = await seedMember(workspaceId, role, "inactive");

      expect(getWorkspaceSettingsView(await contextOf(userId))).toEqual({
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

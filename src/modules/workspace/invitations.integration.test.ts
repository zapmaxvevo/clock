import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { RejectedError } from "@/server/errors";
import { db } from "@/server/db";
import { membership, workspace } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import { seedInvitation, seedMember, seedUser, seedWorkspace } from "@/test/factories";
import { auditFor, emailOf, invitationOf, invitationsOf } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import { invitationMessages } from "./schema";
import {
  entryFactsOf,
  getInvitationsView,
  InvitationError,
  inviteMembers,
  revokeInvitation,
} from "./service";

/**
 * Invitar, revocar y leer las invitaciones (contrato de E1a, §4.4 y §8).
 * Los dominios de la empresa son los de `src/test/setup.ts`: `empresa.com`.
 */

let workspaceId: string;
let ownerId: string;

beforeEach(async () => {
  ({ workspaceId, ownerId } = await seedWorkspace());
});

function owner() {
  return actorIn(workspaceId, ownerId, { role: "owner" });
}

async function memberWith(role: Role, status: MembershipStatus = "active") {
  const userId = await seedMember(workspaceId, role, status);
  return actorIn(workspaceId, userId, { role, status });
}

function settle(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    (value) => ({ value }),
    (error: unknown) => error,
  );
}

describe("inviteMembers", () => {
  it("dos correos nuevos crean dos filas pending con quién y cuándo, y su auditoría (criterio 2)", async () => {
    const admin = await memberWith("admin");

    const result = await inviteMembers(admin, {
      emails: ["nueva@empresa.com", "externa@gmail.com"],
    });

    expect(result).toEqual({
      outcomes: [
        { email: "nueva@empresa.com", result: "invited", external: false },
        { email: "externa@gmail.com", result: "invited", external: true },
      ],
    });
    const rows = await invitationsOf(workspaceId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: "pending",
        invitedById: admin.userId,
        acceptedAt: null,
        revokedAt: null,
        revokedById: null,
      });
      expect(row.invitedAt).toBeInstanceOf(Date);
    }
    const audits = await auditFor("invitation");
    expect(
      audits.map((audit) => ({
        action: audit.action,
        actorId: audit.actorId,
        entityId: audit.entityId,
        next: JSON.parse(audit.nextValue ?? "null") as unknown,
        previous: audit.previousValue,
      })),
    ).toEqual(
      expect.arrayContaining(
        rows.map((row) => ({
          action: "invitation.create",
          actorId: admin.userId,
          entityId: row.id,
          next: { email: row.email, status: "pending" },
          previous: null,
        })),
      ),
    );
    expect(audits).toHaveLength(2);
  });

  it("un correo ya invitado sale «already_invited» sin escribir ni auditar (criterio 4, EQ-19)", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });

    const result = await inviteMembers(owner(), { emails: ["ana@gmail.com"] });

    expect(result.outcomes).toEqual([
      { email: "ana@gmail.com", result: "already_invited", external: true },
    ]);
    expect(await invitationOf(workspaceId, "ana@gmail.com")).toEqual(seeded);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("el correo de una persona activa sale «already_member» sin fila (criterio 4, EQ-20)", async () => {
    const member = await memberWith("member");
    const email = await emailOf(member.userId);

    const result = await inviteMembers(owner(), { emails: [email.toUpperCase()] });

    expect(result.outcomes).toEqual([
      { email, result: "already_member", external: false },
    ]);
    expect(await invitationsOf(workspaceId)).toEqual([]);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("compara con el correo de `user` recortado y en minúsculas (D-E1b-1)", async () => {
    const userId = await seedUser("  Leo@Empresa.com ");
    await db.insert(membership).values({ workspaceId, userId, role: "member" });

    const result = await inviteMembers(owner(), { emails: ["leo@empresa.com"] });

    expect(result.outcomes).toEqual([
      { email: "leo@empresa.com", result: "already_member", external: false },
    ]);
    expect(await invitationsOf(workspaceId)).toEqual([]);
  });

  it("el correo de una persona inactiva rechaza todo el pedido sin escribir (criterio 5, EQ-21)", async () => {
    const inactive = await memberWith("member", "inactive");
    const email = await emailOf(inactive.userId);

    const outcome = await settle(
      inviteMembers(owner(), { emails: ["nueva@empresa.com", email] }),
    );

    expect(outcome).toBeInstanceOf(RejectedError);
    expect(outcome).toMatchObject({
      code: "rejected",
      message: invitationMessages.rejected,
      rejections: [
        {
          id: email,
          code: "inactive_member",
          message: invitationMessages.inactiveMember(email),
        },
      ],
    });
    expect(await invitationsOf(workspaceId)).toEqual([]);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("un correo inválido o de más de 320 caracteres rechaza todo el pedido (criterio 6, EQ-76)", async () => {
    const tooLong = `${"a".repeat(321 - "@empresa.com".length)}@empresa.com`;

    const outcome = await settle(
      inviteMembers(owner(), { emails: ["nueva@empresa.com", "no-es-correo", tooLong] }),
    );

    expect(outcome).toMatchObject({
      code: "rejected",
      rejections: [
        { id: "no-es-correo", code: "invalid_email" },
        { id: tooLong, code: "invalid_email" },
      ],
    });
    expect(await invitationsOf(workspaceId)).toEqual([]);

    const retry = await inviteMembers(owner(), { emails: ["nueva@empresa.com"] });
    expect(retry.outcomes).toEqual([
      { email: "nueva@empresa.com", result: "invited", external: false },
    ]);
  });

  it("dos formas del mismo correo son uno solo, guardado en minúsculas (criterio 8, EQ-105)", async () => {
    const result = await inviteMembers(owner(), {
      emails: ["Ana@Empresa.com ", "ana@empresa.com"],
    });

    expect(result.outcomes).toEqual([
      { email: "ana@empresa.com", result: "invited", external: false },
    ]);
    expect((await invitationsOf(workspaceId)).map((row) => row.email)).toEqual([
      "ana@empresa.com",
    ]);
  });

  it.each(["revoked", "accepted"] as const)(
    "volver a invitar una %s sin membresía reusa la fila (criterio 11)",
    async (status) => {
      const seeded = await seedInvitation({
        workspaceId,
        email: "ana@gmail.com",
        status,
        invitedById: ownerId,
      });
      const admin = await memberWith("admin");

      const result = await inviteMembers(admin, { emails: ["ana@gmail.com"] });

      expect(result.outcomes).toEqual([
        { email: "ana@gmail.com", result: "invited", external: true },
      ]);
      const row = await invitationOf(workspaceId, "ana@gmail.com");
      expect(row).toMatchObject({
        id: seeded.id,
        status: "pending",
        invitedById: admin.userId,
        acceptedAt: null,
        revokedAt: null,
        revokedById: null,
      });
      expect(row?.invitedAt.getTime()).toBeGreaterThanOrEqual(seeded.invitedAt.getTime());
      const audits = await auditFor("invitation", seeded.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: "invitation.reinvite",
        actorId: admin.userId,
        previousValue: JSON.stringify({ status }),
        nextValue: JSON.stringify({ status: "pending" }),
      });
    },
  );

  it("el reintento de un pedido ya aplicado deja una fila y responde «already_invited» (criterio 21)", async () => {
    await inviteMembers(owner(), { emails: ["ana@gmail.com"] });

    const retry = await inviteMembers(owner(), { emails: ["ana@gmail.com"] });

    expect(retry.outcomes).toEqual([
      { email: "ana@gmail.com", result: "already_invited", external: true },
    ]);
    expect(await invitationsOf(workspaceId)).toHaveLength(1);
    expect(await auditFor("invitation")).toHaveLength(1);
  });

  it.each([
    ["member", "active"],
    ["project_manager", "active"],
    ["team_manager", "active"],
    ["admin", "inactive"],
  ] as const)(
    "%s %s responde forbidden sin escribir (criterio 13)",
    async (role, status) => {
      const actor = await memberWith(role, status);

      const outcome = await settle(inviteMembers(actor, { emails: ["ana@gmail.com"] }));

      expect(outcome).toBeInstanceOf(InvitationError);
      expect(outcome).toMatchObject({
        code: "forbidden",
        message: invitationMessages.forbidden,
      });
      expect(await invitationsOf(workspaceId)).toEqual([]);
    },
  );

  it("un admin bajado a member entre la sesión y el bloqueo responde forbidden (criterio 13)", async () => {
    const admin = await memberWith("admin");
    await db
      .update(membership)
      .set({ role: "member" })
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.userId, admin.userId)),
      );

    const outcome = await settle(inviteMembers(admin, { emails: ["ana@gmail.com"] }));

    expect(outcome).toMatchObject({ code: "forbidden" });
    expect(await invitationsOf(workspaceId)).toEqual([]);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("no mira las filas de otro workspace", async () => {
    const other = await seedWorkspace();
    await seedInvitation({ workspaceId: other.workspaceId, email: "ana@gmail.com" });

    const result = await inviteMembers(owner(), { emails: ["ana@gmail.com"] });

    expect(result.outcomes).toEqual([
      { email: "ana@gmail.com", result: "invited", external: true },
    ]);
    expect(await invitationsOf(workspaceId)).toHaveLength(1);
  });
});

describe("revokeInvitation", () => {
  it("una pendiente pasa a revoked con quién y cuándo, y su auditoría (criterio 10)", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const admin = await memberWith("admin");

    const result = await revokeInvitation(admin, { invitationId: seeded.id });

    expect(result).toEqual({ invitationId: seeded.id });
    const row = await invitationOf(workspaceId, "ana@gmail.com");
    expect(row).toMatchObject({ status: "revoked", revokedById: admin.userId });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    const audits = await auditFor("invitation", seeded.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "invitation.revoke",
      actorId: admin.userId,
      previousValue: JSON.stringify({ status: "pending" }),
      nextValue: JSON.stringify({ status: "revoked" }),
    });
  });

  it("una aceptada responde not_pending sin escribir (criterio 12)", async () => {
    const seeded = await seedInvitation({
      workspaceId,
      email: "ana@gmail.com",
      status: "accepted",
    });

    const outcome = await settle(revokeInvitation(owner(), { invitationId: seeded.id }));

    expect(outcome).toBeInstanceOf(InvitationError);
    expect(outcome).toMatchObject({
      code: "not_pending",
      message: invitationMessages.notPending,
    });
    expect(await invitationOf(workspaceId, "ana@gmail.com")).toEqual(seeded);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("una revocada responde éxito sin escribir (criterio 12, D-E1a-8)", async () => {
    const seeded = await seedInvitation({
      workspaceId,
      email: "ana@gmail.com",
      status: "revoked",
    });

    const result = await revokeInvitation(owner(), { invitationId: seeded.id });

    expect(result).toEqual({ invitationId: seeded.id });
    expect(await invitationOf(workspaceId, "ana@gmail.com")).toEqual(seeded);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("un id que no existe o de otro workspace responde not_found con el texto de EQ-81 (criterio 12)", async () => {
    const other = await seedWorkspace();
    const foreign = await seedInvitation({
      workspaceId: other.workspaceId,
      email: "ana@gmail.com",
    });

    for (const invitationId of [randomUUID(), foreign.id]) {
      const outcome = await settle(revokeInvitation(owner(), { invitationId }));
      expect(outcome).toMatchObject({
        code: "not_found",
        message: invitationMessages.notPending,
      });
    }
    expect(await invitationOf(other.workspaceId, "ana@gmail.com")).toEqual(foreign);
  });

  it("un member responde forbidden sin escribir; un admin bajado bajo el bloqueo, también (criterio 13)", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const member = await memberWith("member");
    const admin = await memberWith("admin");
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.userId, admin.userId)),
      );

    for (const actor of [member, admin]) {
      const outcome = await settle(revokeInvitation(actor, { invitationId: seeded.id }));
      expect(outcome).toMatchObject({ code: "forbidden" });
    }
    expect(await invitationOf(workspaceId, "ana@gmail.com")).toEqual(seeded);
  });
});

describe("getInvitationsView", () => {
  it("lista solo las pendientes, por correo, con la marca externa y la dirección", async () => {
    await seedInvitation({ workspaceId, email: "zoe@empresa.com" });
    await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    await seedInvitation({ workspaceId, email: "beto@gmail.com", status: "revoked" });
    await seedInvitation({ workspaceId, email: "carla@gmail.com", status: "accepted" });
    const other = await seedWorkspace();
    await seedInvitation({ workspaceId: other.workspaceId, email: "dani@gmail.com" });

    const view = await getInvitationsView(owner());

    expect(view).toEqual({
      kind: "ready",
      invitations: [
        { id: expect.any(String), email: "ana@gmail.com", external: true },
        { id: expect.any(String), email: "zoe@empresa.com", external: false },
      ],
      appUrl: process.env.BETTER_AUTH_URL,
    });
  });

  it("sin member.invite responde forbidden", async () => {
    await seedInvitation({ workspaceId, email: "ana@gmail.com" });

    for (const actor of [
      await memberWith("member"),
      await memberWith("team_manager"),
      await memberWith("admin", "inactive"),
    ]) {
      expect(await getInvitationsView(actor)).toEqual({ kind: "forbidden" });
    }
  });
});

describe("entryFactsOf (D-E1b-1, criterio 20)", () => {
  const none = { bootstrap: false, invitation: null, membership: null };

  it("da el estado de la invitación del correo, en cada estado", async () => {
    for (const status of ["pending", "accepted", "revoked"] as const) {
      await seedInvitation({ workspaceId, email: `${status}@gmail.com`, status });
      expect(await entryFactsOf(`${status}@gmail.com`)).toEqual({
        ...none,
        invitation: status,
      });
    }
    expect(await entryFactsOf("nadie@gmail.com")).toEqual(none);
  });

  it("da el estado de la membresía, con el correo de `user` con mayúsculas y blancos", async () => {
    const userId = await seedUser(" Ana@Empresa.com  ");
    await db
      .insert(membership)
      .values({ workspaceId, userId, role: "member", status: "inactive" });
    await seedInvitation({ workspaceId, email: "ana@empresa.com", status: "accepted" });

    expect(await entryFactsOf("ana@empresa.com")).toEqual({
      bootstrap: false,
      invitation: "accepted",
      membership: "inactive",
    });
  });

  it("un `user` sin membresía en el workspace da la membresía en null", async () => {
    await seedUser("leo@empresa.com");

    expect(await entryFactsOf("leo@empresa.com")).toEqual(none);
  });

  it("dos `user` con el mismo correo normalizado dan la membresía en null; la pendiente sigue", async () => {
    for (const email of ["ana@empresa.com", "ANA@empresa.com "]) {
      const userId = await seedUser(email);
      await db.insert(membership).values({ workspaceId, userId, role: "member" });
    }

    expect(await entryFactsOf("ana@empresa.com")).toEqual(none);

    await seedInvitation({ workspaceId, email: "ana@empresa.com" });

    expect(await entryFactsOf("ana@empresa.com")).toEqual({
      ...none,
      invitation: "pending",
    });
  });

  it("lee solo el workspace más viejo", async () => {
    const newer = await seedWorkspace();
    await seedInvitation({ workspaceId: newer.workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("leo@gmail.com");
    await db
      .insert(membership)
      .values({ workspaceId: newer.workspaceId, userId, role: "member" });

    expect(await entryFactsOf("ana@gmail.com")).toEqual(none);
    expect(await entryFactsOf("leo@gmail.com")).toEqual(none);
  });
});

describe("entryFactsOf sin workspace", () => {
  it("es el arranque, con la invitación y la membresía en null", async () => {
    await db.delete(workspace);
    await seedUser("ana@empresa.com");

    expect(await entryFactsOf("ana@empresa.com")).toEqual({
      bootstrap: true,
      invitation: null,
      membership: null,
    });
  });
});

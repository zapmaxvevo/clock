import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { changeRole } from "@/modules/team/service";
import type { Transaction } from "@/server/db";
import { invitation, membership } from "@/server/db/schema";
import {
  outcomeWhileHeld,
  queueBehindBarrier,
  raceThroughBarrier,
} from "@/test/concurrency";
import { seedInvitation, seedMember, seedUser } from "@/test/factories";
import { auditFor, invitationOf, invitationsOf, membershipOf } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import { INVITE_LIMIT, invitationMessages } from "./schema";
import { ensureWorkspaceContext, inviteMembers, revokeInvitation } from "./service";

/**
 * La concurrencia de las invitaciones (contrato de E1a, §4.4 y §9.2): dos
 * pedidos con el mismo correo (criterio 9, EQ-106), revocar contra aceptar
 * (EQ-107) y la autoridad releída bajo el bloqueo (D-E1a-9).
 */

let workspaceId: string;
let ownerId: string;

/** El workspace nace por `ensureWorkspaceContext`, que es quien acepta. */
beforeEach(async () => {
  ownerId = await seedUser("owner@empresa.com");
  const context = await ensureWorkspaceContext({
    id: ownerId,
    email: "owner@empresa.com",
  });
  workspaceId = context.workspace.id;
});

function owner() {
  return actorIn(workspaceId, ownerId, { role: "owner" });
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

/** `for update` sobre la invitación, como `lockInvitation`. */
function holdInvitation(id: string) {
  return (tx: Transaction) =>
    tx
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.id, id))
      .for("update");
}

describe("dos pedidos con el mismo correo (criterio 9, EQ-106)", () => {
  it("dejan una fila: uno responde «invited» y el otro «already_invited»", async () => {
    const results = await raceThroughBarrier(holdMembership(ownerId), [
      () => inviteMembers(owner(), { emails: ["ana@gmail.com"] }),
      () => inviteMembers(owner(), { emails: ["ana@gmail.com"] }),
    ]);

    expect(results.map((result) => result.outcomes[0].result).sort()).toEqual([
      "already_invited",
      "invited",
    ]);
    expect(await invitationsOf(workspaceId)).toHaveLength(1);
    expect(await auditFor("invitation")).toHaveLength(1);
  });
});

describe("dos pedidos con los mismos correos en otro orden (criterio 9, EQ-106)", () => {
  // El cruce depende de cómo se intercalen los dos `insert`: varias rondas
  // vuelven casi segura la espera en círculo si los correos no van ordenados.
  it("no se esperan en círculo: los dos responden y queda una fila por correo", async () => {
    for (let round = 0; round < 10; round += 1) {
      const emails = Array.from(
        { length: INVITE_LIMIT },
        (_, index) => `r${round}p${index}@gmail.com`,
      );

      const results = await raceThroughBarrier(holdMembership(ownerId), [
        () => inviteMembers(owner(), { emails }),
        () => inviteMembers(owner(), { emails: [...emails].reverse() }),
      ]);

      const invited = results.flatMap((result) =>
        result.outcomes.filter((outcome) => outcome.result === "invited"),
      );
      expect(invited.map((outcome) => outcome.email).sort()).toEqual([...emails].sort());
    }
    expect(await invitationsOf(workspaceId)).toHaveLength(10 * INVITE_LIMIT);
    expect(await auditFor("invitation")).toHaveLength(10 * INVITE_LIMIT);
  });
});

describe("revocar contra aceptar (EQ-107)", () => {
  it("si gana la revocación, la membresía nace igual y la invitación queda revoked", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");

    const [revoked, entered] = await queueBehindBarrier(holdInvitation(seeded.id), [
      () => revokeInvitation(owner(), { invitationId: seeded.id }),
      () => ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
    ]);

    expect(revoked).toEqual({ status: "fulfilled", value: { invitationId: seeded.id } });
    expect(entered.status).toBe("fulfilled");
    expect((await membershipOf(workspaceId, userId)).status).toBe("active");
    expect((await invitationOf(workspaceId, "ana@gmail.com"))?.status).toBe("revoked");
    expect((await auditFor("invitation")).map((audit) => audit.action)).toEqual([
      "invitation.revoke",
    ]);
  });

  it("si gana la aceptación, revocar responde not_pending", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");

    const [entered, revoked] = await queueBehindBarrier(holdInvitation(seeded.id), [
      () => ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
      () => revokeInvitation(owner(), { invitationId: seeded.id }),
    ]);

    expect(entered.status).toBe("fulfilled");
    expect(revoked).toMatchObject({
      status: "rejected",
      reason: { code: "not_pending", message: invitationMessages.notPending },
    });
    expect((await invitationOf(workspaceId, "ana@gmail.com"))?.status).toBe("accepted");
    expect((await auditFor("invitation")).map((audit) => audit.action)).toEqual([
      "invitation.accept",
    ]);
  });
});

describe("la autoridad bajo el bloqueo (D-E1a-9, criterio 13)", () => {
  it("el owner le quita el rol al admin mientras invita: responde forbidden sin escribir", async () => {
    const adminId = await seedMember(workspaceId, "admin");
    const adminMembership = await membershipOf(workspaceId, adminId);

    const [changed, invited] = await queueBehindBarrier(holdMembership(adminId), [
      () => changeRole(owner(), { membershipId: adminMembership.id, role: "member" }),
      () =>
        inviteMembers(actorIn(workspaceId, adminId, { role: "admin" }), {
          emails: ["ana@gmail.com"],
        }),
    ]);

    expect(changed.status).toBe("fulfilled");
    expect(invited).toMatchObject({ status: "rejected", reason: { code: "forbidden" } });
    expect(await invitationsOf(workspaceId)).toEqual([]);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("invitar no espera a un alta de horas: `for share` no choca con `for key share`", async () => {
    const outcome = await outcomeWhileHeld(
      (tx) =>
        tx
          .select({ id: membership.id })
          .from(membership)
          .where(eq(membership.userId, ownerId))
          .for("key share"),
      () => inviteMembers(owner(), { emails: ["ana@gmail.com"] }),
    );

    expect(outcome).toBe("resolved");
    expect(await invitationsOf(workspaceId)).toHaveLength(1);
  });
});

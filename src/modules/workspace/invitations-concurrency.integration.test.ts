import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { changeRole } from "@/modules/team/service";
import { db, type Transaction } from "@/server/db";
import { invitation, membership, workspace } from "@/server/db/schema";
import {
  outcomeWhileHeld,
  queueBehindBarrier,
  raceThroughBarrier,
  waitForBlockedBackends,
} from "@/test/concurrency";
import { seedInvitation, seedMember, seedUser } from "@/test/factories";
import { auditFor, invitationOf, invitationsOf, membershipOf } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import { workspaceRepository } from "./repository";
import { INVITE_LIMIT, invitationMessages } from "./schema";
import {
  ensureWorkspaceContext,
  inviteMembers,
  revokeInvitation,
  type WorkspaceContext,
} from "./service";

/**
 * La concurrencia de las invitaciones (contrato de E1a, §4.4 y §9.2, y de
 * E1b, §9.2): dos pedidos con el mismo correo (criterio 9, EQ-106), revocar
 * contra aceptar (EQ-107), la autoridad releída bajo el bloqueo (D-E1a-9), el
 * primer ingreso contra sí mismo y contra invitar (D-E1b-11), y el arranque.
 */

let workspaceId: string;
let ownerId: string;

/** El workspace nace por `ensureWorkspaceContext`, por el arranque (D-E1b-3). */
beforeEach(async () => {
  ownerId = await seedUser("owner@empresa.com");
  const context = await ensureWorkspaceContext({
    id: ownerId,
    email: "owner@empresa.com",
  });
  if (context === null) {
    throw new Error("El owner no arrancó el workspace.");
  }
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

describe("revocar contra aceptar (EQ-107, criterio 12)", () => {
  it("si gana la revocación, ensureWorkspaceContext devuelve null y no nace la membresía", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");

    const [revoked, entered] = await queueBehindBarrier(holdInvitation(seeded.id), [
      () => revokeInvitation(owner(), { invitationId: seeded.id }),
      () => ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
    ]);

    expect(revoked).toEqual({ status: "fulfilled", value: { invitationId: seeded.id } });
    expect(entered).toEqual({ status: "fulfilled", value: null });
    await expect(membershipOf(workspaceId, userId)).rejects.toThrow("Sin membresía");
    expect((await invitationOf(workspaceId, "ana@gmail.com"))?.status).toBe("revoked");
    expect((await auditFor("invitation")).map((audit) => audit.action)).toEqual([
      "invitation.revoke",
    ]);
  });

  it("si gana el ingreso, la membresía nace y revocar responde not_pending", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");

    const [entered, revoked] = await queueBehindBarrier(holdInvitation(seeded.id), [
      () => ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
      () => revokeInvitation(owner(), { invitationId: seeded.id }),
    ]);

    expect(entered).toMatchObject({
      status: "fulfilled",
      value: { membership: { userId, role: "member", status: "active" } },
    });
    expect(revoked).toMatchObject({
      status: "rejected",
      reason: { code: "not_pending", message: invitationMessages.notPending },
    });
    expect((await membershipOf(workspaceId, userId)).status).toBe("active");
    expect((await invitationOf(workspaceId, "ana@gmail.com"))?.status).toBe("accepted");
    expect((await auditFor("invitation")).map((audit) => audit.action)).toEqual([
      "invitation.accept",
    ]);
  });
});

describe("dos primeros pedidos de la misma persona (criterio 13)", () => {
  it("dejan una membresía, una aceptación y un invitation.accept; los dos devuelven el contexto", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");

    const contexts = await raceThroughBarrier(holdInvitation(seeded.id), [
      () => ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
      () => ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
    ]);

    const membershipIds = contexts.map((context) => context?.membership.id);
    expect(membershipIds[0]).toBeDefined();
    expect(membershipIds[1]).toBe(membershipIds[0]);
    expect(
      await db.select().from(membership).where(eq(membership.userId, userId)),
    ).toHaveLength(1);
    expect((await invitationOf(workspaceId, "ana@gmail.com"))?.status).toBe("accepted");
    expect((await auditFor("invitation")).map((audit) => audit.action)).toEqual([
      "invitation.accept",
    ]);
  });
});

describe("invitar contra el primer ingreso (D-E1b-11, criterio 19)", () => {
  it("invitar espera al ingreso, ve la membresía y responde already_member sin reinvitar", async () => {
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");

    const [entered, invited] = await queueBehindBarrier(holdInvitation(seeded.id), [
      () => ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
      () => inviteMembers(owner(), { emails: ["ana@gmail.com"] }),
    ]);

    expect(entered).toMatchObject({
      status: "fulfilled",
      value: { membership: { userId } },
    });
    expect(invited).toEqual({
      status: "fulfilled",
      value: {
        outcomes: [{ email: "ana@gmail.com", result: "already_member", external: true }],
      },
    });
    expect((await invitationOf(workspaceId, "ana@gmail.com"))?.status).toBe("accepted");
    expect((await auditFor("invitation")).map((audit) => audit.action)).toEqual([
      "invitation.accept",
    ]);
  });
});

describe("el arranque a la vez (D-E1b-3, criterio 7)", () => {
  /** El bloqueo del arranque, el que toma `ensureWorkspaceContext` sin workspace. */
  function holdBootstrap(tx: Transaction) {
    return workspaceRepository.lockWorkspaceBootstrap(tx);
  }

  beforeEach(async () => {
    // El arranque necesita la base sin workspace: se borra el que deja el
    // `beforeEach` del archivo, con su membresía.
    await db.delete(workspace);
  });

  it("dos primeros pedidos del owner dejan un workspace y una membresía owner", async () => {
    const contexts = await raceThroughBarrier(holdBootstrap, [
      () => ensureWorkspaceContext({ id: ownerId, email: "owner@empresa.com" }),
      () => ensureWorkspaceContext({ id: ownerId, email: "owner@empresa.com" }),
    ]);

    expect(contexts[0]?.workspace.id).toBeDefined();
    expect(contexts[1]?.workspace.id).toBe(contexts[0]?.workspace.id);
    expect(contexts[1]?.membership.id).toBe(contexts[0]?.membership.id);
    expect(await db.select().from(workspace)).toHaveLength(1);
    expect(await db.select().from(membership)).toEqual([
      expect.objectContaining({ userId: ownerId, role: "owner" }),
    ]);
  });

  it("otra persona mientras el owner espera el arranque recibe null y no crea nada", async () => {
    const otherId = await seedUser("ana@empresa.com");
    // Una barrera a mano: la otra persona tiene que correr entera mientras el
    // owner espera el bloqueo, y `outcomeWhileHeld` lo suelta antes.
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding = () => {};
    const held = new Promise<void>((resolve) => {
      holding = resolve;
    });
    const barrier = db.transaction(async (tx) => {
      await holdBootstrap(tx);
      holding();
      await released;
    });
    await held;

    const ownerEntry = ensureWorkspaceContext({
      id: ownerId,
      email: "owner@empresa.com",
    });
    let otherEntry: Promise<WorkspaceContext | null> | undefined;
    let other: WorkspaceContext | null | "blocked" | undefined;
    const waiting = new AbortController();
    try {
      await waitForBlockedBackends({ count: 1 });
      // Si la otra persona también esperara el bloqueo, el test falla acá en
      // vez de colgarse.
      otherEntry = ensureWorkspaceContext({ id: otherId, email: "ana@empresa.com" });
      other = await Promise.race([
        otherEntry,
        waitForBlockedBackends({ count: 2, signal: waiting.signal }).then(
          () => "blocked" as const,
        ),
      ]);
    } finally {
      waiting.abort();
      release();
      await barrier;
      await Promise.allSettled([ownerEntry, otherEntry]);
    }

    expect(other).toBeNull();
    expect((await ownerEntry)?.membership.role).toBe("owner");
    expect(await db.select().from(workspace)).toHaveLength(1);
    expect(await db.select().from(membership)).toEqual([
      expect.objectContaining({ userId: ownerId, role: "owner" }),
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

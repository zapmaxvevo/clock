import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db, type Transaction } from "@/server/db";
import { CHECK_VIOLATION, constraintOf } from "@/server/db/constraint-error";
import {
  auditLog,
  invitation,
  membership,
  user,
  workspace,
  workspaceSettings,
} from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { outcomeWhileHeld, warmPool, waitForBlockedBackends } from "@/test/concurrency";
import {
  seedAccountLink,
  seedInvitation,
  seedMember,
  seedPreferences,
  seedTimeEntry,
  seedUser,
  seedWorkspace,
  setDurationFormat,
} from "@/test/factories";
import { auditFor, invitationOf } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import { workspaceRepository } from "./repository";
import {
  ensureWorkspaceContext,
  entryFactsOf,
  entryMembershipStatusLocked,
  entryWorkspaceIdOf,
  isMembershipActiveLocked,
  listWorkspacePeople,
  registerExternalMember,
  resolveDurationFormat,
  weekStartOf,
  type WorkspaceContext,
} from "./service";

/** `ensureWorkspaceContext` de quien tiene acceso: sin él, el test falla acá. */
async function enter(id: string, email: string): Promise<WorkspaceContext> {
  const context = await ensureWorkspaceContext({ id, email });
  if (context === null) {
    throw new Error(`${email} no tiene acceso.`);
  }
  return context;
}

/** El workspace arrancado por el owner configurado en `src/test/setup.ts`. */
async function workspaceWithOwner() {
  const ownerId = await seedUser("owner@empresa.com");
  const context = await enter(ownerId, "owner@empresa.com");
  return { workspaceId: context.workspace.id, ownerId };
}

/** Lo que `ensureWorkspaceContext` puede escribir, para afirmar que no escribió. */
async function writes() {
  return {
    workspaces: await db.select().from(workspace),
    memberships: await db.select().from(membership),
    invitations: await db.select().from(invitation),
    audits: await db.select().from(auditLog),
  };
}

describe("ensureWorkspaceContext, el arranque (D-E1b-3, criterio 7)", () => {
  it("crea el workspace y deja como owner a la cuenta configurada", async () => {
    const userId = await seedUser("owner@empresa.com");

    const context = await enter(userId, "owner@empresa.com");

    expect(context.workspace.name).toBe("Workspace");
    expect(context.workspace.ownerId).toBe(userId);
    expect(context.actor.role).toBe("owner");
    expect(context.actor.status).toBe("active");
    expect(context.actor.workspaceId).toBe(context.workspace.id);
  });

  it("compara el correo del arranque recortado y en minúsculas", async () => {
    const userId = await seedUser("Owner@Empresa.com");

    const context = await enter(userId, " Owner@Empresa.com");

    expect(context.actor.role).toBe("owner");
  });

  it("otro correo del dominio, sin workspace, recibe null y no crea nada", async () => {
    const userId = await seedUser("ana@empresa.com");

    expect(
      await ensureWorkspaceContext({ id: userId, email: "ana@empresa.com" }),
    ).toBeNull();
    expect(await writes()).toEqual({
      workspaces: [],
      memberships: [],
      invitations: [],
      audits: [],
    });
  });

  it("reutiliza el workspace existente y no duplica la membresía", async () => {
    const userId = await seedUser("owner@empresa.com");

    const first = await enter(userId, "owner@empresa.com");
    const second = await enter(userId, "owner@empresa.com");

    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.membership.id).toBe(first.membership.id);
  });
});

describe("ensureWorkspaceContext con el workspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con una invitación pendiente crea la membresía member y la acepta, con su auditoría (criterio 2)", async () => {
    const { workspaceId } = await workspaceWithOwner();
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("Ana@Gmail.com");

    const context = await enter(userId, "Ana@Gmail.com");

    expect(context.workspace.id).toBe(workspaceId);
    expect(context.membership).toMatchObject({ role: "member", status: "active" });
    const row = await invitationOf(workspaceId, "ana@gmail.com");
    expect(row).toMatchObject({ id: seeded.id, status: "accepted" });
    expect(row?.acceptedAt).toBeInstanceOf(Date);
    const audits = await auditFor("invitation", seeded.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      workspaceId,
      actorId: userId,
      action: "invitation.accept",
      previousValue: JSON.stringify({ status: "pending" }),
      nextValue: JSON.stringify({ status: "accepted" }),
    });
  });

  it("quien ya tiene membresía entra sin aceptar ni auditar (criterio 3, EQ-31)", async () => {
    const { workspaceId } = await workspaceWithOwner();
    const userId = await seedMember(workspaceId, "member", "active");
    const email = `${userId}@empresa.com`;
    // Una pendiente con membresía: el estado que limpia la 0016. La rama que
    // encuentra la membresía ni la mira.
    const seeded = await seedInvitation({ workspaceId, email });

    const context = await enter(userId, email);

    expect(context.membership.userId).toBe(userId);
    expect(await invitationOf(workspaceId, email)).toEqual(seeded);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("sin membresía ni pendiente devuelve null sin escribir (criterio 10)", async () => {
    await workspaceWithOwner();
    const userId = await seedUser("ana@empresa.com");
    const before = await writes();

    expect(
      await ensureWorkspaceContext({ id: userId, email: "ana@empresa.com" }),
    ).toBeNull();
    expect(await writes()).toEqual(before);
  });

  it.each(["revoked", "accepted"] as const)(
    "con una invitación %s y sin membresía devuelve null y no la toca (criterio 10)",
    async (status) => {
      const { workspaceId } = await workspaceWithOwner();
      await seedInvitation({ workspaceId, email: "ana@gmail.com", status });
      const userId = await seedUser("ana@gmail.com");
      const before = await writes();

      expect(
        await ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
      ).toBeNull();
      expect(await writes()).toEqual(before);
    },
  );

  it("una membresía inactiva da el contexto con su estado: la pantalla en solo lectura (TT-92, D-E2-2)", async () => {
    const { workspaceId } = await workspaceWithOwner();
    const userId = await seedMember(workspaceId, "member", "inactive");

    const context = await enter(userId, `${userId}@empresa.com`);

    expect(context.actor.status).toBe("inactive");
  });

  it("después del arranque, el correo configurado sin membresía no entra; con invitación, entra como member (criterio 8)", async () => {
    // Otro owner: el workspace lo arrancó alguien que no es el correo configurado.
    const { workspaceId } = await seedWorkspace();
    const userId = await seedUser("owner@empresa.com");

    expect(
      await ensureWorkspaceContext({ id: userId, email: "owner@empresa.com" }),
    ).toBeNull();

    await seedInvitation({ workspaceId, email: "owner@empresa.com" });
    const context = await enter(userId, "owner@empresa.com");

    expect(context.membership.role).toBe("member");
    expect(
      await db.select().from(membership).where(eq(membership.role, "owner")),
    ).toHaveLength(1);
  });

  it("el owner_id del workspace sin membresía tampoco vuelve como owner (D-E1b-3)", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    await db.delete(membership).where(eq(membership.userId, ownerId));
    await seedInvitation({ workspaceId, email: `${ownerId}@empresa.com` });

    const context = await enter(ownerId, `${ownerId}@empresa.com`);

    expect(context.membership.role).toBe("member");
  });

  it("elige siempre el workspace más viejo, no el que la base devuelva primero", async () => {
    // Insertados al revés de su antigüedad: sin `order by`, cuál sale primero
    // lo decide el plan de la consulta y puede cambiar entre dos peticiones.
    const newerOwner = await seedUser("nuevo@empresa.com");
    const olderOwner = await seedUser("viejo@empresa.com");
    const [newer] = await db
      .insert(workspace)
      .values({
        name: "El nuevo",
        ownerId: newerOwner,
        createdAt: new Date("2026-06-01T00:00:00Z"),
      })
      .returning();
    const [older] = await db
      .insert(workspace)
      .values({
        name: "El viejo",
        ownerId: olderOwner,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })
      .returning();
    await db
      .insert(workspaceSettings)
      .values([{ workspaceId: newer.id }, { workspaceId: older.id }]);
    await seedInvitation({ workspaceId: newer.id, email: "ana@empresa.com" });
    await seedInvitation({ workspaceId: older.id, email: "ana@empresa.com" });

    const userId = await seedUser("ana@empresa.com");
    const context = await enter(userId, "ana@empresa.com");

    expect(context.workspace.id).toBe(older.id);
    expect(context.workspace.name).toBe("El viejo");
    expect((await invitationOf(newer.id, "ana@empresa.com"))?.status).toBe("pending");
  });

  it("si la aceptación falla, la membresía no se crea (criterio 18 de E1a)", async () => {
    const { workspaceId } = await workspaceWithOwner();
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");
    vi.spyOn(workspaceRepository, "acceptPending").mockRejectedValueOnce(
      new Error("falla simulada"),
    );

    await expect(
      ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
    ).rejects.toThrow("falla simulada");

    expect(
      await db.select().from(membership).where(eq(membership.userId, userId)),
    ).toEqual([]);
    expect(await invitationOf(workspaceId, "ana@gmail.com")).toEqual(seeded);
  });

  it("una falla al crear la membresía, después de aceptar, deshace la aceptación (criterio 18 de E1a)", async () => {
    const { workspaceId } = await workspaceWithOwner();
    const seeded = await seedInvitation({ workspaceId, email: "ana@gmail.com" });
    const userId = await seedUser("ana@gmail.com");
    vi.spyOn(workspaceRepository, "createMembership").mockRejectedValueOnce(
      new Error("falla después de aceptar"),
    );

    await expect(
      ensureWorkspaceContext({ id: userId, email: "ana@gmail.com" }),
    ).rejects.toThrow("falla después de aceptar");

    expect(
      await db.select().from(membership).where(eq(membership.userId, userId)),
    ).toEqual([]);
    expect(await invitationOf(workspaceId, "ana@gmail.com")).toEqual(seeded);
    expect(await auditFor("invitation")).toEqual([]);
  });
});

describe("entrar dos veces deja una sola membresía", () => {
  it("la segunda alta devuelve la fila que ya está", async () => {
    const { workspaceId } = await workspaceWithOwner();
    const otherId = await seedUser("ana@empresa.com");
    const values = { workspaceId, userId: otherId, role: "member" } as const;

    const first = await db.transaction((tx) =>
      workspaceRepository.createMembership(tx, values),
    );
    const second = await db.transaction((tx) =>
      workspaceRepository.createMembership(tx, values),
    );

    expect(second.id).toBe(first.id);
    expect(
      await db.select().from(membership).where(eq(membership.userId, otherId)),
    ).toHaveLength(1);
  });

  it("el alta que pierde la carrera se queda con la fila de la que ganó", async () => {
    // El layout y la página llaman requireSession() en el mismo render, así
    // que el primer ingreso de alguien nuevo corre dos veces en paralelo.
    const { workspaceId } = await workspaceWithOwner();
    const otherId = await seedUser("ana@empresa.com");
    const values = { workspaceId, userId: otherId, role: "member" } as const;
    await warmPool(2);

    // Las dos barreras son necesarias y ninguna se puede sacar.
    //
    // `winnerReady` fija el orden: la perdedora no intenta su insert hasta que
    // la ganadora ya hizo el suyo. Lanzar las dos transacciones a la vez no
    // alcanza, porque abrirse a la vez no es intercalarse: la que llega
    // primero termina antes de que la otra inserte y entonces no choca con
    // nada. Peor todavía si la que termina primero es la perdedora, porque la
    // ganadora encuentra la fila ya commiteada, no se traba, y la espera de
    // abajo no se cumple nunca: el test cuelga hasta el timeout.
    //
    // `winnerMayCommit` sostiene la fila sin commitear hasta que la perdedora
    // esté efectivamente trabada en el índice único, que es la situación que
    // se quiere probar. Soltarla antes deja a la perdedora chocando contra una
    // fila ya visible, que es el caso secuencial de arriba y no una carrera.
    let winnerInserted = () => {};
    const winnerReady = new Promise<void>((resolve) => {
      winnerInserted = resolve;
    });
    let releaseWinner = () => {};
    const winnerMayCommit = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    const winner = db.transaction(async (tx) => {
      const row = await workspaceRepository.createMembership(tx, values);
      winnerInserted();
      await winnerMayCommit;
      return row;
    });

    await winnerReady;
    const loser = db.transaction((tx) =>
      workspaceRepository.createMembership(tx, values),
    );
    try {
      await waitForBlockedBackends({ count: 1 });
    } finally {
      // Si la espera vence, la ganadora igual tiene que terminar: sin esto su
      // transacción queda abierta y retiene la conexión.
      releaseWinner();
    }

    const [first, second] = await Promise.all([winner, loser]);

    expect(second.id).toBe(first.id);
    expect(
      await db.select().from(membership).where(eq(membership.userId, otherId)),
    ).toHaveLength(1);
  });
});

describe("membership.week_start", () => {
  it("una membresía nace con lunes", async () => {
    const userId = await seedUser("owner@empresa.com");

    const context = await enter(userId, "owner@empresa.com");

    expect(context.membership.weekStart).toBe(1);
    const [row] = await db
      .select({ weekStart: membership.weekStart })
      .from(membership)
      .where(eq(membership.id, context.membership.id));
    expect(row.weekStart).toBe(1);
  });

  it.each([7, -1])("el check rechaza %i", async (value) => {
    const userId = await seedUser("owner@empresa.com");
    const context = await enter(userId, "owner@empresa.com");

    const error = await db
      .update(membership)
      .set({ weekStart: value })
      .where(eq(membership.id, context.membership.id))
      .catch((caught: unknown) => caught);

    expect(constraintOf(error, CHECK_VIOLATION)).toBe("membership_week_start_range");
  });
});

describe("weekStartOf", () => {
  it("devuelve el valor de la membresía de quien pide", async () => {
    const ownerId = await seedUser("owner@empresa.com");
    const owner = await enter(ownerId, "owner@empresa.com");
    await seedInvitation({ workspaceId: owner.workspace.id, email: "ana@empresa.com" });
    const otherId = await seedUser("ana@empresa.com");
    const other = await enter(otherId, "ana@empresa.com");
    await db
      .update(membership)
      .set({ weekStart: 6 })
      .where(eq(membership.id, owner.membership.id));
    await db
      .update(membership)
      .set({ weekStart: 0 })
      .where(eq(membership.id, other.membership.id));

    const ownerAgain = await enter(ownerId, "owner@empresa.com");
    const otherAgain = await enter(otherId, "ana@empresa.com");

    expect(weekStartOf(ownerAgain)).toBe(6);
    expect(weekStartOf(otherAgain)).toBe(0);
  });

  it("lanza con un valor fuera de rango", async () => {
    const userId = await seedUser("owner@empresa.com");
    const context = await enter(userId, "owner@empresa.com");

    expect(() =>
      weekStartOf({ ...context, membership: { ...context.membership, weekStart: 7 } }),
    ).toThrow(RangeError);
  });
});

describe("resolveDurationFormat (D-WS2a-2)", () => {
  it("sin fila de ajustes da compact", () => {
    expect(resolveDurationFormat(null)).toBe("compact");
  });

  it("devuelve cada valor de la lista", () => {
    expect(resolveDurationFormat("compact")).toBe("compact");
    expect(resolveDurationFormat("full")).toBe("full");
  });

  it("lanza con un valor fuera de lista", () => {
    expect(() => resolveDurationFormat("decimal")).toThrow(RangeError);
    expect(() => resolveDurationFormat("FULL")).toThrow(RangeError);
  });
});

/** Las filas de ajustes del workspace: una, o ninguna si se borró. */
async function settingsRowsOf(workspaceId: string) {
  return db
    .select({ durationFormat: workspaceSettings.durationFormat })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId));
}

describe("el formato de duración en la sesión (D-WS2a-2, criterio 5)", () => {
  it("el arranque deja el workspace en compact, en la fila y en el contexto", async () => {
    const userId = await seedUser("owner@empresa.com");

    const context = await enter(userId, "owner@empresa.com");

    expect(context.settings).toEqual({ durationFormat: "compact" });
    expect(await settingsRowsOf(context.workspace.id)).toEqual([
      { durationFormat: "compact" },
    ]);
  });

  it("trae el valor escrito en la base", async () => {
    const { workspaceId, ownerId } = await workspaceWithOwner();
    await setDurationFormat(workspaceId, "full");

    const context = await enter(ownerId, "owner@empresa.com");

    expect(context.settings).toEqual({ durationFormat: "full" });
  });

  it("cada persona del workspace recibe el mismo formato", async () => {
    const { workspaceId } = await workspaceWithOwner();
    await seedInvitation({ workspaceId, email: "ana@empresa.com" });
    const anaId = await seedUser("ana@empresa.com");
    await setDurationFormat(workspaceId, "full");

    const ana = await enter(anaId, "ana@empresa.com");

    expect(ana.actor.role).toBe("member");
    expect(ana.settings).toEqual({ durationFormat: "full" });
  });

  it("sin la fila de ajustes trae compact, del mismo workspace, sin crearla (WS-73)", async () => {
    const { workspaceId, ownerId } = await workspaceWithOwner();
    await db
      .delete(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    const before = await writes();

    const context = await enter(ownerId, "owner@empresa.com");

    expect(context.workspace.id).toBe(workspaceId);
    expect(context.settings).toEqual({ durationFormat: "compact" });
    expect(await settingsRowsOf(workspaceId)).toEqual([]);
    expect(await writes()).toEqual(before);
  });

  it("lee los ajustes del workspace más viejo, no los de otro", async () => {
    const { workspaceId: oldest } = await seedWorkspace();
    const { workspaceId: newer } = await seedWorkspace();
    await setDurationFormat(newer, "full");

    expect(await workspaceRepository.findFirstWorkspace()).toMatchObject({
      workspace: { id: oldest },
      durationFormat: "compact",
    });

    await setDurationFormat(oldest, "full");
    await setDurationFormat(newer, "compact");

    expect(await workspaceRepository.findFirstWorkspace()).toMatchObject({
      workspace: { id: oldest },
      durationFormat: "full",
    });

    // Sin su fila, el más viejo no toma la del otro.
    await db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, oldest));
    await setDurationFormat(newer, "full");

    expect(await workspaceRepository.findFirstWorkspace()).toMatchObject({
      workspace: { id: oldest },
      durationFormat: null,
    });
  });
});

describe("listWorkspacePeople (RP-62, RP-64; criterio 17 de R4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renameAccount(userId: string, name: string) {
    await db.update(user).set({ name }).where(eq(user.id, userId));
  }

  /** Lo que se lee con el actor, en una transacción como la del reporte. */
  function readPeople(actor: Actor) {
    return db.transaction((tx) => listWorkspacePeople(tx, actor));
  }

  it("las activas, con o sin horas, y las inactivas con su estado y los dos nombres; ni las invitadas ni las de otro workspace", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    await renameAccount(ownerId, "Owner");
    await seedPreferences(ownerId, { displayName: "La dueña" });
    const idleId = await seedMember(workspaceId, "member");
    await renameAccount(idleId, "Sin horas");
    const inactiveId = await seedMember(workspaceId, "member", "inactive");
    await renameAccount(inactiveId, "Inactiva");
    // La aplicación no produce una invitada con horas: se siembra por base.
    const invitedId = await seedMember(workspaceId, "member", "invited");
    const other = await seedWorkspace();
    const startedAt = new Date("2026-09-29T13:00:00Z");
    const endedAt = new Date("2026-09-29T14:00:00Z");
    for (const userId of [ownerId, inactiveId, invitedId]) {
      await seedTimeEntry({ workspaceId, userId, startedAt, endedAt });
    }
    await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt,
      endedAt,
    });

    const people = await readPeople(actorIn(workspaceId, idleId));

    expect(
      [...people].sort((left, right) =>
        left.accountName.localeCompare(right.accountName),
      ),
    ).toStrictEqual([
      {
        userId: inactiveId,
        accountName: "Inactiva",
        displayName: null,
        status: "inactive",
        joinedAt: expect.any(Date),
      },
      {
        userId: ownerId,
        accountName: "Owner",
        displayName: "La dueña",
        status: "active",
        joinedAt: expect.any(Date),
      },
      {
        userId: idleId,
        accountName: "Sin horas",
        displayName: null,
        status: "active",
        joinedAt: expect.any(Date),
      },
    ]);
  });

  it("joinedAt es membership.created_at de cada persona, no updated_at (D-R9-2; criterio 13 de R9)", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    const activeId = await seedMember(workspaceId, "member");
    const inactiveId = await seedMember(workspaceId, "member", "inactive");
    const joined = new Map([
      [ownerId, new Date("2025-03-01T12:00:00.000Z")],
      [activeId, new Date("2026-02-14T09:30:00.123Z")],
      [inactiveId, new Date("2026-09-30T23:59:59.999Z")],
    ]);
    for (const [userId, createdAt] of joined) {
      await db.update(membership).set({ createdAt }).where(eq(membership.userId, userId));
    }
    // La membresía cambia después de crearse: `updated_at` se mueve y `created_at` no.
    await db
      .update(membership)
      .set({ weekStart: 0 })
      .where(eq(membership.workspaceId, workspaceId));
    const stored = await db
      .select({
        userId: membership.userId,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      })
      .from(membership)
      .where(eq(membership.workspaceId, workspaceId));
    expect(
      stored.every((row) => row.updatedAt.getTime() !== row.createdAt.getTime()),
    ).toBe(true);

    const people = await readPeople(actorIn(workspaceId, ownerId, { role: "owner" }));

    expect(
      Object.fromEntries(people.map(({ userId, joinedAt }) => [userId, joinedAt])),
    ).toEqual(Object.fromEntries(joined));
    expect(people).toHaveLength(3);
  });

  it("con un actor que no está activo, vacía sin leer", async () => {
    const { workspaceId } = await seedWorkspace();
    const listPeople = vi.spyOn(workspaceRepository, "listPeople");
    for (const status of ["inactive", "invited"] as const) {
      const actorId = await seedMember(workspaceId, "admin", status);
      expect(await readPeople(actorIn(workspaceId, actorId, { status }))).toEqual([]);
    }
    expect(listPeople).not.toHaveBeenCalled();
  });

  it("lee con la transacción que recibe", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    const listPeople = vi.spyOn(workspaceRepository, "listPeople");
    const transaction = await db.transaction(async (tx) => {
      await listWorkspacePeople(tx, actorIn(workspaceId, ownerId, { role: "owner" }));
      return tx;
    });
    expect(listPeople).toHaveBeenCalledTimes(1);
    expect(listPeople.mock.calls[0]?.[0]).toBe(transaction);
  });
});

describe("las lecturas con bloqueo de E2 (D-E2-2, D-E2-6)", () => {
  /** Toma la membresía como una desactivación en curso. */
  function lockMembership(userId: string) {
    return (tx: Transaction) =>
      tx
        .select()
        .from(membership)
        .where(eq(membership.userId, userId))
        .for("no key update");
  }

  it.each([
    ["active", true],
    ["inactive", false],
    ["invited", false],
  ] as const)(
    "isMembershipActiveLocked con la membresía %s: %s",
    async (status, active) => {
      const { workspaceId } = await seedWorkspace();
      const userId = await seedMember(workspaceId, "member", status);

      expect(
        await db.transaction((tx) =>
          // El `Actor` dice activa: lo que vale es lo que está en la base.
          isMembershipActiveLocked(tx, actorIn(workspaceId, userId)),
        ),
      ).toBe(active);
    },
  );

  it("isMembershipActiveLocked sin membresía: false", async () => {
    const { workspaceId } = await seedWorkspace();
    const userId = await seedUser();

    expect(
      await db.transaction((tx) =>
        isMembershipActiveLocked(tx, actorIn(workspaceId, userId)),
      ),
    ).toBe(false);
  });

  it.each(["active", "inactive", "invited"] as const)(
    "entryMembershipStatusLocked con la membresía %s la devuelve",
    async (status) => {
      const { workspaceId } = await seedWorkspace();
      const userId = await seedMember(workspaceId, "member", status);

      expect(await db.transaction((tx) => entryMembershipStatusLocked(tx, userId))).toBe(
        status,
      );
    },
  );

  it("entryMembershipStatusLocked sin membresía o sin workspace: null", async () => {
    const userId = await seedUser();
    expect(await db.transaction((tx) => entryMembershipStatusLocked(tx, userId))).toBe(
      null,
    );

    await seedWorkspace();
    expect(await db.transaction((tx) => entryMembershipStatusLocked(tx, userId))).toBe(
      null,
    );
  });

  it("entryMembershipStatusLocked lee el workspace más viejo, como entryFactsOf", async () => {
    const { workspaceId: oldest } = await seedWorkspace();
    const userId = await seedMember(oldest, "member", "inactive");
    const { workspaceId: newer } = await seedWorkspace();
    await db.insert(membership).values({ workspaceId: newer, userId, role: "member" });

    expect(await db.transaction((tx) => entryMembershipStatusLocked(tx, userId))).toBe(
      "inactive",
    );
  });

  it("las dos esperan a una desactivación en curso", async () => {
    const { workspaceId } = await seedWorkspace();
    const userId = await seedMember(workspaceId, "member");

    expect(
      await outcomeWhileHeld(lockMembership(userId), () =>
        db.transaction((tx) =>
          isMembershipActiveLocked(tx, actorIn(workspaceId, userId)),
        ),
      ),
    ).toBe("blocked");
    expect(
      await outcomeWhileHeld(lockMembership(userId), () =>
        db.transaction((tx) => entryMembershipStatusLocked(tx, userId)),
      ),
    ).toBe("blocked");
  });
});

describe("entryFactsOf con la vinculación (D-E2b-3, D-E2b-11)", () => {
  async function seedMarked(age?: string) {
    const { workspaceId, ownerId } = await seedWorkspace();
    const userId = await seedMember(workspaceId, "member", "active", {
      email: " Ana@Empresa.com",
    });
    const own = await db.select().from(membership).where(eq(membership.userId, userId));
    if (age !== undefined) {
      await seedAccountLink(own[0]?.id ?? "", ownerId, age);
    }
    return { workspaceId, userId };
  }

  it.each([
    ["vigente", "1 day", true],
    ["vencida", "8 days", false],
    ["sin marca", undefined, false],
  ] as const)("con una marca %s da accountLink %s", async (_label, age, expected) => {
    await seedMarked(age);

    expect(await entryFactsOf("ana@empresa.com")).toEqual({
      bootstrap: false,
      invitation: null,
      membership: "active",
      accountLink: expected,
    });
  });

  it("con dos `user` del mismo correo normalizado da accountLink false, aunque una tenga la marca", async () => {
    await seedMarked("1 day");
    await seedUser("ana@empresa.com");

    expect(await entryFactsOf("ana@empresa.com")).toMatchObject({
      membership: null,
      accountLink: false,
    });
  });

  it("solo mira la marca del workspace más viejo", async () => {
    const { userId } = await seedMarked();
    const { workspaceId: newer, ownerId } = await seedWorkspace();
    const [row] = await db
      .insert(membership)
      .values({ workspaceId: newer, userId, role: "member" })
      .returning();
    await seedAccountLink(row?.id ?? "", ownerId, "1 day");

    expect((await entryFactsOf("ana@empresa.com")).accountLink).toBe(false);
  });
});

describe("entryWorkspaceIdOf (D-E2b-3)", () => {
  it("el workspace más viejo, o null sin workspace", async () => {
    expect(await db.transaction((tx) => entryWorkspaceIdOf(tx))).toBeNull();

    const { workspaceId: oldest } = await seedWorkspace();
    await seedWorkspace();

    expect(await db.transaction((tx) => entryWorkspaceIdOf(tx))).toBe(oldest);
  });
});

describe("registerExternalMember (D-E2b-8, criterio 15 de E2b)", () => {
  function register(actor: Actor, email: string) {
    return db.transaction((tx) => registerExternalMember(tx, actor, email));
  }

  it("sin invitación inserta una accepted con quien actúa, con el correo normalizado, y deja invitation.register", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    const actor = actorIn(workspaceId, ownerId, { role: "owner" });

    expect(await register(actor, " Ana@Gmail.com ")).toBe(true);

    const row = await invitationOf(workspaceId, "ana@gmail.com");
    expect(row).toMatchObject({
      status: "accepted",
      invitedById: ownerId,
      revokedAt: null,
      revokedById: null,
    });
    expect(row?.acceptedAt).toBeInstanceOf(Date);
    expect(await auditFor("invitation")).toMatchObject([
      {
        workspaceId,
        actorId: ownerId,
        action: "invitation.register",
        entityId: row?.id,
        previousValue: null,
        nextValue: JSON.stringify({ status: "accepted" }),
      },
    ]);
  });

  it("con una revoked la pasa a accepted, sin la revocación, y deja invitation.register", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    const actor = actorIn(workspaceId, ownerId, { role: "owner" });
    const revoked = await seedInvitation({
      workspaceId,
      email: "ana@gmail.com",
      status: "revoked",
      invitedById: ownerId,
    });
    await db
      .update(invitation)
      .set({ revokedById: ownerId })
      .where(eq(invitation.id, revoked.id));

    expect(await register(actor, "ana@gmail.com")).toBe(true);

    expect(await invitationOf(workspaceId, "ana@gmail.com")).toMatchObject({
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
      },
    ]);
  });

  it.each(["pending", "accepted"] as const)("con una %s no escribe", async (status) => {
    const { workspaceId, ownerId } = await seedWorkspace();
    const actor = actorIn(workspaceId, ownerId, { role: "owner" });
    const before = await seedInvitation({ workspaceId, email: "ana@gmail.com", status });

    expect(await register(actor, "ana@gmail.com")).toBe(false);

    expect(await invitationOf(workspaceId, "ana@gmail.com")).toEqual(before);
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("un correo de los dominios no escribe", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    const actor = actorIn(workspaceId, ownerId, { role: "owner" });

    expect(await register(actor, "Ana@Empresa.com")).toBe(false);

    expect(await invitationOf(workspaceId, "ana@empresa.com")).toBeUndefined();
    expect(await auditFor("invitation")).toEqual([]);
  });
});

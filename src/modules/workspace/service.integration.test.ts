import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { membership, workspace, workspaceSettings } from "@/server/db/schema";
import { warmPool, waitForBlockedBackends } from "@/test/concurrency";
import { seedUser } from "@/test/factories";

import { workspaceRepository } from "./repository";
import { ensureWorkspaceContext } from "./service";

describe("ensureWorkspaceContext", () => {
  it("crea el workspace y deja como owner a la cuenta configurada", async () => {
    const userId = await seedUser("owner@empresa.com");

    const context = await ensureWorkspaceContext({
      id: userId,
      email: "owner@empresa.com",
    });

    expect(context.workspace.name).toBe("Workspace");
    expect(context.actor.role).toBe("owner");
    expect(context.actor.status).toBe("active");
    expect(context.actor.workspaceId).toBe(context.workspace.id);
  });

  it("reutiliza el workspace existente y no duplica la membresía", async () => {
    const userId = await seedUser("owner@empresa.com");

    const first = await ensureWorkspaceContext({
      id: userId,
      email: "owner@empresa.com",
    });
    const second = await ensureWorkspaceContext({
      id: userId,
      email: "owner@empresa.com",
    });

    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.membership.id).toBe(first.membership.id);
  });

  it("suma al resto del equipo como member en el workspace que ya existe", async () => {
    const ownerId = await seedUser("owner@empresa.com");
    await ensureWorkspaceContext({ id: ownerId, email: "owner@empresa.com" });

    const otherId = await seedUser("ana@empresa.com");
    const context = await ensureWorkspaceContext({
      id: otherId,
      email: "ana@empresa.com",
    });

    expect(context.actor.role).toBe("member");
    expect(context.workspace.ownerId).toBe(ownerId);
  });

  it("crea un solo workspace con dos personas entrando por primera vez a la vez", async () => {
    const ownerId = await seedUser("owner@empresa.com");
    const otherId = await seedUser("ana@empresa.com");
    await warmPool(2);

    const contexts = await Promise.all([
      ensureWorkspaceContext({ id: ownerId, email: "owner@empresa.com" }),
      ensureWorkspaceContext({ id: otherId, email: "ana@empresa.com" }),
    ]);

    expect(contexts[0].workspace.id).toBe(contexts[1].workspace.id);
    expect(await db.select().from(workspace)).toHaveLength(1);
    expect(await db.select().from(workspaceSettings)).toHaveLength(1);
    expect(await db.select().from(membership)).toHaveLength(2);
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

    const userId = await seedUser("ana@empresa.com");
    const context = await ensureWorkspaceContext({
      id: userId,
      email: "ana@empresa.com",
    });

    expect(context.workspace.id).toBe(older.id);
    expect(context.workspace.name).toBe("El viejo");
  });
});

describe("entrar dos veces deja una sola membresía", () => {
  it("la segunda alta devuelve la fila que ya está", async () => {
    const ownerId = await seedUser("owner@empresa.com");
    const context = await ensureWorkspaceContext({
      id: ownerId,
      email: "owner@empresa.com",
    });
    const otherId = await seedUser("ana@empresa.com");
    const values = {
      workspaceId: context.workspace.id,
      userId: otherId,
      role: "member",
    } as const;

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
    const ownerId = await seedUser("owner@empresa.com");
    const context = await ensureWorkspaceContext({
      id: ownerId,
      email: "owner@empresa.com",
    });
    const otherId = await seedUser("ana@empresa.com");
    const values = {
      workspaceId: context.workspace.id,
      userId: otherId,
      role: "member",
    } as const;
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

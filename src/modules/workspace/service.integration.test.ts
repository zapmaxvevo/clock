import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { membership, workspace, workspaceSettings } from "@/server/db/schema";
import { seedUser } from "@/test/factories";

import { workspaceRepository } from "./repository";
import { ensureWorkspaceContext } from "./service";

/**
 * Deja `size` conexiones abiertas en el pool antes de medir una carrera. Sin
 * esto, el handshake de la segunda conexión es más lento que la primera
 * transacción entera y las dos llamadas terminan corriendo una después de la
 * otra. La barrera suelta las transacciones recién cuando todas llegaron, así
 * que no hay ninguna espera fija.
 */
async function warmPool(size: number): Promise<void> {
  let arrived = 0;
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  await Promise.all(
    Array.from({ length: size }, () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        arrived += 1;
        if (arrived === size) {
          open();
        }
        await gate;
      }),
    ),
  );
}

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

  it("deja una sola membresía con dos primeros ingresos en paralelo", async () => {
    // El layout y la página llaman requireSession() en el mismo render, así
    // que el primer ingreso de alguien nuevo corre dos veces en paralelo.
    const ownerId = await seedUser("owner@empresa.com");
    await ensureWorkspaceContext({ id: ownerId, email: "owner@empresa.com" });
    const otherId = await seedUser("ana@empresa.com");
    await warmPool(2);

    const contexts = await Promise.all([
      ensureWorkspaceContext({ id: otherId, email: "ana@empresa.com" }),
      ensureWorkspaceContext({ id: otherId, email: "ana@empresa.com" }),
    ]);

    expect(contexts[0].membership.id).toBe(contexts[1].membership.id);
    expect(contexts[0].actor.role).toBe("member");
    expect(await db.select().from(workspace)).toHaveLength(1);
    expect(
      await db.select().from(membership).where(eq(membership.userId, otherId)),
    ).toHaveLength(1);
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

describe("workspaceRepository.createMembership", () => {
  it("es idempotente: la segunda llamada devuelve la fila que ya está", async () => {
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
});

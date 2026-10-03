import { randomUUID } from "node:crypto";

import { db } from "@/server/db";
import {
  membership,
  timeEntry,
  user,
  workspace,
  workspaceSettings,
} from "@/server/db/schema";
import type { Role } from "@/server/permissions";

/** Zona horaria de los workspaces de prueba. */
export const buenosAires = "America/Argentina/Buenos_Aires";

export type SeededWorkspace = {
  readonly workspaceId: string;
  readonly ownerId: string;
};

/** Crea un usuario con email único. */
export async function seedUser(email?: string): Promise<string> {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: "Persona de prueba",
    email: email ?? `${id}@empresa.com`,
    emailVerified: true,
  });
  return id;
}

/** Crea un workspace con su configuración y la membresía del owner. */
export async function seedWorkspace(timezone = buenosAires): Promise<SeededWorkspace> {
  const ownerId = await seedUser();
  const [created] = await db
    .insert(workspace)
    .values({ name: "Workspace de prueba", ownerId, timezone })
    .returning();
  await db.insert(workspaceSettings).values({ workspaceId: created.id });
  await db
    .insert(membership)
    .values({ workspaceId: created.id, userId: ownerId, role: "owner" });
  return { workspaceId: created.id, ownerId };
}

/** Agrega un miembro con el rol pedido al workspace. */
export async function seedMember(workspaceId: string, role: Role): Promise<string> {
  const userId = await seedUser();
  await db.insert(membership).values({ workspaceId, userId, role });
  return userId;
}

/** Entrada de horas escrita directo contra la tabla. */
export type SeedTimeEntryValues = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly description?: string;
  readonly startedAt: string | Date;
  /** Ausente o nulo deja la entrada abierta, que es el timer activo. */
  readonly endedAt?: string | Date | null;
};

/**
 * Estado de partida de un test, no un camino de la aplicación: los instantes
 * los fija quien llama en vez de salir de `now()`.
 */
export async function seedTimeEntry(values: SeedTimeEntryValues) {
  const endedAt = values.endedAt ?? null;
  const [row] = await db
    .insert(timeEntry)
    .values({
      workspaceId: values.workspaceId,
      userId: values.userId,
      description: values.description ?? "",
      startedAt: new Date(values.startedAt),
      endedAt: endedAt === null ? null : new Date(endedAt),
    })
    .returning();
  return row;
}

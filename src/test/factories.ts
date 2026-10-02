import { randomUUID } from "node:crypto";

import { db } from "@/server/db";
import { membership, user, workspace, workspaceSettings } from "@/server/db/schema";
import type { Role } from "@/server/permissions";

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
export async function seedWorkspace(
  timezone = "America/Argentina/Buenos_Aires",
): Promise<SeededWorkspace> {
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

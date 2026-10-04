import { randomUUID } from "node:crypto";

import { db } from "@/server/db";
import {
  client,
  membership,
  project,
  projectMember,
  task,
  timeEntry,
  user,
  workspace,
  workspaceSettings,
} from "@/server/db/schema";
import type { PaletteKey } from "@/modules/project/palette";
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

/** Un nombre que no choca con los índices de unicidad de otra fila sembrada. */
function uniqueName(prefix: string): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function archivedAtOf(archived: boolean | undefined): Date | null {
  return archived === true ? new Date() : null;
}

/** Cliente escrito directo contra la tabla. */
export async function seedClient(values: {
  readonly workspaceId: string;
  readonly name?: string;
  readonly createdBy?: string | null;
  readonly archived?: boolean;
}) {
  const [row] = await db
    .insert(client)
    .values({
      workspaceId: values.workspaceId,
      name: values.name ?? uniqueName("Cliente"),
      createdBy: values.createdBy ?? null,
      archivedAt: archivedAtOf(values.archived),
    })
    .returning();
  return row;
}

/** Una fila de `project_member`: la pertenencia y, si se pide, la marca de responsable. */
export type SeedProjectMember = {
  readonly userId: string;
  readonly isManager?: boolean;
};

/** Proyecto escrito directo contra la tabla, con sus miembros si se pasan. */
export async function seedProject(values: {
  readonly workspaceId: string;
  readonly clientId?: string | null;
  readonly name?: string;
  readonly color?: PaletteKey;
  readonly isPublic?: boolean;
  readonly archived?: boolean;
  readonly createdBy?: string | null;
  readonly members?: readonly SeedProjectMember[];
}) {
  const [row] = await db
    .insert(project)
    .values({
      workspaceId: values.workspaceId,
      clientId: values.clientId ?? null,
      name: values.name ?? uniqueName("Proyecto"),
      color: values.color ?? "blue",
      isPublic: values.isPublic ?? true,
      archivedAt: archivedAtOf(values.archived),
      createdBy: values.createdBy ?? null,
    })
    .returning();
  for (const member of values.members ?? []) {
    await db.insert(projectMember).values({
      workspaceId: values.workspaceId,
      projectId: row.id,
      userId: member.userId,
      isManager: member.isManager ?? false,
    });
  }
  return row;
}

/** Tarea escrita directo contra la tabla. */
export async function seedTask(values: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly name?: string;
  readonly status?: "active" | "done";
  readonly createdBy?: string | null;
}) {
  const [row] = await db
    .insert(task)
    .values({
      workspaceId: values.workspaceId,
      projectId: values.projectId,
      name: values.name ?? uniqueName("Tarea"),
      status: values.status ?? "active",
      createdBy: values.createdBy ?? null,
    })
    .returning();
  return row;
}

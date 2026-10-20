import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  account,
  client,
  invitation,
  type InvitationStatus,
  membership,
  project,
  projectMember,
  session,
  tag,
  task,
  timeEntry,
  timeEntryTag,
  user,
  userPreference,
  workspace,
  workspaceSettings,
} from "@/server/db/schema";
import type { PaletteKey } from "@/modules/project/palette";
import type { MembershipStatus, Role } from "@/server/permissions";
import type { DisplayFormats } from "@/server/time";

/** Zona horaria de los workspaces de prueba. */
export const buenosAires = "America/Argentina/Buenos_Aires";

/** Los formatos de quien no eligió ninguno (P-03). */
export const defaultFormats: DisplayFormats = {
  time: "24h",
  date: "dd/MM/yyyy",
  duration: "compact",
};

export type SeededWorkspace = {
  readonly workspaceId: string;
  readonly ownerId: string;
};

/** Crea un usuario con email único y, si se pasa, con ese id; sin él, un uuid. */
export async function seedUser(
  email?: string,
  id: string = randomUUID(),
): Promise<string> {
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

/**
 * Agrega un miembro con el rol pedido al workspace, activo salvo que se pida
 * otro estado, y con el id de usuario y el correo que se pasen.
 */
export async function seedMember(
  workspaceId: string,
  role: Role,
  status: MembershipStatus = "active",
  person: { readonly id?: string; readonly email?: string } = {},
): Promise<string> {
  const userId = await seedUser(person.email, person.id);
  await db.insert(membership).values({ workspaceId, userId, role, status });
  return userId;
}

/** Las columnas de preferencia que se siembran; las que faltan quedan en nulo. */
export type SeedPreferenceValues = Partial<
  Pick<
    typeof userPreference.$inferInsert,
    "timezone" | "timeFormat" | "dateFormat" | "displayName" | "theme"
  >
>;

/** La fila de preferencias de una persona, escrita directo con las columnas que se pasen. */
export async function seedPreferences(userId: string, values: SeedPreferenceValues) {
  const [row] = await db
    .insert(userPreference)
    .values({ userId, ...values })
    .returning();
  return row;
}

/** Entrada de horas escrita directo contra la tabla. */
export type SeedTimeEntryValues = {
  /** Ausente, el que genera la base. */
  readonly id?: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly description?: string;
  readonly startedAt: string | Date;
  /** Ausente o nulo deja la entrada abierta, que es el timer activo. */
  readonly endedAt?: string | Date | null;
  readonly projectId?: string | null;
  readonly taskId?: string | null;
  /** Ausente, el valor por omisión de la columna: `false`. */
  readonly billable?: boolean;
  /** Las filas de la unión, en el workspace de la entrada. */
  readonly tagIds?: readonly string[];
  /** Ausente, el `now()` de la base. Fija el desempate de TS-34. */
  readonly createdAt?: string | Date;
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
      id: values.id,
      workspaceId: values.workspaceId,
      userId: values.userId,
      description: values.description ?? "",
      startedAt: new Date(values.startedAt),
      endedAt: endedAt === null ? null : new Date(endedAt),
      projectId: values.projectId ?? null,
      taskId: values.taskId ?? null,
      billable: values.billable,
      createdAt: values.createdAt === undefined ? undefined : new Date(values.createdAt),
    })
    .returning();
  const tagIds = values.tagIds ?? [];
  if (tagIds.length > 0) {
    await db.insert(timeEntryTag).values(
      tagIds.map((tagId) => ({
        workspaceId: row.workspaceId,
        timeEntryId: row.id,
        tagId,
      })),
    );
  }
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
  readonly billableByDefault?: boolean;
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
      billableByDefault: values.billableByDefault ?? false,
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

/** Etiqueta escrita directo contra la tabla. */
export async function seedTag(values: {
  readonly workspaceId: string;
  readonly name?: string;
  readonly archived?: boolean;
  readonly createdBy?: string | null;
}) {
  const [row] = await db
    .insert(tag)
    .values({
      workspaceId: values.workspaceId,
      name: values.name ?? uniqueName("Etiqueta"),
      archivedAt: archivedAtOf(values.archived),
      createdBy: values.createdBy ?? null,
    })
    .returning();
  return row;
}

/**
 * Invitación escrita directo contra la tabla, `pending` salvo que se pida otro
 * estado; las fechas de aceptada y revocada las pide el `check` de cada estado.
 */
export async function seedInvitation(values: {
  readonly workspaceId: string;
  readonly email: string;
  readonly status?: InvitationStatus;
  readonly invitedById?: string | null;
}) {
  const status = values.status ?? "pending";
  const [row] = await db
    .insert(invitation)
    .values({
      workspaceId: values.workspaceId,
      email: values.email,
      status,
      invitedById: values.invitedById ?? null,
      acceptedAt: status === "accepted" ? new Date() : null,
      revokedAt: status === "revoked" ? new Date() : null,
    })
    .returning();
  return row;
}

/**
 * Una cuenta de Google de `userId` con ese `sub`, o uno nuevo, escrita directo
 * contra la tabla: la que deja un ingreso y la que pide reactivar (D-E2-7).
 * Devuelve el `sub`.
 */
export async function seedAccount(
  userId: string,
  sub: string = randomUUID(),
): Promise<string> {
  await db.insert(account).values({
    id: randomUUID(),
    accountId: sub,
    providerId: "google",
    userId,
    updatedAt: new Date(),
  });
  return sub;
}

/**
 * Una sesión de `userId` que vence en un día, escrita directo contra la tabla,
 * sin pasar por los ganchos del ingreso. Devuelve su id.
 */
export async function seedSession(userId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(session).values({
    id,
    token: randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  });
  return id;
}

/**
 * D-E2b-2: la marca de vinculación de `membershipId`, escrita directo contra la
 * tabla con `now()` menos `age`, un intervalo de Postgres (`8 days`, `7 days -5
 * seconds`); sin `age`, ahora. La membresía tiene que estar activa: el
 * `check` lo exige.
 */
export async function seedAccountLink(
  membershipId: string,
  requestedById: string | null,
  age = "0 seconds",
): Promise<void> {
  await db
    .update(membership)
    .set({
      accountLinkRequestedAt: sql`now() - ${age}::interval`,
      accountLinkRequestedById: requestedById,
    })
    .where(eq(membership.id, membershipId));
}

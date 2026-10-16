import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import {
  invitation,
  membership,
  user,
  userPreference,
  workspace,
  workspaceSettings,
} from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";

export type WorkspaceRow = typeof workspace.$inferSelect;
export type MembershipRow = typeof membership.$inferSelect;

/** Una persona del workspace con los dos nombres, que solo se muestran (ADR 0010). */
export type PersonRow = {
  readonly userId: string;
  readonly accountName: string;
  readonly displayName: string | null;
  readonly status: MembershipStatus;
  /** `membership.created_at` (D-R9-2). */
  readonly joinedAt: Date;
};

/** Una invitación, con lo que sus reglas leen (D-E1a-7, D-E1a-8). */
export type InvitationRow = {
  readonly id: string;
  readonly email: string;
  readonly status: "pending" | "accepted" | "revoked";
};

/** Una membresía encontrada por el correo de su `user` (D-E1a-7). */
export type MemberByEmail = { readonly email: string; readonly status: MembershipStatus };

const invitationColumns = {
  id: invitation.id,
  email: invitation.email,
  status: invitation.status,
};

/** El workspace más viejo, como subconsulta: el mismo criterio que `findFirstWorkspace`. */
function firstWorkspaceId() {
  return db
    .select({ id: workspace.id })
    .from(workspace)
    .orderBy(asc(workspace.createdAt), asc(workspace.id))
    .limit(1);
}

/** Los estados de quien está en el workspace; `invited` todavía no (RP-64). */
const PRESENT_STATUSES: readonly MembershipStatus[] = ["active", "inactive"];

/**
 * Clave del bloqueo que serializa la creación del primer workspace. Es
 * arbitraria; lo único que importa es que nadie más la use.
 */
const WORKSPACE_BOOTSTRAP_LOCK = 4_919_284_001;

/** Único lugar con acceso a datos del módulo. */
export const workspaceRepository = {
  /**
   * El workspace más viejo. El orden es explícito porque «el primero» sin
   * criterio es una lectura que puede cambiar entre dos peticiones; el `id`
   * desempata para que no dependa del segundo en que se crearon.
   */
  async findFirstWorkspace(
    tx: Transaction | typeof db = db,
  ): Promise<WorkspaceRow | undefined> {
    const rows = await tx
      .select()
      .from(workspace)
      .orderBy(asc(workspace.createdAt), asc(workspace.id))
      .limit(1);
    return rows.at(0);
  },

  async findMembership(
    workspaceId: string,
    userId: string,
    tx: Transaction | typeof db = db,
  ): Promise<MembershipRow | undefined> {
    const rows = await tx
      .select()
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
      .limit(1);
    return rows.at(0);
  },

  async createWorkspace(
    tx: Transaction,
    values: { name: string; ownerId: string; timezone: string },
  ): Promise<WorkspaceRow> {
    const [created] = await tx.insert(workspace).values(values).returning();
    await tx.insert(workspaceSettings).values({ workspaceId: created.id });
    return created;
  },

  /**
   * Idempotente: dos primeros ingresos en paralelo del mismo usuario insertan
   * los dos, y el que pierde contra `membership_workspace_user_unq` se queda
   * con la fila que ya está en vez de romper el render.
   */
  async createMembership(
    tx: Transaction,
    values: { workspaceId: string; userId: string; role: Role },
  ): Promise<MembershipRow> {
    const [created] = await tx
      .insert(membership)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (created !== undefined) {
      return created;
    }
    const existing = await workspaceRepository.findMembership(
      values.workspaceId,
      values.userId,
      tx,
    );
    if (existing === undefined) {
      throw new Error("La membresía no se insertó y tampoco existe.");
    }
    return existing;
  },

  /** Las membresías `active` e `inactive` del workspace, con los dos nombres. Sin orden. */
  async listPeople(tx: Transaction, workspaceId: string): Promise<PersonRow[]> {
    return tx
      .select({
        userId: membership.userId,
        accountName: user.name,
        displayName: userPreference.displayName,
        status: membership.status,
        joinedAt: membership.createdAt,
      })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .leftJoin(userPreference, eq(userPreference.userId, membership.userId))
      .where(
        and(
          eq(membership.workspaceId, workspaceId),
          inArray(membership.status, [...PRESENT_STATUSES]),
        ),
      );
  },

  /**
   * Bloqueo hasta el fin de la transacción. Lo toma solo el primer ingreso,
   * cuando todavía no hay workspace: sin una restricción que haga único al
   * workspace, `on conflict` no tiene contra qué chocar.
   */
  async lockWorkspaceBootstrap(tx: Transaction): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(${WORKSPACE_BOOTSTRAP_LOCK})`);
  },

  /**
   * D-E1a-9: la membresía de quien actúa, `for share`. `undefined` si no está.
   * Espera a un cambio de rol en curso, que toma `for no key update` sobre la
   * misma fila, y no choca con el `for key share` de un alta de horas.
   */
  async lockActorMembership(
    tx: Transaction,
    workspaceId: string,
    userId: string,
  ): Promise<{ role: Role; status: MembershipStatus } | undefined> {
    const rows = await tx
      .select({ role: membership.role, status: membership.status })
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
      .for("share");
    return rows.at(0);
  },

  /** Las membresías de `workspaceId` cuyo `lower(user.email)` está en `emails`. */
  async membersByEmail(
    tx: Transaction,
    workspaceId: string,
    emails: readonly string[],
  ): Promise<readonly MemberByEmail[]> {
    if (emails.length === 0) {
      return [];
    }
    const email = sql<string>`lower(${user.email})`;
    return tx
      .select({ email, status: membership.status })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.workspaceId, workspaceId), inArray(email, [...emails])));
  },

  /**
   * Las invitaciones de esos correos, `order by id`, `for update`, en una
   * sentencia: dos pedidos con correos en común se esperan en el mismo orden.
   */
  async lockInvitationsByEmail(
    tx: Transaction,
    workspaceId: string,
    emails: readonly string[],
  ): Promise<readonly InvitationRow[]> {
    if (emails.length === 0) {
      return [];
    }
    return tx
      .select(invitationColumns)
      .from(invitation)
      .where(
        and(
          eq(invitation.workspaceId, workspaceId),
          inArray(invitation.email, [...emails]),
        ),
      )
      .orderBy(asc(invitation.id))
      .for("update");
  },

  /**
   * Filas nuevas `pending`; `on conflict do nothing`. Devuelve las que insertó:
   * el correo que otro pedido insertó a la vez no vuelve (EQ-106). Van por
   * correo: dos pedidos con los mismos correos en otro orden se esperarían en
   * círculo en el índice único.
   */
  async insertInvitations(
    tx: Transaction,
    workspaceId: string,
    emails: readonly string[],
    invitedById: string,
  ): Promise<readonly InvitationRow[]> {
    if (emails.length === 0) {
      return [];
    }
    return tx
      .insert(invitation)
      .values([...emails].sort().map((email) => ({ workspaceId, email, invitedById })))
      .onConflictDoNothing()
      .returning(invitationColumns);
  },

  /** Vuelve a `pending` las filas dadas, con quién y cuándo; limpia aceptada y revocada. */
  async reinvite(
    tx: Transaction,
    workspaceId: string,
    ids: readonly string[],
    invitedById: string,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await tx
      .update(invitation)
      .set({
        status: "pending",
        invitedById,
        invitedAt: sql`now()`,
        acceptedAt: null,
        revokedAt: null,
        revokedById: null,
      })
      .where(
        and(eq(invitation.workspaceId, workspaceId), inArray(invitation.id, [...ids])),
      );
  },

  /** La invitación `(workspaceId, id)`, `for update`. */
  async lockInvitation(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ): Promise<InvitationRow | undefined> {
    const rows = await tx
      .select(invitationColumns)
      .from(invitation)
      .where(and(eq(invitation.workspaceId, workspaceId), eq(invitation.id, id)))
      .for("update");
    return rows.at(0);
  },

  /** `pending` a `revoked`, con quién y cuándo. */
  async revoke(
    tx: Transaction,
    workspaceId: string,
    id: string,
    revokedById: string,
  ): Promise<void> {
    await tx
      .update(invitation)
      .set({ status: "revoked", revokedAt: sql`now()`, revokedById })
      .where(
        and(
          eq(invitation.workspaceId, workspaceId),
          eq(invitation.id, id),
          eq(invitation.status, "pending"),
        ),
      );
  },

  /**
   * D-E1a-5: la pendiente de `email` pasa a `accepted`; `where status =
   * 'pending'`, que se vuelve a evaluar después de esperar a una revocación en
   * curso (EQ-107). `email` ya normalizado. Devuelve el id si cambió alguna.
   */
  async acceptPending(
    tx: Transaction,
    workspaceId: string,
    email: string,
  ): Promise<string | undefined> {
    const rows = await tx
      .update(invitation)
      .set({ status: "accepted", acceptedAt: sql`now()` })
      .where(
        and(
          eq(invitation.workspaceId, workspaceId),
          eq(invitation.email, email),
          eq(invitation.status, "pending"),
        ),
      )
      .returning({ id: invitation.id });
    return rows.at(0)?.id;
  },

  /** Las `pending` de `workspaceId`, `order by email`. */
  async listPending(workspaceId: string): Promise<readonly InvitationRow[]> {
    return db
      .select(invitationColumns)
      .from(invitation)
      .where(
        and(eq(invitation.workspaceId, workspaceId), eq(invitation.status, "pending")),
      )
      .orderBy(asc(invitation.email));
  },

  /**
   * D-E1a-4: si el correo, ya normalizado, tiene una invitación `pending` o
   * `accepted` en el workspace más viejo. Hay uno solo, y el login todavía no
   * tiene membresía de la que sacarlo.
   */
  async hasOpenInvitation(email: string): Promise<boolean> {
    const rows = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.workspaceId, sql`(${firstWorkspaceId()})`),
          eq(invitation.email, email),
          inArray(invitation.status, ["pending", "accepted"]),
        ),
      )
      .limit(1);
    return rows.length > 0;
  },
};

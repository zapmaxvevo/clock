import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { account, membership, user, userPreference } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";

import { MEMBER_STATUSES, type ChangeableRole, type MemberStatus } from "./schema";

/** Lo que la lista muestra de una membresía (ADR 0010: `join`, sin reglas). */
export type TeamMemberRow = {
  readonly membershipId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: MemberStatus;
  /** D-E2-7: si tiene una fila de `account`; se muestra. */
  readonly hasAccount: boolean;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  readonly email: string;
  /** `user_preference.display_name`, o `null`. */
  readonly displayName: string | null;
};

/** Una membresía bloqueada para cambiar el rol o el estado. */
export type LockedMembership = {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: MembershipStatus;
};

/** El estado estrechado: la consulta solo deja pasar `active` e `inactive`. */
function memberStatusOf(status: MembershipStatus): MemberStatus {
  if (status === "invited") {
    throw new Error("Una membresía invitada llegó a la lista de equipo.");
  }
  return status;
}

/** Único lugar del módulo con acceso a datos. */
export const teamRepository = {
  /**
   * Las membresías `active` e `inactive` de `workspaceId`, con `"user"` interno,
   * `user_preference` con `left join` y si tienen una fila de `account`. Sin
   * orden. Las `invited` no están (RP-64).
   */
  async listMembers(workspaceId: string): Promise<readonly TeamMemberRow[]> {
    const rows = await db
      .select({
        membershipId: membership.id,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        hasAccount: sql<boolean>`exists (
          select 1 from ${account} where ${account.userId} = ${membership.userId}
        )`,
        accountName: user.name,
        email: user.email,
        displayName: userPreference.displayName,
      })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .leftJoin(userPreference, eq(userPreference.userId, membership.userId))
      .where(
        and(
          eq(membership.workspaceId, workspaceId),
          inArray(membership.status, [...MEMBER_STATUSES]),
        ),
      );
    return rows.map((row) => ({ ...row, status: memberStatusOf(row.status) }));
  },

  /**
   * D-R8-7, D-E2-6: el bloqueo de `changeRole` y de `changeStatus`. En una
   * sentencia, las membresías de `workspaceId` con `id = membershipId` o
   * `user_id = actorUserId`, `order by id`, `for no key update`. Devuelve las
   * que existen: ninguna, una (también si son la misma) o dos.
   *
   * Una sola sentencia ordenada: dos, o el orden de los parámetros, pueden
   * esperarse en círculo con otro cambio que pide las mismas dos (ADR 0011).
   * `for no key update` no choca con el `for key share` que toma un alta de
   * horas sobre la membresía por su clave foránea.
   */
  async lockForChange(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    actorUserId: string,
  ): Promise<readonly LockedMembership[]> {
    return tx
      .select({
        id: membership.id,
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
      })
      .from(membership)
      .where(
        and(
          eq(membership.workspaceId, workspaceId),
          or(eq(membership.id, membershipId), eq(membership.userId, actorUserId)),
        ),
      )
      .orderBy(asc(membership.id))
      .for("no key update");
  },

  /** El rol de `(workspaceId, membershipId)`. `updated_at` lo pone `$onUpdate`. */
  async updateRole(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    role: ChangeableRole,
  ): Promise<void> {
    await tx
      .update(membership)
      .set({ role })
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.id, membershipId)),
      );
  },

  /** El estado de `(workspaceId, membershipId)`. `updated_at` lo pone `$onUpdate`. */
  async updateStatus(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    status: MemberStatus,
  ): Promise<void> {
    await tx
      .update(membership)
      .set({ status })
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.id, membershipId)),
      );
  },
};

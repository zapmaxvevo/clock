import { and, asc, eq, or } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { membership, user, userPreference } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";

import type { ChangeableRole } from "./schema";

/** Lo que la lista muestra de una membresía activa (ADR 0010: `join`, sin reglas). */
export type TeamMemberRow = {
  readonly membershipId: string;
  readonly userId: string;
  readonly role: Role;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  readonly email: string;
  /** `user_preference.display_name`, o `null`. */
  readonly displayName: string | null;
};

/** Una membresía bloqueada para cambiar el rol. */
export type LockedMembership = {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: MembershipStatus;
};

/** Único lugar del módulo con acceso a datos. */
export const teamRepository = {
  /**
   * Las membresías `active` de `workspaceId`, con `"user"` interno y
   * `user_preference` con `left join`. Sin orden.
   */
  async listActiveMembers(workspaceId: string): Promise<readonly TeamMemberRow[]> {
    return db
      .select({
        membershipId: membership.id,
        userId: membership.userId,
        role: membership.role,
        accountName: user.name,
        email: user.email,
        displayName: userPreference.displayName,
      })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .leftJoin(userPreference, eq(userPreference.userId, membership.userId))
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active")),
      );
  },

  /**
   * D-R8-7: en una sentencia, las membresías de `workspaceId` con
   * `id = membershipId` o `user_id = actorUserId`, `order by id`,
   * `for no key update`. Devuelve las que existen: ninguna, una (también si
   * son la misma) o dos.
   *
   * Una sola sentencia ordenada: dos, o el orden de los parámetros, pueden
   * esperarse en círculo con otro cambio que pide las mismas dos (ADR 0011).
   * `for no key update` no choca con el `for key share` que toma un alta de
   * horas sobre la membresía por su clave foránea.
   */
  async lockForRoleChange(
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
};

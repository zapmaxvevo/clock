import type { Transaction } from "@/server/db";
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
  async listActiveMembers(_workspaceId: string): Promise<readonly TeamMemberRow[]> {
    throw new Error("R8: listActiveMembers sin implementar.");
  },

  /**
   * D-R8-7: en una sentencia, las membresías de `workspaceId` con
   * `id = membershipId` o `user_id = actorUserId`, `order by id`,
   * `for no key update`. Devuelve las que existen: ninguna, una (también si
   * son la misma) o dos.
   */
  async lockForRoleChange(
    _tx: Transaction,
    _workspaceId: string,
    _membershipId: string,
    _actorUserId: string,
  ): Promise<readonly LockedMembership[]> {
    throw new Error("R8: lockForRoleChange sin implementar.");
  },

  /** El rol de `(workspaceId, membershipId)`. `updated_at` lo pone `$onUpdate`. */
  async updateRole(
    _tx: Transaction,
    _workspaceId: string,
    _membershipId: string,
    _role: ChangeableRole,
  ): Promise<void> {
    throw new Error("R8: updateRole sin implementar.");
  },
};

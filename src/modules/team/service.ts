import { compareNames } from "@/lib/text";
import { DomainError } from "@/server/errors";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import {
  can,
  type Actor,
  type MembershipResource,
  type Role,
} from "@/server/permissions";
import { displayNameOf } from "@/modules/profile/service";

import { teamRepository, type LockedMembership, type TeamMemberRow } from "./repository";
import {
  CHANGEABLE_ROLES,
  teamMessages,
  type ChangeableRole,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type TeamErrorCode,
  type TeamMember,
  type TeamView,
} from "./schema";

/** Error de dominio del módulo. La action lo traduce a un resultado tipado. */
export class TeamError extends DomainError<TeamErrorCode> {
  constructor(code: TeamErrorCode, message: string) {
    super(code, message);
    this.name = "TeamError";
  }
}

const AUDIT_ACTION = "membership.changeRole";
const AUDIT_ENTITY = "membership";

/** `can(actor, "team.manage", workspace)`: la entrada de la navegación, la vista y la puerta de la mutación. */
export function canManageTeam(actor: Actor): boolean {
  return can(actor, "team.manage", { kind: "workspace", workspaceId: actor.workspaceId });
}

/** D-R8-4: el rol, si R8 lo escribe; `undefined` para `owner` y los otros. */
function changeableRoleOf(role: Role): ChangeableRole | undefined {
  return CHANGEABLE_ROLES.find((changeable) => changeable === role);
}

function membershipResource(
  workspaceId: string,
  row: { readonly userId: string; readonly role: Role },
): MembershipResource {
  return { kind: "membership", workspaceId, userId: row.userId, role: row.role };
}

/**
 * D-R8-3, D-R8-13: el control de la fila, con `can()` sobre su membresía.
 * `team.admin.revoke` se consulta solo sobre una fila `admin`.
 */
function changeOf(actor: Actor, row: TeamMemberRow): TeamMember["change"] {
  const resource = membershipResource(actor.workspaceId, row);
  switch (changeableRoleOf(row.role)) {
    case "member":
      return can(actor, "team.manage", resource) ? "promote" : null;
    case "admin":
      return can(actor, "team.admin.revoke", resource) ? "demote" : null;
    case undefined:
      return null;
  }
}

function toTeamMember(actor: Actor, row: TeamMemberRow): TeamMember {
  return {
    membershipId: row.membershipId,
    name: displayNameOf(row, row.accountName),
    email: row.email,
    role: row.role,
    isSelf: row.userId === actor.userId,
    change: changeOf(actor, row),
  };
}

function compareMembers(left: TeamMember, right: TeamMember): number {
  return compareNames(
    { id: left.membershipId, name: left.name },
    { id: right.membershipId, name: right.name },
  );
}

/** D-R8-2, D-R8-3. Sin `team.manage`, no lee. */
export async function getTeamView(actor: Actor): Promise<TeamView> {
  if (!canManageTeam(actor)) {
    return { kind: "forbidden", reason: actor.status === "active" ? "role" : "inactive" };
  }
  const rows = await teamRepository.listActiveMembers(actor.workspaceId);
  return {
    kind: "ready",
    members: rows.map((row) => toTeamMember(actor, row)).sort(compareMembers),
  };
}

/**
 * D-R8-7: la autoridad de quien actúa, leída bajo el bloqueo. El `Actor` de la
 * sesión se armó en otra transacción y puede haber perdido el rol desde
 * entonces.
 */
function freshActorOf(actor: Actor, locked: readonly LockedMembership[]): Actor {
  const own = locked.find(
    (row) => row.workspaceId === actor.workspaceId && row.userId === actor.userId,
  );
  if (own === undefined) {
    throw new TeamError("forbidden", teamMessages.forbidden);
  }
  return {
    userId: own.userId,
    workspaceId: actor.workspaceId,
    role: own.role,
    status: own.status,
  };
}

/** D-R8-4 a D-R8-9, D-R8-13. */
export async function changeRole(
  actor: Actor,
  input: ChangeRoleInput,
): Promise<ChangeRoleResult> {
  if (!canManageTeam(actor)) {
    throw new TeamError("forbidden", teamMessages.forbidden);
  }
  return db.transaction(async (tx) => {
    const locked = await teamRepository.lockForRoleChange(
      tx,
      actor.workspaceId,
      input.membershipId,
      actor.userId,
    );
    const target = locked.find((row) => row.id === input.membershipId);
    if (target === undefined) {
      throw new TeamError("not_found", teamMessages.notFound);
    }
    const fresh = freshActorOf(actor, locked);
    const resource = membershipResource(target.workspaceId, target);
    if (!can(fresh, "team.manage", resource)) {
      throw new TeamError("forbidden", teamMessages.forbidden);
    }
    // D-R8-13: quitar el rol de admin pide además `team.admin.revoke`. La
    // acción se elige por el pedido y la decide `can()`; pedir `admin` para
    // quien ya lo es no quita nada y sigue siendo idempotente.
    if (
      target.role === "admin" &&
      input.role === "member" &&
      !can(fresh, "team.admin.revoke", resource)
    ) {
      throw new TeamError("forbidden", teamMessages.adminOwnerOnly);
    }
    // `can()` deja al owner tocar su propia membresía; bajarlo dejaría el
    // workspace con un `owner_id` sin el rol `owner` (D-R8-4).
    if (target.role === "owner") {
      throw new TeamError("role_locked", teamMessages.ownerLocked);
    }
    const current = changeableRoleOf(target.role);
    if (current === undefined) {
      throw new TeamError("role_locked", teamMessages.roleLocked);
    }
    if (target.status !== "active") {
      throw new TeamError("inactive_membership", teamMessages.inactive);
    }
    const result = { membershipId: target.id, role: input.role };
    if (current === input.role) {
      return result;
    }
    await teamRepository.updateRole(tx, actor.workspaceId, target.id, input.role);
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: AUDIT_ACTION,
      entity: AUDIT_ENTITY,
      entityId: target.id,
      previousValue: { role: current },
      nextValue: { role: input.role },
    });
    return result;
  });
}

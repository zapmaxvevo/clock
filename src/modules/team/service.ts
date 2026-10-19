import { compareNames } from "@/lib/text";
import { DomainError } from "@/server/errors";
import { recordAudit } from "@/server/audit";
import { deleteSessionsOf, hasAccount } from "@/server/auth-records";
import { db, type Transaction } from "@/server/db";
import {
  can,
  type Actor,
  type MembershipResource,
  type Role,
} from "@/server/permissions";
import { displayNameOf } from "@/modules/profile/service";
import { stopRunningTimerOf } from "@/modules/time-entry/service";

import { teamRepository, type LockedMembership, type TeamMemberRow } from "./repository";
import {
  CHANGEABLE_ROLES,
  teamMessages,
  type ChangeableRole,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type ChangeStatusInput,
  type ChangeStatusResult,
  type MemberStatus,
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
const STATUS_AUDIT_ACTION: Record<MemberStatus, string> = {
  inactive: "membership.deactivate",
  active: "membership.reactivate",
};

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
 * `team.admin.revoke` se consulta solo sobre una fila `admin`. Una inactiva no
 * cambia de rol (EQ-37, P-06).
 */
function changeOf(actor: Actor, row: TeamMemberRow): TeamMember["change"] {
  if (row.status !== "active") {
    return null;
  }
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

/** Por qué una fila no cambia de estado, con `team.manage` ya decidido. */
type StatusLock = "self" | "owner" | "adminOwnerOnly";

/**
 * D-E2-3, pasos 4 a 6, D-E2-4: la propia, la del owner, o la de un admin sin
 * `team.admin.setStatus`, que se consulta solo sobre una fila `admin`. `null`
 * si la fila se puede desactivar o reactivar. La comparten la vista y la
 * mutación, para que el menú no ofrezca lo que el servidor rechaza.
 */
function statusLockOf(
  actor: Actor,
  row: { readonly workspaceId: string; readonly userId: string; readonly role: Role },
): StatusLock | null {
  if (row.userId === actor.userId) {
    return "self";
  }
  if (row.role === "owner") {
    return "owner";
  }
  if (
    row.role === "admin" &&
    !can(actor, "team.admin.setStatus", membershipResource(row.workspaceId, row))
  ) {
    return "adminOwnerOnly";
  }
  return null;
}

const STATUS_LOCK_ERROR: Record<StatusLock, () => TeamError> = {
  self: () => new TeamError("status_locked", teamMessages.selfStatusLocked),
  owner: () => new TeamError("status_locked", teamMessages.ownerStatusLocked),
  adminOwnerOnly: () => new TeamError("forbidden", teamMessages.adminStatusOwnerOnly),
};

/**
 * D-E2-3, D-E2-7: los pasos 4 a 6 y 8 de `changeStatus` sobre el `Actor` de la
 * sesión; el 3, `team.manage`, ya lo decidió `getTeamView`. Una inactiva sin
 * cuenta no se reactiva.
 */
function statusChangeOf(actor: Actor, row: TeamMemberRow): TeamMember["statusChange"] {
  if (statusLockOf(actor, { ...row, workspaceId: actor.workspaceId }) !== null) {
    return null;
  }
  if (row.status === "active") {
    return "deactivate";
  }
  return row.hasAccount ? "reactivate" : null;
}

function toTeamMember(actor: Actor, row: TeamMemberRow): TeamMember {
  return {
    membershipId: row.membershipId,
    name: displayNameOf(row, row.accountName),
    email: row.email,
    role: row.role,
    isSelf: row.userId === actor.userId,
    change: changeOf(actor, row),
    status: row.status,
    hasAccount: row.hasAccount,
    statusChange: statusChangeOf(actor, row),
  };
}

function compareMembers(left: TeamMember, right: TeamMember): number {
  return compareNames(
    { id: left.membershipId, name: left.name },
    { id: right.membershipId, name: right.name },
  );
}

/** D-R8-2, D-R8-3, D-E2-8: las activas y las inactivas. Sin `team.manage`, no lee. */
export async function getTeamView(actor: Actor): Promise<TeamView> {
  if (!canManageTeam(actor)) {
    return { kind: "forbidden", reason: actor.status === "active" ? "role" : "inactive" };
  }
  const rows = await teamRepository.listMembers(actor.workspaceId);
  return {
    kind: "ready",
    members: rows.map((row) => toTeamMember(actor, row)).sort(compareMembers),
  };
}

/**
 * D-R8-7: la autoridad de quien actúa, leída bajo el bloqueo. El `Actor` de la
 * sesión se armó en otra transacción y puede haber perdido el rol desde
 * entonces. Sin su membresía, `forbidden` con el texto de cada acción.
 */
function freshActorOf(
  actor: Actor,
  locked: readonly LockedMembership[],
  forbiddenMessage: string,
): Actor {
  const own = locked.find(
    (row) => row.workspaceId === actor.workspaceId && row.userId === actor.userId,
  );
  if (own === undefined) {
    throw new TeamError("forbidden", forbiddenMessage);
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
    const locked = await teamRepository.lockForChange(
      tx,
      actor.workspaceId,
      input.membershipId,
      actor.userId,
    );
    const target = locked.find((row) => row.id === input.membershipId);
    if (target === undefined) {
      throw new TeamError("not_found", teamMessages.notFound);
    }
    const fresh = freshActorOf(actor, locked, teamMessages.forbidden);
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

/**
 * La membresía con su estado nuevo y el mismo rol (EQ-37), con su constancia.
 * Desactivar además detiene el timer y borra las sesiones (D-E2-5, EQ-41,
 * EQ-43); reactivar no pone en marcha nada (EQ-47). Las dos escrituras ajenas
 * son funciones de su dueño, que no consultan `can()` (ADR 0025).
 */
async function writeStatus(
  tx: Transaction,
  actor: Actor,
  target: LockedMembership,
  change: { readonly previous: MemberStatus; readonly next: MemberStatus },
): Promise<void> {
  await teamRepository.updateStatus(tx, actor.workspaceId, target.id, change.next);
  await recordAudit(tx, {
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    action: STATUS_AUDIT_ACTION[change.next],
    entity: AUDIT_ENTITY,
    entityId: target.id,
    previousValue: { status: change.previous },
    nextValue: { status: change.next },
  });
  if (change.next === "inactive") {
    await stopRunningTimerOf(tx, actor, {
      workspaceId: actor.workspaceId,
      userId: target.userId,
    });
    await deleteSessionsOf(tx, actor, target.userId);
  }
}

/** D-E2-3 a D-E2-7. */
export async function changeStatus(
  actor: Actor,
  input: ChangeStatusInput,
): Promise<ChangeStatusResult> {
  if (!canManageTeam(actor)) {
    throw new TeamError("forbidden", teamMessages.forbiddenAction);
  }
  return db.transaction(async (tx) => {
    const locked = await teamRepository.lockForChange(
      tx,
      actor.workspaceId,
      input.membershipId,
      actor.userId,
    );
    // 1. Una `invited` no está en la lista (RP-64).
    const target = locked.find((row) => row.id === input.membershipId);
    if (target === undefined || target.status === "invited") {
      throw new TeamError("not_found", teamMessages.notFound);
    }
    // 2 y 3. La autoridad releída, antes de describir la fila (EQ-90).
    const fresh = freshActorOf(actor, locked, teamMessages.forbiddenAction);
    if (!canManageTeam(fresh)) {
      throw new TeamError("forbidden", teamMessages.forbiddenAction);
    }
    // 4 a 6. La propia y la del owner antes de mirar el rol de la fila: un
    // pedido armado responde EQ-84 o EQ-83 (EQ-40).
    const lock = statusLockOf(fresh, target);
    if (lock !== null) {
      throw STATUS_LOCK_ERROR[lock]();
    }
    // 7. Idempotente por el estado pedido (EQ-97, EQ-98).
    const result = { membershipId: target.id, status: input.status };
    if (target.status === input.status) {
      return result;
    }
    // 8. D-E2-7: sin `account` no podría volver a entrar; lo levanta E2b.
    if (input.status === "active" && !(await hasAccount(tx, target.userId))) {
      throw new TeamError("no_account", teamMessages.noAccount);
    }
    await writeStatus(tx, actor, target, {
      previous: target.status,
      next: input.status,
    });
    return result;
  });
}

import { isReleasedEmail } from "@/lib/email";
import { compareNames } from "@/lib/text";
import { ACCOUNT_LINK_TTL_DAYS } from "@/server/access";
import { DomainError } from "@/server/errors";
import { recordAudit } from "@/server/audit";
import {
  deleteSessionsOf,
  hasAccount,
  releaseEmailOf,
  userEmailOf,
} from "@/server/auth-records";
import { db, type Transaction } from "@/server/db";
import {
  can,
  type Actor,
  type MembershipResource,
  type Role,
} from "@/server/permissions";
import { displayNameOf } from "@/modules/profile/service";
import { stopRunningTimerOf } from "@/modules/time-entry/service";
import {
  entryWorkspaceIdOf,
  registerExternalMember,
  registersAsExternal,
} from "@/modules/workspace/service";

import { teamRepository, type LockedMembership, type TeamMemberRow } from "./repository";
import {
  CHANGEABLE_ROLES,
  teamMessages,
  type ChangeableRole,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type ChangeStatusInput,
  type ChangeStatusResult,
  type LinkAction,
  type MemberStatus,
  type ReleaseEmailInput,
  type ReleaseEmailResult,
  type SetAccountLinkInput,
  type SetAccountLinkResult,
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

/** Las dos acciones que pasan por la frontera de `isAccountActionLocked`. */
type AccountAction = "team.account.link" | "team.email.release";

/**
 * D-E2b-4: si la fila queda fuera del alcance de `action`: sin `action` sobre su
 * membresía, o una fila `admin` sin `team.admin.account`, que se consulta solo
 * sobre una fila `admin`. La comparten la vista, con el `Actor` de la sesión, y
 * las mutaciones, con el releído bajo el bloqueo.
 */
function isAccountActionLocked(
  actor: Actor,
  row: { readonly workspaceId: string; readonly userId: string; readonly role: Role },
  action: AccountAction,
): boolean {
  const resource = membershipResource(row.workspaceId, row);
  if (!can(actor, action, resource)) {
    return true;
  }
  return row.role === "admin" && !can(actor, "team.admin.account", resource);
}

/** La fila de la vista con el workspace de quien mira, para `can()`. */
function rowResource(actor: Actor, row: TeamMemberRow) {
  return { workspaceId: actor.workspaceId, userId: row.userId, role: row.role };
}

/**
 * D-E2-3, D-E2-7, D-E2b-5: los pasos 4 a 6 y 8 a 9 de `changeStatus` sobre el
 * `Actor` de la sesión; el 3, `team.manage`, ya lo decidió `getTeamView`. Una
 * inactiva con el correo liberado no se reactiva; una sin cuenta, si vincularla
 * no está fuera de alcance (`isAccountActionLocked`).
 */
function statusChangeOf(actor: Actor, row: TeamMemberRow): TeamMember["statusChange"] {
  if (statusLockOf(actor, rowResource(actor, row)) !== null) {
    return null;
  }
  if (row.status === "active") {
    return "deactivate";
  }
  if (isReleasedEmail(row.email)) {
    return null;
  }
  if (row.hasAccount) {
    return "reactivate";
  }
  return isAccountActionLocked(actor, rowResource(actor, row), "team.account.link")
    ? null
    : "reactivate";
}

/** D-E2b-2, D-E2b-11: la marca de la fila, con lo que calculó la base. */
function linkOf(row: TeamMemberRow): TeamMember["link"] {
  if (row.linkRequestedAt === null || row.linkExpiresAt === null) {
    return null;
  }
  return {
    requestedAt: row.linkRequestedAt,
    expiresAt: row.linkExpiresAt,
    expired: row.linkExpired,
  };
}

/**
 * D-E2b-4, D-E2b-6: lo que el menú ofrece sobre la vinculación de una activa:
 * pedir sin marca, cancelar una vigente, las dos con una vencida.
 */
function linkActionsOf(actor: Actor, row: TeamMemberRow): LinkAction[] {
  if (
    row.status !== "active" ||
    isAccountActionLocked(actor, rowResource(actor, row), "team.account.link")
  ) {
    return [];
  }
  if (row.linkRequestedAt === null) {
    return ["request"];
  }
  return row.linkExpired ? ["request", "cancel"] : ["cancel"];
}

/**
 * D-E2b-8: si pedir la vinculación registra el correo como externo, con la regla
 * de `workspace`. Una fila liberada no se vincula, así que no registra.
 */
function registersExternalOf(row: TeamMemberRow): boolean {
  return (
    !isReleasedEmail(row.email) && registersAsExternal(row.email, row.invitationStatus)
  );
}

/** D-E2b-4, D-E2b-9: «Liberar el correo» en una inactiva sin liberar, dentro de la frontera. */
function releaseOf(actor: Actor, row: TeamMemberRow): boolean {
  return (
    row.status === "inactive" &&
    !isReleasedEmail(row.email) &&
    !isAccountActionLocked(actor, rowResource(actor, row), "team.email.release")
  );
}

function toTeamMember(actor: Actor, row: TeamMemberRow): TeamMember {
  return {
    membershipId: row.membershipId,
    name: displayNameOf(row, row.accountName),
    email: isReleasedEmail(row.email) ? null : row.email,
    role: row.role,
    isSelf: row.userId === actor.userId,
    change: changeOf(actor, row),
    status: row.status,
    hasAccount: row.hasAccount,
    statusChange: statusChangeOf(actor, row),
    link: linkOf(row),
    linkActions: linkActionsOf(actor, row),
    registersExternal: registersExternalOf(row),
    canReleaseEmail: releaseOf(actor, row),
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
    linkTtlDays: ACCOUNT_LINK_TTL_DAYS,
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
 * D-E2b-6, D-E2b-8: registra el externo, escribe la marca con la fecha de la
 * base y quien actúa, y deja `membership.linkRequest`. También renueva una
 * vencida. La membresía tiene que estar activa: el `check` de D-E2b-2.
 */
async function requestAccountLink(
  tx: Transaction,
  actor: Actor,
  target: LockedMembership,
  email: string,
): Promise<void> {
  await registerExternalMember(tx, actor, email);
  const requestedAt = await teamRepository.updateAccountLink(
    tx,
    actor.workspaceId,
    target.id,
    actor.userId,
  );
  await recordAudit(tx, {
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    action: "membership.linkRequest",
    entity: AUDIT_ENTITY,
    entityId: target.id,
    previousValue: { linkRequestedAt: target.linkRequestedAt },
    nextValue: { linkRequestedAt: requestedAt },
  });
}

/** D-E2b-6, D-E2b-7: limpia la marca, vigente o vencida, con `membership.linkCancel`. */
async function cancelAccountLink(
  tx: Transaction,
  actor: Actor,
  target: LockedMembership,
): Promise<void> {
  await teamRepository.updateAccountLink(tx, actor.workspaceId, target.id, null);
  await recordAudit(tx, {
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    action: "membership.linkCancel",
    entity: AUDIT_ENTITY,
    entityId: target.id,
    previousValue: { linkRequestedAt: target.linkRequestedAt },
    nextValue: { linkRequestedAt: null },
  });
}

/**
 * La membresía con su estado nuevo y el mismo rol (EQ-37), con su constancia.
 * Desactivar además cancela la vinculación pedida (D-E2b-7), detiene el timer y
 * borra las sesiones (D-E2-5, EQ-41, EQ-43); reactivar no pone en marcha nada
 * (EQ-47). Las escrituras ajenas son funciones de su dueño, que no consultan
 * `can()` (ADR 0025).
 */
async function writeStatus(
  tx: Transaction,
  actor: Actor,
  target: LockedMembership,
  change: { readonly previous: MemberStatus; readonly next: MemberStatus },
): Promise<void> {
  // Antes del estado: el `check` de D-E2b-2 rechaza una marca en una inactiva.
  if (change.next === "inactive" && target.linkPending) {
    await cancelAccountLink(tx, actor, target);
  }
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

/** D-E2-3 a D-E2-6, D-E2b-5. */
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
    const result = {
      membershipId: target.id,
      status: input.status,
      linkRequested: false,
    };
    if (target.status === input.status) {
      return result;
    }
    if (input.status === "inactive") {
      await writeStatus(tx, actor, target, { previous: target.status, next: "inactive" });
      return result;
    }
    // 8. D-E2b-9: una fila liberada no vuelve.
    const email = await userEmailOf(tx, target.userId);
    if (isReleasedEmail(email)) {
      throw new TeamError("email_released", teamMessages.emailReleased);
    }
    // 9. D-E2b-5: sin `account` no podría volver a entrar; reactivarla es además
    // pedir la vinculación, con la frontera de vincular.
    const withoutAccount = !(await hasAccount(tx, target.userId));
    if (withoutAccount && isAccountActionLocked(fresh, target, "team.account.link")) {
      throw new TeamError("forbidden", teamMessages.linkAdminOwnerOnly);
    }
    // 10.
    await writeStatus(tx, actor, target, { previous: target.status, next: "active" });
    if (withoutAccount) {
      await requestAccountLink(tx, actor, target, email);
    }
    return { ...result, linkRequested: withoutAccount };
  });
}

/**
 * D-E2b-6: el bloqueo de las dos membresías y los pasos 1 a 3, comunes a
 * `setAccountLink` y `releaseEmail`. Devuelve la fila pedida y la autoridad
 * releída bajo el bloqueo.
 */
async function lockAccountTarget(
  tx: Transaction,
  actor: Actor,
  membershipId: string,
): Promise<{ readonly target: LockedMembership; readonly fresh: Actor }> {
  const locked = await teamRepository.lockForChange(
    tx,
    actor.workspaceId,
    membershipId,
    actor.userId,
  );
  // 1. Una `invited` no está en la lista (RP-64).
  const target = locked.find((row) => row.id === membershipId);
  if (target === undefined || target.status === "invited") {
    throw new TeamError("not_found", teamMessages.notFound);
  }
  // 2 y 3. La autoridad releída (D-R8-7).
  const fresh = freshActorOf(actor, locked, teamMessages.forbiddenAction);
  if (!canManageTeam(fresh)) {
    throw new TeamError("forbidden", teamMessages.forbiddenAction);
  }
  return { target, fresh };
}

/** D-E2b-6. */
export async function setAccountLink(
  actor: Actor,
  input: SetAccountLinkInput,
): Promise<SetAccountLinkResult> {
  if (!canManageTeam(actor)) {
    throw new TeamError("forbidden", teamMessages.forbiddenAction);
  }
  return db.transaction(async (tx) => {
    const { target, fresh } = await lockAccountTarget(tx, actor, input.membershipId);
    // 4. D-E2b-4.
    if (isAccountActionLocked(fresh, target, "team.account.link")) {
      throw new TeamError("forbidden", teamMessages.linkAdminOwnerOnly);
    }
    // 5. Cancelar: idempotente sin marca (EQ-97).
    if (!input.link) {
      if (target.linkPending) {
        await cancelAccountLink(tx, actor, target);
      }
      return { membershipId: target.id, linkPending: false };
    }
    // 6. Pedir, o renovar una vencida.
    const email = await userEmailOf(tx, target.userId);
    if (isReleasedEmail(email)) {
      throw new TeamError("email_released", teamMessages.emailReleased);
    }
    if (target.status !== "active") {
      throw new TeamError("inactive_membership", teamMessages.linkInactive);
    }
    if (!target.linkValid) {
      await requestAccountLink(tx, actor, target, email);
    }
    return { membershipId: target.id, linkPending: true };
  });
}

/** D-E2b-9. */
export async function releaseEmail(
  actor: Actor,
  input: ReleaseEmailInput,
): Promise<ReleaseEmailResult> {
  if (!canManageTeam(actor)) {
    throw new TeamError("forbidden", teamMessages.forbiddenAction);
  }
  return db.transaction(async (tx) => {
    const { target, fresh } = await lockAccountTarget(tx, actor, input.membershipId);
    const result = { membershipId: target.id };
    // 3. D-E2b-4: la frontera va antes que el estado.
    if (isAccountActionLocked(fresh, target, "team.email.release")) {
      throw new TeamError("forbidden", teamMessages.releaseAdminOwnerOnly);
    }
    // 4. Idempotente (EQ-97).
    const email = await userEmailOf(tx, target.userId);
    if (isReleasedEmail(email)) {
      return result;
    }
    // 5.
    if (target.status === "active") {
      throw new TeamError("active_membership", teamMessages.releaseActive);
    }
    // 6.
    await releaseEmailOf(tx, actor, target.userId, email);
    return result;
  });
}

/** D-E2b-3: lo que `claimAccountLink` leyó y escribió. */
export type ClaimedAccountLink =
  | { readonly kind: "claimed"; readonly person: Actor }
  | { readonly kind: "inactive" }
  | { readonly kind: "none" };

/**
 * D-E2b-3, ADR 0025: toma la marca vigente del `user` cuyo correo normalizado es
 * `email`, en el workspace del ingreso. Con más de una fila `user`, ninguna o una
 * sin membresía, `none` sin bloquear. Con una, bloquea su membresía `for no key
 * update`: no activa, `inactive`; activa, intenta limpiar la marca con
 * `consumeAccountLink`, que decide la vigencia con la hora del momento; si la
 * limpió, deja `membership.linkUse` con la persona como autora y `nextValue: {
 * requestedById }` y devuelve `claimed`; si no, `none`. `inactive` y `none` no
 * escriben. No consulta permisos: la usa `entry.ts` en el ingreso, sin sesión.
 */
export async function claimAccountLink(
  tx: Transaction,
  email: string,
): Promise<ClaimedAccountLink> {
  const workspaceId = await entryWorkspaceIdOf(tx);
  if (workspaceId === null) {
    return { kind: "none" };
  }
  // Las filas `user`, no las membresías: con dos personas con el mismo correo no
  // se elige ninguna (D-E2b-12).
  const users = await teamRepository.usersByEmail(tx, email);
  const [userId] = users;
  if (users.length !== 1 || userId === undefined) {
    return { kind: "none" };
  }
  const own = await teamRepository.lockMembershipOf(tx, workspaceId, userId);
  if (own === undefined) {
    return { kind: "none" };
  }
  if (own.status !== "active") {
    return { kind: "inactive" };
  }
  const consumed = await teamRepository.consumeAccountLink(tx, own.id);
  if (consumed === undefined) {
    return { kind: "none" };
  }
  const person: Actor = { userId, workspaceId, role: own.role, status: "active" };
  await recordAudit(tx, {
    workspaceId,
    actorId: userId,
    action: "membership.linkUse",
    entity: AUDIT_ENTITY,
    entityId: own.id,
    nextValue: { requestedById: consumed.requestedById },
  });
  return { kind: "claimed", person };
}

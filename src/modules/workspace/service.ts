import { normalizeEmail } from "@/lib/email";
import { DomainError, RejectedError } from "@/server/errors";
import type { EntryFacts } from "@/server/access";
import { recordAudit, recordAudits, type AuditEntry } from "@/server/audit";
import { db, type Transaction } from "@/server/db";
import { env } from "@/server/env";
import { can, type Actor, type Role } from "@/server/permissions";
import { parseWeekStart, type WeekStart } from "@/server/time";

import {
  distinctEmails,
  isExternal,
  isValidEmail,
  planInvitations,
} from "./invitation-plan";
import {
  workspaceRepository,
  type MembershipRow,
  type PersonRow,
  type WorkspaceRow,
} from "./repository";
import {
  invitationMessages,
  type InvitationErrorCode,
  type InvitationsView,
  type InviteInput,
  type InviteResult,
  type RevokeInvitationInput,
  type RevokeInvitationResult,
} from "./schema";

export type WorkspaceContext = {
  readonly workspace: WorkspaceRow;
  readonly membership: MembershipRow;
  readonly actor: Actor;
};

/**
 * Primer día de la semana de quien pide: el de su membresía (PF-01, TT-48).
 * Es la única lectura del dato: ningún consumidor lee la columna directo.
 */
export function weekStartOf(context: WorkspaceContext): WeekStart {
  return parseWeekStart(context.membership.weekStart);
}

const DEFAULT_WORKSPACE_NAME = "Workspace";
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
const INVITATION_ENTITY = "invitation";

/**
 * La membresía nueva, con el rol que recibe. Es el único lugar donde nace una
 * membresía en la aplicación (D-E1b-4): de una invitación aceptada o del
 * arranque. E4 copia acá el primer día por defecto del workspace (WS-08).
 */
async function createMembership(
  tx: Transaction,
  workspaceId: string,
  userId: string,
  role: Role,
): Promise<MembershipRow> {
  return workspaceRepository.createMembership(tx, { workspaceId, userId, role });
}

function contextOf(
  current: WorkspaceRow,
  row: MembershipRow,
  userId: string,
): WorkspaceContext {
  return {
    workspace: current,
    membership: row,
    actor: {
      userId,
      workspaceId: current.id,
      role: row.role,
      status: row.status,
    },
  };
}

/**
 * D-E1b-4: la membresía de quien pide, o la que nace de su invitación
 * pendiente. Acepta primero: la aceptación y la revocación son `update … where
 * status = 'pending'` sobre la misma fila, y la segunda vuelve a evaluar el
 * `where` después del bloqueo (EQ-107). `undefined`: sin acceso, sin escribir.
 */
async function membershipOf(
  tx: Transaction,
  workspaceId: string,
  user: { id: string; email: string },
): Promise<MembershipRow | undefined> {
  const found = await workspaceRepository.findMembership(workspaceId, user.id, tx);
  if (found !== undefined) {
    // El costo por pedido no cambia: ni acepta ni audita (EQ-31).
    return found;
  }
  const accepted = await workspaceRepository.acceptPending(
    tx,
    workspaceId,
    normalizeEmail(user.email),
  );
  if (accepted === undefined) {
    // Otro pedido de la misma persona pudo aceptar y crear mientras este
    // esperaba el bloqueo de la invitación: una sentencia nueva lo ve.
    return workspaceRepository.findMembership(workspaceId, user.id, tx);
  }
  const created = await createMembership(tx, workspaceId, user.id, "member");
  await recordAudit(tx, {
    workspaceId,
    actorId: user.id,
    action: "invitation.accept",
    entity: INVITATION_ENTITY,
    entityId: accepted,
    previousValue: { status: "pending" },
    nextValue: { status: "accepted" },
  });
  return created;
}

/**
 * El workspace y la membresía de quien pide. La membresía nace solo de una
 * invitación pendiente, que se acepta primero; el workspace, solo para
 * `WORKSPACE_OWNER_EMAIL` cuando no hay ninguno. `null`: sin acceso.
 *
 * El workspace es uno solo. La lectura sin bloqueo cubre el caso normal, en
 * que ya existe; solo el arranque toma el bloqueo y vuelve a leer, para que
 * dos pedidos del owner a la vez no creen dos workspaces (D-E1b-3).
 */
export async function ensureWorkspaceContext(user: {
  id: string;
  email: string;
}): Promise<WorkspaceContext | null> {
  return db.transaction(async (tx) => {
    let current = await workspaceRepository.findFirstWorkspace(tx);
    if (current === undefined) {
      if (normalizeEmail(user.email) !== normalizeEmail(env().WORKSPACE_OWNER_EMAIL)) {
        return null;
      }
      await workspaceRepository.lockWorkspaceBootstrap(tx);
      current = await workspaceRepository.findFirstWorkspace(tx);
      if (current === undefined) {
        // El rol `owner` nace solo con el workspace (D-E1b-3).
        const created = await workspaceRepository.createWorkspace(tx, {
          name: DEFAULT_WORKSPACE_NAME,
          ownerId: user.id,
          timezone: DEFAULT_TIMEZONE,
        });
        const row = await createMembership(tx, created.id, user.id, "owner");
        return contextOf(created, row, user.id);
      }
    }
    const row = await membershipOf(tx, current.id, user);
    return row === undefined ? null : contextOf(current, row, user.id);
  });
}

/** Una persona del workspace con su estado, para un catálogo de otra pantalla. */
export type WorkspacePerson = {
  readonly userId: string;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  /** `user_preference.display_name`, o `null`: el nombre lo arma `displayNameOf` (ADR 0021). */
  readonly displayName: string | null;
  readonly status: "active" | "inactive";
  /**
   * `membership.created_at`: desde cuándo existe la membresía (D-R9-2). La
   * membresía nace al aceptar la invitación, en el primer ingreso: es la fecha
   * de activación (EQ-33). Para decidir, no para mostrar.
   */
  readonly joinedAt: Date;
};

/**
 * RP-62, RP-64: las personas del workspace, activas e inactivas; las invitadas
 * no están, por su estado. Vacía sin `team.view`. Sin orden. Solo lee, con la
 * transacción de quien la llama (ADR 0010).
 *
 * Solo pregunta `team.view`, que tienen todos los roles. El reporte la llama
 * únicamente con el alcance `everyone`, que ya respondió
 * `timeEntry.others.view` en `scopeOf` (D-R4-4): otro llamador que ofrezca el
 * catálogo como filtro de horas (la exportación de R6) pasa por ese alcance.
 */
export async function listWorkspacePeople(
  tx: Transaction,
  actor: Actor,
): Promise<readonly WorkspacePerson[]> {
  if (!can(actor, "team.view", { kind: "workspace", workspaceId: actor.workspaceId })) {
    return [];
  }
  const rows = await workspaceRepository.listPeople(tx, actor.workspaceId);
  return rows.map(toWorkspacePerson);
}

/** La fila con el estado estrechado: la consulta solo deja pasar `active` e `inactive`. */
function toWorkspacePerson(row: PersonRow): WorkspacePerson {
  if (row.status === "invited") {
    throw new Error(`La persona ${row.userId} llegó invitada al catálogo.`);
  }
  return {
    userId: row.userId,
    accountName: row.accountName,
    displayName: row.displayName,
    status: row.status,
    joinedAt: row.joinedAt,
  };
}

/** Error de dominio de las invitaciones. La action lo traduce a un resultado tipado. */
export class InvitationError extends DomainError<InvitationErrorCode> {
  constructor(code: InvitationErrorCode, message: string) {
    super(code, message);
    this.name = "InvitationError";
  }
}

/** `can(actor, "member.invite", workspace)`: invitar, revocar y leer las pendientes (§3). */
function canInvite(actor: Actor): boolean {
  return can(actor, "member.invite", {
    kind: "workspace",
    workspaceId: actor.workspaceId,
  });
}

/**
 * D-E1a-9: la autoridad de quien actúa, releída bajo `for share`. El `Actor`
 * de la sesión se armó en otra transacción y puede haber perdido el rol.
 */
async function assertCanInviteLocked(tx: Transaction, actor: Actor): Promise<void> {
  const own = await workspaceRepository.lockActorMembership(
    tx,
    actor.workspaceId,
    actor.userId,
  );
  if (own === undefined || !canInvite({ ...actor, role: own.role, status: own.status })) {
    throw new InvitationError("forbidden", invitationMessages.forbidden);
  }
}

/** Sin `member.invite`, `forbidden` sin leer. */
export async function getInvitationsView(actor: Actor): Promise<InvitationsView> {
  if (!canInvite(actor)) {
    return { kind: "forbidden" };
  }
  const config = env();
  const rows = await workspaceRepository.listPending(actor.workspaceId);
  return {
    kind: "ready",
    invitations: rows.map((row) => ({
      id: row.id,
      email: row.email,
      external: isExternal(row.email, config.GOOGLE_WORKSPACE_DOMAINS),
    })),
    appUrl: config.BETTER_AUTH_URL,
  };
}

/**
 * D-E1a-6, D-E1a-7: todo o nada. El reintento se resuelve por el correo: lo
 * que el primer intento creó, el segundo lo cuenta como «ya estaba invitada».
 */
export async function inviteMembers(
  actor: Actor,
  input: InviteInput,
): Promise<InviteResult> {
  if (!canInvite(actor)) {
    throw new InvitationError("forbidden", invitationMessages.forbidden);
  }
  const emails = distinctEmails(input.emails);
  const valid = emails.filter(isValidEmail);
  const domains = env().GOOGLE_WORKSPACE_DOMAINS;

  return db.transaction(async (tx) => {
    await assertCanInviteLocked(tx, actor);
    const invitations = await workspaceRepository.lockInvitationsByEmail(
      tx,
      actor.workspaceId,
      valid,
    );
    // D-E1b-11: después del bloqueo. Un primer ingreso que aceptó una de estas
    // invitaciones ya confirmó su membresía, y esta sentencia nueva la ve: sin
    // eso, la fila `accepted` sin membresía volvería a `pending`.
    const members = await workspaceRepository.membersByEmail(
      tx,
      actor.workspaceId,
      valid,
    );
    const plan = planInvitations(emails, domains, members, invitations);
    if (plan.rejections.length > 0) {
      throw new RejectedError(invitationMessages.rejected, plan.rejections);
    }

    await workspaceRepository.reinvite(
      tx,
      actor.workspaceId,
      plan.toReinvite.map((row) => row.id),
      actor.userId,
    );
    const inserted = await workspaceRepository.insertInvitations(
      tx,
      actor.workspaceId,
      plan.toInsert,
      actor.userId,
    );
    const audits: AuditEntry[] = [
      ...plan.toReinvite.map((row) => ({
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: "invitation.reinvite",
        entity: INVITATION_ENTITY,
        entityId: row.id,
        previousValue: { status: row.status },
        nextValue: { status: "pending" },
      })),
      ...inserted.map((row) => ({
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: "invitation.create",
        entity: INVITATION_ENTITY,
        entityId: row.id,
        nextValue: { email: row.email, status: "pending" },
      })),
    ];
    await recordAudits(tx, audits);

    // EQ-106: el correo que otro pedido insertó a la vez no volvió.
    const insertedEmails = new Set(inserted.map((row) => row.email));
    const lost = new Set(plan.toInsert.filter((email) => !insertedEmails.has(email)));
    return {
      outcomes: plan.outcomes.map((outcome) =>
        lost.has(outcome.email) ? { ...outcome, result: "already_invited" } : outcome,
      ),
    };
  });
}

/** D-E1a-8: solo pendientes; revocar una revocada es éxito sin escribir. */
export async function revokeInvitation(
  actor: Actor,
  input: RevokeInvitationInput,
): Promise<RevokeInvitationResult> {
  if (!canInvite(actor)) {
    throw new InvitationError("forbidden", invitationMessages.forbidden);
  }
  return db.transaction(async (tx) => {
    await assertCanInviteLocked(tx, actor);
    const row = await workspaceRepository.lockInvitation(
      tx,
      actor.workspaceId,
      input.invitationId,
    );
    if (row === undefined) {
      throw new InvitationError("not_found", invitationMessages.notPending);
    }
    const result = { invitationId: row.id };
    switch (row.status) {
      case "revoked":
        return result;
      case "accepted":
        throw new InvitationError("not_pending", invitationMessages.notPending);
      case "pending":
        await workspaceRepository.revoke(tx, actor.workspaceId, row.id, actor.userId);
        await recordAudit(tx, {
          workspaceId: actor.workspaceId,
          actorId: actor.userId,
          action: "invitation.revoke",
          entity: INVITATION_ENTITY,
          entityId: row.id,
          previousValue: { status: "pending" },
          nextValue: { status: "revoked" },
        });
        return result;
    }
  });
}

/**
 * D-E1b-1: lo que la base sabe del correo, para `src/server/entry.ts`. Lee sin
 * actor: no hay sesión todavía. `email` ya normalizado.
 */
export async function entryFactsOf(email: string): Promise<EntryFacts> {
  const facts = await workspaceRepository.entryFacts(email);
  return {
    bootstrap: facts.workspaceId === null,
    invitation: facts.invitation,
    membership: facts.membership,
  };
}

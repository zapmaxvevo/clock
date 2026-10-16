import { z } from "zod";

import { domainOf, normalizeEmail } from "@/lib/email";
import { DomainError, RejectedError, type Rejection } from "@/server/errors";
import { recordAudit, recordAudits, type AuditEntry } from "@/server/audit";
import { db, type Transaction } from "@/server/db";
import { env } from "@/server/env";
import { can, type Actor, type Role } from "@/server/permissions";
import { parseWeekStart, type WeekStart } from "@/server/time";

import {
  workspaceRepository,
  type InvitationRow,
  type MemberByEmail,
  type MembershipRow,
  type PersonRow,
  type WorkspaceRow,
} from "./repository";
import {
  EMAIL_MAX_LENGTH,
  invitationMessages,
  type InvitationErrorCode,
  type InvitationsView,
  type InviteInput,
  type InviteOutcome,
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
 * El workspace es uno solo. La lectura sin bloqueo cubre el caso normal, en
 * que ya existe; solo el primer ingreso toma el bloqueo y vuelve a leer, para
 * que dos personas entrando a la vez no creen dos workspaces.
 */
async function ensureWorkspace(tx: Transaction, userId: string): Promise<WorkspaceRow> {
  const existing = await workspaceRepository.findFirstWorkspace(tx);
  if (existing !== undefined) {
    return existing;
  }
  await workspaceRepository.lockWorkspaceBootstrap(tx);
  const created = await workspaceRepository.findFirstWorkspace(tx);
  return (
    created ??
    (await workspaceRepository.createWorkspace(tx, {
      name: DEFAULT_WORKSPACE_NAME,
      ownerId: userId,
      timezone: DEFAULT_TIMEZONE,
    }))
  );
}

/**
 * La membresía nueva, y en la misma transacción la aceptación de la invitación
 * pendiente de su correo (D-E1a-5). La rama que encuentra la membresía no pasa
 * por acá: el costo por pedido no cambia.
 */
async function createMembership(
  tx: Transaction,
  workspaceId: string,
  user: { id: string; email: string },
  role: Role,
): Promise<MembershipRow> {
  const created = await workspaceRepository.createMembership(tx, {
    workspaceId,
    userId: user.id,
    role,
  });
  const accepted = await workspaceRepository.acceptPending(
    tx,
    workspaceId,
    normalizeEmail(user.email),
  );
  if (accepted !== undefined) {
    await recordAudit(tx, {
      workspaceId,
      actorId: user.id,
      action: "invitation.accept",
      entity: INVITATION_ENTITY,
      entityId: accepted,
      previousValue: { status: "pending" },
      nextValue: { status: "accepted" },
    });
  }
  return created;
}

/**
 * Devuelve el workspace y la membresía de quien entra, creándolos la primera
 * vez. El workspace se crea una sola vez y su owner es la cuenta configurada
 * en WORKSPACE_OWNER_EMAIL; el resto entra como member.
 */
export async function ensureWorkspaceContext(user: {
  id: string;
  email: string;
}): Promise<WorkspaceContext> {
  const ownerEmail = env().WORKSPACE_OWNER_EMAIL.toLowerCase();
  const isOwner = user.email.toLowerCase() === ownerEmail;

  return db.transaction(async (tx) => {
    const current = await ensureWorkspace(tx, user.id);

    const found = await workspaceRepository.findMembership(current.id, user.id, tx);
    const row =
      found ??
      (await createMembership(
        tx,
        current.id,
        user,
        isOwner || current.ownerId === user.id ? "owner" : "member",
      ));

    return {
      workspace: current,
      membership: row,
      actor: {
        userId: user.id,
        workspaceId: current.id,
        role: row.role,
        status: row.status,
      },
    };
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

/** Fuera de los dominios de la empresa: «Externa» se deriva, no se guarda (ADR 0024). */
function isExternal(email: string, domains: readonly string[]): boolean {
  return !domains.includes(domainOf(email));
}

const validEmail = z.email().max(EMAIL_MAX_LENGTH);

/** EQ-76: el formato y el largo de un correo ya normalizado. */
function isValidEmail(email: string): boolean {
  return validEmail.safeParse(email).success;
}

/** EQ-105: normalizados, sin repetidos, conservando el primero. */
function distinctEmails(emails: readonly string[]): string[] {
  return [...new Set(emails.map(normalizeEmail))];
}

export type InvitationPlan = {
  /** En el orden del pedido; vale solo sin rechazos. */
  readonly outcomes: readonly InviteOutcome[];
  /** En el orden del pedido. El `id` es el correo normalizado (ADR 0011). */
  readonly rejections: readonly Rejection<InvitationErrorCode>[];
  /** Los correos sin membresía ni invitación: filas nuevas. */
  readonly toInsert: readonly string[];
  /** Las invitaciones `revoked` o `accepted` que vuelven a `pending`. */
  readonly toReinvite: readonly InvitationRow[];
};

/**
 * D-E1a-7, pura: la clasifica sin base, para probarla de a una. `emails` ya
 * normalizados y sin repetidos; `members` e `invitations`, los de esos correos.
 * La membresía tiene prioridad sobre la invitación: la persona ya está.
 */
export function planInvitations(
  emails: readonly string[],
  domains: readonly string[],
  members: readonly MemberByEmail[],
  invitations: readonly InvitationRow[],
): InvitationPlan {
  const memberStatus = new Map(members.map((member) => [member.email, member.status]));
  const invitationOf = new Map(invitations.map((row) => [row.email, row]));
  const outcomes: InviteOutcome[] = [];
  const rejections: Rejection<InvitationErrorCode>[] = [];
  const toInsert: string[] = [];
  const toReinvite: InvitationRow[] = [];

  for (const email of emails) {
    const external = isExternal(email, domains);
    if (!isValidEmail(email)) {
      rejections.push({
        id: email,
        code: "invalid_email",
        message: invitationMessages.invalidEmail(email),
      });
      continue;
    }
    const status = memberStatus.get(email);
    if (status === "active") {
      outcomes.push({ email, result: "already_member", external });
      continue;
    }
    // `invited` no tiene escritor (ADR 0024, decisión 7): si apareciera, cae acá.
    if (status !== undefined) {
      rejections.push({
        id: email,
        code: "inactive_member",
        message: invitationMessages.inactiveMember(email),
      });
      continue;
    }
    const existing = invitationOf.get(email);
    if (existing === undefined) {
      toInsert.push(email);
      outcomes.push({ email, result: "invited", external });
    } else if (existing.status === "pending") {
      outcomes.push({ email, result: "already_invited", external });
    } else {
      toReinvite.push(existing);
      outcomes.push({ email, result: "invited", external });
    }
  }
  return { outcomes, rejections, toInsert, toReinvite };
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
    const members = await workspaceRepository.membersByEmail(
      tx,
      actor.workspaceId,
      valid,
    );
    const invitations = await workspaceRepository.lockInvitationsByEmail(
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
 * D-E1a-4: el hecho de la vía externa, para `src/server/entry.ts`: una
 * invitación `pending` o `accepted` del correo. Lee sin actor: no hay sesión.
 */
export async function hasOpenInvitation(email: string): Promise<boolean> {
  return workspaceRepository.hasOpenInvitation(normalizeEmail(email));
}

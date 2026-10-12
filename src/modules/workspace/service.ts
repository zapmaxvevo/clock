import { db, type Transaction } from "@/server/db";
import { env } from "@/server/env";
import { can, type Actor } from "@/server/permissions";
import { parseWeekStart, type WeekStart } from "@/server/time";

import {
  workspaceRepository,
  type MembershipRow,
  type PersonRow,
  type WorkspaceRow,
} from "./repository";

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
      (await workspaceRepository.createMembership(tx, {
        workspaceId: current.id,
        userId: user.id,
        role: isOwner || current.ownerId === user.id ? "owner" : "member",
      }));

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
   * `membership.created_at`: desde cuándo existe la membresía; hoy, el primer
   * ingreso (D-R9-2). Con las invitaciones de la fase 2 pasa a ser la fecha de
   * la invitación (§9). Para decidir, no para mostrar.
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

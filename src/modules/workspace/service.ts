import { db, type Transaction } from "@/server/db";
import { env } from "@/server/env";
import type { Actor } from "@/server/permissions";

import { workspaceRepository, type MembershipRow, type WorkspaceRow } from "./repository";

export type WorkspaceContext = {
  readonly workspace: WorkspaceRow;
  readonly membership: MembershipRow;
  readonly actor: Actor;
};

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

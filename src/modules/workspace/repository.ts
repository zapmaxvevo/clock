import { and, asc, eq, sql } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { membership, workspace, workspaceSettings } from "@/server/db/schema";
import type { Role } from "@/server/permissions";

export type WorkspaceRow = typeof workspace.$inferSelect;
export type MembershipRow = typeof membership.$inferSelect;

/**
 * Clave del bloqueo que serializa la creación del primer workspace. Es
 * arbitraria; lo único que importa es que nadie más la use.
 */
const WORKSPACE_BOOTSTRAP_LOCK = 4_919_284_001;

/** Único lugar con acceso a datos del módulo. */
export const workspaceRepository = {
  /**
   * El workspace más viejo. El orden es explícito porque «el primero» sin
   * criterio es una lectura que puede cambiar entre dos peticiones; el `id`
   * desempata para que no dependa del segundo en que se crearon.
   */
  async findFirstWorkspace(
    tx: Transaction | typeof db = db,
  ): Promise<WorkspaceRow | undefined> {
    const rows = await tx
      .select()
      .from(workspace)
      .orderBy(asc(workspace.createdAt), asc(workspace.id))
      .limit(1);
    return rows.at(0);
  },

  async findMembership(
    workspaceId: string,
    userId: string,
    tx: Transaction | typeof db = db,
  ): Promise<MembershipRow | undefined> {
    const rows = await tx
      .select()
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
      .limit(1);
    return rows.at(0);
  },

  async createWorkspace(
    tx: Transaction,
    values: { name: string; ownerId: string; timezone: string },
  ): Promise<WorkspaceRow> {
    const [created] = await tx.insert(workspace).values(values).returning();
    await tx.insert(workspaceSettings).values({ workspaceId: created.id });
    return created;
  },

  /**
   * Idempotente: dos primeros ingresos en paralelo del mismo usuario insertan
   * los dos, y el que pierde contra `membership_workspace_user_unq` se queda
   * con la fila que ya está en vez de romper el render.
   */
  async createMembership(
    tx: Transaction,
    values: { workspaceId: string; userId: string; role: Role },
  ): Promise<MembershipRow> {
    const [created] = await tx
      .insert(membership)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (created !== undefined) {
      return created;
    }
    const existing = await workspaceRepository.findMembership(
      values.workspaceId,
      values.userId,
      tx,
    );
    if (existing === undefined) {
      throw new Error("La membresía no se insertó y tampoco existe.");
    }
    return existing;
  },

  /**
   * Bloqueo hasta el fin de la transacción. Lo toma solo el primer ingreso,
   * cuando todavía no hay workspace: sin una restricción que haga único al
   * workspace, `on conflict` no tiene contra qué chocar.
   */
  async lockWorkspaceBootstrap(tx: Transaction): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(${WORKSPACE_BOOTSTRAP_LOCK})`);
  },
};

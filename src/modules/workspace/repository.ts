import { and, eq } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { membership, workspace, workspaceSettings } from "@/server/db/schema";
import type { Role } from "@/server/permissions";

export type WorkspaceRow = typeof workspace.$inferSelect;
export type MembershipRow = typeof membership.$inferSelect;

/** Único lugar con acceso a datos del módulo. */
export const workspaceRepository = {
  async findFirstWorkspace(
    tx: Transaction | typeof db = db,
  ): Promise<WorkspaceRow | undefined> {
    const rows = await tx.select().from(workspace).limit(1);
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

  async createMembership(
    tx: Transaction,
    values: { workspaceId: string; userId: string; role: Role },
  ): Promise<MembershipRow> {
    const [created] = await tx.insert(membership).values(values).returning();
    return created;
  },
};

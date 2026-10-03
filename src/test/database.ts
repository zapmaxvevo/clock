import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Deja las tablas de negocio y de sesión vacías. Se corre antes de cada test
 * para que ninguno dependa de lo que dejó el anterior.
 */
export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`truncate table time_entry, audit_log, external_invite, membership, workspace_settings, workspace, session, account, verification, "user" restart identity cascade`,
  );
}

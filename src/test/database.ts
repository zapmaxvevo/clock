import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Deja las tablas de negocio y de sesión vacías. Se corre antes de cada test
 * para que ninguno dependa de lo que dejó el anterior. `oauth_client` va aparte
 * porque un cliente registrado sin sesión no tiene `user_id`; su cascada vacía
 * los consentimientos y los tokens. `oauth_resource` y `jwks` quedan: el plugin
 * siembra el recurso una vez por proceso, y las claves sirven entre tests.
 */
export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`truncate table time_entry, audit_log, invitation, membership, workspace_settings, workspace, session, account, verification, oauth_client, "user" restart identity cascade`,
  );
}

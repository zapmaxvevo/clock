import { eq } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { userPreference } from "@/server/db/schema";

export type UserPreferenceRow = typeof userPreference.$inferSelect;

type Executor = Transaction | typeof db;

/**
 * Único lugar con acceso a datos del módulo. `user_preference` es de la cuenta
 * y no tiene workspace: toda consulta filtra por el `user_id` de la sesión, que
 * llega de `actor.userId` y nunca de la entrada.
 */
export const profileRepository = {
  /** Sin bloqueo. `undefined` es «nunca eligió nada». */
  async findPreferences(
    userId: string,
    tx: Executor = db,
  ): Promise<UserPreferenceRow | undefined> {
    const rows = await tx
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .limit(1);
    return rows.at(0);
  },
};

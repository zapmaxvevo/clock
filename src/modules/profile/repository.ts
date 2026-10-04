import { eq } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { now, userPreference } from "@/server/db/schema";

export type UserPreferenceRow = typeof userPreference.$inferSelect;

/** Una sola columna de preferencia con su valor nuevo: la de la clave del pedido. */
export type PreferenceColumn =
  | { readonly timezone: string }
  | { readonly timeFormat: string }
  | { readonly dateFormat: string };

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

  /** Con bloqueo: el pedido escribe sobre lo que leyó. */
  async findPreferencesForUpdate(
    tx: Transaction,
    userId: string,
  ): Promise<UserPreferenceRow | undefined> {
    const rows = await tx
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .for("update")
      .limit(1);
    return rows.at(0);
  },

  /**
   * Crea la fila con la primera preferencia, o escribe esa sola columna: las
   * otras no se nombran, así dos pedidos de claves distintas no se pisan.
   */
  async writePreference(
    tx: Transaction,
    userId: string,
    column: PreferenceColumn,
  ): Promise<UserPreferenceRow> {
    const [row] = await tx
      .insert(userPreference)
      .values({ userId, ...column })
      .onConflictDoUpdate({
        target: userPreference.userId,
        set: { ...column, updatedAt: now },
      })
      .returning();
    return row;
  },
};

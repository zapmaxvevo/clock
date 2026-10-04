import { eq } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { now, userPreference } from "@/server/db/schema";

export type UserPreferenceRow = typeof userPreference.$inferSelect;

/** Una sola columna de preferencia con su valor nuevo: la de la clave del pedido. */
export type PreferenceColumn =
  | { readonly timezone: string }
  | { readonly timeFormat: string }
  | { readonly dateFormat: string };

/**
 * Único lugar con acceso a datos del módulo. `user_preference` es de la cuenta
 * y no tiene workspace: toda consulta filtra por el `user_id` de la sesión, que
 * llega de `actor.userId` y nunca de la entrada.
 */
export const profileRepository = {
  /** Sin bloqueo. `undefined` es «nunca eligió nada». */
  async findPreferences(userId: string): Promise<UserPreferenceRow | undefined> {
    const rows = await db
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .limit(1);
    return rows.at(0);
  },

  /**
   * Crea la fila vacía si falta, para que `findPreferencesForUpdate` tenga qué
   * bloquear: Postgres no bloquea una fila que no existe, y sin ella dos
   * primeros pedidos simultáneos leerían los dos «sin fila».
   */
  async ensurePreferences(tx: Transaction, userId: string): Promise<void> {
    await tx
      .insert(userPreference)
      .values({ userId })
      .onConflictDoNothing({ target: userPreference.userId });
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

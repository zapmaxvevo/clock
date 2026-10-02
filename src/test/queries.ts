import { and, asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { auditLog, timeEntry } from "@/server/db/schema";

/**
 * Consultas de verificación de los tests de integración. Leen el estado que
 * dejó una operación; no crean nada ni pasan por un service.
 */

/** La fila, o `undefined` si ya no está. */
export async function timeEntryById(id: string) {
  const rows = await db.select().from(timeEntry).where(eq(timeEntry.id, id)).limit(1);
  return rows.at(0);
}

/** Todas las entradas de la base, de la más vieja a la más nueva. */
export async function allTimeEntries() {
  return db.select().from(timeEntry).orderBy(asc(timeEntry.startedAt));
}

/** Las entradas de una persona en un workspace, de la más vieja a la más nueva. */
export async function timeEntriesOf(workspaceId: string, userId: string) {
  return db
    .select()
    .from(timeEntry)
    .where(and(eq(timeEntry.workspaceId, workspaceId), eq(timeEntry.userId, userId)))
    .orderBy(asc(timeEntry.startedAt));
}

/**
 * Registros de auditoría de una entidad, o de una fila concreta si se pasa
 * `entityId`. El orden es por `created_at`, que es la marca de inicio de la
 * transacción: dos registros de una misma transacción comparten valor y entre
 * ellos el orden no está definido.
 */
export async function auditFor(entity: string, entityId?: string) {
  const scope =
    entityId === undefined
      ? eq(auditLog.entity, entity)
      : and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId));
  return db.select().from(auditLog).where(scope).orderBy(asc(auditLog.createdAt));
}

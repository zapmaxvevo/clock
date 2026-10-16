import { eq, sql } from "drizzle-orm";

import { DomainError, RejectedError } from "@/server/errors";
import { db, type Transaction } from "@/server/db";
import { timeEntryTag } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import type { WeekStart } from "@/server/time";
import type { TrackerWorkspace } from "@/modules/time-entry/service";

import { outcomeWhileHeld } from "./concurrency";
import { defaultFormats } from "./factories";
import { timeEntryById } from "./queries";

/**
 * Ayudantes de los tests de integración de `time-entry` que comparten más de
 * un archivo. Reciben el workspace y la persona por parámetro.
 */

/** Una membresía del workspace, activa y con rol `member` salvo que se pida otra cosa. */
export function actorIn(
  workspaceId: string,
  userId: string,
  overrides: Partial<Actor> = {},
): Actor {
  return { userId, workspaceId, role: "member", status: "active", ...overrides };
}

/** El workspace tal como lo recibe el service: la zona y el primer día de la semana. */
export function workspaceOf(
  timezone: string,
  weekStart: WeekStart = 1,
): TrackerWorkspace {
  return { timezone, weekStart, formats: defaultFormats };
}

/** Toma el bloqueo de la fila, como lo hace `readOwnEntry`. */
export function lockRow(id: string) {
  return (tx: Transaction) =>
    tx.execute(sql`select id from time_entry where id = ${id} for update`);
}

/**
 * Corre `work` mientras otra transacción sostiene `for update` sobre la fila
 * `id`: `outcomeWhileHeld` con el bloqueo de `lockRow`.
 */
export function outcomeWhileLocked(id: string, work: () => Promise<unknown>) {
  return outcomeWhileHeld(lockRow(id), work);
}

/** El error de dominio de una operación; si termina bien o lanza otra cosa, falla. */
export async function failureOf(work: Promise<unknown>): Promise<DomainError<string>> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) {
      return error;
    }
    throw error;
  }
  throw new Error("La operación no falló.");
}

/** El `RejectedError` de una operación en masa; si termina bien o lanza otra cosa, falla. */
export async function rejectionOf(work: Promise<unknown>): Promise<RejectedError> {
  const error = await failureOf(work);
  if (error instanceof RejectedError) {
    return error;
  }
  throw error;
}

/** Lo que dejó la fila sembrada: sus instantes, su descripción y su `updatedAt`. */
export async function snapshotOf(id: string) {
  const row = await timeEntryById(id);
  return row === undefined
    ? undefined
    : {
        description: row.description,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
}

/** Las filas de la unión de toda la base. */
export async function allEntryTags() {
  return db.select().from(timeEntryTag);
}

/** Los ids de las etiquetas de una entrada en la unión, ordenados. */
export async function tagIdsOfRow(entryId: string): Promise<string[]> {
  const rows = await db
    .select({ tagId: timeEntryTag.tagId })
    .from(timeEntryTag)
    .where(eq(timeEntryTag.timeEntryId, entryId));
  return rows.map((row) => row.tagId).sort();
}

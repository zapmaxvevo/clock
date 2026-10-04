import { auditLog } from "@/server/db/schema";
import type { Transaction } from "@/server/db";

export type AuditEntry = {
  readonly workspaceId: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly previousValue?: unknown;
  readonly nextValue?: unknown;
};

function serialize(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function rowOf(entry: AuditEntry) {
  return {
    workspaceId: entry.workspaceId,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    previousValue: serialize(entry.previousValue),
    nextValue: serialize(entry.nextValue),
  };
}

/**
 * Deja constancia del cambio. Se llama siempre dentro de la transacción de la
 * mutación, para que el registro y el cambio caigan juntos o no caigan.
 */
export async function recordAudit(tx: Transaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values(rowOf(entry));
}

/** Varias constancias en una sola sentencia, dentro de la transacción. Sin filas, no hace nada. */
export async function recordAudits(
  tx: Transaction,
  entries: readonly AuditEntry[],
): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  await tx.insert(auditLog).values(entries.map(rowOf));
}

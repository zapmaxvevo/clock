import { and, asc, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { now, timeEntry } from "@/server/db/schema";

export type TimeEntryRow = typeof timeEntry.$inferSelect;

/**
 * La fila sobre la que escribe una mutación. Los tres valores salen de la fila
 * que el service ya leyó y autorizó, nunca de la entrada del cliente: repetir
 * el `user_id` en el `WHERE` evita que la escritura dependa de que el llamador
 * haya hecho su parte.
 */
export type EntryTarget = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly id: string;
};

function isTarget(target: EntryTarget) {
  return and(
    eq(timeEntry.workspaceId, target.workspaceId),
    eq(timeEntry.userId, target.userId),
    eq(timeEntry.id, target.id),
  );
}

type Executor = Transaction | typeof db;

/** Postgres: violación de restricción única. */
const UNIQUE_VIOLATION = "23505";
/** Postgres: violación de una restricción `check`. */
const CHECK_VIOLATION = "23514";

/** El driver expone `code` y `constraint`; drizzle lo envuelve y lo deja en `cause`. */
function hasConstraint(error: unknown, code: string, constraint: string): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (candidate.code === code && candidate.constraint === constraint) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

/**
 * Único lugar con acceso a datos del módulo. Toda consulta filtra por el
 * `workspace_id` de la sesión.
 */
export const timeEntryRepository = {
  /**
   * Busca por id sin filtrar por usuario: quién es el dueño lo decide `can()`
   * sobre la fila leída, y así una entrada ajena se distingue de una que no
   * existe. Toma el bloqueo porque esa decisión se toma sobre el `user_id` que
   * devuelve y la escritura que viene después ya no lo vuelve a mirar.
   */
  async findByIdForUpdate(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .select()
      .from(timeEntry)
      .where(and(eq(timeEntry.workspaceId, workspaceId), eq(timeEntry.id, id)))
      .limit(1)
      .for("update");
    return rows.at(0);
  },

  async findRunning(
    workspaceId: string,
    userId: string,
    tx: Executor = db,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .select()
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.workspaceId, workspaceId),
          eq(timeEntry.userId, userId),
          isNull(timeEntry.endedAt),
        ),
      )
      .limit(1);
    return rows.at(0);
  },

  async findLatestClosed(
    workspaceId: string,
    userId: string,
    tx: Executor = db,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .select()
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.workspaceId, workspaceId),
          eq(timeEntry.userId, userId),
          isNotNull(timeEntry.endedAt),
        ),
      )
      .orderBy(desc(timeEntry.startedAt))
      .limit(1);
    return rows.at(0);
  },

  /**
   * La entrada cerrada más reciente que empezó antes de `before`. Es la que
   * estira hacia atrás la lista: una entrada futura no cuenta para eso.
   */
  async findLatestClosedBefore(
    workspaceId: string,
    userId: string,
    before: Date,
    tx: Executor = db,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .select()
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.workspaceId, workspaceId),
          eq(timeEntry.userId, userId),
          isNotNull(timeEntry.endedAt),
          lt(timeEntry.startedAt, before),
        ),
      )
      .orderBy(desc(timeEntry.startedAt))
      .limit(1);
    return rows.at(0);
  },

  /** Entradas cerradas cuyo inicio cae en `[from, to)`, de la más reciente a la más vieja. */
  async listClosedBetween(
    workspaceId: string,
    userId: string,
    from: Date,
    to: Date,
    tx: Executor = db,
  ): Promise<readonly TimeEntryRow[]> {
    return tx
      .select()
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.workspaceId, workspaceId),
          eq(timeEntry.userId, userId),
          isNotNull(timeEntry.endedAt),
          gte(timeEntry.startedAt, from),
          lt(timeEntry.startedAt, to),
        ),
      )
      .orderBy(desc(timeEntry.startedAt), asc(timeEntry.id));
  },

  /** El inicio lo escribe la base: `now()` es la marca de inicio de la transacción. */
  async insertRunning(
    tx: Transaction,
    values: { workspaceId: string; userId: string; description: string },
  ): Promise<TimeEntryRow> {
    const [created] = await tx
      .insert(timeEntry)
      .values({ ...values, startedAt: now })
      .returning();
    return created;
  },

  /**
   * Gemelo de `insertRunning` para la entrada manual: acá los dos instantes
   * llegan como valores, porque nacen de una hora de pared tecleada y no de
   * `now()`. Ver el ADR 0005.
   */
  async insertClosed(
    tx: Transaction,
    values: {
      workspaceId: string;
      userId: string;
      description: string;
      startedAt: Date;
      endedAt: Date;
    },
  ): Promise<TimeEntryRow> {
    const [created] = await tx.insert(timeEntry).values(values).returning();
    return created;
  },

  /**
   * Cierra la entrada con el mismo `now()` de la transacción. Devuelve
   * `undefined` si ya estaba cerrada o si no es la fila que se leyó.
   */
  async stopById(
    tx: Transaction,
    target: EntryTarget,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set({ endedAt: now })
      .where(and(isTarget(target), isNull(timeEntry.endedAt)))
      .returning();
    return rows.at(0);
  },

  async updateDescription(
    tx: Transaction,
    target: EntryTarget,
    description: string,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set({ description })
      .where(isTarget(target))
      .returning();
    return rows.at(0);
  },

  async deleteById(
    tx: Transaction,
    target: EntryTarget,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx.delete(timeEntry).where(isTarget(target)).returning();
    return rows.at(0);
  },

  /** La carrera de dos arranques simultáneos. El service solo ve el booleano. */
  isRunningConflict(error: unknown): boolean {
    return hasConstraint(error, UNIQUE_VIOLATION, "time_entry_running_unq");
  },

  /** La red de seguridad contra una duración negativa, ver TT-81. */
  isEndBeforeStart(error: unknown): boolean {
    return hasConstraint(error, CHECK_VIOLATION, "time_entry_end_after_start");
  },
};

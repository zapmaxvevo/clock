import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  hasConstraint,
  UNIQUE_VIOLATION,
} from "@/server/db/constraint-error";
import { now, project, task, timeEntry } from "@/server/db/schema";

export type TimeEntryRow = typeof timeEntry.$inferSelect;

/**
 * Lo que la fila muestra de su proyecto y su tarea, sin ningún filtro: una
 * entrada muestra su proyecto archivado, privado sin acceso, y su tarea hecha
 * (TT-104, PR-63, PR-65, PR-71). El color llega como texto; lo estrecha el
 * service.
 */
export type EntryRefs = {
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly color: string;
  } | null;
  readonly task: { readonly id: string; readonly name: string } | null;
};

/** Toda lectura que termina en una vista devuelve esto (ADR 0010). */
export type EntryWithRefs = TimeEntryRow & EntryRefs;

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

/** Solo las columnas de `ProjectRef` y `TaskRef`. */
const withRefs = {
  entry: timeEntry,
  project: { id: project.id, name: project.name, color: project.color },
  task: { id: task.id, name: task.name },
};

/**
 * Las entradas que cumplen `where`, con su proyecto y su tarea. Las dos claves
 * hacen que el join no cruce workspaces ni proyectos: la tarea se busca por el
 * proyecto de la entrada.
 */
function selectWithRefs(tx: Executor, where: SQL | undefined) {
  return tx
    .select(withRefs)
    .from(timeEntry)
    .leftJoin(
      project,
      and(
        eq(project.workspaceId, timeEntry.workspaceId),
        eq(project.id, timeEntry.projectId),
      ),
    )
    .leftJoin(
      task,
      and(
        eq(task.workspaceId, timeEntry.workspaceId),
        eq(task.projectId, timeEntry.projectId),
        eq(task.id, timeEntry.taskId),
      ),
    )
    .where(where)
    .$dynamic();
}

function toEntryWithRefs(row: {
  readonly entry: TimeEntryRow;
  readonly project: EntryRefs["project"];
  readonly task: EntryRefs["task"];
}): EntryWithRefs {
  return { ...row.entry, project: row.project, task: row.task };
}

/**
 * La fila recién escrita, con sus referencias. `insert … returning` no puede
 * hacer el join: es una lectura más, dentro de la misma transacción.
 */
async function rereadWithRefs(
  tx: Transaction,
  row: TimeEntryRow,
): Promise<EntryWithRefs> {
  const rows = await selectWithRefs(
    tx,
    and(eq(timeEntry.workspaceId, row.workspaceId), eq(timeEntry.id, row.id)),
  ).limit(1);
  const found = rows.at(0);
  if (found === undefined) {
    throw new Error(`La entrada ${row.id} no está en la transacción que la escribió.`);
  }
  return toEntryWithRefs(found);
}

/** `rereadWithRefs` sobre el resultado de una escritura que puede no tocar ninguna fila. */
async function rereadIfWritten(
  tx: Transaction,
  row: TimeEntryRow | undefined,
): Promise<EntryWithRefs | undefined> {
  return row === undefined ? undefined : rereadWithRefs(tx, row);
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
  ): Promise<EntryWithRefs | undefined> {
    // Solo la entrada: Postgres rechaza `for update` sobre el lado nulable de
    // un `left join`.
    const rows = await selectWithRefs(
      tx,
      and(eq(timeEntry.workspaceId, workspaceId), eq(timeEntry.id, id)),
    )
      .limit(1)
      .for("update", { of: timeEntry });
    const row = rows.at(0);
    return row === undefined ? undefined : toEntryWithRefs(row);
  },

  /**
   * Busca por id sin bloqueo y sin filtrar por usuario, como `findByIdForUpdate`:
   * quién es el dueño lo decide `can()` sobre la fila leída.
   */
  async findById(
    workspaceId: string,
    id: string,
    tx: Executor = db,
  ): Promise<EntryWithRefs | undefined> {
    const rows = await selectWithRefs(
      tx,
      and(eq(timeEntry.workspaceId, workspaceId), eq(timeEntry.id, id)),
    ).limit(1);
    const row = rows.at(0);
    return row === undefined ? undefined : toEntryWithRefs(row);
  },

  /** Sin bloqueo. Filtra por workspace y por usuario: solo encuentra filas propias. */
  async findOwnById(
    workspaceId: string,
    userId: string,
    id: string,
    tx: Executor = db,
  ): Promise<EntryWithRefs | undefined> {
    const rows = await selectWithRefs(tx, isTarget({ workspaceId, userId, id })).limit(1);
    const row = rows.at(0);
    return row === undefined ? undefined : toEntryWithRefs(row);
  },

  async findRunning(
    workspaceId: string,
    userId: string,
    tx: Executor = db,
  ): Promise<EntryWithRefs | undefined> {
    const rows = await selectWithRefs(
      tx,
      and(
        eq(timeEntry.workspaceId, workspaceId),
        eq(timeEntry.userId, userId),
        isNull(timeEntry.endedAt),
      ),
    ).limit(1);
    const row = rows.at(0);
    return row === undefined ? undefined : toEntryWithRefs(row);
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
   * estira hacia atrás la lista: una entrada futura no cuenta para eso. Es
   * también la que continúa el atajo «c», así que desempata como
   * `listClosedBetween`: con dos del mismo inicio, la que la lista dibuja primero.
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
      .orderBy(desc(timeEntry.startedAt), asc(timeEntry.id))
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
  ): Promise<readonly EntryWithRefs[]> {
    const rows = await selectWithRefs(
      tx,
      and(
        eq(timeEntry.workspaceId, workspaceId),
        eq(timeEntry.userId, userId),
        isNotNull(timeEntry.endedAt),
        gte(timeEntry.startedAt, from),
        lt(timeEntry.startedAt, to),
      ),
    ).orderBy(desc(timeEntry.startedAt), asc(timeEntry.id));
    return rows.map(toEntryWithRefs);
  },

  /**
   * El inicio lo escribe la base: `now()` es la marca de inicio de la
   * transacción. El id lo eligió el cliente (ADR 0007).
   */
  async insertRunning(
    tx: Transaction,
    values: {
      id: string;
      workspaceId: string;
      userId: string;
      description: string;
      projectId: string | null;
      taskId: string | null;
    },
  ): Promise<EntryWithRefs> {
    const [created] = await tx
      .insert(timeEntry)
      .values({ ...values, startedAt: now })
      .returning();
    return rereadWithRefs(tx, created);
  },

  /**
   * Gemelo de `insertRunning` para las entradas cerradas: acá los dos instantes
   * llegan como valores, porque nacen de una hora de pared tecleada (ADR 0005)
   * o de otra fila, y no de `now()`. El id lo trae duplicar, que lo eligió el
   * cliente (ADR 0007); el alta manual no lo manda.
   */
  async insertClosed(
    tx: Transaction,
    values: {
      id?: string;
      workspaceId: string;
      userId: string;
      description: string;
      projectId: string | null;
      taskId: string | null;
      startedAt: Date;
      endedAt: Date;
    },
  ): Promise<EntryWithRefs> {
    const [created] = await tx.insert(timeEntry).values(values).returning();
    return rereadWithRefs(tx, created);
  },

  /**
   * Cierra la entrada con el mismo `now()` de la transacción, con piso en su
   * inicio: desde que el inicio de un timer se puede editar, puede quedar
   * después de ese `now()` (TT-101). Devuelve `undefined` si ya estaba cerrada
   * o si no es la fila que se leyó.
   */
  async stopById(
    tx: Transaction,
    target: EntryTarget,
  ): Promise<EntryWithRefs | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set({ endedAt: sql`greatest(${now}, ${timeEntry.startedAt})` })
      .where(and(isTarget(target), isNull(timeEntry.endedAt)))
      .returning();
    return rereadIfWritten(tx, rows.at(0));
  },

  /** Solo una fila cerrada. `undefined` si la entrada está corriendo. */
  async updateTimes(
    tx: Transaction,
    target: EntryTarget,
    times: { startedAt: Date; endedAt: Date },
  ): Promise<EntryWithRefs | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set(times)
      .where(and(isTarget(target), isNotNull(timeEntry.endedAt)))
      .returning();
    return rereadIfWritten(tx, rows.at(0));
  },

  /** Solo una fila abierta. `undefined` si ya la cerraron. */
  async updateStartOfRunning(
    tx: Transaction,
    target: EntryTarget,
    startedAt: Date,
  ): Promise<EntryWithRefs | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set({ startedAt })
      .where(and(isTarget(target), isNull(timeEntry.endedAt)))
      .returning();
    return rereadIfWritten(tx, rows.at(0));
  },

  async updateDescription(
    tx: Transaction,
    target: EntryTarget,
    description: string,
  ): Promise<EntryWithRefs | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set({ description })
      .where(isTarget(target))
      .returning();
    return rereadIfWritten(tx, rows.at(0));
  },

  /** Fija los dos valores sobre la fila leída, corra o no. */
  async updateProject(
    tx: Transaction,
    target: EntryTarget,
    pair: { projectId: string | null; taskId: string | null },
  ): Promise<EntryWithRefs | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set({ projectId: pair.projectId, taskId: pair.taskId })
      .where(isTarget(target))
      .returning();
    return rereadIfWritten(tx, rows.at(0));
  },

  async deleteById(
    tx: Transaction,
    target: EntryTarget,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx.delete(timeEntry).where(isTarget(target)).returning();
    return rows.at(0);
  },

  /** Solo una fila abierta. `undefined` si ya la cerraron. */
  async deleteRunningById(
    tx: Transaction,
    target: EntryTarget,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .delete(timeEntry)
      .where(and(isTarget(target), isNull(timeEntry.endedAt)))
      .returning();
    return rows.at(0);
  },

  /** La clave primaria de `time_entry`, para `createOnce`. */
  idConstraint: "time_entry_pkey" as const,

  /** La carrera de dos arranques simultáneos. El service solo ve el booleano. */
  isRunningConflict(error: unknown): boolean {
    return hasConstraint(error, UNIQUE_VIOLATION, "time_entry_running_unq");
  },

  /** La red de seguridad contra una duración negativa, ver TT-81. */
  isEndBeforeStart(error: unknown): boolean {
    return hasConstraint(error, CHECK_VIOLATION, "time_entry_end_after_start");
  },

  /** El proyecto se borró entre la validación y la escritura (TT-77). */
  isMissingProject(error: unknown): boolean {
    return hasConstraint(error, FOREIGN_KEY_VIOLATION, "time_entry_project_fk");
  },

  /** La tarea se borró, o no es del proyecto, entre la validación y la escritura (PR-74). */
  isMissingTask(error: unknown): boolean {
    return hasConstraint(error, FOREIGN_KEY_VIOLATION, "time_entry_task_fk");
  },

  /** La red del `check` de TT-70: Zod lo rechaza antes. */
  isTaskWithoutProject(error: unknown): boolean {
    return hasConstraint(error, CHECK_VIOLATION, "time_entry_task_needs_project");
  },
};

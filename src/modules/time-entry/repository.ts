import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";

import type { ProjectPair } from "@/lib/project-pair";
import { db, type Transaction } from "@/server/db";
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  hasConstraint,
  UNIQUE_VIOLATION,
} from "@/server/db/constraint-error";
import { now, project, tag, task, timeEntry, timeEntryTag } from "@/server/db/schema";

export type TimeEntryRow = typeof timeEntry.$inferSelect;

/**
 * Lo que la fila muestra de su proyecto, su tarea y sus etiquetas, sin ningún
 * filtro: una entrada muestra su proyecto archivado, privado sin acceso, su
 * tarea hecha y sus etiquetas archivadas (TT-104, PR-63, PR-65, PR-71, PR-47,
 * PR-68). El color llega como texto; lo estrecha el service. Las etiquetas
 * llegan sin orden: lo pone el service.
 */
export type EntryRefs = {
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly color: string;
  } | null;
  readonly task: { readonly id: string; readonly name: string } | null;
  readonly tags: readonly { readonly id: string; readonly name: string }[];
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

/** Lo que se escribe en una fila cerrada: solo lo que cambia. */
export type ClosedFields = {
  readonly description?: string;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
};

/**
 * Lo que escriben `updateClosedEntry` y `updateClosedEntries`: lo de
 * `ClosedFields`, el par, siempre entero, el facturable y el conjunto entero
 * de etiquetas.
 */
export type ClosedEntryFields = ClosedFields & {
  readonly pair?: ProjectPair;
  readonly billable?: boolean;
  readonly tagIds?: readonly string[];
};

/** Lo que escribe `updateRunningEntry`. */
export type RunningEntryFields = Omit<ClosedEntryFields, "endedAt">;

type ColumnFields = Omit<ClosedEntryFields, "pair" | "tagIds">;

/** Las columnas de una escritura de una fila cerrada: el par va entero o no va. */
type ClosedColumns = ColumnFields | (ColumnFields & ProjectPair);

/** Las columnas de una escritura: el par se abre en sus dos columnas, juntas. */
function columnsOf({
  pair,
  ...fields
}: Omit<ClosedEntryFields, "tagIds">): ClosedColumns {
  return pair === undefined
    ? fields
    : { ...fields, projectId: pair.projectId, taskId: pair.taskId };
}

function hasColumns(columns: ClosedColumns): boolean {
  return Object.keys(columns).length > 0;
}

function isTarget(target: EntryTarget) {
  return and(
    eq(timeEntry.workspaceId, target.workspaceId),
    eq(timeEntry.userId, target.userId),
    eq(timeEntry.id, target.id),
  );
}

type Executor = Transaction | typeof db;

/**
 * Las etiquetas de la entrada de la fila exterior, en un arreglo JSON: una
 * subconsulta correlacionada no multiplica filas como un `join`. Filtra por el
 * `workspace_id` y el `id` de la entrada; las dos claves de la unión hacen que
 * no cruce workspaces.
 */
const entryTags = sql<unknown>`coalesce((
  select json_agg(json_build_object('id', ${tag.id}, 'name', ${tag.name}))
  from ${timeEntryTag}
  inner join ${tag}
    on ${tag.workspaceId} = ${timeEntryTag.workspaceId} and ${tag.id} = ${timeEntryTag.tagId}
  where ${timeEntryTag.workspaceId} = ${timeEntry.workspaceId}
    and ${timeEntryTag.timeEntryId} = ${timeEntry.id}
), '[]'::json)`;

/** El JSON de `entryTags`, estrechado antes de salir del repository. */
const entryTagsShape = z.array(z.object({ id: z.string(), name: z.string() }));

/** Solo las columnas de `ProjectRef`, `TaskRef` y `TagRef`. */
const withRefs = {
  entry: timeEntry,
  project: { id: project.id, name: project.name, color: project.color },
  task: { id: task.id, name: task.name },
  tags: entryTags,
};

/**
 * Las entradas que cumplen `where`, con su proyecto, su tarea y sus etiquetas.
 * Las dos claves hacen que el join no cruce workspaces ni proyectos: la tarea
 * se busca por el proyecto de la entrada. Las etiquetas salen de la
 * subconsulta de `entryTags`.
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
  readonly tags: unknown;
}): EntryWithRefs {
  return {
    ...row.entry,
    project: row.project,
    task: row.task,
    tags: entryTagsShape.parse(row.tags),
  };
}

/**
 * La fila recién escrita o recién bloqueada, con sus referencias. `insert …
 * returning` no puede hacer el join, y la sentencia que bloquea no debe (ver
 * `findByIdForUpdate`): es una lectura más, dentro de la misma transacción.
 */
async function rereadWithRefs(
  tx: Transaction,
  row: Pick<TimeEntryRow, "workspaceId" | "id">,
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

/**
 * Las filas de la unión que faltan para `tagIds`; las que ya están quedan. Sin
 * etiquetas, no hay sentencia.
 */
async function insertTags(
  tx: Transaction,
  entry: Pick<TimeEntryRow, "workspaceId" | "id">,
  tagIds: readonly string[],
): Promise<void> {
  if (tagIds.length === 0) {
    return;
  }
  await tx
    .insert(timeEntryTag)
    .values(
      tagIds.map((tagId) => ({
        workspaceId: entry.workspaceId,
        timeEntryId: entry.id,
        tagId,
      })),
    )
    .onConflictDoNothing();
}

/** El conjunto entero de etiquetas que una escritura en masa deja en su destino. */
type TagsWrite = {
  readonly target: EntryTarget;
  readonly tagIds: readonly string[];
};

/**
 * Deja en cada destino exactamente su conjunto: borra las filas de la unión que
 * sobran e inserta las que faltan, en dos sentencias sea cual sea la cantidad.
 * Los pares viajan en dos arreglos que se recorren con `unnest`, así el peor
 * caso (200 × 50) no multiplica los parámetros. Solo toca las filas de la
 * unión de los destinos de `writes`; un destino con el conjunto vacío queda
 * sin etiquetas. Sin escrituras, no hay sentencias.
 */
async function replaceManyTags(
  tx: Transaction,
  writes: readonly TagsWrite[],
): Promise<void> {
  const first = writes.at(0);
  if (first === undefined) {
    return;
  }
  const workspaceId = first.target.workspaceId;
  if (writes.some((write) => write.target.workspaceId !== workspaceId)) {
    throw new Error("Una escritura en masa de etiquetas cruza workspaces.");
  }
  const targets = sql.param(writes.map((write) => write.target.id));
  const entries = sql.param(
    writes.flatMap((write) => write.tagIds.map(() => write.target.id)),
  );
  const tagIds = sql.param(writes.flatMap((write) => [...write.tagIds]));
  const pairs = sql`unnest(${entries}::uuid[], ${tagIds}::uuid[]) as pair(entry_id, tag_id)`;
  await tx
    .delete(timeEntryTag)
    .where(
      and(
        eq(timeEntryTag.workspaceId, workspaceId),
        sql`${timeEntryTag.timeEntryId} = any(${targets}::uuid[])`,
        sql`not exists (select 1 from ${pairs} where pair.entry_id = ${timeEntryTag.timeEntryId} and pair.tag_id = ${timeEntryTag.tagId})`,
      ),
    );
  if (writes.every((write) => write.tagIds.length === 0)) {
    return;
  }
  await tx
    .insert(timeEntryTag)
    .select(sql`select ${workspaceId}::uuid, pair.entry_id, pair.tag_id from ${pairs}`)
    .onConflictDoNothing();
}

/**
 * Deja en la entrada exactamente `tagIds`: la regla de `replaceManyTags` con un
 * solo destino, el leído, nunca la entrada del cliente.
 */
function replaceTags(
  tx: Transaction,
  target: EntryTarget,
  tagIds: readonly string[],
): Promise<void> {
  return replaceManyTags(tx, [{ target, tagIds }]);
}

/**
 * El `update` de las columnas de una escritura de una fila cerrada, si trae
 * alguna: sin columnas no hay sentencia (Drizzle rechaza `set({})`), y que la
 * fila esté cerrada lo decidió el service bajo el bloqueo. `false` si el
 * `update` no tocó la fila.
 */
async function writeClosedColumns(
  tx: Transaction,
  target: EntryTarget,
  fields: Omit<ClosedEntryFields, "tagIds">,
): Promise<boolean> {
  const columns = columnsOf(fields);
  return (
    !hasColumns(columns) ||
    (await timeEntryRepository.updateClosedFields(tx, target, columns)) !== undefined
  );
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
    // Dos sentencias. En `read committed`, un `join` o una subconsulta dentro
    // de la que bloquea usan la foto tomada antes de esperar el bloqueo: con
    // otra conexión que cambió las etiquetas o el par y confirmó, traerían las
    // etiquetas de antes o un proyecto nulo con el `project_id` nuevo. La
    // segunda toma su foto con el bloqueo ya tomado.
    const locked = await tx
      .select({ workspaceId: timeEntry.workspaceId, id: timeEntry.id })
      .from(timeEntry)
      .where(and(eq(timeEntry.workspaceId, workspaceId), eq(timeEntry.id, id)))
      .limit(1)
      .for("update");
    const row = locked.at(0);
    return row === undefined ? undefined : rereadWithRefs(tx, row);
  },

  /**
   * Las filas pedidas del workspace, de cualquier dueño —quién lo es lo decide
   * `can()`—, con sus referencias. Bloquea con una sentencia que lee solo
   * `time_entry`, con `order by time_entry.id`: el orden es el que evita que
   * dos operaciones en masa se esperen en círculo (ADR 0011). Las referencias
   * salen de una segunda, por la razón de `findByIdForUpdate`.
   */
  async findManyByIdsForUpdate(
    tx: Transaction,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<readonly EntryWithRefs[]> {
    const locked = await tx
      .select({ id: timeEntry.id })
      .from(timeEntry)
      .where(and(eq(timeEntry.workspaceId, workspaceId), inArray(timeEntry.id, [...ids])))
      .orderBy(asc(timeEntry.id))
      .for("update");
    if (locked.length === 0) {
      return [];
    }
    const rows = await selectWithRefs(
      tx,
      and(
        eq(timeEntry.workspaceId, workspaceId),
        inArray(
          timeEntry.id,
          locked.map((row) => row.id),
        ),
      ),
    ).orderBy(asc(timeEntry.id));
    return rows.map(toEntryWithRefs);
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
   * Las entradas cerradas de la persona que se superponen con `[from, to)`:
   * empiezan antes de `to` y terminan después de `from`, o empiezan justo en
   * `from`, así una de duración cero en ese instante entra. Una que empezó antes
   * y termina exactamente en `from` no se superpone (CAL-26, CAL-94). Con su
   * proyecto y su tarea, por inicio ascendente y después por id: el orden de
   * `Tab` (CAL-76).
   */
  async listClosedOverlapping(
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
        lt(timeEntry.startedAt, to),
        or(gt(timeEntry.endedAt, from), eq(timeEntry.startedAt, from)),
      ),
    ).orderBy(asc(timeEntry.startedAt), asc(timeEntry.id));
    return rows.map(toEntryWithRefs);
  },

  /**
   * El inicio lo escribe la base: `now()` es la marca de inicio de la
   * transacción. El id lo eligió el cliente (ADR 0007). Las etiquetas van a
   * la unión antes de releer.
   */
  async insertRunning(
    tx: Transaction,
    {
      tagIds,
      ...values
    }: {
      id: string;
      workspaceId: string;
      userId: string;
      description: string;
      projectId: string | null;
      taskId: string | null;
      billable: boolean;
      tagIds: readonly string[];
    },
  ): Promise<EntryWithRefs> {
    const [created] = await tx
      .insert(timeEntry)
      .values({ ...values, startedAt: now })
      .returning();
    await insertTags(tx, created, tagIds);
    return rereadWithRefs(tx, created);
  },

  /**
   * Gemelo de `insertRunning` para las entradas cerradas: acá los dos instantes
   * llegan como valores, porque nacen de una hora de pared tecleada (ADR 0005)
   * o de otra fila, y no de `now()`. El id lo eligió el cliente, en el alta
   * manual y en duplicar (ADR 0007).
   */
  async insertClosed(
    tx: Transaction,
    {
      tagIds,
      ...values
    }: {
      id: string;
      workspaceId: string;
      userId: string;
      description: string;
      projectId: string | null;
      taskId: string | null;
      billable: boolean;
      tagIds: readonly string[];
      startedAt: Date;
      endedAt: Date;
    },
  ): Promise<EntryWithRefs> {
    const [created] = await tx.insert(timeEntry).values(values).returning();
    await insertTags(tx, created, tagIds);
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

  /**
   * Los campos que cambian de una fila cerrada y, si viene `tagIds`, su
   * conjunto de etiquetas; releída con sus referencias: el par y las etiquetas
   * pudieron cambiar. `undefined` si la entrada está corriendo. Con solo
   * etiquetas no hay `update` de la fila: su estado lo decidió el service bajo
   * el bloqueo de la lectura.
   */
  async updateClosedEntry(
    tx: Transaction,
    target: EntryTarget,
    fields: ClosedEntryFields,
  ): Promise<EntryWithRefs | undefined> {
    const { tagIds, ...columnFields } = fields;
    if (!(await writeClosedColumns(tx, target, columnFields))) {
      return undefined;
    }
    if (tagIds !== undefined) {
      await replaceTags(tx, target, tagIds);
    }
    return rereadWithRefs(tx, target);
  },

  /**
   * Los campos que cambian de la fila abierta y su conjunto de etiquetas,
   * releída con sus referencias. `undefined` si ya la cerraron. Con solo
   * etiquetas, como `updateClosedEntry`.
   */
  async updateRunningEntry(
    tx: Transaction,
    target: EntryTarget,
    fields: RunningEntryFields,
  ): Promise<EntryWithRefs | undefined> {
    const { tagIds, ...columnFields } = fields;
    const columns = columnsOf(columnFields);
    if (hasColumns(columns)) {
      const rows = await tx
        .update(timeEntry)
        .set(columns)
        .where(and(isTarget(target), isNull(timeEntry.endedAt)))
        .returning();
      if (rows.length === 0) {
        return undefined;
      }
    }
    if (tagIds !== undefined) {
      await replaceTags(tx, target, tagIds);
    }
    return rereadWithRefs(tx, target);
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

  /** Fija el par y el facturable que lo acompaña sobre la fila leída, corra o no. */
  async updateProject(
    tx: Transaction,
    target: EntryTarget,
    values: ProjectPair & { readonly billable: boolean },
  ): Promise<EntryWithRefs | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set({
        projectId: values.projectId,
        taskId: values.taskId,
        billable: values.billable,
      })
      .where(isTarget(target))
      .returning();
    return rereadIfWritten(tx, rows.at(0));
  },

  /**
   * Escribe varias filas cerradas de una operación en masa y las relee con sus
   * referencias. Por cada escritura con columnas, un `update` sobre su destino
   * con `ended_at is not null`, como `updateClosedFields`; el par se abre en sus
   * dos columnas, como `columnsOf`. Las etiquetas, en dos sentencias para todas
   * las escrituras que traen `tagIds` —el conjunto entero de cada una—: un
   * `delete` de las filas de la unión que sobran y un
   * `insert … on conflict do nothing` de las que faltan. Una escritura sin
   * `tagIds` no entra en ninguna de las dos. Una relectura de todas las
   * escritas, con `selectWithRefs`. `undefined` si algún `update` no tocó su
   * fila. Devuelve en el orden de `writes`.
   */
  async updateClosedEntries(
    tx: Transaction,
    writes: readonly {
      readonly target: EntryTarget;
      readonly fields: ClosedEntryFields;
    }[],
  ): Promise<readonly EntryWithRefs[] | undefined> {
    const tagged: TagsWrite[] = [];
    for (const { target, fields } of writes) {
      const { tagIds, ...columnFields } = fields;
      if (!(await writeClosedColumns(tx, target, columnFields))) {
        return undefined;
      }
      if (tagIds !== undefined) {
        tagged.push({ target, tagIds });
      }
    }
    await replaceManyTags(tx, tagged);
    const first = writes.at(0);
    if (first === undefined) {
      return [];
    }
    const rows = await selectWithRefs(
      tx,
      and(
        eq(timeEntry.workspaceId, first.target.workspaceId),
        inArray(
          timeEntry.id,
          writes.map((write) => write.target.id),
        ),
      ),
    );
    const reread = new Map(rows.map((row) => [row.entry.id, toEntryWithRefs(row)]));
    return writes.map(({ target }) => {
      const row = reread.get(target.id);
      if (row === undefined) {
        throw new Error(
          `La entrada ${target.id} no está en la transacción que la escribió.`,
        );
      }
      return row;
    });
  },

  /**
   * Cualquier subconjunto de los tres campos, el par entero y el facturable si
   * vienen, solo en una fila cerrada. Sin relectura: la hace quien la llama.
   */
  async updateClosedFields(
    tx: Transaction,
    target: EntryTarget,
    fields: ClosedColumns,
  ): Promise<TimeEntryRow | undefined> {
    const rows = await tx
      .update(timeEntry)
      .set(fields)
      .where(and(isTarget(target), isNotNull(timeEntry.endedAt)))
      .returning();
    return rows.at(0);
  },

  /**
   * Las filas cerradas de esos destinos, en una sentencia. Los destinos salen de
   * `targetOf` sobre las filas que el service ya leyó y autorizó, así que el
   * `WHERE` repite su `workspace_id` y su `user_id`, como `isTarget`. Devuelve las
   * borradas; el service compara con las autorizadas.
   */
  async deleteClosedByIds(
    tx: Transaction,
    targets: readonly EntryTarget[],
  ): Promise<readonly TimeEntryRow[]> {
    // Sin destinos, `or()` no pone condición y el `delete` vaciaría la tabla.
    if (targets.length === 0) {
      return [];
    }
    return tx
      .delete(timeEntry)
      .where(and(or(...targets.map(isTarget)), isNotNull(timeEntry.endedAt)))
      .returning();
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

  /** La etiqueta se borró entre la validación y la escritura (TT-78). */
  isMissingTag(error: unknown): boolean {
    return hasConstraint(error, FOREIGN_KEY_VIOLATION, "time_entry_tag_tag_fk");
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

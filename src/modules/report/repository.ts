import { and, eq, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { alias, type PgSelect } from "drizzle-orm/pg-core";

import { db, type Transaction } from "@/server/db";
import {
  client,
  membership,
  project,
  tag,
  task,
  timeEntry,
  timeEntryTag,
  user,
  userPreference,
} from "@/server/db/schema";
import type { MembershipStatus } from "@/server/permissions";
import type { TimeBuckets } from "@/server/time";

import type { ReportGroupBy } from "./schema";
// Solo el tipo: el alcance lo construye el service (D-R2a-1). El ciclo se borra al compilar.
import type { ReportScope } from "./service";

type Executor = Transaction | typeof db;

/** El intervalo de instantes que lee el reporte: `[from, to)`. */
export type ReportSpan = { readonly from: Date; readonly to: Date };

type StoredProject = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
};

type NamedRef = { readonly id: string; readonly name: string };

/** Lo que una fila dice de uno de sus niveles: el grupo y lo que se muestra de él. */
export type LevelGroupRow =
  | {
      readonly kind: "person";
      readonly userId: string;
      /** `user.name`, el de Google. */
      readonly accountName: string;
      /** `user_preference.display_name`, o `null`. */
      readonly displayName: string | null;
      readonly status: MembershipStatus;
    }
  | {
      readonly kind: "project";
      /** `null` es «Sin proyecto». */
      readonly project: StoredProject | null;
      readonly client: NamedRef | null;
    }
  /** `null` es «Sin cliente»: sin proyecto o de un proyecto sin cliente. */
  | { readonly kind: "client"; readonly client: NamedRef | null }
  | {
      readonly kind: "task";
      /** `null` es «Sin tarea», y entonces el proyecto también. */
      readonly task: NamedRef | null;
      readonly project: StoredProject | null;
    }
  /** `null` es «Sin etiqueta»: la entrada no tiene ninguna. */
  | { readonly kind: "tag"; readonly tag: NamedRef | null }
  | {
      readonly kind: "date";
      /** La posición del tramo en `buckets.buckets`, desde 0. */
      readonly bucket: number;
    };

export type LevelTotalRow = {
  /** Uno por dimensión pedida, en el mismo orden. */
  readonly groups: readonly LevelGroupRow[];
  readonly seconds: number;
  readonly billableSeconds: number;
};

/** Lo que lee `totalsByLevels`: el intervalo y por qué dimensiones agrupa. */
export type ReportLevelRead = {
  readonly span: ReportSpan;
  /** De una a tres, sin repetir. */
  readonly dimensions: readonly ReportGroupBy[];
  /** Los tramos de `span` si `date` es una de las dimensiones; si no, `null`. */
  readonly buckets: TimeBuckets | null;
};

export type EntryTotals = {
  readonly seconds: number;
  readonly billableSeconds: number;
};

/** Única traducción del alcance a la consulta: ninguna arma su propio filtro de personas. */
function inScope(scope: ReportScope) {
  const inWorkspace = eq(timeEntry.workspaceId, scope.workspaceId);
  if (scope.people.kind === "everyone") {
    return inWorkspace;
  }
  return and(inWorkspace, eq(timeEntry.userId, scope.people.userId));
}

/**
 * Las cerradas con el inicio en `[from, to)`: la regla de `inSpan` de
 * `time-entry`, copiada como admite el ADR 0021.
 */
function closedIn(span: ReportSpan) {
  return and(
    isNotNull(timeEntry.endedAt),
    gte(timeEntry.startedAt, span.from),
    lt(timeEntry.startedAt, span.to),
  );
}

/**
 * `durationSeconds` de cada entrada sobre los instantes como los lee JS, que
 * trunca a milisegundos (ADR 0021, D-R2a-6).
 */
const entrySeconds = sql`floor(extract(epoch from date_trunc('milliseconds', ${timeEntry.endedAt}) - date_trunc('milliseconds', ${timeEntry.startedAt})))`;

/** Una suma de la base a número; lanza si no es un entero seguro no negativo. */
function secondsOf(value: string): number {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new RangeError(`Suma de segundos fuera de rango: ${value}.`);
  }
  return seconds;
}

/** La fila con sus dos sumas convertidas a número. */
function withSeconds<
  Row extends { readonly seconds: string; readonly billableSeconds: string },
>(
  row: Row,
): Omit<Row, "seconds" | "billableSeconds"> & {
  readonly seconds: number;
  readonly billableSeconds: number;
} {
  return {
    ...row,
    seconds: secondsOf(row.seconds),
    billableSeconds: secondsOf(row.billableSeconds),
  };
}

/**
 * La posición desde 0 del tramo que da `width_bucket`, que cuenta desde 1;
 * lanza si no queda entre los `count` tramos.
 */
function bucketIndexOf(value: number, count: number): number {
  const index = value - 1;
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`Tramo fuera de rango: ${value} de ${count}.`);
  }
  return index;
}

/** Una columna de una subconsulta por su nombre: `"totals"."key_1"`. */
function columnOf(subquery: "entries" | "totals", name: string): SQL {
  return sql`${sql.identifier(subquery)}.${sql.identifier(name)}`;
}

/** La clave del nivel `index`, desde 0, con el nombre que lleva en las subconsultas. */
function keyName(index: number): string {
  return `key_${index + 1}`;
}

/** Lo que se muestra de una dimensión, campo por campo, con su tipo. */
type Shown = Record<string, SQL>;
type ShownValues<Fields extends Shown> = {
  readonly [Field in keyof Fields]: Fields[Field] extends SQL<infer Value>
    ? Value
    : never;
};

/** Una dimensión de la lectura por niveles: una fila de la tabla de §4.3 de R3. */
type Dimension<Fields extends Shown = Shown> = {
  /** La clave de cada entrada, en la subconsulta de adentro. */
  readonly key: (read: ReportLevelRead) => SQL;
  /** Lo que une adentro, antes de agrupar: cambia la clave o cuántas filas da una entrada. */
  readonly joinInside?: (query: PgSelect) => PgSelect;
  /** Lo que une afuera, a las filas ya agrupadas, por su clave: de uno a uno. */
  readonly joinOutside?: (query: PgSelect, key: SQL, workspaceId: SQL) => PgSelect;
  /** Lo que la fila trae de la dimensión, por su clave y lo que unió afuera. */
  readonly shown: (key: SQL) => Fields;
  readonly groupOf: (values: ShownValues<Fields>, read: ReportLevelRead) => LevelGroupRow;
};

/** El tipo de cada dimensión se comprueba acá; la tabla las guarda sin él. */
function dimension<Fields extends Shown>(spec: Dimension<Fields>): Dimension {
  return spec as unknown as Dimension;
}

// Cada dimensión une con sus propios alias: el proyecto aparece adentro para
// el cliente y afuera para el proyecto y para la tarea; el cliente, afuera para
// el cliente y para el proyecto. Como una dimensión no se repite, ningún alias
// se usa dos veces en una sentencia.
const entryProject = alias(project, "entry_project");
const groupProject = alias(project, "group_project");
const groupProjectClient = alias(client, "group_project_client");
const groupClient = alias(client, "group_client");
const taskProject = alias(project, "task_project");

/** RP-28: un proyecto nulo es «Sin proyecto»; RP-29: archivado o no. */
function storedProjectOf(values: {
  readonly id: string | null;
  readonly name: string | null;
  readonly color: string | null;
}): StoredProject | null {
  if (values.id === null || values.name === null || values.color === null) {
    return null;
  }
  return { id: values.id, name: values.name, color: values.color };
}

function namedRefOf(values: {
  readonly id: string | null;
  readonly name: string | null;
}): NamedRef | null {
  if (values.id === null || values.name === null) {
    return null;
  }
  return { id: values.id, name: values.name };
}

/** La tabla de §4.3: cada dimensión se describe una vez (D-R3-2). */
const DIMENSIONS: Readonly<Record<ReportGroupBy, Dimension>> = {
  person: dimension({
    key: () => sql`${timeEntry.userId}`,
    joinOutside: (query, key, workspaceId) =>
      query
        // R1: toda entrada tiene membresía en su workspace.
        .innerJoin(
          membership,
          and(eq(membership.workspaceId, workspaceId), eq(membership.userId, key)),
        )
        .innerJoin(user, eq(user.id, key))
        .leftJoin(userPreference, eq(userPreference.userId, key)),
    shown: (key) => ({
      userId: sql<string>`${key}`,
      accountName: sql<string>`${user.name}`,
      displayName: sql<string | null>`${userPreference.displayName}`,
      status: sql<MembershipStatus>`${membership.status}`,
    }),
    groupOf: (values) => ({ kind: "person", ...values }),
  }),

  project: dimension({
    key: () => sql`${timeEntry.projectId}`,
    joinOutside: (query, key, workspaceId) =>
      query
        .leftJoin(
          groupProject,
          and(eq(groupProject.workspaceId, workspaceId), eq(groupProject.id, key)),
        )
        .leftJoin(
          groupProjectClient,
          and(
            eq(groupProjectClient.workspaceId, groupProject.workspaceId),
            eq(groupProjectClient.id, groupProject.clientId),
          ),
        ),
    shown: () => ({
      projectId: sql<string | null>`${groupProject.id}`,
      projectName: sql<string | null>`${groupProject.name}`,
      projectColor: sql<string | null>`${groupProject.color}`,
      clientId: sql<string | null>`${groupProjectClient.id}`,
      clientName: sql<string | null>`${groupProjectClient.name}`,
    }),
    groupOf: (values) => ({
      kind: "project",
      project: storedProjectOf({
        id: values.projectId,
        name: values.projectName,
        color: values.projectColor,
      }),
      client: namedRefOf({ id: values.clientId, name: values.clientName }),
    }),
  }),

  // «Sin cliente» junta las entradas sin proyecto y las de proyectos sin
  // cliente: el `left join` de adentro da `client_id` nulo en los dos casos
  // (RP-28, D-R2b-5).
  client: dimension({
    key: () => sql`${entryProject.clientId}`,
    joinInside: (query) =>
      query.leftJoin(
        entryProject,
        and(
          eq(entryProject.workspaceId, timeEntry.workspaceId),
          eq(entryProject.id, timeEntry.projectId),
        ),
      ),
    joinOutside: (query, key, workspaceId) =>
      query.leftJoin(
        groupClient,
        and(eq(groupClient.workspaceId, workspaceId), eq(groupClient.id, key)),
      ),
    shown: () => ({
      clientId: sql<string | null>`${groupClient.id}`,
      clientName: sql<string | null>`${groupClient.name}`,
    }),
    groupOf: (values) => ({
      kind: "client",
      client: namedRefOf({ id: values.clientId, name: values.clientName }),
    }),
  }),

  // «Sin tarea» junta las entradas de un proyecto sin tarea y las sin
  // proyecto; el proyecto es el de la tarea, así que con «Sin tarea» es nulo
  // (D-R3-4). Hecha o no (RP-29).
  task: dimension({
    key: () => sql`${timeEntry.taskId}`,
    joinOutside: (query, key, workspaceId) =>
      query
        .leftJoin(task, and(eq(task.workspaceId, workspaceId), eq(task.id, key)))
        .leftJoin(
          taskProject,
          and(
            eq(taskProject.workspaceId, task.workspaceId),
            eq(taskProject.id, task.projectId),
          ),
        ),
    shown: () => ({
      taskId: sql<string | null>`${task.id}`,
      taskName: sql<string | null>`${task.name}`,
      projectId: sql<string | null>`${taskProject.id}`,
      projectName: sql<string | null>`${taskProject.name}`,
      projectColor: sql<string | null>`${taskProject.color}`,
    }),
    groupOf: (values) => ({
      kind: "task",
      task: namedRefOf({ id: values.taskId, name: values.taskName }),
      project: storedProjectOf({
        id: values.projectId,
        name: values.projectName,
        color: values.projectColor,
      }),
    }),
  }),

  // D-R3-3: una entrada con `k` etiquetas da `k` filas, y una sin ninguna, una
  // fila con la etiqueta nula: «Sin etiqueta». Archivada o no (RP-29).
  tag: dimension({
    key: () => sql`${timeEntryTag.tagId}`,
    joinInside: (query) =>
      query.leftJoin(
        timeEntryTag,
        and(
          eq(timeEntryTag.workspaceId, timeEntry.workspaceId),
          eq(timeEntryTag.timeEntryId, timeEntry.id),
        ),
      ),
    joinOutside: (query, key, workspaceId) =>
      query.leftJoin(tag, and(eq(tag.workspaceId, workspaceId), eq(tag.id, key))),
    shown: () => ({
      tagId: sql<string | null>`${tag.id}`,
      tagName: sql<string | null>`${tag.name}`,
    }),
    groupOf: (values) => ({
      kind: "tag",
      tag: namedRefOf({ id: values.tagId, name: values.tagName }),
    }),
  }),

  // D-R2b-7: los cortes van una sola vez, como un parámetro, en la subconsulta
  // por entrada; los repetidos no se deduplican y el índice del tramo es la
  // posición en la lista (ADR 0021). El service rotula con `buckets`.
  date: dimension({
    key: (read) => {
      const cuts = sql.param(
        bucketsOf(read).buckets.map((bucket) => bucket.start.toISOString()),
      );
      return sql`width_bucket(${timeEntry.startedAt}, ${cuts}::timestamptz[])`;
    },
    shown: (key) => ({ bucket: sql<number>`${key}` }),
    groupOf: (values, read) => ({
      kind: "date",
      bucket: bucketIndexOf(values.bucket, bucketsOf(read).buckets.length),
    }),
  }),
};

/**
 * Los tramos de una lectura con la fecha. `checkLevelRead` ya garantizó que
 * están: si faltan es un error del módulo, no del pedido.
 */
function bucketsOf(read: ReportLevelRead): TimeBuckets {
  if (read.buckets === null) {
    throw new Error("Una lectura por fecha llegó sin sus tramos.");
  }
  return read.buckets;
}

/** Las guardas de §4.3 de R3: lanza `RangeError` antes de consultar. */
function checkLevelRead(read: ReportLevelRead): void {
  const { dimensions, buckets, span } = read;
  if (dimensions.length < 1 || dimensions.length > 3) {
    throw new RangeError(`Una lectura por niveles lleva de una a tres dimensiones.`);
  }
  if (new Set(dimensions).size !== dimensions.length) {
    throw new RangeError(`Una dimensión repetida: ${dimensions.join(", ")}.`);
  }
  if (dimensions.includes("date") !== (buckets !== null)) {
    throw new RangeError(
      "Los tramos van si y solo si la fecha es una de las dimensiones.",
    );
  }
  if (buckets === null) {
    return;
  }
  const [first] = buckets.buckets;
  if (first === undefined) {
    throw new RangeError("Una lectura por tramos necesita al menos un tramo.");
  }
  if (
    first.start.getTime() !== span.from.getTime() ||
    buckets.end.getTime() !== span.to.getTime()
  ) {
    throw new RangeError("Los tramos no cubren exactamente el intervalo de la lectura.");
  }
}

/**
 * Las lecturas del reporte. Cada función recibe primero el alcance y es una
 * sentencia: agrega sobre `time_entry` y después une los nombres a las filas
 * ya agrupadas (D-R2a-8). Sin orden: lo pone el service.
 */
export const reportRepository = {
  /**
   * Una fila por combinación de grupos con horas cerradas en `read.span`,
   * dentro de `scope`. Con la etiqueta entre las dimensiones, una entrada suma
   * en cada una de las suyas (D-R3-3). Una sentencia; sin orden.
   */
  async totalsByLevels(
    scope: ReportScope,
    read: ReportLevelRead,
    tx: Executor = db,
  ): Promise<readonly LevelTotalRow[]> {
    checkLevelRead(read);
    const levels = read.dimensions.map((groupBy, index) => ({
      dimension: DIMENSIONS[groupBy],
      name: keyName(index),
    }));

    // Adentro, una fila por entrada —o por entrada y etiqueta— con sus claves.
    // Solo las dimensiones pedidas unen sus tablas: `time_entry_tag` unida
    // siempre contaría dos veces una entrada con dos etiquetas.
    let entries: PgSelect = tx
      .select({
        workspaceId: sql`${timeEntry.workspaceId}`.as("workspace_id"),
        ...Object.fromEntries(
          levels.map(({ dimension, name }) => [name, dimension.key(read).as(name)]),
        ),
        seconds: entrySeconds.as("seconds"),
        billable: sql`${timeEntry.billable}`.as("billable"),
      })
      .from(timeEntry)
      .$dynamic();
    for (const { dimension } of levels) {
      entries = dimension.joinInside?.(entries) ?? entries;
    }

    // La medida se trunca por entrada adentro y se suma acá (ADR 0021).
    const entryKeys = levels.map(({ name }) => columnOf("entries", name));
    const totals = tx
      .select({
        workspaceId: sql`${columnOf("entries", "workspace_id")}`.as("workspace_id"),
        ...Object.fromEntries(
          levels.map(({ name }, index) => [name, sql`${entryKeys[index]}`.as(name)]),
        ),
        seconds: sql`sum(${columnOf("entries", "seconds")})::bigint`.as("seconds"),
        billableSeconds:
          sql`coalesce(sum(${columnOf("entries", "seconds")}) filter (where ${columnOf("entries", "billable")}), 0)::bigint`.as(
            "billable_seconds",
          ),
      })
      .from(entries.where(and(inScope(scope), closedIn(read.span))).as("entries"))
      .groupBy(columnOf("entries", "workspace_id"), ...entryKeys)
      .as("totals");

    // Afuera, los nombres por la clave, de uno a uno: una fila por grupo.
    const workspaceId = columnOf("totals", "workspace_id");
    let named: PgSelect = tx
      .select({
        ...Object.fromEntries(
          levels.map(({ dimension, name }, index) => [
            keyName(index),
            dimension.shown(columnOf("totals", name)),
          ]),
        ),
        seconds: sql<string>`${columnOf("totals", "seconds")}`,
        billableSeconds: sql<string>`${columnOf("totals", "billable_seconds")}`,
      })
      .from(totals)
      .$dynamic();
    for (const { dimension, name } of levels) {
      named =
        dimension.joinOutside?.(named, columnOf("totals", name), workspaceId) ?? named;
    }

    // La selección se arma por nivel, así que Drizzle no la tipa: cada nivel
    // la lee su dimensión, con el tipo de sus campos.
    const rows: readonly Readonly<Record<string, unknown>>[] = await named;
    return rows.map((row) => ({
      groups: levels.map(({ dimension, name }) =>
        dimension.groupOf(row[name] as ShownValues<Shown>, read),
      ),
      // `bigint` llega como texto de los dos drivers; `secondsOf` lanza con otra cosa.
      ...withSeconds({
        seconds: String(row.seconds),
        billableSeconds: String(row.billableSeconds),
      }),
    }));
  },

  /** El total y el facturable reales de `span`, sin unir etiquetas. Una sentencia, una fila. */
  async entryTotals(
    scope: ReportScope,
    span: ReportSpan,
    tx: Executor = db,
  ): Promise<EntryTotals> {
    const [row] = await tx
      .select({
        seconds: sql<string>`coalesce(sum(${entrySeconds}), 0)::bigint`,
        billableSeconds: sql<string>`coalesce(sum(${entrySeconds}) filter (where ${timeEntry.billable}), 0)::bigint`,
      })
      .from(timeEntry)
      .where(and(inScope(scope), closedIn(span)));
    return withSeconds(row);
  },
};

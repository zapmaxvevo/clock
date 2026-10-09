import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import {
  client,
  membership,
  project,
  timeEntry,
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

export type PersonTotalRow = {
  readonly userId: string;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  /** `user_preference.display_name`, o `null`. */
  readonly displayName: string | null;
  readonly status: MembershipStatus;
  readonly seconds: number;
  readonly billableSeconds: number;
};

export type ProjectTotalRow = {
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly color: string;
  } | null;
  readonly client: { readonly id: string; readonly name: string } | null;
  readonly seconds: number;
  readonly billableSeconds: number;
};

export type BucketTotalRow = {
  /** La posición del tramo en `buckets.buckets`, desde 0. */
  readonly bucket: number;
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

/** Las dos sumas de un grupo, como texto: `bigint` llega así de los dos drivers. */
function sums() {
  return {
    seconds: sql<string>`sum(${entrySeconds})::bigint`.as("seconds"),
    billableSeconds:
      sql<string>`coalesce(sum(${entrySeconds}) filter (where ${timeEntry.billable}), 0)::bigint`.as(
        "billable_seconds",
      ),
  };
}

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

/** Las columnas por las que agrupa un nivel. */
type GroupColumn = typeof timeEntry.userId | typeof timeEntry.projectId;

/**
 * La agregación sobre `time_entry`, una fila por `(workspace_id, column)`, con
 * el alcance y el rango. Los nombres se unen afuera, a las filas ya agrupadas.
 */
function totalsBy<Column extends GroupColumn>(
  scope: ReportScope,
  span: ReportSpan,
  column: Column,
) {
  return db
    .select({ workspaceId: timeEntry.workspaceId, key: column, ...sums() })
    .from(timeEntry)
    .where(and(inScope(scope), closedIn(span)))
    .groupBy(timeEntry.workspaceId, column)
    .as("totals");
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
    // La firma es la final; el cuerpo llega con el paso 3 de R3.
    void tx;
    throw new Error("totalsByLevels llega con el paso 3 de R3.");
  },

  /** El total y el facturable reales de `span`, sin unir etiquetas. Una sentencia, una fila. */
  async entryTotals(
    scope: ReportScope,
    span: ReportSpan,
    tx: Executor = db,
  ): Promise<EntryTotals> {
    void tx;
    throw new Error("entryTotals llega con el paso 3 de R3.");
  },

  /** Una fila por persona con horas cerradas en `span`, dentro de `scope`. Una sentencia. */
  async totalsByPerson(
    scope: ReportScope,
    span: ReportSpan,
  ): Promise<readonly PersonTotalRow[]> {
    const totals = totalsBy(scope, span, timeEntry.userId);
    const rows = await db
      .select({
        userId: totals.key,
        accountName: user.name,
        displayName: userPreference.displayName,
        status: membership.status,
        seconds: totals.seconds,
        billableSeconds: totals.billableSeconds,
      })
      .from(totals)
      // R1: toda entrada tiene membresía en su workspace.
      .innerJoin(
        membership,
        and(
          eq(membership.workspaceId, totals.workspaceId),
          eq(membership.userId, totals.key),
        ),
      )
      .innerJoin(user, eq(user.id, totals.key))
      .leftJoin(userPreference, eq(userPreference.userId, totals.key));
    return rows.map(withSeconds);
  },

  /** Una fila por proyecto, y una sin proyecto, con horas cerradas en `span`. Una sentencia. */
  async totalsByProject(
    scope: ReportScope,
    span: ReportSpan,
  ): Promise<readonly ProjectTotalRow[]> {
    const totals = totalsBy(scope, span, timeEntry.projectId);
    const rows = await db
      .select({
        project: { id: project.id, name: project.name, color: project.color },
        client: { id: client.id, name: client.name },
        seconds: totals.seconds,
        billableSeconds: totals.billableSeconds,
      })
      .from(totals)
      // RP-28: un proyecto nulo es «Sin proyecto»; RP-29: archivado o no.
      .leftJoin(
        project,
        and(eq(project.workspaceId, totals.workspaceId), eq(project.id, totals.key)),
      )
      .leftJoin(
        client,
        and(eq(client.workspaceId, project.workspaceId), eq(client.id, project.clientId)),
      );
    return rows.map(withSeconds);
  },

  /**
   * Una fila por tramo con horas cerradas, dentro de `scope`; los tramos sin
   * horas no vienen. Una sentencia (D-R2b-6, D-R2b-7).
   */
  async totalsByBucket(
    scope: ReportScope,
    buckets: TimeBuckets,
  ): Promise<readonly BucketTotalRow[]> {
    const [first] = buckets.buckets;
    if (first === undefined) {
      throw new RangeError("Una lectura por tramos necesita al menos un tramo.");
    }
    // Un solo parámetro, en un solo lugar: los cortes repetidos no se
    // deduplican, el índice del tramo es la posición en la lista (ADR 0021).
    const cuts = sql.param(buckets.buckets.map((bucket) => bucket.start.toISOString()));
    const entries = db
      .select({
        bucket:
          sql<number>`width_bucket(${timeEntry.startedAt}, ${cuts}::timestamptz[])`.as(
            "bucket",
          ),
        seconds: entrySeconds.as("seconds"),
        billable: timeEntry.billable,
      })
      .from(timeEntry)
      .where(and(inScope(scope), closedIn({ from: first.start, to: buckets.end })))
      .as("entries");
    const rows = await db
      .select({
        bucket: entries.bucket,
        seconds: sql<string>`sum(${entries.seconds})::bigint`,
        billableSeconds: sql<string>`coalesce(sum(${entries.seconds}) filter (where ${entries.billable}), 0)::bigint`,
      })
      .from(entries)
      .groupBy(entries.bucket);
    return rows.map((row) => ({
      ...withSeconds(row),
      bucket: bucketIndexOf(row.bucket, buckets.buckets.length),
    }));
  },
};

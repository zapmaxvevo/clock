import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/server/db";
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

// Solo el tipo: el alcance lo construye el service (D-R2a-1). El ciclo se borra al compilar.
import type { ReportScope } from "./service";

/** El intervalo de instantes que lee el reporte: `[from, to)`. */
export type ReportSpan = { readonly from: Date; readonly to: Date };

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

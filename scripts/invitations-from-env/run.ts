import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/server/db/schema";

import {
  describeStep,
  planFromEnv,
  splitEnvEmails,
  type EnvInvitationStep,
} from "./plan";

const { auditLog, invitation, membership, user, workspace } = schema;

const AUDIT_ACTION = "invitation.importFromEnv";

/** Su propio cliente de drizzle: `env()` exige las variables de Google. */
export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { pool, db: drizzle({ client: pool, schema }) };
}

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type RunOptions = {
  /** Los correos de `EXTERNAL_INVITE_EMAILS`, ya separados. */
  readonly emails: readonly string[];
  /** `GOOGLE_WORKSPACE_DOMAINS`, si se pasó: solo para señalar (D-E1a-4). */
  readonly domains: readonly string[];
  readonly apply: boolean;
  readonly print: (line: string) => void;
};

/** El workspace más viejo, con el criterio de `findFirstWorkspace`. */
async function oldestWorkspace(tx: Transaction) {
  const rows = await tx
    .select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .orderBy(asc(workspace.createdAt), asc(workspace.id))
    .limit(1);
  const found = rows.at(0);
  if (found === undefined) {
    throw new Error("No hay workspace: el script corre después del primer ingreso.");
  }
  return found;
}

type Plan = {
  readonly steps: readonly EnvInvitationStep[];
  /** Los textos de la variable que no son un correo: no se insertan. */
  readonly invalid: readonly string[];
};

async function readPlan(
  tx: Transaction,
  workspaceId: string,
  options: RunOptions,
): Promise<Plan> {
  const { valid, invalid } = splitEnvEmails(options.emails);
  if (valid.length === 0) {
    return { steps: [], invalid };
  }
  const email = sql<string>`lower(${user.email})`;
  const members = await tx
    .select({ email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), inArray(email, [...valid])));
  const invitations = await tx
    .select({ email: invitation.email, status: invitation.status })
    .from(invitation)
    .where(
      and(eq(invitation.workspaceId, workspaceId), inArray(invitation.email, [...valid])),
    );
  const steps = planFromEnv(
    valid,
    options.domains,
    members.map((row) => row.email),
    invitations,
  );
  return { steps, invalid };
}

/** Lo que se lee antes de decidir: los avisos y un paso por correo. */
function printPlan(plan: Plan, options: RunOptions): void {
  const { print } = options;
  if (options.domains.length === 0) {
    print(
      "Aviso: sin GOOGLE_WORKSPACE_DOMAINS no se señalan los correos del dominio, " +
        "que sin hd dejan de entrar por la variable (D-E1a-4). Pasala para revisar el plan.",
    );
  }
  print(`Correos en la variable: ${plan.steps.length}`);
  plan.steps.forEach((step) => print(describeStep(step)));
  if (plan.invalid.length > 0) {
    print(`Descartados, no son un correo: ${plan.invalid.length}`);
    plan.invalid.forEach((text) => print(`  ${text}`));
  }
}

/**
 * Inserta las filas del plan y una constancia por cada una, sin actor: no la
 * origina una sesión. `on conflict do nothing`: una fila que alguien creó desde
 * la pantalla mientras corría el script se queda como está, sin constancia.
 */
async function applyPlan(
  tx: Transaction,
  workspaceId: string,
  steps: readonly EnvInvitationStep[],
): Promise<number> {
  const rows = steps.flatMap((step) =>
    step.kind === "create"
      ? [
          {
            workspaceId,
            email: step.email,
            status: step.status,
            acceptedAt: step.status === "accepted" ? sql`now()` : null,
          },
        ]
      : [],
  );
  if (rows.length === 0) {
    return 0;
  }
  const inserted = await tx
    .insert(invitation)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: invitation.id, email: invitation.email, status: invitation.status });
  if (inserted.length > 0) {
    await tx.insert(auditLog).values(
      inserted.map((row) => ({
        workspaceId,
        actorId: null,
        action: AUDIT_ACTION,
        entity: "invitation",
        entityId: row.id,
        nextValue: JSON.stringify({ email: row.email, status: row.status }),
      })),
    );
  }
  return inserted.length;
}

/**
 * Lee e imprime el plan; con `apply`, lo escribe. Todo en una transacción, de
 * solo lectura en seco. Devuelve cuántas filas creó.
 */
export async function runInvitationsFromEnv(
  db: Database,
  options: RunOptions,
): Promise<number> {
  return db.transaction(
    async (tx) => {
      const target = await oldestWorkspace(tx);
      const plan = await readPlan(tx, target.id, options);
      const { print } = options;
      print(`Workspace: ${target.name} (${target.id})`);
      printPlan(plan, options);
      const pending = plan.steps.filter((step) => step.kind === "create").length;
      if (!options.apply) {
        print(`En seco: se crearían ${pending} filas. Con --apply se escriben.`);
        return 0;
      }
      const created = await applyPlan(tx, target.id, plan.steps);
      print(`Se crearon ${created} filas de invitation, con su constancia.`);
      return created;
    },
    { accessMode: options.apply ? "read write" : "read only" },
  );
}

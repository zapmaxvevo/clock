import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { sql, TransactionRollbackError } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import {
  CHECK_VIOLATION,
  constraintOf,
  UNIQUE_VIOLATION,
} from "@/server/db/constraint-error";
import { auditLog, invitation } from "@/server/db/schema";
import { seedInvitation, seedMember, seedWorkspace } from "@/test/factories";
import { invitationOf } from "@/test/queries";

/**
 * La tabla `invitation` y sus migraciones (contrato de E1a, §2, criterio 20, y
 * de E1b, §2, criterio 15). La base, escrita de forma directa: los `check`
 * son la última defensa.
 */

/** El SQL de la migración `tag`, que tiene que estar en el diario. */
async function migrationSql(tag: string): Promise<string> {
  const journal = JSON.parse(
    await readFile(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  if (!journal.entries.some((entry) => entry.tag === tag)) {
    throw new Error(`El diario no tiene la migración ${tag}.`);
  }
  return readFile(join(process.cwd(), "drizzle", `${tag}.sql`), "utf8");
}

const migrationTag = "0015_invitation";

/** La primera sentencia de la 0015: el bloque que corta antes de borrar. */
async function guardStatement(): Promise<string> {
  const migration = await migrationSql(migrationTag);
  const [guard] = migration.split("--> statement-breakpoint");
  if (!guard.includes("external_invite tiene filas")) {
    throw new Error(`La ${migrationTag} no empieza por el bloque que corta.`);
  }
  return guard;
}

/** El error de una escritura que la base tiene que rechazar. */
async function rejection(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("La base aceptó la escritura.");
}

/**
 * Corre el bloque sobre una `external_invite` recreada, con o sin una fila, en
 * una transacción que siempre se deshace: la tabla ya no existe en la base de
 * test.
 */
async function runGuard(withRow: boolean): Promise<unknown> {
  const guard = await guardStatement();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`create table external_invite (email text not null)`);
      if (withRow) {
        await tx.execute(
          sql`insert into external_invite (email) values ('ana@gmail.com')`,
        );
      }
      await tx.execute(sql.raw(guard));
      tx.rollback();
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) {
      return "passed";
    }
    return error;
  }
  throw new Error("La transacción no se deshizo.");
}

let workspaceId: string;

beforeEach(async () => {
  ({ workspaceId } = await seedWorkspace());
});

describe("la migración 0015 (criterio 20)", () => {
  it("corta si external_invite tiene filas", async () => {
    const outcome = await runGuard(true);

    expect(outcome).toBeInstanceOf(Error);
    expect(String((outcome as Error).cause ?? outcome)).toMatch(
      /external_invite tiene filas/,
    );
  });

  it("sigue si external_invite está vacía", async () => {
    expect(await runGuard(false)).toBe("passed");
  });
});

describe("los check de invitation (criterio 20)", () => {
  it("rechaza un correo con mayúsculas o con blancos", async () => {
    for (const email of ["Ana@gmail.com", " ana@gmail.com"]) {
      const error = await rejection(db.insert(invitation).values({ workspaceId, email }));
      expect(constraintOf(error, CHECK_VIOLATION)).toBe("invitation_email_normalized");
    }
  });

  it("rechaza un correo de menos de 3 o más de 320 caracteres", async () => {
    for (const email of ["a@", `${"a".repeat(321 - "@gmail.com".length)}@gmail.com`]) {
      const error = await rejection(db.insert(invitation).values({ workspaceId, email }));
      expect(constraintOf(error, CHECK_VIOLATION)).toBe("invitation_email_len");
    }
  });

  it("rechaza accepted sin accepted_at, y accepted_at en otro estado", async () => {
    const withoutDate = await rejection(
      db
        .insert(invitation)
        .values({ workspaceId, email: "a@gmail.com", status: "accepted" }),
    );
    expect(constraintOf(withoutDate, CHECK_VIOLATION)).toBe("invitation_accepted_at");

    const dateWhilePending = await rejection(
      db
        .insert(invitation)
        .values({ workspaceId, email: "b@gmail.com", acceptedAt: new Date() }),
    );
    expect(constraintOf(dateWhilePending, CHECK_VIOLATION)).toBe(
      "invitation_accepted_at",
    );
  });

  it("rechaza revoked sin revoked_at, y revoked_at en otro estado", async () => {
    const withoutDate = await rejection(
      db
        .insert(invitation)
        .values({ workspaceId, email: "a@gmail.com", status: "revoked" }),
    );
    expect(constraintOf(withoutDate, CHECK_VIOLATION)).toBe("invitation_revoked_at");

    const dateWhilePending = await rejection(
      db
        .insert(invitation)
        .values({ workspaceId, email: "b@gmail.com", revokedAt: new Date() }),
    );
    expect(constraintOf(dateWhilePending, CHECK_VIOLATION)).toBe("invitation_revoked_at");
  });

  it("deja una sola fila por workspace y correo, en cualquier estado", async () => {
    await seedInvitation({ workspaceId, email: "ana@gmail.com", status: "revoked" });

    const error = await rejection(
      db.insert(invitation).values({ workspaceId, email: "ana@gmail.com" }),
    );
    expect(constraintOf(error, UNIQUE_VIOLATION)).toBe("invitation_workspace_email_unq");
  });
});

describe("la migración 0016 (D-E1b-6, criterio 15)", () => {
  async function runMigration() {
    const migration = await migrationSql("0016_invitation_accept_members");
    // Una sola sentencia: la 0016 no tiene cortes.
    expect(migration).not.toContain("--> statement-breakpoint");
    await db.execute(sql.raw(migration));
  }

  it("acepta las pendientes cuyo correo tiene membresía en su workspace, con su constancia sin actor", async () => {
    const plain = await seedInvitation({ workspaceId, email: "ana@empresa.com" });
    const messy = await seedInvitation({ workspaceId, email: "leo@gmail.com" });
    await seedMember(workspaceId, "member", "active", { email: "ana@empresa.com" });
    // El correo de `user` con mayúsculas y blancos: compara normalizado.
    await seedMember(workspaceId, "member", "active", { email: "  Leo@Gmail.COM " });

    await runMigration();

    for (const [seeded, email] of [
      [plain, "ana@empresa.com"],
      [messy, "leo@gmail.com"],
    ] as const) {
      const row = await invitationOf(workspaceId, email);
      expect(row).toMatchObject({ id: seeded.id, status: "accepted", revokedAt: null });
      expect(row?.acceptedAt).toBeInstanceOf(Date);
    }
    const audits = await db.select().from(auditLog);
    // `json_build_object` escribe el texto con otros blancos que `JSON.stringify`.
    expect(
      audits
        .map((audit) => ({
          workspaceId: audit.workspaceId,
          actorId: audit.actorId,
          action: audit.action,
          entity: audit.entity,
          entityId: audit.entityId,
          previousValue: JSON.parse(audit.previousValue ?? "null") as unknown,
          nextValue: JSON.parse(audit.nextValue ?? "null") as unknown,
        }))
        .sort((left, right) => left.entityId.localeCompare(right.entityId)),
    ).toEqual(
      [plain.id, messy.id].sort().map((id) => ({
        workspaceId,
        actorId: null,
        action: "invitation.acceptBackfill",
        entity: "invitation",
        entityId: id,
        previousValue: { status: "pending" },
        nextValue: { status: "accepted" },
      })),
    );
  });

  it("no toca una pendiente sin membresía, ni una de otro workspace, ni una aceptada o revocada", async () => {
    const other = await seedWorkspace();
    const untouched = [
      await seedInvitation({ workspaceId, email: "nadie@empresa.com" }),
      // Membresía en el workspace de prueba, invitación en el otro.
      await seedInvitation({ workspaceId: other.workspaceId, email: "ana@empresa.com" }),
      await seedInvitation({ workspaceId, email: "acc@empresa.com", status: "accepted" }),
      await seedInvitation({ workspaceId, email: "rev@empresa.com", status: "revoked" }),
    ];
    await seedMember(workspaceId, "member", "active", { email: "ana@empresa.com" });
    await seedMember(workspaceId, "member", "active", { email: "acc@empresa.com" });
    await seedMember(workspaceId, "member", "active", { email: "rev@empresa.com" });

    await runMigration();

    expect(await db.select().from(invitation).orderBy(invitation.id)).toEqual(
      [...untouched].sort((left, right) => left.id.localeCompare(right.id)),
    );
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});

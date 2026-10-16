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
import { invitation } from "@/server/db/schema";
import { seedInvitation, seedWorkspace } from "@/test/factories";

/**
 * La tabla `invitation` y su migración (contrato de E1a, §2, criterio 20). La
 * base, escrita de forma directa: los `check` son la última defensa.
 */

const migrationTag = "0015_invitation";

/** La primera sentencia de la 0015: el bloque que corta antes de borrar. */
async function guardStatement(): Promise<string> {
  const journal = JSON.parse(
    await readFile(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  if (!journal.entries.some((entry) => entry.tag === migrationTag)) {
    throw new Error(`El diario no tiene la migración ${migrationTag}.`);
  }
  const migration = await readFile(
    join(process.cwd(), "drizzle", `${migrationTag}.sql`),
    "utf8",
  );
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

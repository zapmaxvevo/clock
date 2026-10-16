import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { seedMember, seedUser, seedWorkspace } from "@/test/factories";
import { testDatabaseUrl } from "@/test/database-url";
import { auditFor, emailOf, invitationsOf } from "@/test/queries";

import { createDatabase, runInvitationsFromEnv } from "./run";

/** El script de la variable contra la base de test (criterio 19). */

const { pool, db } = createDatabase(testDatabaseUrl);

afterAll(async () => {
  await pool.end();
});

let workspaceId: string;
let memberEmail: string;
let lines: string[];

beforeEach(async () => {
  ({ workspaceId } = await seedWorkspace());
  memberEmail = await emailOf(await seedMember(workspaceId, "member"));
  lines = [];
});

function run(
  apply: boolean,
  emails: readonly string[],
  domains: readonly string[] = ["empresa.com"],
) {
  return runInvitationsFromEnv(db, {
    emails,
    domains,
    apply,
    print: (line) => lines.push(line),
  });
}

describe("runInvitationsFromEnv", () => {
  it("en seco imprime el plan y no escribe", async () => {
    const created = await run(false, [memberEmail.toUpperCase(), "nueva@gmail.com"]);

    expect(created).toBe(0);
    expect(await invitationsOf(workspaceId)).toEqual([]);
    expect(await auditFor("invitation")).toEqual([]);
    expect(lines.join("\n")).toMatch(
      /se crea accepted\s+\S+@empresa\.com\s+¡del dominio!/,
    );
    expect(lines.join("\n")).toMatch(/se crea pending\s+nueva@gmail\.com/);
  });

  it("con --apply crea accepted para quien tiene membresía y pending para quien no, con su constancia; la segunda corrida no escribe", async () => {
    const created = await run(true, [memberEmail, "Nueva@Gmail.com", "nueva@gmail.com"]);

    expect(created).toBe(2);
    const rows = await invitationsOf(workspaceId);
    expect(
      rows.map((row) => ({
        email: row.email,
        status: row.status,
        invitedById: row.invitedById,
        accepted: row.acceptedAt !== null,
      })),
    ).toEqual(
      [
        { email: memberEmail, status: "accepted", invitedById: null, accepted: true },
        {
          email: "nueva@gmail.com",
          status: "pending",
          invitedById: null,
          accepted: false,
        },
      ].sort((left, right) => left.email.localeCompare(right.email)),
    );
    const audits = await auditFor("invitation");
    expect(
      audits.map((audit) => ({
        action: audit.action,
        actorId: audit.actorId,
        workspaceId: audit.workspaceId,
        next: JSON.parse(audit.nextValue ?? "null") as unknown,
      })),
    ).toEqual(
      expect.arrayContaining(
        rows.map((row) => ({
          action: "invitation.importFromEnv",
          actorId: null,
          workspaceId,
          next: { email: row.email, status: row.status },
        })),
      ),
    );
    expect(audits).toHaveLength(2);

    const again = await run(true, [memberEmail, "nueva@gmail.com"]);

    expect(again).toBe(0);
    expect(await invitationsOf(workspaceId)).toEqual(rows);
    expect(await auditFor("invitation")).toHaveLength(2);
    expect(lines.join("\n")).toMatch(/ya existe \(pending\)\s+nueva@gmail\.com/);
  });

  it("no inserta los textos que no son un correo y los lista", async () => {
    const created = await run(true, ["ana.gmail.com", "nueva@gmail.com", "leo@"]);

    expect(created).toBe(1);
    expect((await invitationsOf(workspaceId)).map((row) => row.email)).toEqual([
      "nueva@gmail.com",
    ]);
    const output = lines.join("\n");
    expect(output).toMatch(
      /Descartados, no son un correo: 2\n {2}ana\.gmail\.com\n {2}leo@/,
    );
  });

  it("sin dominios avisa que no puede señalar los correos del dominio", async () => {
    await run(false, [memberEmail], []);

    expect(lines.join("\n")).toMatch(/Aviso: sin GOOGLE_WORKSPACE_DOMAINS/);
    expect(lines.join("\n")).not.toMatch(/¡del dominio!/);
  });

  it("con dominios no avisa", async () => {
    await run(false, [memberEmail]);

    expect(lines.join("\n")).not.toMatch(/Aviso/);
  });

  it("escribe en el workspace más viejo", async () => {
    const newer = await seedWorkspace();

    await run(true, ["nueva@gmail.com"]);

    expect(await invitationsOf(newer.workspaceId)).toEqual([]);
    expect(await invitationsOf(workspaceId)).toHaveLength(1);
  });
});

describe("sin workspace", () => {
  it("sale con error sin escribir", async () => {
    const { truncateAll } = await import("@/test/database");
    await truncateAll();
    await seedUser();

    await expect(run(true, ["nueva@gmail.com"])).rejects.toThrow("No hay workspace");
  });
});

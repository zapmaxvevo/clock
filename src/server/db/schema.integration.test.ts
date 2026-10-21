import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { CHECK_VIOLATION, constraintOf } from "@/server/db/constraint-error";
import { workspace, workspaceSettings } from "@/server/db/schema";
import { seedWorkspace } from "@/test/factories";

/** Las columnas de `table` en la base, en el orden en que la tabla las guarda. */
async function columnsOf(table: string): Promise<string[]> {
  const result = await db.execute(
    sql`select column_name from information_schema.columns
        where table_schema = 'public' and table_name = ${table}
        order by ordinal_position`,
  );
  return result.rows.map((row) => (row as { column_name: string }).column_name);
}

describe("las columnas sin efecto, borradas en la 0018 (WS0, criterio 5)", () => {
  it.each([
    ["workspace", ["logo_url", "currency"]],
    [
      "workspace_settings",
      [
        "who_sees_rates",
        "who_creates_projects",
        "require_project",
        "require_task",
        "require_description",
        "require_tag",
        "force_timer",
        "timesheet_enabled",
        "rounding_minutes",
      ],
    ],
    ["membership", ["weekly_capacity_minutes"]],
  ])("%s ya no tiene %j", async (table, dropped) => {
    const columns = await columnsOf(table);
    expect(columns).not.toHaveLength(0);
    expect(columns.filter((column) => dropped.includes(column))).toEqual([]);
  });

  it("workspace_settings queda con su clave, who_sees_all_entries, las fechas y duration_format (0019)", async () => {
    expect(await columnsOf("workspace_settings")).toEqual([
      "workspace_id",
      "who_sees_all_entries",
      "created_at",
      "updated_at",
      "duration_format",
    ]);
  });

  it("el tipo visibility_scope sigue, porque lo usa who_sees_all_entries", async () => {
    const result = await db.execute(
      sql`select typname from pg_type where typname = 'visibility_scope'`,
    );
    expect(result.rows).toEqual([{ typname: "visibility_scope" }]);
  });
});

/**
 * El error de una escritura que la base tiene que rechazar. Local: la reversión
 * de WS2a conserva este archivo (§2.3 de su contrato), así que importa solo lo
 * que había antes de WS2a.
 */
async function rejection(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("La base aceptó la escritura.");
}

async function durationFormatOf(workspaceId: string): Promise<string | undefined> {
  const rows = await db
    .select({ durationFormat: workspaceSettings.durationFormat })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId));
  return rows.at(0)?.durationFormat;
}

describe("workspace_settings.duration_format, de la 0019 (WS2a, criterios 5 y 11)", () => {
  it("es text, not null y compact por omisión", async () => {
    const result = await db.execute(
      sql`select data_type, column_default, is_nullable
          from information_schema.columns
          where table_schema = 'public' and table_name = 'workspace_settings'
            and column_name = 'duration_format'`,
    );
    expect(result.rows).toEqual([
      { data_type: "text", column_default: "'compact'::text", is_nullable: "NO" },
    ]);
  });

  it("una fila nueva queda en compact", async () => {
    const { workspaceId } = await seedWorkspace();
    expect(await durationFormatOf(workspaceId)).toBe("compact");
  });

  it("acepta compact y full", async () => {
    const { workspaceId } = await seedWorkspace();
    for (const durationFormat of ["full", "compact"]) {
      await db
        .update(workspaceSettings)
        .set({ durationFormat })
        .where(eq(workspaceSettings.workspaceId, workspaceId));
      expect(await durationFormatOf(workspaceId)).toBe(durationFormat);
    }
  });

  it("rechaza un valor fuera de lista con su check", async () => {
    const { workspaceId } = await seedWorkspace();
    const error = await rejection(
      db.execute(
        sql`update workspace_settings set duration_format = 'decimal'
            where workspace_id = ${workspaceId}`,
      ),
    );
    expect(constraintOf(error, CHECK_VIOLATION)).toBe(
      "workspace_settings_duration_format_known",
    );
    expect(await durationFormatOf(workspaceId)).toBe("compact");
  });
});

describe("los check de workspace.name, de la 0019 (WS2a, D-WS2a-10, criterio 11)", () => {
  async function nameOf(workspaceId: string): Promise<string | undefined> {
    const rows = await db
      .select({ name: workspace.name })
      .from(workspace)
      .where(eq(workspace.id, workspaceId));
    return rows.at(0)?.name;
  }

  it.each([
    ["vacío", "", "workspace_name_len"],
    ["de 101 caracteres", "a".repeat(101), "workspace_name_len"],
    ["con un blanco adelante", " x", "workspace_name_trimmed"],
    ["con un blanco atrás", "x ", "workspace_name_trimmed"],
  ])("rechaza un nombre %s", async (_case, name, constraint) => {
    const { workspaceId } = await seedWorkspace();

    const error = await rejection(
      db.update(workspace).set({ name }).where(eq(workspace.id, workspaceId)),
    );

    expect(constraintOf(error, CHECK_VIOLATION)).toBe(constraint);
    expect(await nameOf(workspaceId)).toBe("Workspace de prueba");
  });

  it("acepta un nombre de 1 y de 100 caracteres, con blancos en el medio", async () => {
    const { workspaceId } = await seedWorkspace();

    for (const name of ["x", "a".repeat(100), "run0km", "Mi workspace"]) {
      await db.update(workspace).set({ name }).where(eq(workspace.id, workspaceId));
      expect(await nameOf(workspaceId)).toBe(name);
    }
  });

  it("cuenta caracteres y no bytes", async () => {
    const { workspaceId } = await seedWorkspace();
    const name = "ñ".repeat(100);

    await db.update(workspace).set({ name }).where(eq(workspace.id, workspaceId));

    expect(await nameOf(workspaceId)).toBe(name);
  });
});

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { CHECK_VIOLATION, constraintOf } from "@/server/db/constraint-error";
import { workspaceSettings } from "@/server/db/schema";
import { DURATION_FORMATS } from "@/server/time";
import { seedWorkspace, setDurationFormat } from "@/test/factories";

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

/** El error de una escritura que la base tiene que rechazar. */
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

  it("acepta cada valor de DURATION_FORMATS", async () => {
    const { workspaceId } = await seedWorkspace();
    for (const format of DURATION_FORMATS) {
      await setDurationFormat(workspaceId, format);
      expect(await durationFormatOf(workspaceId)).toBe(format);
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

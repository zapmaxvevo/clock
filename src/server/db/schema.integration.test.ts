import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";

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

  it("workspace_settings queda con su clave, who_sees_all_entries y las fechas", async () => {
    expect(await columnsOf("workspace_settings")).toEqual([
      "workspace_id",
      "who_sees_all_entries",
      "created_at",
      "updated_at",
    ]);
  });

  it("el tipo visibility_scope sigue, porque lo usa who_sees_all_entries", async () => {
    const result = await db.execute(
      sql`select typname from pg_type where typname = 'visibility_scope'`,
    );
    expect(result.rows).toEqual([{ typname: "visibility_scope" }]);
  });
});

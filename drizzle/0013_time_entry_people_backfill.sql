-- Lo que drizzle-kit no puede expresar. Contrato de R1 del núcleo de reportes,
-- §2.1. Cada persona con horas en un workspace donde no tiene membresía recibe
-- una, con su constancia, antes de que la 0014 cree la clave compuesta
-- validada: inactiva, salvo el owner del workspace. ADR 0020, condición cuarta.
WITH "inserted" AS (
  INSERT INTO "membership" ("workspace_id", "user_id", "role", "status")
  SELECT "missing"."workspace_id", "missing"."user_id", "missing"."role", "missing"."status"
  FROM (
    SELECT DISTINCT
      "time_entry"."workspace_id",
      "time_entry"."user_id",
      CASE WHEN "workspace"."owner_id" = "time_entry"."user_id"
        THEN 'owner'::"workspace_role" ELSE 'member'::"workspace_role" END AS "role",
      CASE WHEN "workspace"."owner_id" = "time_entry"."user_id"
        THEN 'active'::"membership_status" ELSE 'inactive'::"membership_status" END AS "status"
    FROM "time_entry"
    INNER JOIN "workspace" ON "workspace"."id" = "time_entry"."workspace_id"
    WHERE NOT EXISTS (
      SELECT 1 FROM "membership"
      WHERE "membership"."workspace_id" = "time_entry"."workspace_id"
        AND "membership"."user_id" = "time_entry"."user_id"
    )
  ) AS "missing"
  ON CONFLICT ("workspace_id", "user_id") DO NOTHING
  RETURNING "id", "workspace_id", "user_id", "role", "status"
)
INSERT INTO "audit_log" ("workspace_id", "actor_id", "action", "entity", "entity_id", "next_value")
SELECT "workspace_id", NULL, 'membership.backfill', 'membership', "id"::text,
  json_build_object('userId', "user_id", 'role', "role", 'status', "status")::text
FROM "inserted";

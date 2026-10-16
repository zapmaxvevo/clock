-- Lo que drizzle-kit no puede expresar. Contrato de E1b de la fase 2, §2 y
-- D-E1b-6. Una invitación pendiente cuyo correo ya tiene membresía en su
-- workspace pasa a aceptada, con su constancia: desde E1b, una pendiente da
-- acceso, y la de quien ya está le dejaría volver si se la quita (EQ-51).
WITH "accepted" AS (
  UPDATE "invitation"
  SET "status" = 'accepted', "accepted_at" = now(), "updated_at" = now()
  WHERE "invitation"."status" = 'pending'
    AND EXISTS (
      SELECT 1
      FROM "membership"
      INNER JOIN "user" ON "user"."id" = "membership"."user_id"
      WHERE "membership"."workspace_id" = "invitation"."workspace_id"
        AND lower(btrim("user"."email")) = "invitation"."email"
    )
  RETURNING "invitation"."id", "invitation"."workspace_id"
)
INSERT INTO "audit_log" ("workspace_id", "actor_id", "action", "entity", "entity_id", "previous_value", "next_value")
SELECT "workspace_id", NULL, 'invitation.acceptBackfill', 'invitation', "id"::text,
  json_build_object('status', 'pending')::text,
  json_build_object('status', 'accepted')::text
FROM "accepted";

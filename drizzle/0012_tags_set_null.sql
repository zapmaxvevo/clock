-- Lo que drizzle-kit no puede expresar. Contrato del slice 11, §2.2. La clave
-- de quien creó la etiqueta pasa a la forma con lista de columnas (Postgres
-- 15): sin la lista, el borrado de la membresía intentaría anular también
-- `workspace_id`, que no admite nulos. Conserva el nombre, así el próximo
-- `db:generate` no ve diferencias con `schema.ts`.
ALTER TABLE "tag" DROP CONSTRAINT "tag_created_by_fk";--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE SET NULL ("created_by") ON UPDATE NO ACTION;

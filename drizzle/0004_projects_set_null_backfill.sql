-- Lo que drizzle-kit no puede expresar. Contrato del slice 9, §2.2 y §2.5.
-- Las cuatro claves con `set null` pasan a la forma con lista de columnas
-- (Postgres 15): sin la lista, el borrado intentaría anular también
-- `workspace_id`, que no admite nulos. Conservan el nombre, así el próximo
-- `db:generate` no ve diferencias con `schema.ts`.
ALTER TABLE "project" DROP CONSTRAINT "project_client_fk";--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."client"("workspace_id","id") ON DELETE SET NULL ("client_id") ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT "client_created_by_fk";--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE SET NULL ("created_by") ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_created_by_fk";--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE SET NULL ("created_by") ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "task" DROP CONSTRAINT "task_created_by_fk";--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE SET NULL ("created_by") ON UPDATE NO ACTION;--> statement-breakpoint
-- P-18, PR-59: ninguna pantalla pudo cambiar el valor; `admins` era el valor
-- por omisión anterior, no la elección de alguien.
UPDATE "workspace_settings" SET "who_creates_projects" = 'everyone';

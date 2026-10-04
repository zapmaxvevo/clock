-- Lo que drizzle-kit no puede expresar. Contrato del slice 10, §2.1.
-- Las dos claves de `time_entry` pasan a la forma con lista de columnas
-- (Postgres 15): sin la lista, el borrado intentaría anular también
-- `workspace_id`, que no admite nulos. Conservan el nombre, así el próximo
-- `db:generate` no ve diferencias con `schema.ts`.
ALTER TABLE "time_entry" DROP CONSTRAINT "time_entry_project_fk";--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE SET NULL ("project_id") ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "time_entry" DROP CONSTRAINT "time_entry_task_fk";--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_task_fk" FOREIGN KEY ("workspace_id","project_id","task_id") REFERENCES "public"."task"("workspace_id","project_id","id") ON DELETE SET NULL ("task_id") ON UPDATE NO ACTION;

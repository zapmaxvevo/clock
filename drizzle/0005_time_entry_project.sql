ALTER TABLE "time_entry" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_task_fk" FOREIGN KEY ("workspace_id","project_id","task_id") REFERENCES "public"."task"("workspace_id","project_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entry_workspace_project_task_idx" ON "time_entry" USING btree ("workspace_id","project_id","task_id") WHERE "time_entry"."project_id" is not null;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_task_needs_project" CHECK ("time_entry"."task_id" is null or "time_entry"."project_id" is not null);
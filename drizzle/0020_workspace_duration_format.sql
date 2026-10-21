ALTER TABLE "workspace_settings" ADD COLUMN "duration_format" text DEFAULT 'compact' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_len" CHECK (char_length("workspace"."name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_trimmed" CHECK ("workspace"."name" = btrim("workspace"."name"));--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_duration_format_known" CHECK ("workspace_settings"."duration_format" in ('compact', 'full'));
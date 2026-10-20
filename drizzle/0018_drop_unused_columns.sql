ALTER TABLE "membership" DROP COLUMN "weekly_capacity_minutes";--> statement-breakpoint
ALTER TABLE "workspace" DROP COLUMN "logo_url";--> statement-breakpoint
ALTER TABLE "workspace" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "who_sees_rates";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "who_creates_projects";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_project";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_task";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_description";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_tag";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "force_timer";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "timesheet_enabled";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "rounding_minutes";
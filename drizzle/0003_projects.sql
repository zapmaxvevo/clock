CREATE TYPE "public"."task_status" AS ENUM('active', 'done');--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_workspace_id_unq" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_name_len" CHECK (char_length("client"."name") between 1 and 100),
	CONSTRAINT "client_name_trimmed" CHECK ("client"."name" = btrim("client"."name")),
	CONSTRAINT "client_address_len" CHECK (char_length("client"."address") <= 3000),
	CONSTRAINT "client_note_len" CHECK (char_length("client"."note") <= 3000)
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"billable_by_default" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_workspace_id_unq" UNIQUE("workspace_id","id"),
	CONSTRAINT "project_name_len" CHECK (char_length("project"."name") between 1 and 100),
	CONSTRAINT "project_name_trimmed" CHECK ("project"."name" = btrim("project"."name")),
	CONSTRAINT "project_note_len" CHECK (char_length("project"."note") <= 3000),
	CONSTRAINT "project_color_palette" CHECK ("project"."color" in ('red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'))
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"is_manager" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_member_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "task_status" DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_workspace_id_unq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_workspace_project_id_unq" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "task_name_len" CHECK (char_length("task"."name") between 1 and 100),
	CONSTRAINT "task_name_trimmed" CHECK ("task"."name" = btrim("task"."name"))
);
--> statement-breakpoint
CREATE TABLE "task_assignee" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignee_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "who_creates_projects" SET DEFAULT 'everyone';--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."client"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."task"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_name_unq" ON "client" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "project_name_unq" ON "project" USING btree ("workspace_id",coalesce("client_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "project_workspace_client_idx" ON "project" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "project_member_workspace_user_idx" ON "project_member" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_name_unq" ON "task" USING btree ("workspace_id","project_id",lower("name"));--> statement-breakpoint
CREATE INDEX "task_assignee_workspace_user_idx" ON "task_assignee" USING btree ("workspace_id","user_id");
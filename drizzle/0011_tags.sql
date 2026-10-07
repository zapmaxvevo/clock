CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_workspace_id_unq" UNIQUE("workspace_id","id"),
	CONSTRAINT "tag_name_len" CHECK (char_length("tag"."name") between 1 and 100),
	CONSTRAINT "tag_name_trimmed" CHECK ("tag"."name" = btrim("tag"."name"))
);
--> statement-breakpoint
CREATE TABLE "time_entry_tag" (
	"workspace_id" uuid NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "time_entry_tag_time_entry_id_tag_id_pk" PRIMARY KEY("time_entry_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tag" ADD CONSTRAINT "time_entry_tag_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tag" ADD CONSTRAINT "time_entry_tag_entry_fk" FOREIGN KEY ("workspace_id","time_entry_id") REFERENCES "public"."time_entry"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tag" ADD CONSTRAINT "time_entry_tag_tag_fk" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "public"."tag"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_name_unq" ON "tag" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "time_entry_tag_workspace_tag_idx" ON "time_entry_tag" USING btree ("workspace_id","tag_id");
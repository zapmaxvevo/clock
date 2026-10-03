CREATE TABLE "time_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entry_end_after_start" CHECK ("time_entry"."ended_at" is null or "time_entry"."ended_at" >= "time_entry"."started_at"),
	CONSTRAINT "time_entry_description_len" CHECK (char_length("time_entry"."description") <= 3000)
);
--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entry_running_unq" ON "time_entry" USING btree ("workspace_id","user_id") WHERE "time_entry"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "time_entry_workspace_user_started_idx" ON "time_entry" USING btree ("workspace_id","user_id","started_at" DESC NULLS LAST);
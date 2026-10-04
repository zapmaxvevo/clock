CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text,
	"time_format" text,
	"date_format" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preference_timezone_len" CHECK (char_length("user_preference"."timezone") between 1 and 64),
	CONSTRAINT "user_preference_time_format_known" CHECK ("user_preference"."time_format" in ('24h', '12h')),
	CONSTRAINT "user_preference_date_format_known" CHECK ("user_preference"."date_format" in ('dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'))
);
--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
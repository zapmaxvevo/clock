ALTER TABLE "user_preference" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_display_name_len" CHECK (char_length("user_preference"."display_name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_theme_known" CHECK ("user_preference"."theme" in ('system', 'light', 'dark'));
ALTER TABLE "time_entry" DROP CONSTRAINT "time_entry_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
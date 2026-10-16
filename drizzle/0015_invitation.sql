-- Retocada a mano: contrato de E1a, §2. `invitation` reemplaza a
-- `external_invite`, que el código nunca escribió; una fila escrita a mano no
-- se pierde en silencio: la migración corta antes de borrarla.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "external_invite") THEN
    RAISE EXCEPTION 'external_invite tiene filas: migrarlas a mano antes de seguir';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by_id" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_workspace_email_unq" UNIQUE("workspace_id","email"),
	CONSTRAINT "invitation_email_normalized" CHECK ("invitation"."email" = lower(btrim("invitation"."email"))),
	CONSTRAINT "invitation_email_len" CHECK (char_length("invitation"."email") between 3 and 320),
	CONSTRAINT "invitation_accepted_at" CHECK (("invitation"."status" = 'accepted') = ("invitation"."accepted_at" is not null)),
	CONSTRAINT "invitation_revoked_at" CHECK (("invitation"."status" = 'revoked') = ("invitation"."revoked_at" is not null))
);
--> statement-breakpoint
DROP TABLE "external_invite" CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_revoked_by_id_user_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE TYPE "public"."board_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "board_invite" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"role" "board_role" NOT NULL,
	"token_hash" text NOT NULL,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "board_invite_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "board_invite_role_not_owner" CHECK ("board_invite"."role" != 'owner'),
	CONSTRAINT "board_invite_use_count_non_negative" CHECK ("board_invite"."use_count" >= 0),
	CONSTRAINT "board_invite_max_uses_positive" CHECK ("board_invite"."max_uses" IS NULL OR "board_invite"."max_uses" > 0)
);
--> statement-breakpoint
ALTER TABLE "board" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refresh_token" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "snapshot" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "default_role" "board_role" DEFAULT 'editor' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_invite" ADD CONSTRAINT "board_invite_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_invite" ADD CONSTRAINT "board_invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_invite_board_id_idx" ON "board_invite" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "snapshot_board_id_idx" ON "snapshot" USING btree ("board_id");--> statement-breakpoint
ALTER TABLE "board" ADD CONSTRAINT "board_default_role_not_owner" CHECK ("board"."default_role" != 'owner');
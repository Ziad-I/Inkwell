CREATE TYPE "public"."draw_permission" AS ENUM('owner', 'anyone');--> statement-breakpoint
CREATE TABLE "board" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'Untitled Board' NOT NULL,
	"draw_permission" "draw_permission" DEFAULT 'anyone' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
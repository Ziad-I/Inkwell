DROP INDEX "snapshot_board_id_idx";--> statement-breakpoint
ALTER TABLE "refresh_token" ADD COLUMN "rotation_grace_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "snapshot_board_id_created_at_idx" ON "snapshot" USING btree ("board_id","created_at");
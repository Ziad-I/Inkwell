ALTER TABLE "snapshot" DROP CONSTRAINT "snapshot_board_id_board_id_fk";
--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE no action;
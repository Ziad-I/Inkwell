import { defineEntity, type InferEntity, p } from "@mikro-orm/core";
import { BoardSchema } from "@/db/entities/board.js";
import type { BoardState } from "@/types/types.js";

export const SnapshotSchema = defineEntity({
  name: "Snapshot",
  properties: {
    id: p.uuid().primary(),
    board: p.manyToOne(BoardSchema),
    state: p.json<BoardState>(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export type Snapshot = InferEntity<typeof SnapshotSchema>;

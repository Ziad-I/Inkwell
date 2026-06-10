import { db } from "@/db/index.js";
import { BoardSchema } from "@/db/entities/board.js";
import { SnapshotSchema } from "@/db/entities/snapshot.js";
import type { BoardState } from "@/types/types.js";
import { getBoardState } from "@/services/state.js";

export async function writeBoardSnapshot(roomId: string) {
  const state = await getBoardState(roomId);
  if (!state) return;
  await saveSnapshot(roomId, state);
}

export async function saveSnapshot(roomId: string, state: BoardState) {
  const snapshot = db.em.create(SnapshotSchema, {
    board: db.em.getReference(BoardSchema, roomId),
    state: state,
  });
  await db.em.flush();
  return snapshot;
}

export async function getLatestSnapshot(roomId: string) {
  const snapshot = await db.em.findOne(
    SnapshotSchema,
    { board: { id: roomId } },
    { orderBy: { createdAt: "DESC" } },
  );
  return snapshot?.state || null;
}

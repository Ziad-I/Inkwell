import { db } from "@/db/index.js";
import { snapshots } from "@/db/schema.js";
import { eq, desc } from "drizzle-orm";
import type { BoardState } from "@/types/types.js";
import { getBoardState } from "@/services/state.js";

export async function writeBoardSnapshot(roomId: string) {
  const state = await getBoardState(roomId);
  if (!state || Object.keys(state).length === 0) return;
  await saveSnapshot(roomId, state);
}

export async function saveSnapshot(roomId: string, state: BoardState) {
  const result = await db
    .insert(snapshots)
    .values({ boardId: roomId, state })
    .returning();
  return result[0]!;
}

export async function getLatestSnapshot(roomId: string) {
  const result = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.boardId, roomId))
    .orderBy(desc(snapshots.createdAt))
    .limit(1);
  return result[0]?.state ?? null;
}

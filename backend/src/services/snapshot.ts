import { db } from "@/db/index.js";
import { snapshots } from "@/db/schema.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { BoardState } from "@/types/types.js";
import { getBoardState } from "@/services/state.js";
import { env } from "@/config/config.js";

/**
 * Retention is gated behind a cheap indexed count(*) — the ordered
 * delete subquery only runs once the board is actually over budget.
 */
async function pruneSnapshots(roomId: string) {
  const counts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(snapshots)
    .where(eq(snapshots.boardId, roomId))
    .limit(1);

  const excess = (counts[0]?.count ?? 0) - env.SNAPSHOT_RETENTION;
  if (excess <= 0) return;

  const stale = db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(eq(snapshots.boardId, roomId))
    .orderBy(desc(snapshots.createdAt))
    .offset(env.SNAPSHOT_RETENTION);

  await db
    .delete(snapshots)
    .where(and(eq(snapshots.boardId, roomId), inArray(snapshots.id, stale)));
}

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
  await pruneSnapshots(roomId);
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

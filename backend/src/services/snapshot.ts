import { db } from "@/db/index.js";
import { snapshots } from "@/db/schema.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import logger from "@/config/logger.js";
import type { BoardState } from "@/types/types.js";
import { getBoardState } from "@/services/state.js";
import { env } from "@/config/config.js";

/**
 * Retention is gated behind a cheap indexed count(*) — the ordered
 * delete subquery only runs once the board is actually over budget.
 *
 * Requires: index on snapshots.boardId (for the count),
 * ideally composite (boardId, createdAt desc) for the offset query.
 */
async function pruneSnapshots(roomId: string) {
  if (env.SNAPSHOT_RETENTION <= 0) return;

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
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
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

  try {
    await pruneSnapshots(roomId);
  } catch (err) {
    logger.error(`Failed to prune snapshots for room ${roomId}: ${err}`);
  }

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

import { randomUUID } from "node:crypto";
import { db } from "@/db/index.js";
import { boards } from "@/db/schema.js";
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { initBoardState } from "@/services/state.js";
import { getLatestSnapshot, saveSnapshot } from "@/services/snapshot.js";
import { type BoardRole } from "@/types/types.js";

export async function getBoardById(roomId: string) {
  const result = await db
    .select()
    .from(boards)
    .where(eq(boards.id, roomId))
    .limit(1);
  return result[0] ?? null;
}

export async function createBoard(
  name: string,
  ownerId: string,
  defaultRole: BoardRole = "editor",
) {
  const result = await db
    .insert(boards)
    .values({ title: name, ownerId, defaultRole })
    .returning();
  return result[0]!;
}

/**
 * Creates an ephemeral, Redis-only room for anonymous users. No row is
 * written to Postgres: the room lives for as long as someone is connected
 * and is destroyed by the last-user-leave cleanup.
 */
export async function createEphemeralRoom(): Promise<{ id: string }> {
  const roomId = randomUUID();
  await initBoardState(roomId, {});
  return { id: roomId };
}

export async function updateBoard(
  roomId: string,
  updates: Partial<{
    title: string;
    archivedAt: Date | null;
  }>,
) {
  const setValues = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  ) as Partial<typeof boards.$inferInsert>;

  if (Object.keys(setValues).length === 0) return;

  await db
    .update(boards)
    .set({ ...setValues, updatedAt: new Date() })
    .where(eq(boards.id, roomId));
}

/**
 * Lists boards owned by `ownerId`, newest activity first. Archived boards are
 * excluded unless explicitly requested — they stay reachable by direct link
 * but are hidden from the default dashboard list.
 */
export async function listBoardsByOwner(
  ownerId: string,
  status: "active" | "archived" = "active",
) {
  const archivedFilter =
    status === "archived"
      ? isNotNull(boards.archivedAt)
      : isNull(boards.archivedAt);

  const result = await db
    .select()
    .from(boards)
    .where(and(eq(boards.ownerId, ownerId), archivedFilter))
    .orderBy(desc(boards.updatedAt));
  return result;
}

/**
 * Clones a board (title suffixed with "(Copy)") plus its latest persisted
 * snapshot. Invite links are intentionally not copied: a duplicate is a
 * fresh board with no shares. Live Redis state is not copied either.
 */
export async function duplicateBoard(boardId: string) {
  const source = await getBoardById(boardId);
  if (!source) return null;

  const copy = await createBoard(
    `${source.title} (Copy)`,
    source.ownerId,
    source.defaultRole,
  );

  const latestState = await getLatestSnapshot(boardId);
  if (latestState) await saveSnapshot(copy.id, latestState);

  return copy;
}

export async function archiveBoard(roomId: string) {
  await updateBoard(roomId, { archivedAt: new Date() });
}

export async function restoreBoard(roomId: string) {
  await updateBoard(roomId, { archivedAt: null });
}

export async function deleteBoard(roomId: string) {
  await db.delete(boards).where(eq(boards.id, roomId));
}

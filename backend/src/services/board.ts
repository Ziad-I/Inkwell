import { randomUUID } from "node:crypto";
import { db } from "@/db/index.js";
import { boards } from "@/db/schema.js";
import { eq } from "drizzle-orm";
import { initBoardState } from "@/services/state.js";
import { BoardRole } from "@/types/types.js";

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

export async function deleteBoard(roomId: string) {
  await db.delete(boards).where(eq(boards.id, roomId));
}

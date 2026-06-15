import { db } from "@/db/index.js";
import { boards } from "@/db/schema.js";
import { eq } from "drizzle-orm";
import type { DrawPermission } from "@/types/types.js";

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
  drawPermission: DrawPermission,
) {
  const result = await db
    .insert(boards)
    .values({ title: name, drawPermission })
    .returning();
  return result[0]!;
}

export async function updateBoard(
  roomId: string,
  updates: Partial<{
    title: string;
    drawPermission: DrawPermission;
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

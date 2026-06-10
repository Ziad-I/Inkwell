import { db } from "@/db/index.js";
import { BoardSchema } from "@/db/entities/board.js";
import type { DrawPermission } from "@/types/types.js";

export async function getBoardById(roomId: string) {
  const board = await db.em.findOne(BoardSchema, {
    id: roomId,
  });
  return board;
}

export async function createBoard(
  name: string,
  drawPermission: DrawPermission,
) {
  const board = db.em.create(BoardSchema, {
    title: name,
    drawPermission,
  });
  await db.em.flush();
  return board;
}

export async function updateBoard(
  roomId: string,
  updates: Partial<{
    title: string;
    drawPermission: DrawPermission;
  }>,
) {
  const board = db.em.getReference(BoardSchema, roomId);
  board.title = updates.title ?? board.title;
  board.drawPermission = updates.drawPermission ?? board.drawPermission;
  await db.em.flush();
}

export async function deleteBoard(roomId: string) {
  const board = db.em.getReference(BoardSchema, roomId);
  await db.em.remove(board).flush();
}

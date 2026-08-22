import type { Request, Response } from "express";
import {
  archiveBoard as archiveBoardService,
  createBoard as createBoardService,
  createEphemeralRoom,
  deleteBoard as deleteBoardService,
  duplicateBoard as duplicateBoardService,
  getBoardById,
  listBoardsByOwner,
  restoreBoard as restoreBoardService,
  updateBoard as updateBoardService,
} from "@/services/board.js";
import { isRoomInitialized } from "@/services/state.js";
import { z } from "zod";
import { BoardRoles } from "@/types/types.js";
import type { Board } from "@/db/schema.js";

const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  defaultRole: z
    .enum(BoardRoles)
    .optional()
    .default("editor")
    .refine((role) => role !== "owner", {
      message: "Cannot create a board with owner role",
    }),
});

const renameBoardSchema = z.object({
  title: z.string().min(1).max(100),
});

const listBoardsSchema = z.object({
  status: z.enum(["active", "archived"]).default("active"),
});

export async function createBoard(req: Request, res: Response) {
  const result = createBoardSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.format() });
    return;
  }
  const { name, defaultRole } = result.data;

  // Authenticated users get a durable, persisted board owned by their account.
  if (req.userId) {
    const board = await createBoardService(name, req.userId, defaultRole);
    res.status(201).json({ id: board.id });
    return;
  }

  // Anonymous users get an ephemeral Redis-only room with no DB row.
  const room = await createEphemeralRoom();
  res.status(201).json({ id: room.id });
}

export async function getBoard(req: Request, res: Response) {
  const { roomId } = req.params as { roomId: string };

  if (!roomId) {
    res.status(400).json({ message: "Room ID is required" });
    return;
  }
  const board = await getBoardById(roomId);
  if (board) {
    res.status(200).json(board);
    return;
  }
  // No persisted board: fall back to a Redis existence check so ephemeral
  // (anonymous) rooms still validate for the join flow.
  if (await isRoomInitialized(roomId)) {
    res.status(200).json({ id: roomId });
    return;
  }
  res.status(404).json({ message: "Board not found" });
}

/**
 * Resolves the board and enforces ownership. Responds and returns null when
 * the board is missing or the caller is not the owner.
 */
async function requireOwnedBoard(
  req: Request,
  res: Response,
  action: string,
): Promise<Board | null> {
  const { boardId } = req.params as { boardId: string };
  const board = await getBoardById(boardId);
  if (!board) {
    res.status(404).json({ message: "Board not found" });
    return null;
  }
  if (!req.userId || board.ownerId !== req.userId) {
    res.status(403).json({ message: `Only the board owner can ${action}` });
    return null;
  }
  return board;
}

export async function listBoards(req: Request, res: Response) {
  if (!req.userId) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const result = listBoardsSchema.safeParse(req.query);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.flatten() });
    return;
  }

  const boardsList = await listBoardsByOwner(req.userId, result.data.status);
  res.status(200).json({ boards: boardsList });
}

export async function renameBoard(req: Request, res: Response) {
  const board = await requireOwnedBoard(req, res, "rename this board");
  if (!board) return;

  const result = renameBoardSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.flatten() });
    return;
  }

  await updateBoardService(board.id, { title: result.data.title });
  res.status(204).send();
}

export async function duplicateBoard(req: Request, res: Response) {
  const board = await requireOwnedBoard(req, res, "duplicate this board");
  if (!board) return;

  const copy = await duplicateBoardService(board.id);
  res.status(201).json({ id: copy!.id });
}

export async function archiveBoard(req: Request, res: Response) {
  const board = await requireOwnedBoard(req, res, "archive this board");
  if (!board) return;

  await archiveBoardService(board.id);
  res.status(204).send();
}

export async function restoreBoard(req: Request, res: Response) {
  const board = await requireOwnedBoard(req, res, "restore this board");
  if (!board) return;

  await restoreBoardService(board.id);
  res.status(204).send();
}

export async function deleteBoard(req: Request, res: Response) {
  const board = await requireOwnedBoard(req, res, "delete this board");
  if (!board) return;

  await deleteBoardService(board.id);
  res.status(204).send();
}

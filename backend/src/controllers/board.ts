import type { Request, Response } from "express";
import {
  createBoard as createBoardService,
  createEphemeralRoom,
  getBoardById,
} from "@/services/board.js";
import { isRoomInitialized } from "@/services/state.js";
import { z } from "zod";
import { BoardRoles } from "@/types/types.js";

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

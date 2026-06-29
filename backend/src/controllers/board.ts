import type { Request, Response } from "express";
import {
  createBoard as createBoardService,
  getBoardById,
} from "@/services/board.js";
import { z } from "zod";
import { DrawPermissions } from "@/types/types.js";

const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  drawPermission: z.enum(DrawPermissions).optional().default("anyone"),
});

export async function createBoard(req: Request, res: Response) {
  const result = createBoardSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.format() });
    return;
  }
  const { name, userId, drawPermission } = result.data;
  const board = await createBoardService(name, userId, drawPermission);
  res.status(201).json({ id: board.id });
}

export async function getBoard(req: Request, res: Response) {
  const { roomId } = req.params as { roomId: string };

  if (!roomId) {
    res.status(400).json({ message: "Room ID is required" });
    return;
  }
  const board = await getBoardById(roomId);
  if (!board) {
    res.status(404).json({ message: "Board not found" });
    return;
  }
  res.status(200).json(board);
}

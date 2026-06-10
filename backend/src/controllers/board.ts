import type { Request, Response } from "express";
import {
  createBoard as createBoardService,
  getBoardById,
} from "@/services/board.js";

export async function createBoard(req: Request, res: Response) {
  const { name, drawPermission } = req.body;
  const board = await createBoardService(name, drawPermission);
  res.status(201).json(board);
}

export async function getBoard(req: Request, res: Response) {
  const { roomId } = req.params;
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

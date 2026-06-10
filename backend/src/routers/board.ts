import { Router } from "express";
import { createBoard, getBoard } from "@/controllers/board.js";

const router = Router();

router.post("/", createBoard);
router.get("/:roomId", getBoard);

export default router;

import { Router } from "express";
import { createBoard, getBoard } from "@/controllers/board.js";
import { optionalAuth } from "@/middlewares/auth.js";

const router = Router();

router.post("/", optionalAuth, createBoard);
router.get("/:roomId", getBoard);

export default router;

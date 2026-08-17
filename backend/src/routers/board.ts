import { Router } from "express";
import { createBoard, getBoard } from "@/controllers/board.js";
import {
  clearBoardAccess,
  createBoardInvite,
  revokeBoardInvite,
} from "@/controllers/invites.js";
import { optionalAuth, requireAuth } from "@/middlewares/auth.js";

const router = Router();

router.post("/", optionalAuth, createBoard);
router.get("/:roomId", getBoard);
router.post("/:boardId/invites", requireAuth, createBoardInvite);
router.delete("/:boardId/invites/:inviteId", requireAuth, revokeBoardInvite);
router.delete("/:boardId/access", clearBoardAccess);

export default router;
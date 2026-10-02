import { Router } from "express";
import {
  archiveBoard,
  createBoard,
  deleteBoard,
  duplicateBoard,
  getBoard,
  listBoards,
  renameBoard,
  restoreBoard,
} from "@/controllers/board.js";
import {
  clearBoardAccess,
  createBoardInvite,
  revokeBoardInvite,
} from "@/controllers/invites.js";
import { optionalAuth, requireAuth } from "@/middlewares/auth.js";

const router = Router();

router.post("/", optionalAuth, createBoard);
// The list changes whenever boards are created/archived elsewhere, so the
// browser must never serve or revalidate a cached copy of this response.
router.get(
  "/",
  requireAuth,
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
  listBoards,
);
router.get("/:roomId", getBoard);

router.patch("/:boardId", requireAuth, renameBoard);
router.patch("/:boardId/archive", requireAuth, archiveBoard);
router.patch("/:boardId/restore", requireAuth, restoreBoard);
router.post("/:boardId/duplicate", requireAuth, duplicateBoard);
router.delete("/:boardId", requireAuth, deleteBoard);

router.post("/:boardId/invites", requireAuth, createBoardInvite);
router.delete("/:boardId/invites/:inviteId", requireAuth, revokeBoardInvite);
router.delete("/:boardId/access", clearBoardAccess);

export default router;
import type { Request, Response } from "express";
import { z } from "zod";
import { getBoardById } from "@/services/board.js";
import {
  createInvite,
  getInviteById,
  getInviteByToken,
  redeemInvite,
  revokeInvite,
} from "@/services/invites.js";
import { getBoardAccessCookieName } from "@/utils/cookies.js";
import { env } from "@/config/config.js";
import { BoardRoles } from "@/types/types.js";

const createInviteSchema = z.object({
  role: z
    .enum(BoardRoles)
    .default("editor")
    .refine((role) => role !== "owner", {
      message: "Cannot create an invite with owner role",
    }),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

const redeemSchema = z.object({
  token: z.string().min(1),
});

function setBoardAccessCookie(
  res: Response,
  boardId: string,
  rawToken: string,
) {
  res.cookie(getBoardAccessCookieName(boardId), rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production" ? true : false,
    sameSite: "lax",
    path: "/",
  });
}

export async function createBoardInvite(req: Request, res: Response) {
  const { boardId } = req.params as { boardId: string };

  const board = await getBoardById(boardId);
  if (!board) {
    res.status(404).json({ message: "Board not found" });
    return;
  }
  if (!req.userId || board.ownerId !== req.userId) {
    res
      .status(403)
      .json({ message: "Only the board owner can create invites" });
    return;
  }

  const result = createInviteSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.flatten() });
    return;
  }
  const { role, expiresAt, maxUses } = result.data;

  const { rawToken } = await createInvite({
    boardId,
    createdBy: req.userId,
    role,
    ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
    maxUses: maxUses ?? null,
  });

  res.status(201).json({ token: rawToken });
}

export async function redeemBoardInvite(req: Request, res: Response) {
  const result = redeemSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.flatten() });
    return;
  }

  const redeemed = await redeemInvite(result.data.token);
  if (!redeemed) {
    res.status(400).json({ message: "Invite is not redeemable" });
    return;
  }

  setBoardAccessCookie(res, redeemed.boardId, result.data.token);
  res.status(200).json({ boardId: redeemed.boardId });
}

export async function getBoardInvite(req: Request, res: Response) {
  const { token } = req.params as { token: string };

  const invite = await getInviteByToken(token);
  if (!invite) {
    res.status(404).json({ message: "Invite not found" });
    return;
  }

  const expired =
    invite.expiresAt !== null && invite.expiresAt.getTime() <= Date.now();

  const exhausted =
    invite.maxUses !== null && invite.useCount >= invite.maxUses;

  const valid = invite.revokedAt === null && !expired && !exhausted;

  res.status(200).json({
    boardId: invite.boardId,
    role: invite.role,
    boardName: invite.boardName,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    valid,
  });
}

export async function revokeBoardInvite(req: Request, res: Response) {
  const { boardId, inviteId } = req.params as {
    boardId: string;
    inviteId: string;
  };

  const board = await getBoardById(boardId);
  if (!board) {
    res.status(404).json({ message: "Board not found" });
    return;
  }
  if (!req.userId || board.ownerId !== req.userId) {
    res
      .status(403)
      .json({ message: "Only the board owner can revoke invites" });
    return;
  }

  const invite = await getInviteById(inviteId);
  if (!invite || invite.boardId !== boardId) {
    res.status(404).json({ message: "Invite not found" });
    return;
  }

  await revokeInvite(inviteId);
  res.status(204).send();
}

export async function clearBoardAccess(req: Request, res: Response) {
  const { boardId } = req.params as { boardId: string };

  res.clearCookie(getBoardAccessCookieName(boardId), { path: "/" });
  res.status(204).send();
}

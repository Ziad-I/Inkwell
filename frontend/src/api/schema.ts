import { z } from "zod";

import type { AuthUser } from "@/types/auth";
import type { BoardSummary } from "@/types/boards";
import type { InviteInfo } from "@/types/invite";

const idSchema = z.string().trim().min(1).max(128);
const isoDatetimeSchema = z.iso.datetime();

const authUserSchema = z.strictObject({
  id: idSchema,
  username: z.string().max(50),
  email: z.email().max(254),
});

export const authSessionResponseSchema: z.ZodType<{
  user: AuthUser;
  accessToken: string;
}> = z.strictObject({
  user: authUserSchema,
  accessToken: z.string().min(1).max(8_192),
});

export const inviteInfoResponseSchema: z.ZodType<InviteInfo> = z.strictObject({
  boardId: idSchema,
  boardName: z.string().max(100),
  role: z.enum(["editor", "viewer"]),
  expiresAt: isoDatetimeSchema.nullable(),
  valid: z.boolean(),
});

export const inviteRedeemResponseSchema: z.ZodType<{ boardId: string }> =
  z.strictObject({
    boardId: idSchema,
  });

export const inviteCreateResponseSchema: z.ZodType<{ token: string }> =
  z.strictObject({
    token: z.string().min(16).max(512),
  });

export const boardReferenceResponseSchema: z.ZodType<{ id: string }> =
  z.strictObject({
    id: idSchema,
  });

const boardSummarySchema = z.strictObject({
  id: idSchema,
  title: z.string().max(100),
  ownerId: idSchema,
  defaultRole: z.enum(["editor", "viewer"]),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
  archivedAt: isoDatetimeSchema.nullable(),
});

export const boardListResponseSchema: z.ZodType<{ boards: BoardSummary[] }> =
  z.strictObject({
    boards: z.array(boardSummarySchema).max(1_000),
  });

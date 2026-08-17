import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { boardInvites, type BoardInvite } from "@/db/schema.js";
import { hashToken } from "@/services/auth.js";
import type { BoardRole } from "@/types/types.js";

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createInvite(input: {
  boardId: string;
  createdBy: string;
  role: "editor" | "viewer";
  expiresAt?: Date;
  maxUses?: number | null;
}): Promise<{ id: string; rawToken: string }> {
  const rawToken = generateInviteToken();

  const rows = await db
    .insert(boardInvites)
    .values({
      boardId: input.boardId,
      createdBy: input.createdBy,
      role: input.role,
      tokenHash: hashToken(rawToken),
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses ?? null,
    })
    .returning({ id: boardInvites.id });

  return { id: rows[0]!.id, rawToken };
}

/**
 * Atomically redeems an invite. The conditional UPDATE both validates
 * (not revoked, not expired, uses remaining) and increments use_count in a
 * single statement, so concurrent redemptions cannot exceed max_uses.
 */
export async function redeemInvite(rawToken: string): Promise<{
  boardId: string;
  role: BoardRole;
} | null> {
  const rows = await db
    .update(boardInvites)
    .set({ useCount: sql`${boardInvites.useCount} + 1` })
    .where(
      and(
        eq(boardInvites.tokenHash, hashToken(rawToken)),
        isNull(boardInvites.revokedAt),
        or(
          isNull(boardInvites.expiresAt),
          gt(boardInvites.expiresAt, new Date()),
        ),
        or(
          isNull(boardInvites.maxUses),
          lt(boardInvites.useCount, boardInvites.maxUses),
        ),
      ),
    )
    .returning({ boardId: boardInvites.boardId, role: boardInvites.role });

  return rows[0] ?? null;
}

/**
 * Validates a bearer token for ongoing access (Socket.IO path). Deliberately
 * does NOT check use_count: a user who already redeemed keeps their access
 * after the invite's uses are exhausted.
 */
export async function validateInviteToken(rawToken: string): Promise<{
  boardId: string;
  role: BoardRole;
} | null> {
  const rows = await db
    .select({ boardId: boardInvites.boardId, role: boardInvites.role })
    .from(boardInvites)
    .where(
      and(
        eq(boardInvites.tokenHash, hashToken(rawToken)),
        isNull(boardInvites.revokedAt),
        or(
          isNull(boardInvites.expiresAt),
          gt(boardInvites.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getInviteByToken(
  rawToken: string,
): Promise<BoardInvite | null> {
  const rows = await db
    .select()
    .from(boardInvites)
    .where(eq(boardInvites.tokenHash, hashToken(rawToken)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getInviteById(
  inviteId: string,
): Promise<{ boardId: string } | null> {
  const rows = await db
    .select({ boardId: boardInvites.boardId })
    .from(boardInvites)
    .where(eq(boardInvites.id, inviteId))
    .limit(1);

  return rows[0] ?? null;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await db
    .update(boardInvites)
    .set({ revokedAt: new Date() })
    .where(eq(boardInvites.id, inviteId));
}
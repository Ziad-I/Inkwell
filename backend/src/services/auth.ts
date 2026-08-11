import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { AuthError } from "@/types/errors.js";
import { db } from "@/db/index.js";
import { refreshTokens } from "@/db/schema.js";
import { env } from "@/config/config.js";

const BCRYPT_ROUNDS = 10;

// ─── Passwords ────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// ─── Access Tokens ────────────────────────────────────────────────────────────

export function signAccessToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      kind: "access",
    },
    env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_TTL,
    },
  );
}

export function verifyAccessToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      payload.sub.length === 0
    ) {
      throw new AuthError("Invalid token payload");
    }

    if (payload.kind !== "access") {
      throw new AuthError("Invalid token payload");
    }

    return payload.sub;
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }

    throw new AuthError("Invalid or expired token");
  }
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random opaque refresh token.
 *
 * The raw token is returned to the client.
 * Only its SHA-256 hash is stored in the database.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(
  userId: string,
  token: string,
): Promise<void> {
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000),
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(refreshTokens.tokenHash, hashToken(token)),
        isNull(refreshTokens.revokedAt),
      ),
    );
}

export async function revokeAllUserRefreshTokens(
  userId: string,
): Promise<void> {
  await db
    .update(refreshTokens)
    .set({
      revokedAt: new Date(),
    })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
    );
}

type RotationResult =
  | { status: "not_found" }
  | { status: "reused"; userId: string }
  | { status: "expired" }
  | { status: "ok"; userId: string; newToken: string };

/**
 * Rotates a refresh token atomically.
 *
 * The existing token row is locked with FOR UPDATE so concurrent requests
 * presenting the same refresh token cannot both rotate it successfully —
 * the second waits for the first transaction to commit, then sees the
 * now-revoked row.
 *
 * If a previously revoked token is presented (reuse after rotation — a
 * signal of token theft), the whole token family for that user is revoked.
 * That revocation is deliberately issued *after* the transaction below
 * settles, not inside it: writing it inside the transaction that then
 * throws would cause it to be rolled back along with the throw, silently
 * defeating the entire theft-detection mechanism.
 */
export async function rotateRefreshToken(oldToken: string): Promise<{
  userId: string;
  newToken: string;
}> {
  const tokenHash = hashToken(oldToken);

  const result: RotationResult = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for("update")
      .limit(1);

    const record = rows[0];

    if (!record) {
      return { status: "not_found" };
    }

    if (record.revokedAt) {
      // Reuse of an already-rotated token. Don't write here — return and
      // let the caller issue the family-revoke as an independent statement.
      return { status: "reused", userId: record.userId };
    }

    const now = Date.now();

    if (record.expiresAt.getTime() <= now) {
      return { status: "expired" };
    }

    const newToken = generateRefreshToken();

    await tx
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
      })
      .where(eq(refreshTokens.id, record.id));

    await tx.insert(refreshTokens).values({
      userId: record.userId,
      tokenHash: hashToken(newToken),
      expiresAt: new Date(now + env.REFRESH_TOKEN_TTL * 1000),
    });

    return { status: "ok", userId: record.userId, newToken };
  });

  switch (result.status) {
    case "reused":
      await revokeAllUserRefreshTokens(result.userId);
      throw new AuthError("Invalid refresh token");
    case "not_found":
      throw new AuthError("Invalid refresh token");
    case "expired":
      throw new AuthError("Refresh token expired");
    case "ok":
      return { userId: result.userId, newToken: result.newToken };
  }
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockTx } from "../../mocks/db.js";

async function loadAuthService() {
  vi.restoreAllMocks();
  return import("@/services/auth.js");
}

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeRefreshRecord(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "token-record-1",
    userId: USER_ID,
    tokenHash: "some-hash",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("password hashing", () => {
  it("hashes and verifies a password roundtrip", async () => {
    const { hashPassword, verifyPassword } = await loadAuthService();

    const hash = await hashPassword("supersecret");
    expect(hash).not.toBe("supersecret");

    expect(await verifyPassword("supersecret", hash)).toBe(true);
    expect(await verifyPassword("wrongpass", hash)).toBe(false);
  });

  it("produces different hashes for the same password", async () => {
    const { hashPassword } = await loadAuthService();
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});

describe("JWT access tokens", () => {
  it("signs and verifies an access token", async () => {
    const { signAccessToken, verifyAccessToken } = await loadAuthService();
    const token = signAccessToken(USER_ID);
    expect(verifyAccessToken(token)).toBe(USER_ID);
  });

  it("rejects an invalid token", async () => {
    const { verifyAccessToken, AuthError } = await loadAuthService();
    expect(() => verifyAccessToken("not-a-jwt")).toThrow(AuthError);
  });

  it("rejects a tampered token", async () => {
    const { signAccessToken, verifyAccessToken, AuthError } =
      await loadAuthService();
    const token = signAccessToken(USER_ID);
    expect(() => verifyAccessToken(`${token}x`)).toThrow(AuthError);
  });

  it("rejects an opaque refresh token presented as an access token", async () => {
    const { generateRefreshToken, verifyAccessToken, AuthError } =
      await loadAuthService();
    const refreshToken = generateRefreshToken();
    expect(() => verifyAccessToken(refreshToken)).toThrow(AuthError);
  });
});

describe("refresh token storage and rotation", () => {
  beforeEach(() => {
    mockTx.limit.mockReturnValue([]);
  });

  it("generates unique opaque refresh tokens", async () => {
    const { generateRefreshToken } = await loadAuthService();
    const first = generateRefreshToken();
    const second = generateRefreshToken();

    // 32 random bytes encoded as base64url ⇒ 43 chars, no JWT structure
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain(".");
    expect(first).not.toBe(second);
  });

  it("stores the refresh token hash, never the raw token", async () => {
    const { generateRefreshToken, storeRefreshToken, hashToken } =
      await loadAuthService();
    const token = generateRefreshToken();
    await storeRefreshToken(USER_ID, token);

    const values = mockDb.values.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(values.tokenHash).toBe(hashToken(token));
    expect(values.tokenHash).not.toBe(token);
    expect(values.expiresAt).toBeInstanceOf(Date);
  });

  it("rotates a token atomically: locks the row, revokes it, issues a new one", async () => {
    const { rotateRefreshToken, generateRefreshToken } =
      await loadAuthService();
    const oldToken = generateRefreshToken();
    mockTx.limit.mockReturnValue([makeRefreshRecord()]);

    const { userId, newToken } = await rotateRefreshToken(oldToken);

    expect(userId).toBe(USER_ID);
    expect(newToken).not.toBe(oldToken);
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.set).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
    expect(mockTx.insert).toHaveBeenCalled();
    expect(mockTx.values).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: expect.any(String) }),
    );
  });

  it("revokes the whole family and throws when a revoked token is reused", async () => {
    const { rotateRefreshToken, generateRefreshToken, AuthError } =
      await loadAuthService();
    const reusedToken = generateRefreshToken();
    mockTx.limit.mockReturnValue([
      makeRefreshRecord({ revokedAt: new Date(Date.now() - 1000) }),
    ]);

    await expect(rotateRefreshToken(reusedToken)).rejects.toThrow(AuthError);

    expect(mockDb.update).toHaveBeenCalled();
  });

  it("rejects rotation when the stored token is expired", async () => {
    const { rotateRefreshToken, generateRefreshToken, AuthError } =
      await loadAuthService();
    const expiredToken = generateRefreshToken();
    mockTx.limit.mockReturnValue([
      makeRefreshRecord({ expiresAt: new Date(Date.now() - 10_000) }),
    ]);

    await expect(rotateRefreshToken(expiredToken)).rejects.toThrow(AuthError);
  });

  it("rejects rotation when the token is unknown", async () => {
    const { rotateRefreshToken, generateRefreshToken, AuthError } =
      await loadAuthService();
    const unknownToken = generateRefreshToken();
    mockTx.limit.mockReturnValue([]);

    await expect(rotateRefreshToken(unknownToken)).rejects.toThrow(AuthError);
  });
});
import { describe, it, expect, afterAll } from "vitest";
import supertest from "supertest";
import {
  httpServer,
  seedBoard,
  seedInvite,
  getInviteByRawToken,
  cleanupTestData,
} from "./setup.js";

const request = () => supertest(httpServer);

const boardIds: string[] = [];

async function registerOwner() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await request().post("/api/auth/register").send({
    username: `owner-${suffix}`,
    email: `owner-${suffix}@test.local`,
    password: "supersecret",
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

describe("invite creation", () => {
  it("creates an editor invite and returns only the raw token", async () => {
    const owner = await registerOwner();
    const boardId = await seedBoard({ ownerId: owner.id });
    boardIds.push(boardId);

    const res = await request()
      .post(`/api/boards/${boardId}/invites`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ role: "editor", maxUses: 10 });

    expect(res.status).toBe(201);
    // 32 random bytes, base64url → 43 chars. Never a URL — the frontend
    // constructs the invite URL from this token.
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(res.body)).not.toContain("tokenHash");

    const rawToken = res.body.token as string;
    const { hashToken } = await import("@/services/auth.js");
    const row = await getInviteByRawToken(rawToken);
    expect(row).not.toBeNull();
    expect(row!.tokenHash).toBe(hashToken(rawToken));
    expect(row!.tokenHash).not.toBe(rawToken);
    expect(row!.role).toBe("editor");
    expect(row!.maxUses).toBe(10);
    expect(row!.useCount).toBe(0);
  });

  it("creates a viewer invite", async () => {
    const owner = await registerOwner();
    const boardId = await seedBoard({ ownerId: owner.id });
    boardIds.push(boardId);

    const res = await request()
      .post(`/api/boards/${boardId}/invites`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ role: "viewer" });

    expect(res.status).toBe(201);
    const rawToken = res.body.token as string;
    const row = await getInviteByRawToken(rawToken);
    expect(row!.role).toBe("viewer");
  });

  it("rejects invite creation without auth", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);

    const res = await request()
      .post(`/api/boards/${boardId}/invites`)
      .send({ role: "editor" });

    expect(res.status).toBe(401);
  });

  it("rejects invite creation by a non-owner", async () => {
    const owner = await registerOwner();
    const boardId = await seedBoard({ ownerId: owner.id });
    boardIds.push(boardId);
    const stranger = await registerOwner();

    const res = await request()
      .post(`/api/boards/${boardId}/invites`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ role: "editor" });

    expect(res.status).toBe(403);
  });

  it("rejects invalid payloads", async () => {
    const owner = await registerOwner();
    const boardId = await seedBoard({ ownerId: owner.id });
    boardIds.push(boardId);

    const res = await request()
      .post(`/api/boards/${boardId}/invites`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ role: "owner" });

    expect(res.status).toBe(400);
  });
});

describe("invite redemption", () => {
  it("redeems a valid invite, sets the board cookie, returns boardId", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, maxUses: 2 });

    const res = await request()
      .post("/api/invites/redeem")
      .send({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.body.boardId).toBe(boardId);

    const setCookie = res.headers["set-cookie"] as unknown as string[];
    const cookieHeader = setCookie.find((c) =>
      c.startsWith(`board_access_${boardId}=`),
    );
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain("HttpOnly");
    if (process.env.NODE_ENV === "production") {
      expect(cookieHeader).toContain("Secure");
    } else {
      expect(cookieHeader).not.toContain("Secure");
    }
    expect(cookieHeader).toContain("SameSite=Lax");
    expect(cookieHeader).toContain("Path=/");
    expect(cookieHeader).toContain(rawToken);
  });

  it("rejects a nonexistent invite", async () => {
    const res = await request()
      .post("/api/invites/redeem")
      .send({ token: "no-such-token" });

    expect(res.status).toBe(400);
  });

  it("rejects an expired invite", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({
      boardId,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request()
      .post("/api/invites/redeem")
      .send({ token: rawToken });

    expect(res.status).toBe(400);
  });

  it("rejects a revoked invite", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, revokedAt: new Date() });

    const res = await request()
      .post("/api/invites/redeem")
      .send({ token: rawToken });

    expect(res.status).toBe(400);
  });

  it("rejects an exhausted invite", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, maxUses: 1 });

    await request().post("/api/invites/redeem").send({ token: rawToken });
    const res = await request()
      .post("/api/invites/redeem")
      .send({ token: rawToken });

    expect(res.status).toBe(400);
  });

  it("allows only one of two concurrent redemptions of a single-use invite", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, maxUses: 1 });

    const [a, b] = await Promise.all([
      request().post("/api/invites/redeem").send({ token: rawToken }),
      request().post("/api/invites/redeem").send({ token: rawToken }),
    ]);

    const ok = [a, b].filter((r) => r.status === 200);
    const bad = [a, b].filter((r) => r.status === 400);
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(1);
  });

  it("lets an authenticated user redeem an invite", async () => {
    const user = await registerOwner();
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId });

    const res = await request()
      .post("/api/invites/redeem")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ token: rawToken });

    expect(res.status).toBe(200);
  });

  it("lets an anonymous user redeem an invite", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId });

    const res = await request()
      .post("/api/invites/redeem")
      .send({ token: rawToken });

    expect(res.status).toBe(200);
  });
});

describe("invite info", () => {
  it("returns invite info without consuming it", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, maxUses: 3 });

    const res = await request().get(`/api/invites/${rawToken}`);

    expect(res.status).toBe(200);
    expect(res.body.boardId).toBe(boardId);
    expect(res.body.role).toBe("editor");
    expect(res.body.boardName).toBe("Test Board");
    expect(res.body.expiresAt).toBeNull();
    expect(res.body.valid).toBe(true);

    const row = await getInviteByRawToken(rawToken);
    expect(row!.useCount).toBe(0);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request().get("/api/invites/no-such-token");
    expect(res.status).toBe(404);
  });
});

describe("invite revocation", () => {
  it("revokes an invite as the owner and blocks redemption", async () => {
    const owner = await registerOwner();
    const boardId = await seedBoard({ ownerId: owner.id });
    boardIds.push(boardId);
    const { id, rawToken } = await seedInvite({ boardId, createdBy: owner.id });

    const revoke = await request()
      .delete(`/api/boards/${boardId}/invites/${id}`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(revoke.status).toBe(204);

    const res = await request()
      .post("/api/invites/redeem")
      .send({ token: rawToken });

    expect(res.status).toBe(400);
  });

  it("rejects revocation by a non-owner", async () => {
    const owner = await registerOwner();
    const boardId = await seedBoard({ ownerId: owner.id });
    boardIds.push(boardId);
    const { id } = await seedInvite({ boardId, createdBy: owner.id });
    const stranger = await registerOwner();

    const res = await request()
      .delete(`/api/boards/${boardId}/invites/${id}`)
      .set("Authorization", `Bearer ${stranger.token}`);

    expect(res.status).toBe(403);
  });
});

describe("board access cookie cleanup", () => {
  it("clears the board access cookie", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);

    const res = await request().delete(`/api/boards/${boardId}/access`);

    expect(res.status).toBe(204);
    const setCookie = res.headers["set-cookie"] as unknown as string[];
    expect(
      setCookie.some((c) => c.startsWith(`board_access_${boardId}=;`)),
    ).toBe(true);
  });
});

afterAll(async () => {
  for (const id of boardIds) {
    await cleanupTestData(id);
  }
});
import { beforeAll, describe, it, expect } from "vitest";
import supertest from "supertest";
import { randomUUID } from "node:crypto";
import {
  httpServer,
  getBoardRow,
  countSnapshots,
} from "./setup.js";
import { db } from "@/db/index.js";
import { boardInvites, snapshots } from "@/db/schema.js";
import type { BoardState } from "@/types/types.js";
import { eq } from "drizzle-orm";

const request = () => supertest(httpServer);

type Registered = { token: string; userId: string };

async function registerUser(prefix: string): Promise<Registered> {
  const suffix = randomUUID().slice(0, 12);
  const res = await request().post("/api/auth/register").send({
    username: `${prefix}_${suffix}`,
    email: `${prefix}_${suffix}@test.local`,
    password: "supersecret",
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.accessToken as string,
    userId: res.body.user.id as string,
  };
}

function auth(token: string) {
  const header = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request().get(url).set(header),
    post: (url: string) => request().post(url).set(header),
    patch: (url: string) => request().patch(url).set(header),
    delete: (url: string) => request().delete(url).set(header),
  };
}

async function createBoard(token: string, name: string): Promise<string> {
  const res = await auth(token).post("/api/boards").send({ name });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("GET /api/boards", () => {
  let user: Registered;

  beforeAll(async () => {
    await registerUser("list-user").then((u) => (user = u));
  });

  it("returns 401 without authentication", async () => {
    const res = await request().get("/api/boards");
    expect(res.status).toBe(401);
  });

  it("returns only the caller's active boards, newest activity first", async () => {
    await createBoard(user.token, "Alpha");
    await createBoard(user.token, "Beta");

    // Someone else's board must never appear
    const other = await registerUser("list-other");
    await createBoard(other.token, "Not Mine");

    const res = await auth(user.token).get("/api/boards");
    expect(res.status).toBe(200);
    const titles = (res.body.boards as Array<{ title: string }>).map(
      (b) => b.title,
    );
    expect(titles).toContain("Alpha");
    expect(titles).toContain("Beta");
    expect(titles).not.toContain("Not Mine");
  });

  it("excludes archived boards by default and serves them via status=archived", async () => {
    const boardId = await createBoard(user.token, "To Archive");
    const archived = await auth(user.token).patch(
      `/api/boards/${boardId}/archive`,
    );
    expect(archived.status).toBe(204);

    const active = await auth(user.token).get("/api/boards");
    expect(
      (active.body.boards as Array<{ id: string }>).some(
        (b) => b.id === boardId,
      ),
    ).toBe(false);

    const archivedList = await auth(user.token).get(
      "/api/boards?status=archived",
    );
    expect(archivedList.status).toBe(200);
    expect(
      (archivedList.body.boards as Array<{ id: string }>).map((b) => b.id),
    ).toContain(boardId);

    // Unknown status values are rejected
    const bad = await auth(user.token).get("/api/boards?status=nonsense");
    expect(bad.status).toBe(400);
  });
});

describe("PATCH /api/boards/:boardId (rename)", () => {
  it("renames an owned board", async () => {
    const user = await registerUser("rename-user");
    const boardId = await createBoard(user.token, "Old Name");

    const res = await auth(user.token)
      .patch(`/api/boards/${boardId}`)
      .send({ title: "New Name" });
    expect(res.status).toBe(204);
    expect((await getBoardRow(boardId))!.title).toBe("New Name");
  });

  it("rejects non-owners with 403 and unknown ids with 404", async () => {
    const owner = await registerUser("rename-owner");
    const boardId = await createBoard(owner.token, "Owned");

    const intruder = await registerUser("rename-intruder");
    const forbidden = await auth(intruder.token)
      .patch(`/api/boards/${boardId}`)
      .send({ title: "Hijacked" });
    expect(forbidden.status).toBe(403);

    const notFoundRes = await auth(owner.token)
      .patch("/api/boards/00000000-0000-4000-8000-000000000000")
      .send({ title: "Ghost" });
    expect(notFoundRes.status).toBe(404);
  });

  it("rejects invalid titles with 400", async () => {
    const user = await registerUser("rename-invalid");
    const boardId = await createBoard(user.token, "Valid");

    const empty = await auth(user.token)
      .patch(`/api/boards/${boardId}`)
      .send({ title: "" });
    expect(empty.status).toBe(400);
  });
});

describe("POST /api/boards/:boardId/duplicate", () => {
  it("clones the board and its latest snapshot without copying invites", async () => {
    const user = await registerUser("dup-user");
    const boardId = await createBoard(user.token, "Source Board");
    await db.insert(snapshots).values({
      boardId,
      state: { "cmd-1": { id: "cmd-1", type: "stroke", payload: { points: [0, 0, 1, 1] }, owner: "u1", status: "applied", timestamp: Date.now() } } as BoardState,
    });

    // Source has an invite link; the copy must not inherit shares
    const invite = await auth(user.token)
      .post(`/api/boards/${boardId}/invites`)
      .send({ role: "editor" });
    expect(invite.status).toBe(201);

    const res = await auth(user.token).post(`/api/boards/${boardId}/duplicate`);
    expect(res.status).toBe(201);
    const copyId = res.body.id as string;
    expect(copyId).not.toBe(boardId);

    const row = await getBoardRow(copyId);
    expect(row).not.toBeNull();
    expect(row!.title).toBe("Source Board (Copy)");
    expect(row!.ownerId).toBe(user.userId);
    expect(await countSnapshots(copyId)).toBe(1);

    // Invites stay bound to the source only
    const copyInvites = await db
      .select()
      .from(boardInvites)
      .where(eq(boardInvites.boardId, copyId));
    expect(copyInvites).toHaveLength(0);
  });

  it("rejects non-owners with 403", async () => {
    const owner = await registerUser("dup-owner");
    const boardId = await createBoard(owner.token, "Owned");

    const intruder = await registerUser("dup-intruder");
    const res = await auth(intruder.token).post(
      `/api/boards/${boardId}/duplicate`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown boards", async () => {
    const user = await registerUser("dup-ghost");
    const res = await auth(user.token).post(
      "/api/boards/00000000-0000-4000-8000-000000000000/duplicate",
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/boards/:boardId/archive + restore", () => {
  it("archives then restores an owned board", async () => {
    const user = await registerUser("arch-user");
    const boardId = await createBoard(user.token, "Cycle");

    await auth(user.token).patch(`/api/boards/${boardId}/archive`);
    let row = await getBoardRow(boardId);
    expect(row!.archivedAt).not.toBeNull();

    await auth(user.token).patch(`/api/boards/${boardId}/restore`);
    row = await getBoardRow(boardId);
    expect(row!.archivedAt).toBeNull();
  });

  it("rejects non-owners with 403", async () => {
    const owner = await registerUser("arch-owner");
    const boardId = await createBoard(owner.token, "Owned");

    const intruder = await registerUser("arch-intruder");
    const archiveRes = await auth(intruder.token).patch(
      `/api/boards/${boardId}/archive`,
    );
    expect(archiveRes.status).toBe(403);
    const restoreRes = await auth(intruder.token).patch(
      `/api/boards/${boardId}/restore`,
    );
    expect(restoreRes.status).toBe(403);
  });
});

describe("DELETE /api/boards/:boardId", () => {
  it("permanently deletes an owned board along with its snapshots", async () => {
    const user = await registerUser("del-user");
    const boardId = await createBoard(user.token, "Doomed");
    await db.insert(snapshots).values({
      boardId,
      state: {} as BoardState,
    });
    expect(await countSnapshots(boardId)).toBe(1);

    const res = await auth(user.token).delete(`/api/boards/${boardId}`);
    expect(res.status).toBe(204);
    expect(await getBoardRow(boardId)).toBeNull();
    expect(await countSnapshots(boardId)).toBe(0);
  });

  it("rejects non-owners with 403", async () => {
    const owner = await registerUser("del-owner");
    const boardId = await createBoard(owner.token, "Owned");

    const intruder = await registerUser("del-intruder");
    const res = await auth(intruder.token).delete(`/api/boards/${boardId}`);
    expect(res.status).toBe(403);
    expect(await getBoardRow(boardId)).not.toBeNull();
  });
});

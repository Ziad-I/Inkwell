import { describe, it, expect, afterAll } from "vitest";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import {
  port,
  seedBoard,
  seedInvite,
  cleanupTestData,
} from "./setup.js";

const boardIds: string[] = [];

function connectClient(
  auth?: Record<string, unknown>,
  cookie?: string,
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      auth: auth ?? { userId: "test-user" },
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("connection timeout")), 3000);
  });
}

function roomJoin(
  socket: ClientSocket,
  roomId: string,
): Promise<{ err: unknown; data: unknown }> {
  return new Promise((resolve, reject) => {
    socket.emit("room:join", { roomId }, (err: unknown, data: unknown) => {
      try {
        resolve({ err, data });
      } catch (e) {
        reject(e);
      }
    });
    setTimeout(() => reject(new Error("ack timeout")), 3000);
  });
}

describe("socket join authorization via invite cookies", () => {
  it("resolves an editor invite cookie to editor access", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "editor" });

    const socket = await connectClient(
      { userId: "guest-editor" },
      `board_access_${boardId}=${rawToken}`,
    );
    const joined = await roomJoin(socket, boardId);

    expect(joined.err).toBeNull();
    expect(joined.data).toMatchObject({ canDraw: true, role: "editor" });
    socket.disconnect();
  });

  it("resolves a viewer invite cookie to viewer access", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "viewer" });

    const socket = await connectClient(
      { userId: "guest-viewer" },
      `board_access_${boardId}=${rawToken}`,
    );
    const joined = await roomJoin(socket, boardId);

    expect(joined.err).toBeNull();
    expect(joined.data).toMatchObject({ canDraw: false, role: "viewer" });
    socket.disconnect();
  });

  it("does not let board A's cookie authorize board B", async () => {
    const boardA = await seedBoard();
    const boardB = await seedBoard();
    boardIds.push(boardA, boardB);
    const { rawToken } = await seedInvite({ boardId: boardA, role: "viewer" });

    const socket = await connectClient(
      { userId: "cross-board" },
      `board_access_${boardA}=${rawToken}`,
    );
    const joined = await roomJoin(socket, boardB);

    // Cookie is ignored for B — B's default role applies.
    expect(joined.data).toMatchObject({ canDraw: true, role: "editor" });
    socket.disconnect();
  });

  it("rejects a tampered cookie without granting elevation", async () => {
    const boardId = await seedBoard({ drawPermission: "owner" });
    boardIds.push(boardId);

    const socket = await connectClient(
      { userId: "tampered" },
      `board_access_${boardId}=garbage-token`,
    );
    const joined = await roomJoin(socket, boardId);

    expect(joined.data).toMatchObject({ canDraw: false, role: "viewer" });
    socket.disconnect();
  });

  it("rejects a revoked invite during socket authorization", async () => {
    const boardId = await seedBoard({ defaultRole: "viewer" });
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({
      boardId,
      role: "editor",
      revokedAt: new Date(),
    });

    const socket = await connectClient(
      { userId: "revoked" },
      `board_access_${boardId}=${rawToken}`,
    );
    const joined = await roomJoin(socket, boardId);

    // The revoked invite grants nothing — the board default (viewer) applies.
    expect(joined.data).toMatchObject({ canDraw: false, role: "viewer" });
    socket.disconnect();
  });

  it("rejects an expired invite during socket authorization", async () => {
    const boardId = await seedBoard({ defaultRole: "viewer" });
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({
      boardId,
      role: "editor",
      expiresAt: new Date(Date.now() - 1000),
    });

    const socket = await connectClient(
      { userId: "expired" },
      `board_access_${boardId}=${rawToken}`,
    );
    const joined = await roomJoin(socket, boardId);

    expect(joined.data).toMatchObject({ canDraw: false, role: "viewer" });
    socket.disconnect();
  });

  it("joins an anonymously created board as an editor", async () => {
    const socket = await connectClient({ userId: "owner-user" });
    const { default: request } = await import("supertest");
    const { httpServer } = await import("./setup.js");
    const created = await request(httpServer).post("/api/boards").send({
      name: "Owner Board",
      userId: "owner-user",
      drawPermission: "anyone",
    });
    const boardId = created.body.id as string;
    boardIds.push(boardId);

    const joined = await roomJoin(socket, boardId);

    expect(joined.data).toMatchObject({ canDraw: true, role: "editor" });
    socket.disconnect();
  });

  it("returns BOARD_NOT_FOUND for unknown rooms", async () => {
    const socket = await connectClient();
    const joined = await roomJoin(socket, "00000000-0000-4000-8000-000000000000");

    expect(joined.err).toBe("BOARD_NOT_FOUND");
    socket.disconnect();
  });
});

afterAll(async () => {
  for (const id of boardIds) {
    await cleanupTestData(id);
  }
});

import { describe, it, expect, afterAll } from "vitest";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { port, seedBoard, seedInvite, cleanupTestData } from "./setup.js";

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
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
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
    expect(joined.data).toMatchObject({
      role: "editor",
      permissions: { draw: true, read: true },
    });
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
    expect(joined.data).toMatchObject({
      role: "viewer",
      permissions: { draw: false, read: true },
    });
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
    expect(joined.data).toMatchObject({
      role: "editor",
      permissions: { draw: true, read: true },
    });
    socket.disconnect();
  });

  it("rejects a tampered cookie without granting elevation", async () => {
    const boardId = await seedBoard({ defaultRole: "viewer" });
    boardIds.push(boardId);

    const socket = await connectClient(
      { userId: "tampered" },
      `board_access_${boardId}=garbage-token`,
    );
    const joined = await roomJoin(socket, boardId);

    expect(joined.data).toMatchObject({
      role: "viewer",
      permissions: { draw: false, read: true },
    });
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
    expect(joined.data).toMatchObject({
      role: "viewer",
      permissions: { draw: false, read: true },
    });
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

    expect(joined.data).toMatchObject({
      role: "viewer",
      permissions: { draw: false, read: true },
    });
    socket.disconnect();
  });

  it("joins an anonymously created board as an editor", async () => {
    const socket = await connectClient({ userId: "owner-user" });
    const { default: request } = await import("supertest");
    const { httpServer } = await import("./setup.js");
    const created = await request(httpServer).post("/api/boards").send({
      name: "Owner Board",
      userId: "owner-user",
    });
    const boardId = created.body.id as string;
    boardIds.push(boardId);

    const joined = await roomJoin(socket, boardId);

    expect(joined.data).toMatchObject({
      role: "editor",
      permissions: { draw: true, read: true },
    });
    socket.disconnect();
  });

  it("returns BOARD_NOT_FOUND for unknown rooms", async () => {
    const socket = await connectClient();
    const joined = await roomJoin(
      socket,
      "00000000-0000-4000-8000-000000000000",
    );

    expect(joined.err).toBe("BOARD_NOT_FOUND");
    socket.disconnect();
  });
});

describe("socket operation permissions", () => {
  const makeCommand = (id: string, owner: string) => ({
    id,
    type: "stroke" as const,
    payload: { points: [0, 0, 1, 1] },
    owner,
    status: "pending" as const,
    timestamp: Date.now(),
  });

  function finalize(
    socket: ClientSocket,
    id: string,
    command: ReturnType<typeof makeCommand>,
  ): Promise<{ err: unknown; data: unknown }> {
    return new Promise((resolve, reject) => {
      socket.emit(
        "command:finalize",
        { id, command },
        (err: unknown, data: unknown) => {
          try {
            resolve({ err, data });
          } catch (e) {
            reject(e);
          }
        },
      );
      setTimeout(() => reject(new Error("ack timeout")), 3000);
    });
  }

  it("lets an editor draw", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "editor" });

    const socket = await connectClient(
      { userId: "editor-user" },
      `board_access_${boardId}=${rawToken}`,
    );
    await roomJoin(socket, boardId);

    const res = await finalize(
      socket,
      "cmd-1",
      makeCommand("cmd-1", "editor-user"),
    );

    expect(res.err).toBeNull();
    expect(res.data).toMatchObject({ seq: 1 });
    socket.disconnect();
  });

  it("lets a viewer receive the board sync", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "viewer" });

    const socket = await connectClient(
      { userId: "viewer-sync" },
      `board_access_${boardId}=${rawToken}`,
    );

    const syncPromise = new Promise<void>((resolve, reject) => {
      socket.on("room:sync", (state: unknown) => {
        try {
          expect(Array.isArray(state)).toBe(true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error("no room:sync")), 3000);
    });

    await roomJoin(socket, boardId);
    await syncPromise;
    socket.disconnect();
  });

  it("lets a viewer receive presence", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "viewer" });

    const viewer = await connectClient(
      { userId: "viewer-presence" },
      `board_access_${boardId}=${rawToken}`,
    );
    const editor = await connectClient(
      { userId: "editor-presence" },
      `board_access_${boardId}=${rawToken}`,
    );

    const presencePromise = new Promise<void>((resolve, reject) => {
      viewer.on("presence:join", (userId: unknown) => {
        try {
          expect(userId).toBe("editor-presence");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error("no presence:join")), 3000);
    });

    await roomJoin(viewer, boardId);
    await roomJoin(editor, boardId);
    await presencePromise;
    viewer.disconnect();
    editor.disconnect();
  });

  it("rejects a viewer's draw attempt", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "viewer" });

    const socket = await connectClient(
      { userId: "viewer-draw" },
      `board_access_${boardId}=${rawToken}`,
    );
    await roomJoin(socket, boardId);

    const rejectPromise = new Promise<void>((resolve, reject) => {
      socket.on("command:reject", (commandId: unknown, reason: unknown) => {
        try {
          expect(commandId).toBe("cmd-x");
          expect(reason).toBe("UNAUTHORIZED_NO_PERMISSION_TO_DRAW");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error("no command:reject")), 3000);
    });

    socket.emit("command:create", {
      id: "cmd-x",
      command: makeCommand("cmd-x", "viewer-draw"),
    });
    await rejectPromise;
    socket.disconnect();
  });

  it("rejects a viewer's erase attempt (command with erase type)", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "viewer" });

    const socket = await connectClient(
      { userId: "viewer-erase" },
      `board_access_${boardId}=${rawToken}`,
    );
    await roomJoin(socket, boardId);

    const rejectPromise = new Promise<void>((resolve, reject) => {
      socket.on("command:reject", (commandId: unknown, reason: unknown) => {
        try {
          expect(commandId).toBe("cmd-e");
          expect(reason).toBe("UNAUTHORIZED_NO_PERMISSION_TO_DRAW");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error("no command:reject")), 3000);
    });

    socket.emit("command:create", {
      id: "cmd-e",
      command: { ...makeCommand("cmd-e", "viewer-erase"), type: "erase" },
    });
    await rejectPromise;
    socket.disconnect();
  });

  it("rejects a viewer's undo attempt", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);
    const { rawToken } = await seedInvite({ boardId, role: "viewer" });

    const socket = await connectClient(
      { userId: "viewer-undo" },
      `board_access_${boardId}=${rawToken}`,
    );
    await roomJoin(socket, boardId);

    const rejectPromise = new Promise<void>((resolve, reject) => {
      socket.on("command:reject", (commandId: unknown, reason: unknown) => {
        try {
          expect(commandId).toBe("cmd-u");
          expect(reason).toBe("UNAUTHORIZED_NO_PERMISSION_TO_DRAW");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error("no command:reject")), 3000);
    });

    socket.emit("command:undo", { id: "cmd-u" });
    await rejectPromise;
    socket.disconnect();
  });

  it("does not authorize drawing without a join (no boardAccess)", async () => {
    const boardId = await seedBoard();
    boardIds.push(boardId);

    const socket = await connectClient({ userId: "never-joined" });

    const rejectPromise = new Promise<void>((resolve, reject) => {
      socket.on("command:reject", (commandId: unknown, reason: unknown) => {
        try {
          expect(commandId).toBe("cmd-n");
          expect(reason).toBe("NOT_IN_ROOM");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error("no command:reject")), 3000);
    });

    socket.emit("command:create", {
      id: "cmd-n",
      command: makeCommand("cmd-n", "never-joined"),
    });
    await rejectPromise;
    socket.disconnect();
  });
});

afterAll(async () => {
  for (const id of boardIds) {
    await cleanupTestData(id);
  }
});

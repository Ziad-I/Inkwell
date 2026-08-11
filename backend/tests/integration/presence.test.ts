import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { port, seedBoard, seedUser, cleanupTestData } from "./setup.js";

function connectClient(auth?: Record<string, unknown>): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      auth: auth ?? { userId: "test-user" },
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("connection timeout")), 3000);
  });
}

describe("presence:move", () => {
  let boardId: string;

  beforeAll(async () => {
    const ownerId = await seedUser();
    boardId = await seedBoard({ title: "Presence Test", ownerId });
  });

  afterAll(async () => {
    await cleanupTestData(boardId);
  });

  it("broadcasts presence:move to other clients in room", async () => {
    const socket1 = await connectClient({ userId: "user-1" });
    const socket2 = await connectClient({ userId: "user-2" });

    const presencePromise = new Promise<void>((resolve, reject) => {
      socket1.on("presence:move", (userId: unknown, pos: unknown) => {
        try {
          expect(userId).toBe("user-2");
          expect(pos).toMatchObject({ x: 100, y: 200 });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error("timeout waiting for presence:move")), 3000);
    });

    await new Promise<void>((resolve, reject) => {
      socket1.emit("room:join", { roomId: boardId }, () => {
        socket2.emit("room:join", { roomId: boardId }, () => {
          socket2.emit("presence:move", { pos: { x: 100, y: 200 } });
          resolve();
        });
      });
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    await presencePromise;
    socket1.disconnect();
    socket2.disconnect();
  });
});

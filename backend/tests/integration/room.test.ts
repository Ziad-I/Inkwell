import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seedBoard, cleanupTestData } from "./setup.js";
import { connectClient } from "./helpers.js";

describe("room lifecycle", () => {
  let boardId1: string;
  let boardId2: string;

  beforeAll(async () => {
    boardId1 = await seedBoard({ title: "Room Test 1" });
    boardId2 = await seedBoard({ title: "Room Test 2" });
  });

  afterAll(async () => {
    await cleanupTestData(boardId1);
    await cleanupTestData(boardId2);
  });

  it("client joins room and receives room:joined ack", async () => {
    const socket = await connectClient();

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        "room:join",
        { roomId: boardId1 },
        (err: unknown, data: unknown) => {
          try {
            expect(err).toBeNull();
            expect(data).toMatchObject({ permissions: { draw: true, read: true } });
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      );
      setTimeout(() => reject(new Error("ack timeout")), 3000);
    });

    socket.disconnect();
  });

  it("two clients in same room both receive presence:join", async () => {
    const socket1 = await connectClient({ userId: "user-1" });
    const socket2 = await connectClient({ userId: "user-2" });

    const presencePromise = new Promise<void>((resolve, reject) => {
      socket1.on("presence:join", (userId: unknown, meta: unknown) => {
        try {
          expect(userId).toBe("user-2");
          expect(meta).toMatchObject({ userName: "Anonymous" });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(
        () => reject(new Error("timeout waiting for presence:join")),
        3000,
      );
    });

    await new Promise<void>((resolve, reject) => {
      socket1.emit("room:join", { roomId: boardId2 }, () => {
        socket2.emit("room:join", { roomId: boardId2 }, () => resolve());
      });
      setTimeout(() => reject(new Error("ack timeout")), 3000);
    });

    await presencePromise;
    socket1.disconnect();
    socket2.disconnect();
  });
});

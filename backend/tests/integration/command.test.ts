import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { port, seedBoard, cleanupTestData } from "./setup.js";

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

describe("command:create", () => {
  let boardId: string;

  beforeAll(async () => {
    boardId = await seedBoard({ title: "Command Test" });
  });

  afterAll(async () => {
    await cleanupTestData(boardId);
  });

  it("creates a command and receives ack", async () => {
    const socket = await connectClient();

    await new Promise<void>((resolve, reject) => {
      socket.emit("room:join", { roomId: boardId }, () => {
        socket.emit(
          "command:create",
          { id: "cmd-1", command: { type: "draw", payload: { x: 10, y: 20 }, owner: "test-user" } },
          (err: unknown) => {
            try {
              expect(err).toBeUndefined();
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        );
      });
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    socket.disconnect();
  });

  it("rejects command when not in a room", async () => {
    const socket = await connectClient();

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        "command:create",
        { id: "cmd-1", command: { type: "draw", payload: {}, owner: "test-user" } },
        (response: unknown) => {
          try {
            expect(response).toBe("User not in a room");
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      );
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    socket.disconnect();
  });
});

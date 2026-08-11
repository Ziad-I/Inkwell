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

function makeStrokeCommand(id: string, owner: string) {
  return {
    id,
    command: {
      id,
      type: "stroke" as const,
      payload: {
        nodeId: `n-${id}`,
        points: [0, 0, 10, 10],
        color: "#000",
        strokeWidth: 2,
        lineCap: "round" as const,
        lineJoin: "round" as const,
        opacity: 1,
      },
      owner,
      status: "pending" as const,
      timestamp: Date.now(),
    },
  };
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
          makeStrokeCommand("cmd-1", "test-user"),
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
        makeStrokeCommand("cmd-1", "test-user"),
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

describe("command:finalize", () => {
  let boardId: string;

  beforeAll(async () => {
    boardId = await seedBoard({ title: "Finalize Test" });
  });

  afterAll(async () => {
    await cleanupTestData(boardId);
  });

  it("finalizes a command and receives ack with seq", async () => {
    const socket = await connectClient();

    await new Promise<void>((resolve, reject) => {
      socket.emit("room:join", { roomId: boardId }, () => {
        socket.emit(
          "command:create",
          makeStrokeCommand("cmd-f1", "test-user"),
          () => {
            socket.emit(
              "command:finalize",
              makeStrokeCommand("cmd-f1", "test-user"),
              (err: unknown, resp?: { seq: number }) => {
                try {
                  expect(err).toBeNull();
                  expect(resp).toBeDefined();
                  expect(resp!.seq).toBeGreaterThanOrEqual(1);
                  resolve();
                } catch (e) {
                  reject(e);
                }
              },
            );
          },
        );
      });
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    socket.disconnect();
  });

  it("rejects finalize when not in a room", async () => {
    const socket = await connectClient();

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        "command:finalize",
        makeStrokeCommand("cmd-f2", "test-user"),
        (err: unknown) => {
          try {
            expect(err).toBe("User not in a room");
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

describe("command:undo / command:redo", () => {
  let boardId: string;

  beforeAll(async () => {
    boardId = await seedBoard({ title: "Undo Redo Test" });
  });

  afterAll(async () => {
    await cleanupTestData(boardId);
  });

  it("undoes and redoes a finalized command", async () => {
    const socket = await connectClient();

    await new Promise<void>((resolve, reject) => {
      socket.emit("room:join", { roomId: boardId }, () => {
        socket.emit(
          "command:create",
          makeStrokeCommand("cmd-ur1", "test-user"),
          () => {
            socket.emit(
              "command:finalize",
              makeStrokeCommand("cmd-ur1", "test-user"),
              (_err: unknown, _resp?: { seq: number }) => {
                socket.emit(
                  "command:undo",
                  { id: "cmd-ur1" },
                  (undoErr: unknown, undoResp?: { seq: number }) => {
                    try {
                      expect(undoErr).toBeNull();
                      expect(undoResp).toBeDefined();
                      expect(undoResp!.seq).toBeGreaterThanOrEqual(1);

                      socket.emit(
                        "command:redo",
                        { id: "cmd-ur1" },
                        (redoErr: unknown, redoResp?: { seq: number }) => {
                          try {
                            expect(redoErr).toBeNull();
                            expect(redoResp).toBeDefined();
                            expect(redoResp!.seq).toBeGreaterThanOrEqual(1);
                            resolve();
                          } catch (e) {
                            reject(e);
                          }
                        },
                      );
                    } catch (e) {
                      reject(e);
                    }
                  },
                );
              },
            );
          },
        );
      });
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    socket.disconnect();
  });
});

describe("delta sync on reconnect", () => {
  let boardId: string;

  beforeAll(async () => {
    boardId = await seedBoard({ title: "Delta Sync Test" });
  });

  afterAll(async () => {
    await cleanupTestData(boardId);
  });

  it("returns empty sync state when client is up-to-date", async () => {
    const socket1 = await connectClient();

    const lastSeq = await new Promise<number>((resolve, reject) => {
      socket1.emit("room:join", { roomId: boardId }, () => {
        socket1.emit(
          "command:create",
          makeStrokeCommand("cmd-ds1", "test-user"),
          () => {
            socket1.emit(
              "command:finalize",
              makeStrokeCommand("cmd-ds1", "test-user"),
              (_err: unknown, resp?: { seq: number }) => {
                resolve(resp!.seq);
              },
            );
          },
        );
      });
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    const socket2 = await connectClient();

    const syncState = await new Promise<unknown[]>((resolve, reject) => {
      socket2.emit(
        "room:join",
        { roomId: boardId, lastSeq },
        (joinErr: unknown) => {
          if (joinErr) {
            reject(joinErr);
            return;
          }
          socket2.on("room:sync", (state: unknown[]) => {
            resolve(state);
          });
          setTimeout(() => reject(new Error("timeout")), 3000);
        },
      );
    });

    expect(syncState).toEqual([]);

    socket1.disconnect();
    socket2.disconnect();
  });
});

describe("draw permissions", () => {
  let boardId: string;

  beforeAll(async () => {
    const ownerId = await seedUser();
    boardId = await seedBoard({
      title: "Permissions Test",
      ownerId,
      drawPermission: "owner",
    });
  });

  afterAll(async () => {
    await cleanupTestData(boardId);
  });

  it("restricts draw when joining as non-owner", async () => {
    const socket = await connectClient({ userId: "other-user" });

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        "room:join",
        { roomId: boardId },
        (err: unknown, resp?: { canDraw: boolean }) => {
          try {
            expect(err).toBeNull();
            expect(resp).toBeDefined();
            expect(resp!.canDraw).toBe(false);
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

  it("rejects command:create when user cannot draw", async () => {
    const socket = await connectClient({ userId: "other-user" });

    await new Promise<void>((resolve, reject) => {
      socket.emit("room:join", { roomId: boardId }, () => {
        socket.emit(
          "command:create",
          makeStrokeCommand("cmd-p1", "other-user"),
          (err: unknown) => {
            try {
              expect(err).toBe("User does not have permission to draw");
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
});

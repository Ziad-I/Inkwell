import { describe, it, expect } from "vitest";
import type { Socket } from "socket.io-client";
import {
  cleanupTestData,
  countSnapshots,
  getLatestSnapshotState,
  seedBoard,
} from "./setup.js";
import {
  connectClient,
  roomJoin,
  waitForRoomTeardown,
} from "./helpers.js";

function makeCommand(id: string) {
  return {
    id,
    command: {
      id,
      type: "stroke" as const,
      payload: { points: [0, 0, 10, 10] },
      owner: "test-user",
      status: "pending" as const,
      timestamp: Date.now(),
    },
  };
}

function finalize(socket: Socket, command: ReturnType<typeof makeCommand>) {
  return new Promise<{ err: unknown; seq?: number }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("finalize ack timeout")), 3000);
    socket.emit(
      "command:finalize",
      command,
      (err: unknown, response?: { seq: number }) => {
        clearTimeout(timeout);
        resolve({ err, seq: response?.seq });
      },
    );
  });
}

async function joinAndCaptureSync(socket: Socket, roomId: string, lastSeq?: number) {
  const sync = new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("room:sync timeout")), 3000);
    socket.once("room:sync", (state: unknown) => {
      clearTimeout(timeout);
      resolve(state);
    });
  });

  const joined = await new Promise<{ err: unknown; data: unknown }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("join ack timeout")), 3000);
      socket.emit(
        "room:join",
        { roomId, ...(lastSeq === undefined ? {} : { lastSeq }) },
        (err: unknown, data: unknown) => {
          clearTimeout(timeout);
          resolve({ err, data });
        },
      );
    },
  );

  return { joined, sync: await sync };
}

describe("persistent board durability", () => {
  it("round-trips finalized commands through snapshot persistence and restore", async () => {
    const boardId = await seedBoard({ title: "Durability Test" });
    let firstSocket: Socket | undefined;
    let secondSocket: Socket | undefined;

    try {
      firstSocket = await connectClient();
      const initialJoin = await roomJoin(firstSocket, boardId);
      expect(initialJoin.err).toBeNull();

      const commands = [
        makeCommand("durable-1"),
        makeCommand("durable-2"),
        makeCommand("durable-3"),
      ];
      const acks = [];
      for (const command of commands) {
        acks.push(await finalize(firstSocket, command));
      }
      expect(acks.map(({ err, seq }) => [err, seq])).toEqual([
        [null, 1],
        [null, 2],
        [null, 3],
      ]);

      firstSocket.disconnect();
      firstSocket = undefined;
      await waitForRoomTeardown(boardId);

      expect(await countSnapshots(boardId)).toBe(1);
      expect(await getLatestSnapshotState(boardId)).toEqual(
        Object.fromEntries(
          commands.map(({ id, command }, index) => [
            id,
            { ...command, status: "applied", seq: index + 1 },
          ]),
        ),
      );

      secondSocket = await connectClient();
      const restored = await joinAndCaptureSync(secondSocket, boardId);
      expect(restored.joined.err).toBeNull();
      expect(restored.sync).toEqual(
        expect.arrayContaining(
          commands.map(({ id }) =>
            expect.objectContaining({ id, status: "applied" }),
          ),
        ),
      );
      expect((restored.sync as unknown[]).length).toBe(3);

      const delta = await joinAndCaptureSync(secondSocket, boardId, 3);
      expect(delta.joined.err).toBeNull();
      expect(delta.sync).toEqual([]);
    } finally {
      secondSocket?.disconnect();
      firstSocket?.disconnect();
      await waitForRoomTeardown(boardId);
      await cleanupTestData(boardId);
    }
  });
});

import { describe, it, expect } from "vitest";
import supertest from "supertest";
import {
  httpServer,
  getBoardRow,
  countSnapshots,
} from "./setup.js";
import {
  connectClient,
  roomJoin,
  waitForRoomTeardown,
} from "./helpers.js";

const request = () => supertest(httpServer);

describe("board creation — anonymous (ephemeral)", () => {
  it("creates an ephemeral room with no DB row, fallback GET, joinable socket", async () => {
    const created = await request().post("/api/boards").send({
      name: "Guest Board",
      userId: "guest-123",
    });
    expect(created.status).toBe(201);
    const roomId = created.body.id as string;

    // No persisted row
    expect(await getBoardRow(roomId)).toBeNull();

    // Redis existence fallback for the frontend join flow
    const lookup = await request().get(`/api/boards/${roomId}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.id).toBe(roomId);

    // Joinable via Socket.IO with draw access
    const socket = await connectClient({ userId: "guest-123" });
    const joined = await roomJoin(socket, roomId);
    expect(joined.err).toBeNull();
    expect(joined.data).toMatchObject({
      role: "editor",
      permissions: { draw: true, read: true },
    });

    // State lives in Redis and commands can be finalized
    const seqAck = await new Promise<{ err: unknown; seq?: number }>(
      (resolve, reject) => {
        socket.emit(
          "command:finalize",
          {
            id: "cmd-1",
            command: {
              id: "cmd-1",
              type: "stroke",
              payload: { points: [0, 0, 1, 1] },
              owner: "guest-123",
              status: "pending",
              timestamp: Date.now(),
            },
          },
          (err: unknown, data: unknown) => {
            try {
              resolve({ err, ...(data as { seq?: number }) });
            } catch (e) {
              reject(e);
            }
          },
        );
        setTimeout(() => reject(new Error("ack timeout")), 3000);
      },
    );
    expect(seqAck.err).toBeNull();
    expect(seqAck.seq).toBe(1);

    socket.disconnect();
    await waitForRoomTeardown(roomId);

    // No snapshot was ever written because there is no board row
    expect(await countSnapshots(roomId)).toBe(0);
  });

  it("returns 404 for unknown rooms with no Redis state", async () => {
    const res = await request().get(
      "/api/boards/00000000-0000-4000-8000-000000000000",
    );
    expect(res.status).toBe(404);
  });
});

describe("board creation — authenticated (persisted)", () => {
  it("creates a persisted board owned by the caller", async () => {
    const registered = await request().post("/api/auth/register").send({
      username: "board-owner",
      email: "board-owner@example.com",
      password: "supersecret",
    });
    expect(registered.status).toBe(201);
    const authToken = registered.body.accessToken as string;
    const userId = registered.body.user.id as string;

    const created = await request()
      .post("/api/boards")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "My Saved Board" });
    expect(created.status).toBe(201);
    const roomId = created.body.id as string;

    const row = await getBoardRow(roomId);
    expect(row).not.toBeNull();
    expect(row!.title).toBe("My Saved Board");
    expect(row!.ownerId).toBe(userId);

    const lookup = await request().get(`/api/boards/${roomId}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.title).toBe("My Saved Board");
  });
});

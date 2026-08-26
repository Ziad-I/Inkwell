import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seedBoard, seedUser, cleanupTestData } from "./setup.js";
import { connectClient, roomJoin, roomLeave } from "./helpers.js";

const boardIds: string[] = [];

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

    await roomJoin(socket1, boardId);
    await roomJoin(socket2, boardId);
    socket2.emit("presence:move", { pos: { x: 100, y: 200 } });

    await presencePromise;
    socket1.disconnect();
    socket2.disconnect();
  });
});

describe("multi-room membership", () => {
  it("keeps membership across boards: switch does not announce leave; explicit leave does; disconnect sweeps", async () => {
    const b1 = await seedBoard({ title: "Multi A" });
    const b2 = await seedBoard({ title: "Multi B" });
    boardIds.push(b1, b2);

    const a = await connectClient({ userId: "user-A" });
    const b = await connectClient({ userId: "user-B" });
    const c = await connectClient({ userId: "user-C" });

    const seenJoins: string[] = [];
    b.on("presence:join", (uid: unknown) => seenJoins.push(String(uid)));
    c.on("presence:join", (uid: unknown) => seenJoins.push(String(uid)));
    const bLeaves: string[] = [];
    b.on("presence:leave", (uid: unknown) => bLeaves.push(String(uid)));
    const cLeaves: string[] = [];
    c.on("presence:leave", (uid: unknown) => cLeaves.push(String(uid)));

    await roomJoin(a, b1);
    await roomJoin(b, b1);
    await roomJoin(c, b2);
    await roomJoin(a, b2); // A now in BOTH rooms

    expect(seenJoins.filter((u) => u === "user-A").length).toBeGreaterThanOrEqual(
      1,
    ); // B saw join(A) at b1; C saw join(A) at b2

    await roomLeave(a, b1); // explicit single-room leave
    expect(bLeaves).toContain("user-A");
    expect(cLeaves).not.toContain("user-A");

    a.disconnect(); // sweep: only b2 remains
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => reject(new Error("c did not see disconnect leave")), 3000);
      const check = setInterval(() => {
        if (cLeaves.includes("user-A")) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
    expect(bLeaves.filter((u) => u === "user-A")).toHaveLength(1); // no duplicate leave to B
    b.disconnect();
    c.disconnect();
  });

  it("routes commands to the focused room after multi-room joins", async () => {
    const b1 = await seedBoard({ title: "Focus 1" });
    const b2 = await seedBoard({ title: "Focus 2" });
    boardIds.push(b1, b2);
    const drawer = await connectClient({ userId: "drawer" });
    const peerB1 = await connectClient({ userId: "peer-b1" });
    const peerB2 = await connectClient({ userId: "peer-b2" });
    await roomJoin(peerB1, b1);
    await roomJoin(peerB2, b2);
    await roomJoin(drawer, b1);
    await roomJoin(drawer, b2); // focus = b2

    const gotOnB2 = new Promise<void>((resolve, reject) => {
      peerB2.on("command:create", () => resolve());
      setTimeout(() => reject(new Error("b2 got nothing")), 3000);
    });
    let b1Got = false;
    peerB1.on("command:create", () => {
      b1Got = true;
    });

    drawer.emit("command:create", {
      id: "fc1",
      command: {
        id: "fc1",
        type: "stroke",
        payload: {},
        owner: "drawer",
        status: "pending",
        timestamp: Date.now(),
      },
    });
    await gotOnB2;
    await new Promise((r) => setTimeout(r, 150));
    expect(b1Got).toBe(false);
    [drawer, peerB1, peerB2].forEach((s) => s.disconnect());
  });
});

afterAll(async () => {
  for (const id of boardIds) {
    await cleanupTestData(id);
  }
});

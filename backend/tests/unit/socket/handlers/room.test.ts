import { describe, it, expect, vi, beforeEach } from "vitest";

function createMockSocket(data?: Record<string, unknown>) {
  return {
    data: data ?? { userId: "user-123" },
    on: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    join: vi.fn(),
    to: vi.fn().mockReturnThis(),
    id: "mock-socket-id",
  };
}

function createMockServer() {
  return {
    on: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnValue({
      fetchSockets: vi.fn().mockResolvedValue([]),
    }),
  };
}

const mockBoard = {
  id: "room-abc",
  title: "Test Board",
  ownerId: "user-123",
  drawPermission: "anyone",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function getHandler(socket: { on: ReturnType<typeof vi.fn> }, event: string) {
  return socket.on.mock.calls.find(
    (c: unknown[]) => c[0] === event,
  )?.[1];
}

const boardMock = vi.hoisted(() => ({ getBoardById: vi.fn() }));
const stateMock = vi.hoisted(() => ({
  isRoomInitialized: vi.fn(),
  initBoardState: vi.fn(),
  getCommandsInBuffer: vi.fn(),
  getBoardStateArr: vi.fn(),
}));
const snapshotMock = vi.hoisted(() => ({ getLatestSnapshot: vi.fn() }));

vi.mock("@/services/board.js", () => boardMock);
vi.mock("@/services/state.js", () => stateMock);
vi.mock("@/services/snapshot.js", () => snapshotMock);

describe("resolveCanDraw", () => {
  it("returns true for anyone permission", async () => {
    const { resolveCanDraw } = await import("@/socket/handlers/room.js");
    expect(resolveCanDraw("anyone", "owner-1", "user-1")).toBe(true);
  });

  it("returns true for owner permission when user is owner", async () => {
    const { resolveCanDraw } = await import("@/socket/handlers/room.js");
    expect(resolveCanDraw("owner", "owner-1", "owner-1")).toBe(true);
  });

  it("returns false for owner permission when user is not owner", async () => {
    const { resolveCanDraw } = await import("@/socket/handlers/room.js");
    expect(resolveCanDraw("owner", "owner-1", "user-other")).toBe(false);
  });

  it("returns false for unknown permission", async () => {
    const { resolveCanDraw } = await import("@/socket/handlers/room.js");
    expect(resolveCanDraw("unknown", "owner-1", "user-1")).toBe(false);
  });
});

describe("registerRoomHandlers — room:join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardMock.getBoardById.mockResolvedValue(mockBoard);
    stateMock.isRoomInitialized.mockResolvedValue(true);
    stateMock.initBoardState.mockResolvedValue(undefined);
    stateMock.getCommandsInBuffer.mockResolvedValue([]);
    stateMock.getBoardStateArr.mockResolvedValue([]);
    snapshotMock.getLatestSnapshot.mockResolvedValue(null);
  });

  it("rejects join when board not found and room is not in Redis", async () => {
    boardMock.getBoardById.mockResolvedValue(null);
    stateMock.isRoomInitialized.mockResolvedValue(false);

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "room:join")({ roomId: "nonexistent" }, ack);

    expect(ack).toHaveBeenCalledWith("Room not found");
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("joins ephemeral rooms with no board row when Redis state exists", async () => {
    boardMock.getBoardById.mockResolvedValue(null);
    stateMock.isRoomInitialized.mockResolvedValue(true);

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "room:join")({ roomId: "ephemeral-room" }, ack);

    expect(socket.join).toHaveBeenCalledWith("ephemeral-room");
    expect(socket.data.canDraw).toBe(true);
    expect(ack).toHaveBeenCalledWith(undefined, { canDraw: true });
    expect(stateMock.initBoardState).not.toHaveBeenCalled();
  });

  it("initializes board state from snapshot if room not initialized", async () => {
    stateMock.isRoomInitialized.mockResolvedValue(false);
    snapshotMock.getLatestSnapshot.mockResolvedValue({
      "cmd-1": { id: "cmd-1", type: "stroke", payload: {}, owner: "user-123", status: "applied", timestamp: 123 },
    });

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    await getHandler(socket, "room:join")({ roomId: "room-abc" }, vi.fn());

    expect(snapshotMock.getLatestSnapshot).toHaveBeenCalledWith("room-abc");
    expect(stateMock.initBoardState).toHaveBeenCalled();
  });

  it("sets canDraw=true for anyone permission", async () => {
    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "room:join")({ roomId: "room-abc" }, ack);

    expect(socket.data.canDraw).toBe(true);
    expect(ack).toHaveBeenCalledWith(undefined, { canDraw: true });
  });

  it("sets canDraw=false for owner permission when user is not owner", async () => {
    boardMock.getBoardById.mockResolvedValue({
      ...mockBoard,
      drawPermission: "owner",
      ownerId: "owner-user",
    });

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket({ userId: "guest-user" });
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "room:join")({ roomId: "room-abc" }, ack);

    expect(socket.data.canDraw).toBe(false);
    expect(ack).toHaveBeenCalledWith(undefined, { canDraw: false });
  });

  it("emits room:sync with full state when no lastSeq", async () => {
    stateMock.getBoardStateArr.mockResolvedValue([
      { id: "cmd-1", type: "stroke", payload: {}, owner: "user-123", status: "applied", timestamp: 123 },
    ]);

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    await getHandler(socket, "room:join")({ roomId: "room-abc" }, vi.fn());

    const syncCall = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "room:sync",
    );
    expect(syncCall).toBeDefined();
    expect(syncCall?.[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "cmd-1" })]),
    );
  });

  it("performs delta sync when lastSeq is provided", async () => {
    stateMock.getCommandsInBuffer.mockResolvedValue([
      { id: "cmd-2", type: "stroke", payload: {}, owner: "user-123", status: "applied", timestamp: 456 },
    ]);

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    await getHandler(socket, "room:join")({ roomId: "room-abc", lastSeq: 5 }, vi.fn());

    expect(stateMock.getCommandsInBuffer).toHaveBeenCalledWith("room-abc", 5);
    const syncCall = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "room:sync",
    );
    expect(syncCall).toBeDefined();
    expect(syncCall?.[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "cmd-2" })]),
    );
  });
});

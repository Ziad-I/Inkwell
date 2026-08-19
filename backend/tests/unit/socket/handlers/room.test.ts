import { describe, it, expect, vi, beforeEach } from "vitest";

function createMockSocket(data?: Record<string, unknown>, cookie?: string) {
  return {
    data: data ?? { userId: "user-123", principalType: "guest" },
    handshake: { headers: { cookie } },
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
  defaultRole: "editor",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function getHandler(socket: { on: ReturnType<typeof vi.fn> }, event: string) {
  return socket.on.mock.calls.find((c: unknown[]) => c[0] === event)?.[1];
}

const boardMock = vi.hoisted(() => ({ getBoardById: vi.fn() }));
const stateMock = vi.hoisted(() => ({
  isRoomInitialized: vi.fn(),
  initBoardState: vi.fn(),
  getCommandsInBuffer: vi.fn(),
  getBoardStateArr: vi.fn(),
}));
const snapshotMock = vi.hoisted(() => ({ getLatestSnapshot: vi.fn() }));
const boardAccessMock = vi.hoisted(() => ({ authorizeBoardAccess: vi.fn() }));

vi.mock("@/services/board.js", () => boardMock);
vi.mock("@/services/state.js", () => stateMock);
vi.mock("@/services/snapshot.js", () => snapshotMock);
vi.mock("@/services/boardAccess.js", () => boardAccessMock);

function makeAccess(role: "owner" | "editor" | "viewer") {
  return {
    boardId: "room-abc",
    principal: { type: "guest" as const, id: "user-123" },
    role,
    permissions: { read: true, draw: role !== "viewer" },
  };
}

describe("registerRoomHandlers — room:join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardMock.getBoardById.mockResolvedValue(mockBoard);
    stateMock.isRoomInitialized.mockResolvedValue(true);
    stateMock.initBoardState.mockResolvedValue(undefined);
    stateMock.getCommandsInBuffer.mockResolvedValue([]);
    stateMock.getBoardStateArr.mockResolvedValue([]);
    snapshotMock.getLatestSnapshot.mockResolvedValue(null);
    boardAccessMock.authorizeBoardAccess.mockResolvedValue(
      makeAccess("editor"),
    );
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

    expect(ack).toHaveBeenCalledWith("BOARD_NOT_FOUND");
    expect(socket.join).not.toHaveBeenCalled();
    expect(boardAccessMock.authorizeBoardAccess).not.toHaveBeenCalled();
  });

  it("joins ephemeral rooms with editor access when Redis state exists", async () => {
    boardMock.getBoardById.mockResolvedValue(null);
    stateMock.isRoomInitialized.mockResolvedValue(true);

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "room:join")({ roomId: "ephemeral-room" }, ack);

    expect(socket.join).toHaveBeenCalledWith("ephemeral-room");
    expect(boardAccessMock.authorizeBoardAccess).toHaveBeenCalledWith({
      boardId: "ephemeral-room",
      board: null,
      principal: { type: "guest", id: "user-123" },
      inviteToken: null,
    });
    expect(socket.data.boardAccess).toEqual(makeAccess("editor"));
    expect(ack).toHaveBeenCalledWith(undefined, {
      role: "editor",
      permissions: { draw: true, read: true },
    });
  });

  it("initializes board state from snapshot if room not initialized", async () => {
    stateMock.isRoomInitialized.mockResolvedValue(false);
    snapshotMock.getLatestSnapshot.mockResolvedValue({
      "cmd-1": {
        id: "cmd-1",
        type: "stroke",
        payload: {},
        owner: "user-123",
        status: "applied",
        timestamp: 123,
      },
    });

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    await getHandler(socket, "room:join")({ roomId: "room-abc" }, vi.fn());

    expect(snapshotMock.getLatestSnapshot).toHaveBeenCalledWith("room-abc");
    expect(stateMock.initBoardState).toHaveBeenCalled();
  });

  it("passes the board-specific cookie through to authorization", async () => {
    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket(
      undefined,
      "board_access_room-abc=raw-token",
    );
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    await getHandler(socket, "room:join")({ roomId: "room-abc" }, vi.fn());

    expect(boardAccessMock.authorizeBoardAccess).toHaveBeenCalledWith({
      boardId: "room-abc",
      board: mockBoard,
      principal: { type: "guest", id: "user-123" },
      inviteToken: "raw-token",
    });
  });

  it("resolves viewer access for a viewer invite", async () => {
    boardAccessMock.authorizeBoardAccess.mockResolvedValue(
      makeAccess("viewer"),
    );

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "room:join")({ roomId: "room-abc" }, ack);

    expect(socket.data.boardAccess).toEqual(makeAccess("viewer"));
    expect(ack).toHaveBeenCalledWith(undefined, {
      role: "viewer",
      permissions: { draw: false, read: true },
    });
  });

  it("emits room:sync with full state when no lastSeq", async () => {
    stateMock.getBoardStateArr.mockResolvedValue([
      {
        id: "cmd-1",
        type: "stroke",
        payload: {},
        owner: "user-123",
        status: "applied",
        timestamp: 123,
      },
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
      {
        id: "cmd-2",
        type: "stroke",
        payload: {},
        owner: "user-123",
        status: "applied",
        timestamp: 456,
      },
    ]);

    const { registerRoomHandlers } = await import("@/socket/handlers/room.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerRoomHandlers(socket as never, io as never);

    await getHandler(socket, "room:join")(
      { roomId: "room-abc", lastSeq: 5 },
      vi.fn(),
    );

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

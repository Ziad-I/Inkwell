import { describe, it, expect, vi } from "vitest";

function createMockSocket(data?: Record<string, unknown>) {
  return {
    data: data ?? { userId: "user-123", roomId: "room-abc", canDraw: true },
    on: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
    id: "mock-socket-id",
  };
}

function createMockServer() {
  return { on: vi.fn().mockReturnThis() };
}

const baseCommand = {
  id: "cmd-1",
  type: "stroke" as const,
  payload: { points: [0, 0, 100, 100] },
  owner: "user-123",
  status: "pending" as const,
  timestamp: Date.now(),
};

function getHandler(socket: { on: ReturnType<typeof vi.fn> }, event: string) {
  return socket.on.mock.calls.find((c: unknown[]) => c[0] === event)?.[1];
}

describe("reject helper", () => {
  it("emits command:reject and calls ack when provided", async () => {
    const { reject } = await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const ack = vi.fn();

    reject(socket as never, "cmd-1", "test reason", ack);

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "test reason",
    );
    expect(ack).toHaveBeenCalledWith("test reason");
  });

  it("emits command:reject without ack when not provided", async () => {
    const { reject } = await import("@/socket/handlers/command.js");
    const socket = createMockSocket();

    reject(socket as never, "cmd-1", "test reason");

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "test reason",
    );
  });
});

describe("command:create", () => {
  it("broadcasts to room and acks", async () => {
    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:create")(
      { id: "cmd-1", command: baseCommand },
      ack,
    );

    expect(socket.to).toHaveBeenCalledWith("room-abc");
    expect(socket.to("room-abc").emit).toHaveBeenCalledWith(
      "command:create",
      "cmd-1",
      baseCommand,
    );
    expect(ack).toHaveBeenCalledWith();
  });

  it("rejects when not in a room", async () => {
    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket({ userId: "user-123", canDraw: true });
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:create")(
      { id: "cmd-1", command: baseCommand },
      ack,
    );

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "NOT_IN_ROOM",
    );
    expect(ack).toHaveBeenCalledWith("NOT_IN_ROOM");
  });

  it("rejects when cannot draw", async () => {
    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket({
      userId: "user-123",
      roomId: "room-abc",
      canDraw: false,
    });
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:create")(
      { id: "cmd-1", command: baseCommand },
      ack,
    );

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "UNAUTHORIZED_NO_PERMISSION_TO_DRAW",
    );
  });

  it("rejects when command owner mismatch", async () => {
    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket({
      userId: "user-456",
      roomId: "room-abc",
      canDraw: true,
    });
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:create")(
      { id: "cmd-1", command: baseCommand },
      ack,
    );

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "UNAUTHORIZED_NOT_COMMAND_OWNER",
    );
  });
});

describe("command:update", () => {
  it("broadcasts update to room", async () => {
    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:update")(
      { id: "cmd-1", command: baseCommand },
      ack,
    );

    expect(socket.to("room-abc").emit).toHaveBeenCalledWith(
      "command:update",
      "cmd-1",
      baseCommand,
    );
    expect(ack).toHaveBeenCalledWith();
  });

  it("rejects when not in room", async () => {
    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket({ userId: "user-123", canDraw: true });
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:update")(
      { id: "cmd-1", command: baseCommand },
      ack,
    );

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "NOT_IN_ROOM",
    );
  });
});

const stateMock = vi.hoisted(() => ({
  getCommandById: vi.fn(),
  applyFinalize: vi.fn(),
  applyUndo: vi.fn(),
  applyRedo: vi.fn(),
}));

vi.mock("@/services/state.js", () => stateMock);

describe("command:finalize", () => {
  it("calls applyFinalize and broadcasts with seq", async () => {
    stateMock.applyFinalize.mockResolvedValue({
      ...baseCommand,
      status: "applied",
      seq: 1,
    });

    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:finalize")(
      { id: "cmd-1", command: baseCommand },
      ack,
    );

    expect(stateMock.applyFinalize).toHaveBeenCalledWith(
      "room-abc",
      baseCommand,
    );
    expect(socket.to("room-abc").emit).toHaveBeenCalledWith(
      "command:finalize",
      "cmd-1",
      expect.objectContaining({ status: "applied", seq: 1 }),
    );
    expect(ack).toHaveBeenCalledWith(undefined, { seq: 1 });
  });
});

describe("command:cancel", () => {
  it("broadcasts cancel when command found and owned", async () => {
    stateMock.getCommandById.mockResolvedValue(baseCommand);

    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:cancel")({ id: "cmd-1" }, ack);

    expect(socket.to("room-abc").emit).toHaveBeenCalledWith(
      "command:cancel",
      "cmd-1",
    );
    expect(ack).toHaveBeenCalledWith();
  });

  it("rejects cancel when INVALID_COMMAND", async () => {
    stateMock.getCommandById.mockResolvedValue(null);

    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:cancel")({ id: "cmd-nonexistent" }, ack);

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-nonexistent",
      "INVALID_COMMAND",
    );
  });
});

describe("command:undo", () => {
  it("calls applyUndo on applied command", async () => {
    stateMock.getCommandById.mockResolvedValue({
      ...baseCommand,
      status: "applied",
    });
    stateMock.applyUndo.mockResolvedValue({
      ...baseCommand,
      status: "reverted",
      seq: 2,
    });

    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:undo")({ id: "cmd-1" }, ack);

    expect(stateMock.applyUndo).toHaveBeenCalledWith("room-abc", {
      ...baseCommand,
      status: "applied",
    });
    expect(ack).toHaveBeenCalledWith(undefined, { seq: 2 });
  });

  it("rejects undo if COMMAND_NOT_APPLIED", async () => {
    stateMock.getCommandById.mockResolvedValue({
      ...baseCommand,
      status: "pending",
    });

    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:undo")({ id: "cmd-1" }, ack);

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "COMMAND_NOT_APPLIED",
    );
  });
});

describe("command:redo", () => {
  it("calls applyRedo on reverted command", async () => {
    stateMock.getCommandById.mockResolvedValue({
      ...baseCommand,
      status: "reverted",
    });
    stateMock.applyRedo.mockResolvedValue({
      ...baseCommand,
      status: "applied",
      seq: 3,
    });

    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:redo")({ id: "cmd-1" }, ack);

    expect(stateMock.applyRedo).toHaveBeenCalledWith("room-abc", {
      ...baseCommand,
      status: "reverted",
    });
    expect(ack).toHaveBeenCalledWith(undefined, { seq: 3 });
  });

  it("rejects redo if COMMAND_NOT_REVERTED", async () => {
    stateMock.getCommandById.mockResolvedValue({
      ...baseCommand,
      status: "applied",
    });

    const { registerCommandHandlers } =
      await import("@/socket/handlers/command.js");
    const socket = createMockSocket();
    const io = createMockServer();

    registerCommandHandlers(socket as never, io as never);

    const ack = vi.fn();
    await getHandler(socket, "command:redo")({ id: "cmd-1" }, ack);

    expect(socket.emit).toHaveBeenCalledWith(
      "command:reject",
      "cmd-1",
      "COMMAND_NOT_REVERTED",
    );
  });
});

import { describe, it, expect, vi } from "vitest";

const viewerAccess = {
  boardId: "room-abc",
  principal: { type: "guest" as const, id: "user-123" },
  role: "viewer" as const,
  permissions: { read: true, draw: false },
};

function createMockSocket(data?: Record<string, unknown>) {
  return {
    data:
      data ?? {
        userId: "user-123",
        roomId: "room-abc",
        principalType: "guest",
        boardAccess: viewerAccess,
      },
    on: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
    id: "mock-socket-id",
    rooms: new Set(["room-abc"]),
  };
}

function createMockServer() {
  return {
    use: vi.fn(),
    on: vi.fn().mockReturnThis(),
    of: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };
}

describe("registerPresenceHandlers", () => {
  it("broadcasts presence:move to room excluding sender", async () => {
    const socket = createMockSocket();
    const io = createMockServer();
    const { registerPresenceHandlers } = await import("@/socket/handlers/presence.js");

    registerPresenceHandlers(socket as never, io as never);

    const presenceMoveHandler = (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "presence:move",
    )?.[1];

    expect(presenceMoveHandler).toBeDefined();

    presenceMoveHandler({ pos: { x: 100, y: 200 } });

    expect(socket.to).toHaveBeenCalledWith("room-abc");
    expect(socket.to("room-abc").emit).toHaveBeenCalledWith(
      "presence:move",
      "user-123",
      { x: 100, y: 200 },
    );
  });

  it("does not broadcast when not in a room", async () => {
    const socket = createMockSocket({ userId: "user-123", principalType: "guest" });
    const io = createMockServer();
    const { registerPresenceHandlers } = await import("@/socket/handlers/presence.js");

    registerPresenceHandlers(socket as never, io as never);

    const presenceMoveHandler = (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "presence:move",
    )?.[1];

    presenceMoveHandler({ pos: { x: 50, y: 50 } });

    expect(socket.to).not.toHaveBeenCalled();
  });

  it("does not broadcast presence:move without board access", async () => {
    const socket = createMockSocket({
      userId: "user-123",
      roomId: "room-abc",
      principalType: "guest",
    });
    const io = createMockServer();
    const { registerPresenceHandlers } = await import("@/socket/handlers/presence.js");

    registerPresenceHandlers(socket as never, io as never);

    const presenceMoveHandler = (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "presence:move",
    )?.[1];

    presenceMoveHandler({ pos: { x: 50, y: 50 } });

    expect(socket.to).not.toHaveBeenCalled();
  });

  it("broadcasts presence:leave on disconnecting (full membership sweep)", async () => {
    const socket = createMockSocket();
    const io = createMockServer();
    const { registerPresenceHandlers } = await import("@/socket/handlers/presence.js");

    registerPresenceHandlers(socket as never, io as never);

    const disconnectHandler = (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "disconnecting",
    )?.[1];

    expect(disconnectHandler).toBeDefined();

    disconnectHandler();

    expect(socket.to).toHaveBeenCalledWith("room-abc");
    expect(socket.to).not.toHaveBeenCalledWith("mock-socket-id");
    expect(socket.to("room-abc").emit).toHaveBeenCalledWith("presence:leave", "user-123");
  });

  it("sweeps every joined room on disconnecting, skipping its own id", async () => {
    const socket = createMockSocket({ userId: "user-123", principalType: "guest" });
    socket.id = "sock-1";
    socket.rooms = new Set(["sock-1", "room-a", "room-b"]);
    const io = createMockServer();
    const { registerPresenceHandlers } = await import("@/socket/handlers/presence.js");

    registerPresenceHandlers(socket as never, io as never);

    const disconnectHandler = (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "disconnecting",
    )?.[1];

    disconnectHandler();

    expect(socket.to).toHaveBeenCalledWith("room-a");
    expect(socket.to).toHaveBeenCalledWith("room-b");
    expect(socket.to).not.toHaveBeenCalledWith("sock-1");
    expect(socket.to("room-a").emit).toHaveBeenCalledWith("presence:leave", "user-123");
    expect(socket.to("room-b").emit).toHaveBeenCalledWith("presence:leave", "user-123");
  });

  it("emits nothing on disconnecting when the socket never joined a room", async () => {
    const socket = createMockSocket({ userId: "user-123", principalType: "guest" });
    socket.rooms = new Set(["mock-socket-id"]);
    const io = createMockServer();
    const { registerPresenceHandlers } = await import("@/socket/handlers/presence.js");

    registerPresenceHandlers(socket as never, io as never);

    const disconnectHandler = (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "disconnecting",
    )?.[1];

    disconnectHandler();

    expect(socket.to).not.toHaveBeenCalled();
  });
});

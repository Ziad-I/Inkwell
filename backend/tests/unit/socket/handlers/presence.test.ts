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

  it("broadcasts presence:leave on disconnect", async () => {
    const socket = createMockSocket();
    const io = createMockServer();
    const { registerPresenceHandlers } = await import("@/socket/handlers/presence.js");

    registerPresenceHandlers(socket as never, io as never);

    const disconnectHandler = (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "disconnect",
    )?.[1];

    expect(disconnectHandler).toBeDefined();

    disconnectHandler();

    expect(socket.to).toHaveBeenCalledWith("room-abc");
    expect(socket.to("room-abc").emit).toHaveBeenCalledWith("presence:leave", "user-123");
  });
});

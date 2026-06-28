import { describe, it, expect, vi } from "vitest";

function createMockSocket(data?: Record<string, unknown>) {
  return {
    data: data ?? {},
    handshake: { auth: {} },
    on: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    join: vi.fn(),
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
    sockets: { adapter: { on: vi.fn() } },
  };
}

describe("registerAuthMiddleware", () => {
  it("sets userId, meta from handshake auth", async () => {
    const io = createMockServer();
    const { registerAuthMiddleware } = await import("@/socket/handlers/auth.js");

    registerAuthMiddleware(io as never);

    expect(io.use).toHaveBeenCalled();
    const middleware = (io.use as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

    const socket = createMockSocket();
    socket.handshake.auth = { userId: "user-abc", userName: "Alice", userColor: "#ff0000" };

    const next = vi.fn();
    middleware(socket, next);

    expect((socket.data as Record<string, unknown>).userId).toBe("user-abc");
    expect((socket.data as Record<string, unknown>).meta).toEqual({ userName: "Alice", userColor: "#ff0000" });
    expect(next).toHaveBeenCalled();
  });

  it("uses defaults when userName and userColor are missing", async () => {
    const io = createMockServer();
    const { registerAuthMiddleware } = await import("@/socket/handlers/auth.js");

    registerAuthMiddleware(io as never);

    const middleware = (io.use as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const socket = createMockSocket();
    socket.handshake.auth = { userId: "user-xyz" };

    const next = vi.fn();
    middleware(socket, next);

    expect((socket.data as Record<string, unknown>).meta).toEqual({ userName: "Anonymous", userColor: "#000000" });
  });
});

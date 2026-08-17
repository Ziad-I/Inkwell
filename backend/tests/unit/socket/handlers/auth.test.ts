import { describe, it, expect, vi, beforeEach } from "vitest";

const authServiceMock = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
}));

const usersServiceMock = vi.hoisted(() => ({
  getUserById: vi.fn(),
}));

vi.mock("@/services/auth.js", () => authServiceMock);
vi.mock("@/services/users.js", () => usersServiceMock);

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
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.verifyAccessToken.mockImplementation((token: string) => token);
    usersServiceMock.getUserById.mockResolvedValue({ id: "account-1" });
  });

  it("sets userId, meta from handshake auth", async () => {
    const io = createMockServer();
    const { registerAuthMiddleware } = await import("@/socket/handlers/auth.js");

    registerAuthMiddleware(io as never);

    expect(io.use).toHaveBeenCalled();
    const middleware = (io.use as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

    const socket = createMockSocket();
    socket.handshake.auth = { userId: "user-abc", userName: "Alice", userColor: "#ff0000" };

    const next = vi.fn();
    await middleware(socket, next);

    expect((socket.data as Record<string, unknown>).userId).toBe("user-abc");
    expect((socket.data as Record<string, unknown>).meta).toEqual({ userName: "Alice", userColor: "#ff0000" });
    expect((socket.data as Record<string, unknown>).principalType).toBe("guest");
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
    await middleware(socket, next);

    expect((socket.data as Record<string, unknown>).meta).toEqual({ userName: "Anonymous", userColor: "#000000" });
  });

  it("resolves the account userId when a valid token is provided", async () => {
    const io = createMockServer();
    const { registerAuthMiddleware } = await import("@/socket/handlers/auth.js");

    registerAuthMiddleware(io as never);

    const middleware = (io.use as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const socket = createMockSocket();
    socket.handshake.auth = { userId: "anonymous-id", token: "valid-jwt", userName: "Alice" };

    const next = vi.fn();
    await middleware(socket, next);

    expect(authServiceMock.verifyAccessToken).toHaveBeenCalledWith("valid-jwt");
    expect((socket.data as Record<string, unknown>).userId).toBe("account-1");
    expect((socket.data as Record<string, unknown>).principalType).toBe("user");
    expect(next).toHaveBeenCalled();
  });

  it("falls back to the anonymous identity when the token is invalid", async () => {
    authServiceMock.verifyAccessToken.mockImplementation(() => {
      throw new Error("bad token");
    });

    const io = createMockServer();
    const { registerAuthMiddleware } = await import("@/socket/handlers/auth.js");

    registerAuthMiddleware(io as never);

    const middleware = (io.use as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const socket = createMockSocket();
    socket.handshake.auth = { userId: "anonymous-id", token: "expired-jwt" };

    const next = vi.fn();
    await middleware(socket, next);

    expect((socket.data as Record<string, unknown>).userId).toBe("anonymous-id");
    expect((socket.data as Record<string, unknown>).principalType).toBe("guest");
    expect(next).toHaveBeenCalled();
  });

  it("falls back to a generated id when token is provided but the account is gone", async () => {
    usersServiceMock.getUserById.mockResolvedValue(null);

    const io = createMockServer();
    const { registerAuthMiddleware } = await import("@/socket/handlers/auth.js");

    registerAuthMiddleware(io as never);

    const middleware = (io.use as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const socket = createMockSocket();
    socket.handshake.auth = { token: "valid-jwt-but-user-deleted" };

    const next = vi.fn();
    await middleware(socket, next);

    expect(typeof (socket.data as Record<string, unknown>).userId).toBe("string");
    expect(next).toHaveBeenCalled();
  });
});
import { describe, it, expect, vi, beforeEach } from "vitest";

const invitesMock = vi.hoisted(() => ({ validateInviteToken: vi.fn() }));
vi.mock("@/services/invites.js", () => invitesMock);

const makeBoard = (overrides: Record<string, unknown> = {}) => ({
  id: "room-abc",
  title: "Test Board",
  ownerId: "owner-1",
  defaultRole: "editor" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

async function load() {
  return import("@/services/boardAccess.js");
}

describe("getPermissionsForRole", () => {
  it("grants read and draw to owner and editor, read-only to viewer", async () => {
    const { getPermissionsForRole } = await load();
    expect(getPermissionsForRole("owner")).toEqual({ read: true, draw: true });
    expect(getPermissionsForRole("editor")).toEqual({ read: true, draw: true });
    expect(getPermissionsForRole("viewer")).toEqual({
      read: true,
      draw: false,
    });
  });
});

describe("hasPermission", () => {
  it("is false when access is missing", async () => {
    const { hasPermission } = await load();
    expect(hasPermission(undefined, "read")).toBe(false);
  });

  it("checks the permission map", async () => {
    const { hasPermission, getPermissionsForRole } = await load();
    const viewer = {
      boardId: "b",
      principal: { type: "guest" as const, id: "g" },
      role: "viewer" as const,
      permissions: getPermissionsForRole("viewer"),
    };
    expect(hasPermission(viewer, "read")).toBe(true);
    expect(hasPermission(viewer, "draw")).toBe(false);
  });
});

describe("authorizeBoardAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the board owner to owner even with an invite token", async () => {
    invitesMock.validateInviteToken.mockResolvedValue({
      boardId: "room-abc",
      role: "viewer",
    });
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard({ ownerId: "owner-1" }),
      principal: { type: "user", id: "owner-1" },
      inviteToken: "some-token",
    });
    expect(access.role).toBe("owner");
    expect(access.permissions).toEqual({ read: true, draw: true });
  });

  it("resolves the invite role for a valid editor invite", async () => {
    invitesMock.validateInviteToken.mockResolvedValue({
      boardId: "room-abc",
      role: "editor",
    });
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard(),
      principal: { type: "guest", id: "guest-1" },
      inviteToken: "valid-token",
    });
    expect(access.role).toBe("editor");
  });

  it("resolves the invite role for a valid viewer invite", async () => {
    invitesMock.validateInviteToken.mockResolvedValue({
      boardId: "room-abc",
      role: "viewer",
    });
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard(),
      principal: { type: "guest", id: "guest-1" },
      inviteToken: "valid-token",
    });
    expect(access.role).toBe("viewer");
  });

  it("falls back to the board default role when the token is invalid", async () => {
    invitesMock.validateInviteToken.mockResolvedValue(null);
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard(),
      principal: { type: "guest", id: "guest-1" },
      inviteToken: "tampered",
    });
    expect(access.role).toBe("editor");
  });

  it("ignores an invite for a different board", async () => {
    invitesMock.validateInviteToken.mockResolvedValue({
      boardId: "other-board",
      role: "viewer",
    });
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard(),
      principal: { type: "guest", id: "guest-1" },
      inviteToken: "token-for-other-board",
    });
    expect(access.role).toBe("editor");
  });

  it("falls back to viewer on owner-only boards without a valid invite", async () => {
    invitesMock.validateInviteToken.mockResolvedValue(null);
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard({ defaultRole: "viewer" }),
      principal: { type: "guest", id: "guest-1" },
      inviteToken: "tampered",
    });
    expect(access.role).toBe("viewer");
  });

  it("lets an editor invite override an owner-only board", async () => {
    invitesMock.validateInviteToken.mockResolvedValue({
      boardId: "room-abc",
      role: "editor",
    });
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard({ defaultRole: "editor" }),
      principal: { type: "guest", id: "guest-1" },
      inviteToken: "valid-token",
    });
    expect(access.role).toBe("editor");
  });

  it("uses the board defaultRole when no token is present", async () => {
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "room-abc",
      board: makeBoard({ defaultRole: "viewer" }),
      principal: { type: "guest", id: "guest-1" },
      inviteToken: null,
    });
    expect(access.role).toBe("viewer");
  });

  it("resolves ephemeral rooms (no board row) to editor", async () => {
    const { authorizeBoardAccess } = await load();
    const access = await authorizeBoardAccess({
      boardId: "ephemeral-1",
      board: null,
      principal: { type: "guest", id: "guest-1" },
      inviteToken: null,
    });
    expect(access.role).toBe("editor");
    expect(access.boardId).toBe("ephemeral-1");
  });
});

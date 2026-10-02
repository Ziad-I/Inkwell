import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb } from "../../mocks/db.js";

async function load() {
  vi.restoreAllMocks();
  return import("@/services/invites.js");
}

async function loadAuth() {
  return import("@/services/auth.js");
}

describe("createInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores only the token hash and returns the raw token once", async () => {
    const { hashToken } = await loadAuth();
    const { createInvite } = await load();
    mockDb.returning.mockResolvedValue([{ id: "invite-1" }]);

    const result = await createInvite({
      boardId: "board-1",
      createdBy: "user-1",
      role: "editor",
      maxUses: 10,
    });

    expect(result.rawToken).toBeTypeOf("string");
    expect(result.rawToken.length).toBeGreaterThan(30);

    const values = mockDb.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values["boardId"]).toBe("board-1");
    expect(values["createdBy"]).toBe("user-1");
    expect(values["role"]).toBe("editor");
    expect(values["maxUses"]).toBe(10);
    expect(values["tokenHash"]).toBe(hashToken(result.rawToken));
    expect(values["tokenHash"]).not.toBe(result.rawToken);
  });

  it("passes null for optional fields when omitted", async () => {
    const { createInvite } = await load();
    mockDb.returning.mockResolvedValue([{ id: "invite-2" }]);

    await createInvite({
      boardId: "board-1",
      createdBy: "user-1",
      role: "viewer",
    });

    const values = mockDb.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values["expiresAt"]).toBeNull();
    expect(values["maxUses"]).toBeNull();
  });
});

describe("redeemInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns boardId and role when the conditional update matches", async () => {
    const { redeemInvite } = await load();
    mockDb.returning.mockResolvedValue([
      { boardId: "board-1", role: "editor" },
    ]);

    const result = await redeemInvite("raw-token");

    expect(result).toEqual({ boardId: "board-1", role: "editor" });
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
  });

  it("returns null when the invite is not redeemable", async () => {
    const { redeemInvite } = await load();
    mockDb.returning.mockResolvedValue([]);

    const result = await redeemInvite("raw-token");

    expect(result).toBeNull();
  });
});

describe("validateInviteToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the invite when not revoked and not expired", async () => {
    const { validateInviteToken } = await load();
    mockDb.limit.mockReturnValue([
      { boardId: "board-1", role: "viewer" },
    ]);

    const result = await validateInviteToken("raw-token");

    expect(result).toEqual({ boardId: "board-1", role: "viewer" });
  });

  it("returns null when no matching invite exists", async () => {
    const { validateInviteToken } = await load();
    mockDb.limit.mockReturnValue([]);

    const result = await validateInviteToken("raw-token");

    expect(result).toBeNull();
  });
});

describe("getInviteByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the invite row for the raw token", async () => {
    const { getInviteByToken } = await load();
    const invite = {
      id: "invite-1",
      boardId: "board-1",
      createdBy: "user-1",
      role: "editor",
      tokenHash: "hash",
      maxUses: null,
      useCount: 0,
      createdAt: new Date(),
      expiresAt: null,
      revokedAt: null,
    };
    mockDb.limit.mockReturnValue([
      { board_invite: invite, board: { title: "Board One" } },
    ]);

    const result = await getInviteByToken("raw-token");

    expect(result).toEqual({ ...invite, boardName: "Board One" });
  });
});

describe("getInviteById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the invite's boardId", async () => {
    const { getInviteById } = await load();
    mockDb.limit.mockReturnValue([{ boardId: "board-1" }]);

    const result = await getInviteById("invite-1");

    expect(result).toEqual({ boardId: "board-1" });
  });

  it("returns null when the invite does not exist", async () => {
    const { getInviteById } = await load();
    mockDb.limit.mockReturnValue([]);

    const result = await getInviteById("invite-missing");

    expect(result).toBeNull();
  });
});

describe("revokeInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets revokedAt on the invite", async () => {
    const { revokeInvite } = await load();

    await revokeInvite("invite-1");

    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCall["revokedAt"]).toBeInstanceOf(Date);
    expect(mockDb.where).toHaveBeenCalled();
  });
});
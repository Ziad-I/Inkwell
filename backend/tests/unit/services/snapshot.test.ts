import { describe, it, expect, vi } from "vitest";
import { mockDb } from "../../mocks/db.js";

const mockState = {
  "cmd-1": {
    id: "cmd-1",
    type: "stroke" as const,
    payload: { points: [0, 0, 100, 100] },
    owner: "user-123",
    status: "applied" as const,
    timestamp: Date.now(),
    seq: 1,
  },
};

vi.mock("@/services/state.js", () => ({
  getBoardState: vi.fn(),
}));

const { getBoardState } = await import("@/services/state.js");

describe("writeBoardSnapshot", () => {
  it("writes a snapshot when board state exists", async () => {
    vi.mocked(getBoardState).mockResolvedValue(mockState);
    mockDb.returning.mockResolvedValue([
      { id: "snap-1", boardId: "room-1", state: mockState },
    ]);

    const { writeBoardSnapshot } = await import("@/services/snapshot.js");
    await writeBoardSnapshot("room-1");

    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("does nothing when board state is null", async () => {
    vi.mocked(getBoardState).mockResolvedValue(null as never);

    const { writeBoardSnapshot } = await import("@/services/snapshot.js");
    await writeBoardSnapshot("room-1");

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does nothing when board state is undefined", async () => {
    vi.mocked(getBoardState).mockResolvedValue(undefined as never);

    const { writeBoardSnapshot } = await import("@/services/snapshot.js");
    await writeBoardSnapshot("room-1");

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("saveSnapshot", () => {
  it("saves and returns a snapshot", async () => {
    const snap = {
      id: "snap-1",
      boardId: "room-1",
      state: mockState,
      createdAt: new Date(),
    };
    mockDb.returning.mockResolvedValue([snap]);

    const { saveSnapshot } = await import("@/services/snapshot.js");
    const result = await saveSnapshot("room-1", mockState);

    expect(result).toEqual(snap);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: "room-1", state: mockState }),
    );
  });
});

describe("getLatestSnapshot", () => {
  it("returns latest snapshot state", async () => {
    mockDb.limit.mockReturnValue([{ state: mockState }]);

    const { getLatestSnapshot } = await import("@/services/snapshot.js");
    const result = await getLatestSnapshot("room-1");

    expect(result).toEqual(mockState);
    expect(mockDb.orderBy).toHaveBeenCalled();
  });

  it("returns null when no snapshots exist", async () => {
    mockDb.limit.mockReturnValue([]);

    const { getLatestSnapshot } = await import("@/services/snapshot.js");
    const result = await getLatestSnapshot("room-1");

    expect(result).toBeNull();
  });
});

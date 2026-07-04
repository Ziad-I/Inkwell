import { describe, it, expect, vi } from "vitest";
import { mockRedisClient } from "../../mocks/redis.js";

const mockCommand = {
  id: "cmd-1",
  type: "stroke" as const,
  payload: { points: [0, 0, 100, 100] },
  owner: "user-123",
  status: "applied" as const,
  timestamp: Date.now(),
  seq: 1,
};

function resetMocks() {
  vi.clearAllMocks();
}

async function loadState() {
  resetMocks();
  return import("@/services/state.js");
}

describe("initBoardState", () => {
  it("initializes board state from a snapshot", async () => {
    const { initBoardState } = await loadState();
    const initialState = { "cmd-1": mockCommand };

    await initBoardState("room-1", initialState);

    expect(mockRedisClient.multi).toHaveBeenCalled();
    expect(mockRedisClient.del).toHaveBeenCalled();
    expect(mockRedisClient.hset).toHaveBeenCalled();
    expect(mockRedisClient.set).toHaveBeenCalled();
    expect(mockRedisClient.exec).toHaveBeenCalled();
  });

  it("sets the sequence to the max seq among commands", async () => {
    const { initBoardState } = await loadState();
    const cmds = {
      "cmd-1": { ...mockCommand, seq: 5 },
      "cmd-2": { ...mockCommand, id: "cmd-2", seq: 10 },
    };

    await initBoardState("room-1", cmds);

    const setCall = mockRedisClient.set.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("seq"),
    );
    expect(setCall).toBeDefined();
    expect(setCall?.[1]).toBe(10);
  });
});

describe("isRoomInitialized", () => {
  it("returns true when seq key exists", async () => {
    mockRedisClient.exists.mockResolvedValue(1);
    const { isRoomInitialized } = await loadState();

    const result = await isRoomInitialized("room-1");

    expect(result).toBe(true);
  });

  it("returns false when seq key does not exist", async () => {
    mockRedisClient.exists.mockResolvedValue(0);
    const { isRoomInitialized } = await loadState();

    const result = await isRoomInitialized("room-1");

    expect(result).toBe(false);
  });
});

describe("getBoardState", () => {
  it("returns parsed commands from hash", async () => {
    mockRedisClient.hgetall.mockResolvedValue({
      "cmd-1": JSON.stringify(mockCommand),
    });
    const { getBoardState } = await loadState();

    const result = await getBoardState("room-1");

    expect(result).toEqual({ "cmd-1": mockCommand });
  });

  it("returns empty object when no entries", async () => {
    mockRedisClient.hgetall.mockResolvedValue({});
    const { getBoardState } = await loadState();

    const result = await getBoardState("room-1");

    expect(result).toEqual({});
  });

  it("skips unparseable commands with a warning", async () => {
    mockRedisClient.hgetall.mockResolvedValue({
      "cmd-1": JSON.stringify(mockCommand),
      "cmd-2": "{invalid json}",
    });
    const { getBoardState } = await loadState();

    const result = await getBoardState("room-1");

    expect(result).toEqual({ "cmd-1": mockCommand });
    expect(Object.keys(result).length).toBe(1);
  });
});

describe("getBoardStateArr", () => {
  it("returns array of commands", async () => {
    mockRedisClient.hgetall.mockResolvedValue({
      "cmd-1": JSON.stringify(mockCommand),
    });
    const { getBoardStateArr } = await loadState();

    const result = await getBoardStateArr("room-1");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("cmd-1");
  });
});

describe("clearBoardState", () => {
  it("removes all room keys and dirty flag", async () => {
    const { clearBoardState } = await loadState();

    await clearBoardState("room-1");

    expect(mockRedisClient.multi).toHaveBeenCalled();
    expect(mockRedisClient.del).toHaveBeenCalled();
    expect(mockRedisClient.srem).toHaveBeenCalled();
    expect(mockRedisClient.exec).toHaveBeenCalled();
  });
});

describe("markRoomClean", () => {
  it("removes room from dirty set", async () => {
    const { markRoomClean } = await loadState();

    await markRoomClean("room-1");

    expect(mockRedisClient.srem).toHaveBeenCalledWith(
      expect.stringContaining("dirty"),
      "room-1",
    );
  });
});

describe("getSequence", () => {
  it("returns parsed sequence number", async () => {
    mockRedisClient.get.mockResolvedValue("42");
    const { getSequence } = await loadState();

    const result = await getSequence("room-1");

    expect(result).toBe(42);
  });

  it("returns 0 when no sequence stored", async () => {
    mockRedisClient.get.mockResolvedValue(null);
    const { getSequence } = await loadState();

    const result = await getSequence("room-1");

    expect(result).toBe(0);
  });
});

describe("nextSequence", () => {
  it("increments the sequence counter", async () => {
    mockRedisClient.incr.mockResolvedValue(5);
    const { nextSequence } = await loadState();

    const result = await nextSequence("room-1");

    expect(result).toBe(5);
    expect(mockRedisClient.incr).toHaveBeenCalled();
  });
});

describe("pushToBuffer", () => {
  it("stores command in hash, zset, trims buffer, and marks dirty", async () => {
    const { pushToBuffer } = await loadState();
    const cmd = { ...mockCommand, seq: 1 };

    await pushToBuffer("room-1", cmd);

    expect(mockRedisClient.multi).toHaveBeenCalled();
    expect(mockRedisClient.hset).toHaveBeenCalled();
    expect(mockRedisClient.zadd).toHaveBeenCalled();
    expect(mockRedisClient.zremrangebyrank).toHaveBeenCalled();
    expect(mockRedisClient.sadd).toHaveBeenCalled();
    expect(mockRedisClient.exec).toHaveBeenCalled();
  });
});

describe("getCommandById", () => {
  it("returns parsed command when found", async () => {
    mockRedisClient.hget.mockResolvedValue(JSON.stringify(mockCommand));
    const { getCommandById } = await loadState();

    const result = await getCommandById("room-1", "cmd-1");

    expect(result).toEqual(mockCommand);
  });

  it("returns null when command not found", async () => {
    mockRedisClient.hget.mockResolvedValue(null);
    const { getCommandById } = await loadState();

    const result = await getCommandById("room-1", "cmd-nonexistent");

    expect(result).toBeNull();
  });
});

describe("getCommandsInBuffer", () => {
  it("returns commands after given sequence", async () => {
    mockRedisClient.zrange.mockResolvedValue([JSON.stringify(mockCommand), String(mockCommand.seq)]);
    mockRedisClient.zrangebyscore.mockResolvedValue([JSON.stringify(mockCommand)]);
    const { getCommandsInBuffer } = await loadState();

    const result = await getCommandsInBuffer("room-1", 0);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result![0]?.id).toBe("cmd-1");
  });

  it("returns null when client is behind buffer (gap detected)", async () => {
    mockRedisClient.zrange.mockResolvedValue(["cmd-0", "50"]);
    mockRedisClient.zrangebyscore.mockResolvedValue([]);
    const { getCommandsInBuffer } = await loadState();

    const result = await getCommandsInBuffer("room-1", 1);

    expect(result).toBeNull();
  });

  it("skips unparseable entries", async () => {
    mockRedisClient.zrange.mockResolvedValue(["cmd-1", "1"]);
    mockRedisClient.zrangebyscore.mockResolvedValue(["{invalid}"]);
    const { getCommandsInBuffer } = await loadState();

    const result = await getCommandsInBuffer("room-1", 0);

    expect(result).toEqual([]);
  });
});

describe("applyFinalize", () => {
  it("sets status to applied, increments seq, pushes to buffer", async () => {
    mockRedisClient.incr.mockResolvedValue(2);
    const { applyFinalize } = await loadState();

    const result = await applyFinalize("room-1", mockCommand);

    expect(result.status).toBe("applied");
    expect(result.seq).toBe(2);
    expect(mockRedisClient.incr).toHaveBeenCalled();
    expect(mockRedisClient.multi).toHaveBeenCalled();
  });
});

describe("applyUndo", () => {
  it("sets status to reverted, increments seq, pushes to buffer", async () => {
    mockRedisClient.incr.mockResolvedValue(3);
    const { applyUndo } = await loadState();

    const result = await applyUndo("room-1", mockCommand);

    expect(result.status).toBe("reverted");
    expect(result.seq).toBe(3);
  });
});

describe("applyRedo", () => {
  it("sets status to applied, increments seq, pushes to buffer", async () => {
    mockRedisClient.incr.mockResolvedValue(4);
    const { applyRedo } = await loadState();

    const result = await applyRedo("room-1", mockCommand);

    expect(result.status).toBe("applied");
    expect(result.seq).toBe(4);
  });
});

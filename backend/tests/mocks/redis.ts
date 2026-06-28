import { vi } from "vitest";

function createMockRedisClient() {
  return {
    on: vi.fn().mockReturnThis(),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue("PONG"),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    hset: vi.fn().mockResolvedValue(1),
    hget: vi.fn().mockResolvedValue(null),
    hgetall: vi.fn().mockResolvedValue({}),
    hdel: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    multi: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
    zadd: vi.fn().mockResolvedValue(1),
    zrange: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zremrangebyrank: vi.fn().mockResolvedValue(1),
    zremrangebyscore: vi.fn().mockResolvedValue(1),
    lpush: vi.fn().mockResolvedValue(1),
    lrange: vi.fn().mockResolvedValue([]),
    duplicate: vi.fn().mockReturnThis(),
    status: "ready",
  };
}

export const mockRedisClient = createMockRedisClient();

vi.mock("ioredis", () => ({
  Redis: vi.fn(function () {
    return mockRedisClient;
  }),
}));

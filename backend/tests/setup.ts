import { vi, beforeEach } from "vitest";
import "./mocks/redis.js";
import "./mocks/db.js";
import "./mocks/logger.js";

beforeEach(() => {
  vi.clearAllMocks();
});

process.env.NODE_ENV = "test";
process.env.PORT = "5000";
process.env.DATABASE_URL =
  "postgres://inkwell:inkwell_test@localhost:5433/inkwell_test";
process.env.REDIS_URL = "redis://localhost:6380";
process.env.LOG_LEVEL = "error";
process.env.APP_NAME = "inkwell-test";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.SNAPSHOT_INTERVAL = "60000";
process.env.SNAPSHOT_RETENTION = "3";

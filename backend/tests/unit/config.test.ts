import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";

const ENV_KEYS = [
  "APP_NAME",
  "NODE_ENV",
  "LOG_LEVEL",
  "PORT",
  "DATABASE_URL",
  "REDIS_URL",
  "CORS_ORIGIN",
  "SNAPSHOT_RETENTION",
  "API_RATE_LIMIT_MAX",
  "ACCESS_TOKEN_SECRET",
  "ACCESS_TOKEN_TTL",
  "REFRESH_TOKEN_TTL",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const VALID_ACCESS_TOKEN_SECRET = "unit-test-access-token-secret-0123456789";

// Sane baseline for OTHER unit files in this worker: exactly what tests/setup.ts
// establishes plus the token values auth-related modules need at import time.
const BASELINE_ENV: Record<EnvKey, string> = {
  NODE_ENV: "test",
  PORT: "5000",
  DATABASE_URL: "postgres://inkwell:inkwell_test@localhost:5433/inkwell_test",
  REDIS_URL: "redis://localhost:6380",
  LOG_LEVEL: "error",
  APP_NAME: "inkwell-test",
  CORS_ORIGIN: "http://localhost:5173",
  SNAPSHOT_RETENTION: "3",
  API_RATE_LIMIT_MAX: "100",
  ACCESS_TOKEN_SECRET: VALID_ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_TTL: "900",
  REFRESH_TOKEN_TTL: "604800",
};

let loadEnvSpy: MockInstance | undefined;
let exitSpy: MockInstance | undefined;
let consoleErrorSpy: MockInstance | undefined;

function isolateEnv(overrides: Partial<Record<EnvKey, string>> = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }

  vi.resetModules();
  loadEnvSpy = vi
    .spyOn(process, "loadEnvFile")
    .mockImplementation(() => undefined);
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code}`);
  }) as never);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  loadEnvSpy?.mockRestore();
  exitSpy?.mockRestore();
  consoleErrorSpy?.mockRestore();

  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(BASELINE_ENV)) {
    process.env[key] = value;
  }
});

describe("config (real module)", () => {
  it("applies documented defaults when optional vars are absent", async () => {
    isolateEnv({ ACCESS_TOKEN_SECRET: VALID_ACCESS_TOKEN_SECRET });

    const { env } = await import("@/config/config.js");

    expect(env.APP_NAME).toBe("Backend");
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.PORT).toBe(5000);
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(env.SNAPSHOT_RETENTION).toBe(3);
    expect(env.API_RATE_LIMIT_MAX).toBe(100);
    expect(env.ACCESS_TOKEN_TTL).toBe(900);
    expect(env.REFRESH_TOKEN_TTL).toBe(604800);
    expect(loadEnvSpy).toHaveBeenCalledTimes(1);
  });

  it("coerces numeric strings to numbers", async () => {
    isolateEnv({
      ACCESS_TOKEN_SECRET: VALID_ACCESS_TOKEN_SECRET,
      PORT: "3000",
      SNAPSHOT_RETENTION: "7",
      API_RATE_LIMIT_MAX: "250",
      ACCESS_TOKEN_TTL: "120",
      REFRESH_TOKEN_TTL: "1209600",
    });

    const { env } = await import("@/config/config.js");

    expect(env.PORT).toBe(3000);
    expect(env.SNAPSHOT_RETENTION).toBe(7);
    expect(env.API_RATE_LIMIT_MAX).toBe(250);
    expect(env.ACCESS_TOKEN_TTL).toBe(120);
    expect(env.REFRESH_TOKEN_TTL).toBe(1209600);
  });

  it("exits when ACCESS_TOKEN_SECRET is missing", async () => {
    isolateEnv({});

    await expect(import("@/config/config.js")).rejects.toThrow(
      "process.exit:1",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when ACCESS_TOKEN_SECRET is shorter than 24 chars", async () => {
    isolateEnv({ ACCESS_TOKEN_SECRET: "short-secret" });

    await expect(import("@/config/config.js")).rejects.toThrow(
      "process.exit:1",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when PORT is not positive", async () => {
    isolateEnv({
      ACCESS_TOKEN_SECRET: VALID_ACCESS_TOKEN_SECRET,
      PORT: "-1",
    });

    await expect(import("@/config/config.js")).rejects.toThrow(
      "process.exit:1",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

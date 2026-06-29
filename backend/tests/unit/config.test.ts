import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { DrawPermissions } from "@/types/types.js";

const envSchema = z.object({
  APP_NAME: z.string().default("Backend"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "http", "debug", "silly"])
    .default("info"),
  PORT: z.preprocess(
    (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : typeof val === "number" ? val : undefined),
    z.number().int().positive().default(5000),
  ),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SNAPSHOT_INTERVAL: z.preprocess(
    (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : typeof val === "number" ? val : undefined),
    z.number().int().positive().default(60000),
  ),
  SNAPSHOT_RETENTION: z.preprocess(
    (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : typeof val === "number" ? val : undefined),
    z.number().int().positive().default(3),
  ),
});

describe("config schema validation", () => {
  it("uses defaults for optional fields", () => {
    const result = envSchema.parse({
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(result.APP_NAME).toBe("Backend");
    expect(result.NODE_ENV).toBe("development");
    expect(result.LOG_LEVEL).toBe("info");
    expect(result.PORT).toBe(5000);
    expect(result.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(result.SNAPSHOT_INTERVAL).toBe(60000);
    expect(result.SNAPSHOT_RETENTION).toBe(3);
  });

  it("parses PORT from string", () => {
    const result = envSchema.parse({
      PORT: "3000",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(result.PORT).toBe(3000);
  });

  it("parses PORT from number", () => {
    const result = envSchema.parse({
      PORT: 4000,
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(result.PORT).toBe(4000);
  });

  it("rejects invalid NODE_ENV", () => {
    expect(() =>
      envSchema.parse({
        NODE_ENV: "invalid",
        DATABASE_URL: "postgres://test:test@localhost:5432/test",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow();
  });

  it("rejects invalid LOG_LEVEL", () => {
    expect(() =>
      envSchema.parse({
        LOG_LEVEL: "invalid",
        DATABASE_URL: "postgres://test:test@localhost:5432/test",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow();
  });

  it("rejects non-positive PORT", () => {
    expect(() =>
      envSchema.parse({
        PORT: "-1",
        DATABASE_URL: "postgres://test:test@localhost:5432/test",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow();
  });

  it("rejects missing DATABASE_URL", () => {
    expect(() => envSchema.parse({ REDIS_URL: "redis://localhost:6379" })).toThrow();
  });

  it("rejects missing REDIS_URL", () => {
    expect(() =>
      envSchema.parse({ DATABASE_URL: "postgres://test:test@localhost:5432/test" }),
    ).toThrow();
  });

  it("accepts DrawPermission enum values", () => {
    expect(DrawPermissions).toContain("owner");
    expect(DrawPermissions).toContain("anyone");
    expect(DrawPermissions.length).toBe(2);
  });
});

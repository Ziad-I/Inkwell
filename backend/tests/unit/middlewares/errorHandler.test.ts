import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const ENV_KEYS = ["NODE_ENV", "ACCESS_TOKEN_SECRET"] as const;
const BASELINE_ENV = {
  NODE_ENV: "test",
  ACCESS_TOKEN_SECRET: "unit-test-access-token-secret-0123456789",
};

function isolateEnv(nodeEnv: "test" | "production") {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.NODE_ENV = nodeEnv;
  process.env.ACCESS_TOKEN_SECRET = BASELINE_ENV.ACCESS_TOKEN_SECRET;

  vi.resetModules();
  vi.spyOn(process, "loadEnvFile").mockImplementation(() => undefined);
}

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, BASELINE_ENV);
});

describe("errorHandler", () => {
  it("passes through an error status and exposes the original message and stack outside production", async () => {
    isolateEnv("test");
    const { errorHandler } = await import("@/middlewares/errorHandler.js");
    const err = Object.assign(new Error("Bad request details"), {
      statusCode: 422,
    });
    const res = createResponse();

    errorHandler(err, {} as Request, res, {} as NextFunction);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad request details",
      stack: err.stack,
    });
  });

  it("defaults an error without a status to 500 outside production", async () => {
    isolateEnv("test");
    const { errorHandler } = await import("@/middlewares/errorHandler.js");
    const err = new Error("Unexpected failure");
    const res = createResponse();

    errorHandler(err, {} as Request, res, {} as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unexpected failure",
      stack: err.stack,
    });
  });

  it("masks a production 500 and excludes the stack", async () => {
    isolateEnv("production");
    const { errorHandler } = await import("@/middlewares/errorHandler.js");
    const err = new Error("Database credentials leaked");
    const res = createResponse();

    errorHandler(err, {} as Request, res, {} as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal Server Error" });
  });

  it("preserves a non-500 production error message while excluding the stack", async () => {
    isolateEnv("production");
    const { errorHandler } = await import("@/middlewares/errorHandler.js");
    const err = Object.assign(new Error("Not authorized"), { status: 401 });
    const res = createResponse();

    errorHandler(err, {} as Request, res, {} as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Not authorized" });
  });
});

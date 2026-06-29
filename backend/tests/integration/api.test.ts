import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { httpServer } from "./setup.js";

describe("GET /health", () => {
  it("returns 200 with OK status", async () => {
    const res = await supertest(httpServer).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "OK" });
  });
});

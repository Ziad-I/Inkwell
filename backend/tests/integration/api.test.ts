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

describe("unknown API routes", () => {
  it("returns the public 404 error contract", async () => {
    const res = await supertest(httpServer).get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Not Found" });
  });
});

import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { httpServer } from "./setup.js";

// NOTE: httpServer is assigned by setup.ts's beforeAll, so the supertest
// instance must be created lazily inside tests (module scope would capture
// `undefined`).
function api() {
  return supertest(httpServer);
}

const USER_PAYLOAD = {
  username: "carol",
  email: "carol@example.com",
  password: "supersecret",
};

describe("users API", () => {
  it("returns 401 for /me without a token", async () => {
    const res = await api().get("/api/users/me");

    expect(res.status).toBe(401);
  });

  it("returns 401 for /me with an invalid token", async () => {
    const res = await api()
      .get("/api/users/me")
      .set("Authorization", "Bearer not-a-valid-token");

    expect(res.status).toBe(401);
  });

  it("returns the user for /me with a valid token", async () => {
    const register = await api().post("/api/auth/register").send(USER_PAYLOAD);
    expect(register.status).toBe(201);

    const res = await api()
      .get("/api/users/me")
      .set("Authorization", `Bearer ${register.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: expect.any(String),
      username: "carol",
      email: "carol@example.com",
    });
  });
});
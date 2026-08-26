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

describe("PATCH /api/users/me", () => {
  it("returns 409 when concurrent users claim the same email", async () => {
    const suffix = crypto.randomUUID();
    const registrations = await Promise.all(
      ["a", "b"].map((label) =>
        api().post("/api/auth/register").send({
          username: `${label}_${suffix}`,
          email: `${label}_${suffix}@test.local`,
          password: "supersecret",
        }),
      ),
    );
    const target = `shared_${suffix}@test.local`;
    const results = await Promise.all(
      registrations.map((registration) =>
        api()
          .patch("/api/users/me")
          .set("Authorization", `Bearer ${registration.body.accessToken}`)
          .send({ email: target }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body).toEqual({
      message: "Email is already registered",
    });
  });

  it("401 without a token", async () => {
    expect(
      (await api().patch("/api/users/me").send({ username: "x" })).status,
    ).toBe(401);
  });

  it("updates the username", async () => {
    const stamp = Date.now();
    const reg = await api().post("/api/auth/register").send({
      username: `upd_${stamp}`,
      email: `upd_${stamp}@test.local`,
      password: "supersecret",
    });
    const res = await api()
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${reg.body.accessToken}`)
      .send({ username: `renamed_${stamp}` });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(`renamed_${stamp}`);
  });

  it("updates the email", async () => {
    const stamp = Date.now();
    const reg = await api().post("/api/auth/register").send({
      username: `upde_${stamp}`,
      email: `upde_${stamp}@test.local`,
      password: "supersecret",
    });
    const res = await api()
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${reg.body.accessToken}`)
      .send({ email: `moved_${stamp}@test.local` });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(`moved_${stamp}@test.local`);
  });

  it("400 on empty update, 400 on malformed email, 409 on taken email", async () => {
    const stamp = Date.now();
    const a = await api().post("/api/auth/register").send({
      username: `conf_a_${stamp}`,
      email: `conf_a_${stamp}@test.local`,
      password: "supersecret",
    });
    const b = await api().post("/api/auth/register").send({
      username: `conf_b_${stamp}`,
      email: `conf_b_${stamp}@test.local`,
      password: "supersecret",
    });
    const tokenA = a.body.accessToken as string;

    expect(
      (
        await api()
          .patch("/api/users/me")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await api()
          .patch("/api/users/me")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ email: "nope" })
      ).status,
    ).toBe(400);
    expect(
      (
        await api()
          .patch("/api/users/me")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ email: `conf_b_${stamp}@test.local` })
      ).status,
    ).toBe(409);

    // Re-submitting your own values is not a conflict
    const own = await api()
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        username: `conf_a_${stamp}`,
        email: `conf_a_${stamp}@test.local`,
      });
    expect(own.status).toBe(200);
    expect(own.body.user).toMatchObject({
      username: `conf_a_${stamp}`,
      email: `conf_a_${stamp}@test.local`,
    });
  });
});

import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { httpServer } from "./setup.js";

const REFRESH_COOKIE = "inkwell_refresh";

// NOTE: httpServer is assigned by setup.ts's beforeAll, so the supertest
// instance must be created lazily inside tests (module scope would capture
// `undefined`).
function api() {
  return supertest(httpServer);
}

const REGISTER_PAYLOAD = {
  username: "alice",
  email: "alice@example.com",
  password: "supersecret",
};

describe("auth API", () => {
  it("registers a user and returns access token + refresh cookie", async () => {
    const res = await api().post("/api/auth/register").send(REGISTER_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      id: expect.any(String),
      username: "alice",
      email: "alice@example.com",
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects duplicate email registration", async () => {
    const res = await api().post("/api/auth/register").send(REGISTER_PAYLOAD);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Email is already registered");
  });

  it("rejects duplicate username registration", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ ...REGISTER_PAYLOAD, email: "alice2@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Username is already taken");
  });

  it("rejects invalid registration input", async () => {
    const res = await api().post("/api/auth/register").send({
      username: "bob",
      email: "not-an-email",
      password: "short",
    });

    expect(res.status).toBe(400);
  });

  it("rejects login with wrong password", async () => {
    const res = await api().post("/api/auth/login").send({
      email: "alice@example.com",
      password: "wrongpass",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("logs in and returns access token + refresh cookie", async () => {
    const res = await api().post("/api/auth/login").send({
      email: "alice@example.com",
      password: "supersecret",
    });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeDefined();
  });

it("refreshes the access token with the refresh cookie and rotates it", async () => {
    const login = await api().post("/api/auth/login").send({
      email: "alice@example.com",
      password: "supersecret",
    });
    const oldCookie = getRefreshCookie(login);

    const refresh = await api()
      .post("/api/auth/refresh")
      .set("Cookie", oldCookie);

    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toEqual(expect.any(String));
    expect(refresh.body.user.email).toBe("alice@example.com");
    const newCookie = getRefreshCookie(refresh);
    expect(newCookie).not.toBe(oldCookie);
  });

  it("rejects a reused (rotated-out) refresh token", async () => {
    const login = await api().post("/api/auth/login").send({
      email: "alice@example.com",
      password: "supersecret",
    });
    const cookie = getRefreshCookie(login);

    const first = await api().post("/api/auth/refresh").set("Cookie", cookie);
    expect(first.status).toBe(200);

    const second = await api()
      .post("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(second.status).toBe(401);
  });

  it("rejects /refresh without a cookie", async () => {
    const res = await api().post("/api/auth/refresh");

    expect(res.status).toBe(401);
  });

  it("logs out: revokes the refresh token and clears the cookie", async () => {
    const login = await api().post("/api/auth/login").send({
      email: "alice@example.com",
      password: "supersecret",
    });
    const cookie = getRefreshCookie(login);

    const logout = await api().post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);

    const refresh = await api()
      .post("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(refresh.status).toBe(401);
  });
});

// The route sets the cookie with Path=/api/auth; curl-style tooling and
// supertest need the raw token value, but for these assertions only the
// cookie header matters.
function getRefreshCookie(res: supertest.Response): string {
  const setCookie = res.headers["set-cookie"] as string[] | undefined;
  const cookie = setCookie?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  expect(cookie).toBeDefined();
  return cookie!.split(";")[0]!;
}
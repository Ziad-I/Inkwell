import { describe, it, expect } from "vitest";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import { httpServer, seedRefreshToken, seedUser } from "./setup.js";
import { env } from "@/config/config.js";

const REFRESH_COOKIE = "inkwell_refresh";

// NOTE: httpServer is assigned by setup.ts's beforeAll, so the supertest
// instance must be created lazily inside tests (module scope would capture
// `undefined`).
function api() {
  return supertest(httpServer);
}

function registrationPayload() {
  const suffix = crypto.randomUUID();
  return {
    username: `user_${suffix}`,
    email: `${suffix}@test.local`,
    password: "supersecret",
  };
}

async function registerUser() {
  const payload = registrationPayload();
  const res = await api().post("/api/auth/register").send(payload);
  expect(res.status).toBe(201);
  return { payload, response: res };
}

describe("auth API", () => {
  it("registers a user and returns access token + refresh cookie", async () => {
    const { payload, response: res } = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      id: expect.any(String),
      username: payload.username,
      email: payload.email,
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects duplicate email registration", async () => {
    const { payload } = await registerUser();
    const res = await api().post("/api/auth/register").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Email is already registered");
  });

  it("rejects duplicate username registration", async () => {
    const { payload } = await registerUser();
    const res = await api().post("/api/auth/register").send({
      ...payload,
      email: `${crypto.randomUUID()}@test.local`,
    });

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
    const { payload } = await registerUser();
    const res = await api().post("/api/auth/login").send({
      email: payload.email,
      password: "wrongpass",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("logs in and returns access token + refresh cookie", async () => {
    const { payload } = await registerUser();
    const res = await api().post("/api/auth/login").send({
      email: payload.email,
      password: "supersecret",
    });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(payload.username);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("refreshes the access token with the refresh cookie and rotates it", async () => {
    const { payload } = await registerUser();
    const login = await api().post("/api/auth/login").send(payload);
    const oldCookie = getRefreshCookie(login);

    const refresh = await api()
      .post("/api/auth/refresh")
      .set("Cookie", oldCookie);

    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toEqual(expect.any(String));
    expect(refresh.body.user.email).toBe(payload.email);
    const newCookie = getRefreshCookie(refresh);
    expect(newCookie).not.toBe(oldCookie);
  });

  it("rejects a reused (rotated-out) refresh token", async () => {
    const { payload } = await registerUser();
    const login = await api().post("/api/auth/login").send(payload);
    const cookie = getRefreshCookie(login);

    const first = await api().post("/api/auth/refresh").set("Cookie", cookie);
    expect(first.status).toBe(200);

    const second = await api()
      .post("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(second.status).toBe(401);
  });

  it("allows exactly one concurrent rotation of the same refresh cookie", async () => {
    const { payload } = await registerUser();
    const login = await api().post("/api/auth/login").send(payload);
    const cookie = getRefreshCookie(login);

    const results = await Promise.all([
      api().post("/api/auth/refresh").set("Cookie", cookie),
      api().post("/api/auth/refresh").set("Cookie", cookie),
    ]);

    expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([
      200,
      401,
    ]);
  });

  it("revokes sibling login cookies when an old refresh token is replayed", async () => {
    const { payload } = await registerUser();
    const loginA = await api().post("/api/auth/login").send(payload);
    const loginB = await api().post("/api/auth/login").send(payload);
    const cookieA = getRefreshCookie(loginA);
    const cookieB = getRefreshCookie(loginB);

    const rotation = await api().post("/api/auth/refresh").set("Cookie", cookieA);
    expect(rotation.status).toBe(200);

    const replay = await api().post("/api/auth/refresh").set("Cookie", cookieA);
    expect(replay.status).toBe(401);

    const sibling = await api().post("/api/auth/refresh").set("Cookie", cookieB);
    expect(sibling.status).toBe(401);
  });

  it("rejects an expired access JWT on /api/users/me", async () => {
    const userId = await seedUser();
    const token = jwt.sign(
      { sub: userId, kind: "access" },
      env.ACCESS_TOKEN_SECRET,
      { expiresIn: -1 },
    );

    const res = await api()
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it("rejects an expired refresh row with the expiry message", async () => {
    const userId = await seedUser();
    const token = await seedRefreshToken(userId, {
      expiresAt: new Date(Date.now() - 1_000),
    });

    const res = await api()
      .post("/api/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Refresh token expired");
  });

  it("sets the refresh cookie with the hardened contract after refresh", async () => {
    const { payload } = await registerUser();
    const login = await api().post("/api/auth/login").send(payload);
    const refresh = await api()
      .post("/api/auth/refresh")
      .set("Cookie", getRefreshCookie(login));
    const cookie = getRefreshSetCookie(refresh);

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/auth");
  });

  it("rejects /refresh without a cookie", async () => {
    const res = await api().post("/api/auth/refresh");

    expect(res.status).toBe(401);
  });

  it("logs out: revokes the refresh token and clears the cookie", async () => {
    const { payload } = await registerUser();
    const login = await api().post("/api/auth/login").send(payload);
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
  const cookie = getRefreshSetCookie(res);
  return cookie.split(";")[0]!;
}

function getRefreshSetCookie(res: supertest.Response): string {
  const setCookie = res.headers["set-cookie"] as string[] | undefined;
  const cookie = setCookie?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  expect(cookie).toBeDefined();
  return cookie!;
}

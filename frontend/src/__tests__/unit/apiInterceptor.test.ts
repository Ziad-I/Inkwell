import { beforeEach, describe, expect, it } from "vitest";

import { apiClient } from "@/api/client";
import { installAuthInterceptors } from "@/api/interceptors";
import { useAuthStore } from "@/stores/authStore";

import {
  deferred,
  flushAsync,
  httpError,
  installHttpAdapter,
  resetAuthStore,
  sessionWith,
  type HttpAdapterHarness,
} from "../helpers/httpClient";

/*
 * Install the real interceptor stack once for this Axios instance.
 *
 * refreshSession itself uses this same apiClient, so the refresh request
 * crosses the same test adapter and exercises the real session subsystem.
 */
import { refreshSession } from "@/api/session";

installAuthInterceptors(apiClient, refreshSession);

let harness: HttpAdapterHarness;

beforeEach(() => {
  resetAuthStore();
  harness = installHttpAdapter(apiClient);
});

describe("api request interceptor", () => {
  it("attaches the bearer token to non-authenticated requests when present", async () => {
    useAuthStore.setState({
      accessToken: "token-1",
    });

    harness.stub(() => ({}));

    await apiClient.get("/boards");

    expect(harness.requests[0].headers.Authorization).toBe("Bearer token-1");
  });

  it("omits the Authorization header when no token is present", async () => {
    harness.stub(() => ({}));

    await apiClient.get("/boards");

    expect(harness.requests[0].headers.Authorization).toBeUndefined();
  });

  it("does not attach the bearer token to auth endpoints", async () => {
    useAuthStore.setState({
      accessToken: "token-1",
    });

    harness.stub(() => ({}));

    await apiClient.post("/auth/login", {
      email: "alice@example.com",
      password: "password",
    });

    expect(harness.requests[0].headers.Authorization).toBeUndefined();
  });
});

describe("api response interceptor refresh eligibility", () => {
  it("rejects a plain 401 without attempting a refresh", async () => {
    harness.stub(() => {
      throw httpError(401);
    });

    await expect(apiClient.get("/boards")).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(
      harness.requests.filter((request) => request.url === "/auth/refresh"),
    ).toHaveLength(0);
  });

  it("propagates non-401 failures without refreshing", async () => {
    harness.stub(() => {
      throw httpError(503);
    });

    await expect(
      apiClient.get("/boards", {
        metadata: {
          allowAuthRefresh: true,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        status: 503,
      },
    });

    expect(
      harness.requests.filter((request) => request.url === "/auth/refresh"),
    ).toHaveLength(0);
  });

  it.each([["/auth/login"], ["/auth/register"], ["/auth/logout"]] as const)(
    "does not refresh after a 401 from %s",
    async (url) => {
      harness.stub(() => {
        throw httpError(401);
      });

      await expect(
        apiClient.post(url, null, {
          metadata: {
            allowAuthRefresh: true,
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 401,
        },
      });

      expect(
        harness.requests.filter((request) => request.url === "/auth/refresh"),
      ).toHaveLength(0);
    },
  );

  it("does not recursively refresh a failed refresh request", async () => {
    harness.stub(() => {
      throw httpError(401);
    });

    await expect(
      apiClient.post("/auth/refresh", null, {
        metadata: {
          allowAuthRefresh: true,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    const refreshRequests = harness.requests.filter(
      (request) => request.url === "/auth/refresh",
    );

    expect(refreshRequests).toHaveLength(1);
    expect(refreshRequests[0].headers.Authorization).toBeUndefined();
  });
});

describe("api response interceptor refresh and retry", () => {
  it("refreshes once and retries the original request with the fresh token", async () => {
    useAuthStore.setState({
      user: sessionWith("stale-token").user,
      accessToken: "stale-token",
      status: "authenticated",
    });

    const attempts: string[] = [];

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        return {
          data: sessionWith("fresh-token"),
        };
      }

      if (request.url === "/boards") {
        attempts.push(request.headers.Authorization ?? "none");

        if (request.headers.Authorization === "Bearer fresh-token") {
          return {
            data: {
              boards: [],
            },
          };
        }

        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const response = await apiClient.get("/boards", {
      metadata: {
        allowAuthRefresh: true,
      },
    });

    expect(response.data).toEqual({
      boards: [],
    });

    expect(attempts).toEqual(["Bearer stale-token", "Bearer fresh-token"]);

    const refreshRequests = harness.requests.filter(
      (request) => request.url === "/auth/refresh",
    );

    expect(refreshRequests).toHaveLength(1);

    expect(refreshRequests[0]).toMatchObject({
      url: "/auth/refresh",
      method: "post",
    });

    expect(refreshRequests[0].headers.Authorization).toBeUndefined();

    expect(refreshRequests[0].signal).toBeInstanceOf(AbortSignal);

    expect(useAuthStore.getState().accessToken).toBe("fresh-token");
  });

  it("does not refresh again when the retried request still 401s", async () => {
    let boardAttempts = 0;

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        return {
          data: sessionWith("fresh-token"),
        };
      }

      if (request.url === "/boards") {
        boardAttempts += 1;
        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    await expect(
      apiClient.get("/boards", {
        metadata: {
          allowAuthRefresh: true,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(
      harness.requests.filter((request) => request.url === "/auth/refresh"),
    ).toHaveLength(1);

    expect(boardAttempts).toBe(2);
  });

  it("clears the session and rejects with the original error when refresh fails", async () => {
    useAuthStore.setState({
      user: sessionWith("stale-token").user,
      accessToken: "stale-token",
      status: "authenticated",
    });

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        throw httpError(401);
      }

      if (request.url === "/boards") {
        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    await expect(
      apiClient.get("/boards", {
        metadata: {
          allowAuthRefresh: true,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });

    expect(
      harness.requests.filter((request) => request.url === "/boards"),
    ).toHaveLength(1);
  });

  it("treats a schema-violating refresh payload as a failed refresh", async () => {
    useAuthStore.setState({
      user: sessionWith("stale-token").user,
      accessToken: "stale-token",
      status: "authenticated",
    });

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        return {
          data: {
            user: {
              id: 42,
              username: "alice",
              email: "alice@example.com",
            },
            accessToken: "fresh-token",
          },
        };
      }

      if (request.url === "/boards") {
        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    await expect(
      apiClient.get("/boards", {
        metadata: {
          allowAuthRefresh: true,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });

    expect(
      harness.requests.filter((request) => request.url === "/boards"),
    ).toHaveLength(1);
  });
});

describe("api response interceptor epoch safety", () => {
  it("writes nothing to the store when refresh resolves after logout", async () => {
    useAuthStore.setState({
      user: sessionWith("stale-token").user,
      accessToken: "stale-token",
      status: "authenticated",
    });

    const gate = deferred<{ data: unknown }>();

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        return gate.promise;
      }

      if (request.url === "/boards") {
        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const pending = apiClient.get("/boards", {
      metadata: {
        allowAuthRefresh: true,
      },
    });

    await flushAsync();

    useAuthStore.getState().logoutLocally();

    gate.resolve({
      data: sessionWith("fresh-token"),
    });

    await expect(pending).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });

    expect(
      harness.requests.filter((request) => request.url === "/boards"),
    ).toHaveLength(1);
  });

  it("cannot clear a newer login when a stale refresh fails", async () => {
    useAuthStore.setState({
      user: sessionWith("stale-token").user,
      accessToken: "stale-token",
      status: "authenticated",
    });

    const gate = deferred<{ data: unknown }>();

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        return gate.promise;
      }

      if (request.url === "/boards") {
        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const pending = apiClient.get("/boards", {
      metadata: {
        allowAuthRefresh: true,
      },
    });

    await flushAsync();

    useAuthStore.getState().logoutLocally();

    const reloginEpoch = useAuthStore.getState().captureEpoch();

    useAuthStore
      .getState()
      .commitSession(reloginEpoch, sessionWith("relogin-token"));

    gate.reject(httpError(401));

    await expect(pending).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(useAuthStore.getState()).toMatchObject({
      user: sessionWith("relogin-token").user,
      accessToken: "relogin-token",
      status: "authenticated",
    });
  });
});

describe("api response interceptor refresh deduplication", () => {
  it("deduplicates the refresh when two eligible reads fail together", async () => {
    useAuthStore.setState({
      user: sessionWith("stale-token").user,
      accessToken: "stale-token",
      status: "authenticated",
    });

    let boardReads = 0;

    const gate = deferred<{ data: unknown }>();

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        return gate.promise;
      }

      if (request.url === "/boards" || request.url === "/boards/b1") {
        boardReads += 1;

        if (boardReads <= 2) {
          throw httpError(401);
        }

        return {
          data: request.url === "/boards" ? { boards: [] } : { ok: true },
        };
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const first = apiClient.get("/boards", {
      metadata: {
        allowAuthRefresh: true,
      },
    });

    const second = apiClient.get("/boards/b1", {
      metadata: {
        allowAuthRefresh: true,
      },
    });

    await flushAsync();

    expect(
      harness.requests.filter((request) => request.url === "/auth/refresh"),
    ).toHaveLength(1);

    gate.resolve({
      data: sessionWith("fresh-token"),
    });

    await expect(first).resolves.toMatchObject({
      data: {
        boards: [],
      },
    });

    await expect(second).resolves.toMatchObject({
      data: {
        ok: true,
      },
    });

    expect(boardReads).toBe(4);
  });

  it("never shares an in-flight refresh across epochs", async () => {
    useAuthStore.setState({
      user: sessionWith("stale-token").user,
      accessToken: "stale-token",
      status: "authenticated",
    });

    const firstRefresh = deferred<{ data: unknown }>();

    const secondRefresh = deferred<{ data: unknown }>();

    let refreshCount = 0;

    harness.stub((request) => {
      if (request.url === "/auth/refresh") {
        refreshCount += 1;

        return refreshCount === 1
          ? firstRefresh.promise
          : secondRefresh.promise;
      }

      if (request.url === "/boards") {
        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    const stale = apiClient.get("/boards", {
      metadata: {
        allowAuthRefresh: true,
      },
    });

    await flushAsync();

    useAuthStore.getState().logoutLocally();

    const fresh = apiClient.get("/boards", {
      metadata: {
        allowAuthRefresh: true,
      },
    });

    await flushAsync();

    expect(
      harness.requests.filter((request) => request.url === "/auth/refresh"),
    ).toHaveLength(2);

    firstRefresh.resolve({
      data: sessionWith("stale-refresh-token"),
    });

    await expect(stale).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    secondRefresh.resolve({
      data: sessionWith("fresh-token"),
    });

    await expect(fresh).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(useAuthStore.getState().accessToken).toBe("fresh-token");
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { restoreSession, revokeServerSession } from "@/api/auth";
import { apiClient } from "@/api/client";
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

let harness: HttpAdapterHarness;

beforeEach(() => {
  resetAuthStore();
  harness = installHttpAdapter(apiClient);
});

describe("restoreSession", () => {
  it("resolves authenticated and commits the session when refresh succeeds", async () => {
    harness.stub((request) => {
      expect(request.url).toBe("/auth/refresh");
      expect(request.method).toBe("post");
      expect(request.headers.Authorization).toBeUndefined();

      return {
        data: sessionWith("access-1"),
      };
    });

    await expect(restoreSession()).resolves.toBe("authenticated");

    expect(useAuthStore.getState()).toMatchObject({
      user: sessionWith("access-1").user,
      accessToken: "access-1",
      status: "authenticated",
    });
  });

  it("marks the store restoring while refresh is in flight", async () => {
    const gate = deferred<{ data: unknown }>();

    harness.stub((request) => {
      expect(request.url).toBe("/auth/refresh");
      return gate.promise;
    });

    const pending = restoreSession();

    await flushAsync();

    expect(useAuthStore.getState().status).toBe("restoring");

    gate.resolve({
      data: sessionWith("access-1"),
    });

    await expect(pending).resolves.toBe("authenticated");
  });

  it("resolves unauthenticated and clears credentials when refresh fails", async () => {
    useAuthStore.setState({
      user: sessionWith("old-token").user,
      accessToken: "old-token",
      status: "authenticated",
    });

    harness.stub(() => {
      throw httpError(401);
    });

    await expect(restoreSession()).resolves.toBe("unauthenticated");

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });
  });

  it("does not restore the session after logout", async () => {
    const gate = deferred<{ data: unknown }>();

    harness.stub((request) => {
      expect(request.url).toBe("/auth/refresh");
      return gate.promise;
    });

    const restore = restoreSession();

    await flushAsync();

    useAuthStore.getState().logoutLocally();

    gate.resolve({
      data: sessionWith("access-2"),
    });

    await expect(restore).resolves.toBe("stale");

    expect(useAuthStore.getState().accessToken).toBeNull();

    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("cannot clear a newer login when a stale restore fails", async () => {
    const gate = deferred<{ data: unknown }>();

    harness.stub((request) => {
      expect(request.url).toBe("/auth/refresh");
      return gate.promise;
    });

    const restore = restoreSession();

    await flushAsync();

    useAuthStore.getState().logoutLocally();

    const epoch = useAuthStore.getState().captureEpoch();

    useAuthStore.getState().commitSession(epoch, sessionWith("relogin-token"));

    gate.reject(httpError(503));

    await expect(restore).resolves.toBe("stale");

    expect(useAuthStore.getState()).toMatchObject({
      user: sessionWith("relogin-token").user,
      accessToken: "relogin-token",
      status: "authenticated",
    });
  });

  it("resolves unauthenticated when the refresh payload is malformed", async () => {
    harness.stub((request) => {
      expect(request.url).toBe("/auth/refresh");

      return {
        data: {
          accessToken: "",
        },
      };
    });

    await expect(restoreSession()).resolves.toBe("unauthenticated");

    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("threads the caller's abort signal into the refresh request", async () => {
    const controller = new AbortController();
    const gate = deferred<{ data: unknown }>();

    harness.stub((request) => {
      expect(request.url).toBe("/auth/refresh");
      return gate.promise;
    });

    const pending = restoreSession({
      signal: controller.signal,
    });

    await flushAsync();

    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0].url).toBe("/auth/refresh");

    const refreshSignal = harness.requests[0].signal;

    expect(refreshSignal).toBeInstanceOf(AbortSignal);
    expect(refreshSignal).not.toBe(controller.signal);
    expect(refreshSignal?.aborted).toBe(false);

    controller.abort();

    expect(refreshSignal?.aborted).toBe(true);

    gate.resolve({
      data: sessionWith("access-1"),
    });

    await expect(pending).resolves.toBe("unauthenticated");

    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });
});

describe("revokeServerSession", () => {
  it("revokes the session through the shared client without a bearer token", async () => {
    useAuthStore.setState({
      accessToken: "token-1",
    });

    harness.stub((request) => {
      expect(request.url).toBe("/auth/logout");
      expect(request.method).toBe("post");

      expect(request.headers.Authorization).toBeUndefined();

      return {
        status: 204,
      };
    });

    await expect(revokeServerSession()).resolves.toBeUndefined();

    expect(harness.requests).toHaveLength(1);

    expect(harness.requests[0]).toMatchObject({
      url: "/auth/logout",
      method: "post",
    });

    expect(harness.requests[0].headers.Authorization).toBeUndefined();
  });

  it("resolves even when the logout request fails", async () => {
    harness.stub(() => {
      throw httpError(503);
    });

    await expect(revokeServerSession()).resolves.toBeUndefined();
  });

  it("does not trigger auth refresh when logout fails with 401", async () => {
    harness.stub((request) => {
      if (request.url === "/auth/logout") {
        throw httpError(401);
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    await expect(revokeServerSession()).resolves.toBeUndefined();

    expect(
      harness.requests.filter((request) => request.url === "/auth/refresh"),
    ).toHaveLength(0);
  });
});

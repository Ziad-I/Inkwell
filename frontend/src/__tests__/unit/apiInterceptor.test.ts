import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosError } from "axios";
import { useAuthStore } from "@/stores/authStore";

function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    status: "idle",
  });
}

function makeAxiosError(status: number, url: string, retried = false) {
  return {
    response: { status },
    config: { url, headers: {}, _retried: retried },
  } as unknown as AxiosError;
}

type RequestHandler = (config: { headers: Record<string, string> }) => unknown;
type ResponseHandler = {
  onFulfilled: (response: unknown) => unknown;
  onRejected: (error: AxiosError) => unknown;
};

const instanceRequest = vi.fn();
const requestHandlers: RequestHandler[] = [];
const responseHandlers: ResponseHandler[] = [];
const axiosPostMock = vi.fn();

const fakeInstance = Object.assign(instanceRequest, {
  interceptors: {
    request: {
      use: (onFulfilled: RequestHandler) => {
        requestHandlers.push(onFulfilled);
      },
    },
    response: {
      use: (
        onFulfilled: (response: unknown) => unknown,
        onRejected: (error: AxiosError) => unknown,
      ) => {
        responseHandlers.push({ onFulfilled, onRejected });
      },
    },
  },
});

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      create: () => fakeInstance,
      post: axiosPostMock,
    },
  };
});

async function loadApi() {
  return import("@/lib/api");
}

beforeEach(() => {
  resetStore();
});

describe("api request interceptor", () => {
  it("attaches the bearer token when present", async () => {
    await loadApi();
    useAuthStore.setState({ accessToken: "token-1" });

    const config = await requestHandlers[0]({ headers: {} });

    expect(
      (config as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer token-1");
  });

  it("does not attach a header when no token is present", async () => {
    await loadApi();

    const config = await requestHandlers[0]({ headers: {} });

    expect(
      (config as { headers: Record<string, string> }).headers.Authorization,
    ).toBeUndefined();
  });
});

describe("api response interceptor", () => {
  beforeEach(() => {
    instanceRequest.mockReset();
    axiosPostMock.mockReset();
  });

  it("retries the original request once after a successful refresh", async () => {
    await loadApi();
    axiosPostMock.mockResolvedValue({ data: { accessToken: "new-access" } });
    instanceRequest.mockResolvedValue({ status: 200 });

    const err = makeAxiosError(401, "/boards");
    const result = await responseHandlers[0].onRejected(err);

    expect(axiosPostMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      null,
      { withCredentials: true },
    );
    expect(useAuthStore.getState().accessToken).toBe("new-access");
    expect((err.config as { _retried?: boolean })._retried).toBe(true);
    expect(
      (err.config as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer new-access");
    expect(instanceRequest).toHaveBeenCalledWith(err.config);
    expect(result).toEqual({ status: 200 });
  });

  it("does not retry non-401 errors", async () => {
    await loadApi();
    const err = makeAxiosError(500, "/boards");

    await expect(responseHandlers[0].onRejected(err)).rejects.toBe(err);
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(instanceRequest).not.toHaveBeenCalled();
  });

  it("does not retry a request that was already retried", async () => {
    await loadApi();
    const err = makeAxiosError(401, "/boards", true);

    await expect(responseHandlers[0].onRejected(err)).rejects.toBe(err);
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(instanceRequest).not.toHaveBeenCalled();
  });

  it("does not retry the refresh endpoint itself", async () => {
    await loadApi();
    const err = makeAxiosError(401, "/auth/refresh");

    await expect(responseHandlers[0].onRejected(err)).rejects.toBe(err);
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(instanceRequest).not.toHaveBeenCalled();
  });

  it("does not retry 401s from login or register", async () => {
    await loadApi();
    const err = makeAxiosError(401, "/auth/login");

    await expect(responseHandlers[0].onRejected(err)).rejects.toBe(err);
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(instanceRequest).not.toHaveBeenCalled();
  });

  it("clears the session when refresh fails", async () => {
    await loadApi();
    useAuthStore.setState({
      user: { id: "u1", username: "alice", email: "a@b.c" },
      accessToken: "stale",
      status: "authenticated",
    });
    axiosPostMock.mockRejectedValue(new Error("no cookie"));

    const err = makeAxiosError(401, "/boards");

    await expect(responseHandlers[0].onRejected(err)).rejects.toBe(err);

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.status).toBe("unauthenticated");
    expect(instanceRequest).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/stores/authStore";

const MOCK_USER = { id: "user-1", username: "alice", email: "a@b.c" };

function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    status: "idle",
  });
}

describe("authStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("setSession stores the user and access token as authenticated", () => {
    useAuthStore.getState().setSession(MOCK_USER, "access-1");

    expect(useAuthStore.getState().user).toEqual(MOCK_USER);
    expect(useAuthStore.getState().accessToken).toBe("access-1");
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("setUser updates only the user", () => {
    useAuthStore.getState().setUser(MOCK_USER);

    expect(useAuthStore.getState().user).toEqual(MOCK_USER);
    expect(useAuthStore.getState().status).toBe("idle");
  });

  it("setAccessToken updates only the access token", () => {
    useAuthStore.getState().setAccessToken("access-2");

    expect(useAuthStore.getState().accessToken).toBe("access-2");
  });

  it("setStatus updates only the status", () => {
    useAuthStore.getState().setStatus("loading");

    expect(useAuthStore.getState().status).toBe("loading");
  });

  it("clearSession resets user, token, and status", () => {
    useAuthStore.setState({
      user: MOCK_USER,
      accessToken: "access-1",
      status: "authenticated",
    });

    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });
});

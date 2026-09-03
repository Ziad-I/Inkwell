import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/stores/authStore";

const MOCK_USER = { id: "user-1", username: "alice", email: "a@b.c" };
const VALID_SESSION = { user: MOCK_USER, accessToken: "access-1" };

function resetStore() {
  useAuthStore.setState({
    epoch: 0,
    user: null,
    accessToken: null,
    status: "idle",
  });
}

describe("authStore epoch safety", () => {
  beforeEach(() => {
    resetStore();
  });

  it("cannot restore credentials after logout wins", () => {
    const store = useAuthStore.getState();
    const epoch = store.captureEpoch();
    store.logoutLocally();

    expect(store.commitSession(epoch, VALID_SESSION)).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });
  });

  it("commitSession within the current epoch authenticates", () => {
    const store = useAuthStore.getState();
    const epoch = store.captureEpoch();

    const committed = store.commitSession(epoch, VALID_SESSION);

    expect(committed).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      epoch,
      user: MOCK_USER,
      accessToken: "access-1",
      status: "authenticated",
    });
  });

  it("beginRestore within the current epoch marks restoring", () => {
    const store = useAuthStore.getState();
    const epoch = store.captureEpoch();

    expect(store.beginRestore(epoch)).toBe(true);
    expect(useAuthStore.getState().status).toBe("restoring");
  });

  it("beginRestore with a stale epoch performs no write", () => {
    const store = useAuthStore.getState();
    const epoch = store.captureEpoch();
    store.logoutLocally();

    expect(store.beginRestore(epoch)).toBe(false);
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("commitUnauthenticated within the current epoch clears credentials", () => {
    const store = useAuthStore.getState();
    const epoch = store.captureEpoch();
    store.commitSession(epoch, VALID_SESSION);

    expect(store.commitUnauthenticated(epoch)).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });
  });

  it("commitUnauthenticated with a stale epoch cannot clobber a newer login", () => {
    const store = useAuthStore.getState();
    const staleEpoch = store.captureEpoch();
    store.logoutLocally();
    const freshEpoch = useAuthStore.getState().captureEpoch();
    useAuthStore.getState().commitSession(freshEpoch, VALID_SESSION);

    expect(store.commitUnauthenticated(staleEpoch)).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      user: MOCK_USER,
      accessToken: "access-1",
      status: "authenticated",
    });
  });

  it("failRestore within the current epoch marks error", () => {
    const store = useAuthStore.getState();
    const epoch = store.captureEpoch();
    store.beginRestore(epoch);

    expect(store.failRestore(epoch)).toBe(true);
    expect(useAuthStore.getState().status).toBe("error");
  });

  it("failRestore with a stale epoch does not clobber a newer login", () => {
    const store = useAuthStore.getState();
    const staleEpoch = store.captureEpoch();
    store.logoutLocally();
    const freshEpoch = useAuthStore.getState().captureEpoch();
    useAuthStore.getState().commitSession(freshEpoch, VALID_SESSION);

    expect(store.failRestore(staleEpoch)).toBe(false);
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("logoutLocally increments the epoch once and clears credentials atomically", () => {
    const store = useAuthStore.getState();
    store.commitSession(store.captureEpoch(), VALID_SESSION);

    const returnedEpoch = store.logoutLocally();

    expect(returnedEpoch).toBe(1);
    expect(useAuthStore.getState()).toMatchObject({
      epoch: 1,
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });
  });

  it("captureEpoch reads the epoch without writing state", () => {
    const first = useAuthStore.getState().captureEpoch();
    const second = useAuthStore.getState().captureEpoch();

    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(useAuthStore.getState().epoch).toBe(0);
    expect(useAuthStore.getState().status).toBe("idle");
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});

describe("interim setSession kept for login and register pages", () => {
  beforeEach(() => {
    resetStore();
  });

  it("still writes the session unconditionally for the legacy pages", () => {
    useAuthStore.getState().setSession(MOCK_USER, "access-1");

    expect(useAuthStore.getState()).toMatchObject({
      user: MOCK_USER,
      accessToken: "access-1",
      status: "authenticated",
    });
  });
});

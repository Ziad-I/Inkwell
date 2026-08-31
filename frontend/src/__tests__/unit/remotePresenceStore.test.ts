import { describe, it, expect, beforeEach } from "vitest";
import { useRemotePresenceStore } from "@/stores/remotePresenceStore";

describe("remotePresenceStore", () => {
  beforeEach(() => {
    useRemotePresenceStore.getState().clearAll();
  });

  it("applyJoin registers a remote user with identity and no position yet", () => {
    useRemotePresenceStore
      .getState()
      .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });

    const users = useRemotePresenceStore.getState().remoteUsers;
    expect(users.size).toBe(1);
    expect(users.get("user-1")).toEqual({
      userName: "Ada",
      userColor: "#123456",
      pos: null,
    });
  });

  it("applyJoin on a known user refreshes the identity but keeps the position", () => {
    useRemotePresenceStore
      .getState()
      .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });
    useRemotePresenceStore.getState().applyMove("user-1", { x: 8, y: 9 });

    useRemotePresenceStore
      .getState()
      .applyJoin("user-1", { userName: "Ada L.", userColor: "#654321" });

    expect(useRemotePresenceStore.getState().remoteUsers.get("user-1")).toEqual(
      {
        userName: "Ada L.",
        userColor: "#654321",
        pos: { x: 8, y: 9 },
      },
    );
  });

  it("applyMove updates the position of a known user", () => {
    useRemotePresenceStore
      .getState()
      .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });

    useRemotePresenceStore.getState().applyMove("user-1", { x: 12, y: 34 });

    expect(
      useRemotePresenceStore.getState().remoteUsers.get("user-1")?.pos,
    ).toEqual({ x: 12, y: 34 });
  });

  it("applyMove ignores users that never joined", () => {
    useRemotePresenceStore.getState().applyMove("ghost", { x: 1, y: 2 });

    expect(useRemotePresenceStore.getState().remoteUsers.size).toBe(0);
  });

  it("applyLeave removes a known user", () => {
    useRemotePresenceStore
      .getState()
      .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });
    useRemotePresenceStore
      .getState()
      .applyJoin("user-2", { userName: "Bob", userColor: "#abcdef" });

    useRemotePresenceStore.getState().applyLeave("user-1");

    const users = useRemotePresenceStore.getState().remoteUsers;
    expect(users.size).toBe(1);
    expect(users.has("user-2")).toBe(true);
  });

  it("applyLeave ignores unknown users", () => {
    useRemotePresenceStore.getState().applyLeave("ghost");

    expect(useRemotePresenceStore.getState().remoteUsers.size).toBe(0);
  });

  it("clearAll removes every remote user", () => {
    useRemotePresenceStore
      .getState()
      .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });
    useRemotePresenceStore
      .getState()
      .applyJoin("user-2", { userName: "Bob", userColor: "#abcdef" });

    useRemotePresenceStore.getState().clearAll();

    expect(useRemotePresenceStore.getState().remoteUsers.size).toBe(0);
  });

  it("notifies subscribers when the user set changes", () => {
    const sizes: number[] = [];
    const unsubscribe = useRemotePresenceStore.subscribe((state) =>
      sizes.push(state.remoteUsers.size),
    );

    useRemotePresenceStore
      .getState()
      .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });
    useRemotePresenceStore.getState().applyLeave("user-1");

    unsubscribe();

    expect(sizes).toEqual([1, 0]);
  });
});

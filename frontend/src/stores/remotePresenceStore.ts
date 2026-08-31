import { create } from "zustand";
import type { Point } from "@/types/common";
import type { PresenceMeta } from "@/types/command";

export type RemotePresenceUser = {
  userName: string;
  userColor: string;
  /** Last known cursor position in world coordinates; null until the first move. */
  pos: Point | null;
};

type RemotePresenceState = {
  /** Remote users visible in the current board session, keyed by user id. */
  remoteUsers: Map<string, RemotePresenceUser>;
  applyJoin: (userId: string, meta: PresenceMeta) => void;
  applyMove: (userId: string, pos: Point) => void;
  applyLeave: (userId: string) => void;
  clearAll: () => void;
};

/**
 * Session-scoped model of remote users' presence. Kept separate from the
 * persisted local presence identity store: remote users must never be
 * persisted and are cleared on disconnect, reconciliation, and session
 * teardown. Moves for users that never joined are ignored — the server
 * guarantees join-before-move by replaying `presence:join` for every room
 * member on join.
 */
export const useRemotePresenceStore = create<RemotePresenceState>()((set) => ({
  remoteUsers: new Map(),

  applyJoin: (userId, meta) =>
    set((state) => {
      const existing = state.remoteUsers.get(userId);
      const remoteUsers = new Map(state.remoteUsers);
      remoteUsers.set(userId, {
        userName: meta.userName,
        userColor: meta.userColor,
        pos: existing?.pos ?? null,
      });
      return { remoteUsers };
    }),

  applyMove: (userId, pos) =>
    set((state) => {
      const existing = state.remoteUsers.get(userId);
      if (!existing) {
        return {};
      }
      const remoteUsers = new Map(state.remoteUsers);
      remoteUsers.set(userId, { ...existing, pos });
      return { remoteUsers };
    }),

  applyLeave: (userId) =>
    set((state) => {
      if (!state.remoteUsers.has(userId)) {
        return {};
      }
      const remoteUsers = new Map(state.remoteUsers);
      remoteUsers.delete(userId);
      return { remoteUsers };
    }),

  clearAll: () => set({ remoteUsers: new Map() }),
}));

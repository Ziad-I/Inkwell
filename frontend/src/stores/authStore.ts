import { create } from "zustand";

import type { AuthStatus, AuthUser } from "@/types/auth";

type AuthSession = { user: AuthUser; accessToken: string };

type AuthState = {
  epoch: number;
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
  captureEpoch: () => number;
  beginRestore: (epoch: number) => boolean;
  /**
   * Claims a fresh epoch for an explicit sign-in (login or
   * register): increments the epoch so every capture made before
   * the sign-in — e.g. an in-flight pre-login refresh — becomes stale,
   * and returns the new epoch to commit against. Credentials and
   * status are left untouched until the sign-in commits.
   */
  beginSession: () => number;
  commitSession: (epoch: number, session: AuthSession) => boolean;
  commitUnauthenticated: (epoch: number) => boolean;
  failRestore: (epoch: number) => boolean;
  logoutLocally: () => number;
  /**
   * INTERIM unconditional write so the login and register pages compile
   * before their orchestration migrates to capture/commit semantics.
   * Not epoch-safe.
   *
   * @deprecated use captureEpoch + commitSession instead
   */
  setSession: (user: AuthUser, accessToken: string) => void;
  setStatus: (status: AuthStatus) => void;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  epoch: 0,
  user: null,
  accessToken: null,
  status: "idle",

  captureEpoch: () => get().epoch,

  beginRestore: (epoch) => {
    let committed = false;
    set((state) => {
      if (state.epoch !== epoch) {
        return {};
      }
      committed = true;
      return { status: "restoring" };
    });
    return committed;
  },

  beginSession: () => {
    let nextEpoch = 0;
    set((state) => {
      nextEpoch = state.epoch + 1;
      return { epoch: nextEpoch };
    });
    return nextEpoch;
  },
  commitSession: (epoch, session) => {
    let committed = false;
    set((state) => {
      if (state.epoch !== epoch) {
        return {};
      }
      committed = true;
      return {
        user: session.user,
        accessToken: session.accessToken,
        status: "authenticated",
      };
    });
    return committed;
  },

  commitUnauthenticated: (epoch) => {
    let committed = false;
    set((state) => {
      if (state.epoch !== epoch) {
        return {};
      }
      committed = true;
      return { user: null, accessToken: null, status: "unauthenticated" };
    });
    return committed;
  },

  failRestore: (epoch) => {
    let committed = false;
    set((state) => {
      if (state.epoch !== epoch) {
        return {};
      }
      committed = true;
      return { status: "error" };
    });
    return committed;
  },

  logoutLocally: () => {
    let nextEpoch = 0;
    set((state) => {
      nextEpoch = state.epoch + 1;
      return {
        epoch: nextEpoch,
        user: null,
        accessToken: null,
        status: "unauthenticated",
      };
    });
    return nextEpoch;
  },

  setSession: (user, accessToken) =>
    set({ user, accessToken, status: "authenticated" }),

  setStatus: (status) => set({ status }),
}));

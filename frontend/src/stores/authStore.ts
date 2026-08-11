import { create } from "zustand";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated";

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
  setSession: (user: AuthUser, accessToken: string) => void;
  setUser: (user: AuthUser | null) => void;
  setAccessToken: (token: string | null) => void;
  setStatus: (status: AuthStatus) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  status: "idle",

  setSession: (user, accessToken) =>
    set({ user, accessToken, status: "authenticated" }),
  setUser: (user) => set({ user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setStatus: (status) => set({ status }),
  clearSession: () =>
    set({ user: null, accessToken: null, status: "unauthenticated" }),
}));

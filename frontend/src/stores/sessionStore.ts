import { create } from "zustand";
import type { BoardSessionSnapshot } from "@/types/session";

type SessionState = {
  session: BoardSessionSnapshot;
  setSession: (snapshot: BoardSessionSnapshot) => void;
  reset: () => void;
};

const initialSnapshot: BoardSessionSnapshot = {
  epoch: "",
  roomId: "",
  phase: "idle",
  role: null,
  permissions: { read: false, draw: false },
  canDraw: false,
  error: null,
};

export const useSessionStore = create<SessionState>()((set) => ({
  session: initialSnapshot,
  setSession: (snapshot) => set({ session: snapshot }),
  reset: () => set({ session: initialSnapshot }),
}));

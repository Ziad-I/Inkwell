import { create } from "zustand";
import type { SessionStatus } from "@/types/session";

type SessionState = {
  sessionStatus: SessionStatus;
  setSessionStatus: (status: SessionStatus) => void;
  reset: () => void;
};

const initialState: SessionStatus = { status: "idle" };

export const useSessionStore = create<SessionState>()((set) => ({
  sessionStatus: initialState,
  setSessionStatus: (status) => set({ sessionStatus: status }),
  reset: () => set({ sessionStatus: initialState }),
}));

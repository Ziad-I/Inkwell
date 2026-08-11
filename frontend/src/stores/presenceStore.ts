import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PresenceState = {
  // Anonymous presence identity
  anonymousId: string;
  anonymousName: string;
  presenceColor: string;

  // Actions
  setAnonymousName: (name: string) => void;
  setPresenceColor: (color: string) => void;

  reset: () => void;
};

const initialPresence = {
  anonymousId: Math.random().toString(36).substring(2, 15),
  anonymousName: `User_${Math.random().toString(36).substring(2, 15)}`,
  presenceColor:
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0"),
};

export const usePresenceStore = create<PresenceState>()(
  persist(
    (set) => ({
      ...initialPresence,
      setAnonymousName: (name: string) => set(() => ({ anonymousName: name })),
      setPresenceColor: (color: string) =>
        set(() => ({ presenceColor: color })),
      reset: () => set(() => ({ ...initialPresence })),
    }),
    {
      name: "inkwell-presence", // localStorage key
      partialize: (state) => ({
        anonymousId: state.anonymousId,
        anonymousName: state.anonymousName,
      }),
      version: 1,
    },
  ),
);

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserState = {
  // User Presence;
  userId: string;
  userName: string;
  userColor: string;

  // Actions
  setUserId: (id: string) => void;
  setUserName: (name: string) => void;
  setUserColor: (color: string) => void;

  reset: () => void;
};

const initialUser = {
  userId: Math.random().toString(36).substring(2, 15),
  userName: `User_${Math.random().toString(36).substring(2, 15)}`,
  userColor:
    "#" + ((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0"),
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      ...initialUser,
      setUserId: (id: string) => set(() => ({ userId: id })),
      setUserName: (name: string) => set(() => ({ userName: name })),
      setUserColor: (color: string) => set(() => ({ userColor: color })),
      reset: () => set(() => ({ ...initialUser })),
    }),
    {
      name: "inkwell-user", // localStorage key
      partialize: (state) => ({
        userId: state.userId,
        userName: state.userName,
      }),
      version: 1,
    },
  ),
);

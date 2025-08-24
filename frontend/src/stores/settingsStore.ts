import type { LINE_CAPS, LINE_JOINS } from "@/lib/constants";
import { create } from "zustand";
// import { persist } from "zustand/middleware";

type LineCap = (typeof LINE_CAPS)[number];
type LineJoin = (typeof LINE_JOINS)[number];

export type SettingsState = {
  // Tool settings
  color: string;
  strokeWidth: number; // px
  opacity: number; // 0-1
  lineCap: LineCap;
  lineJoin: LineJoin;

  // General settings
  showGrid: boolean;
  // darkMode: boolean;

  // Actions
  setColor: (c: string) => void;
  setStrokeWidth: (n: number) => void;
  setOpacity: (v: number) => void;
  setLineCap: (cap: LineCap) => void;
  setLineJoin: (join: LineJoin) => void;
  setShowGrid: (s: boolean) => void;
  // setDarkMode: (d: boolean) => void;
  reset: () => void;
};

const initialSettings = {
  color: "#000",
  strokeWidth: 2,
  opacity: 1,
  lineCap: "round",
  lineJoin: "miter",
  showGrid: false,
  darkMode: false,
};

export const useSettingsStore = create<SettingsState>()(
  // persist(
  (set) => ({
    ...initialSettings,
    setColor: (c: string) => set(() => ({ color: c })),
    setStrokeWidth: (n: number) =>
      set(() => ({ strokeWidth: Math.max(1, Math.min(50, Math.round(n))) })),
    setOpacity: (v: number) =>
      set(() => ({ opacity: Math.max(0, Math.min(1, v)) })),
    setLineCap: (cap: LineCap) => set(() => ({ lineCap: cap })),
    setLineJoin: (join: LineJoin) => set(() => ({ lineJoin: join })),
    setShowGrid: (s: boolean) => set(() => ({ showGrid: s })),
    // setDarkMode: (d: boolean) => set(() => ({ darkMode: d })),
    reset: () => set(() => ({ ...initialSettings })),
  })
  //   {
  //     name: "whiteboard-settings", // localStorage key
  //     version: 1,
  //   }
  // )
);

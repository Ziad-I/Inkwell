import {
  LINE_CAPS,
  LINE_JOINS,
  SHAPE_KINDS,
  type ShapeKind,
} from "@/lib/constants";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type LineCap = (typeof LINE_CAPS)[number];
type LineJoin = (typeof LINE_JOINS)[number];

export type SettingsState = {
  // Tool settings
  color: string;
  strokeWidth: number; // px
  opacity: number; // 0-1
  lineCap: LineCap;
  lineJoin: LineJoin;
  shapeKind: ShapeKind;

  // General settings
  showGrid: boolean;

  // Actions
  setColor: (c: string) => void;
  setStrokeWidth: (n: number) => void;
  setOpacity: (v: number) => void;
  setLineCap: (cap: LineCap) => void;
  setLineJoin: (join: LineJoin) => void;
  setShapeKind: (kind: ShapeKind) => void;
  setShowGrid: (s: boolean) => void;

  reset: () => void;
};

const initialSettings = {
  color: "#000",
  strokeWidth: 2,
  opacity: 1,
  lineCap: "round",
  lineJoin: "miter",
  shapeKind: SHAPE_KINDS[0],
  showGrid: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialSettings,
      setColor: (c: string) => set(() => ({ color: c })),
      setStrokeWidth: (n: number) =>
        set(() => ({ strokeWidth: Math.max(1, Math.min(50, Math.round(n))) })),
      setOpacity: (v: number) =>
        set(() => ({ opacity: Math.max(0, Math.min(1, v)) })),
      setLineCap: (cap: LineCap) => set(() => ({ lineCap: cap })),
      setLineJoin: (join: LineJoin) => set(() => ({ lineJoin: join })),
      setShapeKind: (kind: ShapeKind) =>
        set(() => ({
          shapeKind: SHAPE_KINDS.includes(kind) ? kind : SHAPE_KINDS[0],
        })),
      setShowGrid: (s: boolean) => set(() => ({ showGrid: s })),
      reset: () => set(() => ({ ...initialSettings })),
    }),
    {
      name: "inkwell-settings", // localStorage key
      version: 1,
    },
  ),
);

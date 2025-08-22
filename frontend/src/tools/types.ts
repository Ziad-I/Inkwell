import type { StageOperations, Settings } from "@/lib/definations";
import type { KonvaEventObject } from "konva/lib/Node";

export const Tools = {
  Brush: "brush",
  Eraser: "eraser",
  Shape: "shape",
};
export type Tools = (typeof Tools)[keyof typeof Tools];

export interface Tool {
  id: Tools;
  label?: string;
  icon?: string;
  cursor?: string; // CSS cursor style
  exclusive?: boolean; // whether it blocks others
  onActivate?: () => void;
  onDeactivate?: () => void;
  onPointerDown?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerMove?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerUp?: (e: KonvaEventObject<PointerEvent>) => void;
}

export interface ToolContext {
  stageOps: StageOperations;
  settingsRef?: React.RefObject<Settings>;
}

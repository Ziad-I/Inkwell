import type { StageOperations } from "@/lib/definations";
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
  onActivate?: () => void;
  onDeactivate?: () => void;
  onPointerDown?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerMove?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerUp?: (e: KonvaEventObject<PointerEvent>) => void;
  exclusive?: boolean; // whether it blocks others
}

export interface toolSettings {
  stroke?: string;
  strokeWidth?: number;
  color?: string;
}

export interface ToolContext {
  stageOps: StageOperations;
  toolSettingsRef?: React.RefObject<toolSettings>;
}

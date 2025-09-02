import type { historyOperations, StageOperations } from "@/types/common";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LucideProps } from "lucide-react";

export const Tools = {
  Brush: "brush",
  Eraser: "eraser",
  Selection: "selection",
};
export type Tools = (typeof Tools)[keyof typeof Tools];

export type ToolMetadata = {
  id: Tools;
  label?: string;
  icon?: React.ComponentType<LucideProps>;
  cursor?: string;
  exclusive?: boolean;
};

export interface Tool {
  id: Tools;
  label?: string;
  icon?: React.ComponentType<LucideProps>;
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
  historyOps: historyOperations;
}

export type ToolLoader = {
  load: (ctx: ToolContext) => Tool | Promise<Tool>;
  eager?: boolean; // if true, tool is loaded immediately, else on demand
};

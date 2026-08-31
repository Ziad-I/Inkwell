import type { StageOperations } from "@/types/common";
import type { CommandManager } from "@/core/commandManager";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LucideProps } from "lucide-react";

export const Tools = {
  Brush: "brush",
  Eraser: "eraser",
  Shapes: "shapes",
  Selection: "selection",
};
export type Tools = (typeof Tools)[keyof typeof Tools];

export type ToolMetadata = {
  id: Tools;
  label?: string;
  icon?: React.ComponentType<LucideProps>;
  cursor?: string;
  exclusive?: boolean;
  /**
   * Tools that mutate board content. Mutating tools require draw
   * capability before activation; defaults to true.
   */
  mutating?: boolean;
};

export interface Tool {
  meta: ToolMetadata;
  onActivate?: () => void;
  onDeactivate?: () => void;
  /**
   * Cancels any in-flight gesture: captures the pending command id,
   * resets local gesture state first, then cancels the command. Must be
   * idempotent and must never finalize.
   */
  cancelGesture?: () => void;
  onPointerDown?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerMove?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerUp?: (e: KonvaEventObject<PointerEvent>) => void;
}

export interface ToolContext {
  stageOps: StageOperations;
  commandManager: CommandManager;
}

export type ToolLoader = {
  load: (ctx: ToolContext) => Tool | Promise<Tool>;
  eager?: boolean; // if true, tool is loaded immediately, else on demand
};

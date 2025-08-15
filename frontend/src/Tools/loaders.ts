import { createBrushTool } from "@/Tools/brushTool";
import type { Tool, ToolContext } from "@/lib/definations";

export const Tools = {
  Brush: "brush",
  Eraser: "eraser",
  Shape: "shape",
};
export type Tools = (typeof Tools)[keyof typeof Tools];

export type ToolLoader = {
  load: (ctx: ToolContext) => Tool | Promise<Tool>;
  eager?: boolean; // if true, tool is loaded immediately, else on demand
};

export const toolLoaders: Record<Tools, ToolLoader> = {
  [Tools.Brush]: { load: (ctx) => createBrushTool(ctx), eager: true },
};

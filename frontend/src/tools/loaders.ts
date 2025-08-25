import { BrushTool } from "@/tools/brushTool";
import { type Tool, type ToolContext, Tools } from "@/tools/types";
import { EraserTool } from "./eraserTool";

export type ToolLoader = {
  load: (ctx: ToolContext) => Tool | Promise<Tool>;
  eager?: boolean; // if true, tool is loaded immediately, else on demand
};

export const toolLoaders: Record<Tools, ToolLoader> = {
  [Tools.Brush]: { load: (ctx) => new BrushTool(ctx), eager: true },
  [Tools.Eraser]: { load: (ctx) => new EraserTool(ctx), eager: true },
};

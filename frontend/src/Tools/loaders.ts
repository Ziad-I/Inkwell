import { createBrushTool } from "@/Tools/brushTool";
import { type Tool, type ToolContext, Tools } from "@/Tools/types";

export type ToolLoader = {
  load: (ctx: ToolContext) => Tool | Promise<Tool>;
  eager?: boolean; // if true, tool is loaded immediately, else on demand
};

export const toolLoaders: Record<Tools, ToolLoader> = {
  [Tools.Brush]: { load: (ctx) => createBrushTool(ctx), eager: true },
};

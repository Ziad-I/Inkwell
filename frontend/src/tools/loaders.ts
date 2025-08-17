import { BrushTool } from "@/tools/brushTool";
import { type Tool, type ToolContext, Tools } from "@/tools/types";

export type ToolLoader = {
  load: (ctx: ToolContext) => Tool | Promise<Tool>;
  eager?: boolean; // if true, tool is loaded immediately, else on demand
};

export const toolLoaders: Record<Tools, ToolLoader> = {
  [Tools.Brush]: { load: (ctx) => new BrushTool(ctx), eager: true },
};

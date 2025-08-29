import { BrushTool } from "@/tools/brushTool";
import { type ToolLoader, Tools } from "@/types/tool";
import { EraserTool } from "../tools/eraserTool";

export const toolLoaders: Record<Tools, ToolLoader> = {
  [Tools.Brush]: { load: (ctx) => new BrushTool(ctx), eager: true },
  [Tools.Eraser]: { load: (ctx) => new EraserTool(ctx), eager: true },
};

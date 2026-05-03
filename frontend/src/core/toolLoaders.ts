import { type ToolLoader, Tools } from "@/types/tool";
import { BrushTool } from "@/tools/brushTool";
import { EraserTool } from "@/tools/eraserTool";
import { ShapesTool } from "@/tools/shapesTool";
import { SelectionTool } from "@/tools/selectionTool";

export const toolLoaders: Record<Tools, ToolLoader> = {
  [Tools.Brush]: { load: (ctx) => new BrushTool(ctx), eager: true },
  [Tools.Eraser]: { load: (ctx) => new EraserTool(ctx), eager: true },
  [Tools.Shapes]: { load: (ctx) => new ShapesTool(ctx), eager: true },
  [Tools.Selection]: { load: (ctx) => new SelectionTool(ctx), eager: true },
};

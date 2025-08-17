// tools/BaseTool.ts
import type { Tool, ToolContext, Tools } from "./types";
import Konva from "konva";

export abstract class BaseTool implements Tool {
  public abstract id: Tools;
  public label?: string;
  public cursor?: string;
  public exclusive?: boolean;

  protected ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  // default lifecycle hooks (no-op)
  onActivate() {}
  onDeactivate() {}
  onPointerDown(_: Konva.KonvaEventObject<PointerEvent>) {}
  onPointerMove(_: Konva.KonvaEventObject<PointerEvent>) {}
  onPointerUp(_: Konva.KonvaEventObject<PointerEvent>) {}
}

import Konva from "konva";
import { Tools, type ToolContext } from "@/types/tool";
import type { KonvaEventObject } from "konva/lib/Node";
import { BaseTool } from "./baseTool";
import { Eraser as EraserIcon } from "lucide-react";

export class EraserTool extends BaseTool {
  id = Tools.Eraser;
  label = "Eraser";
  icon = EraserIcon;
  cursor = "cell";
  exclusive = true;

  private isErasing = false;

  constructor(ctx: ToolContext) {
    super(ctx);
  }

  private isErasableShape(shape: Konva.Shape | null): boolean {
    if (!shape) return false;
    const erasable = shape.getAttr("erasable");
    return erasable === true;
  }

  private eraseAtPointer() {
    this.ctx.stageOps.redrawDrawingLayer();
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const layer = this.ctx.stageOps.getDrawingLayer();
    if (!layer) return;

    const shape = layer.getIntersection(pointer);
    if (this.isErasableShape(shape)) {
      this.ctx.stageOps.removeNode(shape!, true);
      this.ctx.stageOps.redrawDrawingLayer();
    }
  }

  onActivate(): void {
    // this.ctx.stageOps.getDrawingLayer()?.toggleHitCanvas();
    // this.ctx.stageOps.redrawDrawingLayer();
  }

  onDeactivate(): void {
    this.isErasing = false;
    // this.ctx.stageOps.getDrawingLayer()?.toggleHitCanvas();
  }

  onPointerDown(event: KonvaEventObject<PointerEvent>) {
    this.isErasing = true;
    this.eraseAtPointer();
  }

  onPointerMove(event: KonvaEventObject<PointerEvent>) {
    if (!this.isErasing) return;
    this.eraseAtPointer();
  }

  onPointerUp(event: KonvaEventObject<PointerEvent>) {
    this.isErasing = false;
  }
}

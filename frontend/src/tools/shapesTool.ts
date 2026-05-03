import type { Point } from "@/types/common";
import { type CommandID, type ShapePayload } from "@/types/command";
import { Tools, type ToolContext } from "@/types/tool";
import type { KonvaEventObject } from "konva/lib/Node";
import { Square } from "lucide-react";
import { BaseTool } from "./baseTool";
import { generateId } from "@/lib/utils";

export class ShapesTool extends BaseTool {
  meta = {
    id: Tools.Shapes,
    label: "Shapes",
    icon: Square,
    cursor: "crosshair",
    exclusive: true,
  };

  private shapeCommandId: CommandID | null = null;
  private shapeCommandPayload: ShapePayload | null = null;
  private isDrawing = false;
  private startPoint: Point | null = null;
  private lastPoint: Point | null = null;

  private readonly MIN_DRAW_DISTANCE = 6;

  constructor(ctx: ToolContext) {
    super(ctx);
  }

  private resetState() {
    this.shapeCommandId = null;
    this.shapeCommandPayload = null;
    this.isDrawing = false;
    this.startPoint = null;
    this.lastPoint = null;
  }

  private getPointerWorldPoint(): Point | null {
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return null;

    const pointer = stage.getPointerPosition();
    if (!pointer) return null;

    return this.ctx.stageOps.screenToWorld(pointer.x, pointer.y);
  }

  private initPayload(startPoint: Point) {
    const { shapeKind, strokeWidth, color, lineCap, lineJoin, opacity } =
      this.getSettings();

    this.shapeCommandPayload = {
      nodeId: generateId(),
      kind: shapeKind,
      start: startPoint,
      end: startPoint,
      color,
      opacity,
      strokeWidth,
      lineCap: (lineCap as CanvasLineCap) ?? "round",
      lineJoin: (lineJoin as CanvasLineJoin) ?? "miter",
    } as ShapePayload;
  }

  private cancelActiveShape() {
    if (this.shapeCommandId && this.isDrawing) {
      this.ctx.commandManager.cancelCommand(this.shapeCommandId);
    }

    this.resetState();
  }

  private hasMinimumSize() {
    if (!this.startPoint || !this.lastPoint) return false;

    const start = this.ctx.stageOps.worldToScreen(
      this.startPoint.x,
      this.startPoint.y,
    );
    const end = this.ctx.stageOps.worldToScreen(
      this.lastPoint.x,
      this.lastPoint.y,
    );

    return (
      Math.hypot(end.x - start.x, end.y - start.y) >= this.MIN_DRAW_DISTANCE
    );
  }

  onDeactivate() {
    this.cancelActiveShape();
  }

  onPointerDown(_: KonvaEventObject<PointerEvent>) {
    const pointerWorldPoint = this.getPointerWorldPoint();
    if (!pointerWorldPoint) return;

    this.isDrawing = true;
    this.startPoint = pointerWorldPoint;
    this.lastPoint = pointerWorldPoint;
    this.initPayload(pointerWorldPoint);

    this.shapeCommandId = this.ctx.commandManager.startCommand(
      "shape",
      this.shapeCommandPayload!,
    );
  }

  onPointerMove(_: KonvaEventObject<PointerEvent>) {
    if (!this.isDrawing || !this.shapeCommandId) return;

    const pointerWorldPoint = this.getPointerWorldPoint();
    if (!pointerWorldPoint) return;

    this.lastPoint = pointerWorldPoint;
    this.ctx.commandManager.updateCommand(this.shapeCommandId, {
      end: pointerWorldPoint,
    });
  }

  onPointerUp(_: KonvaEventObject<PointerEvent>) {
    if (!this.isDrawing || !this.shapeCommandId) return;

    const pointerWorldPoint = this.getPointerWorldPoint();
    if (pointerWorldPoint) {
      this.lastPoint = pointerWorldPoint;
      this.ctx.commandManager.updateCommand(this.shapeCommandId, {
        end: pointerWorldPoint,
      });
    }

    if (this.hasMinimumSize()) {
      this.ctx.commandManager.finalizeCommand(this.shapeCommandId);
    } else {
      this.ctx.commandManager.cancelCommand(this.shapeCommandId);
    }

    this.resetState();
  }
}

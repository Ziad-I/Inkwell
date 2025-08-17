import type { Point } from "@/lib/definations";
import Konva from "konva";
import { Tools, type ToolContext } from "@/tools/types";
import type { KonvaEventObject } from "konva/lib/Node";
import { BaseTool } from "./baseTool";

export class BrushTool extends BaseTool {
  id = Tools.Brush;
  label = "Brush";
  cursor = "crosshair";
  exclusive = true;

  private isDrawing = false;
  private pts: Point[] = [];
  private line: Konva.Line | null = null;

  constructor(ctx: ToolContext) {
    super(ctx);
  }

  private flattenPoints(pts: Point[]) {
    return pts.flatMap((p) => [p.x, p.y]);
  }

  onActivate() {}

  onDeactivate() {
    if (this.line) {
      this.line.destroy();
      this.line = null;
    }
    this.pts = [];
    this.isDrawing = false;
  }

  onPointerDown(e: KonvaEventObject<PointerEvent>) {
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const p = stage.getPointerPosition();
    if (!p) return;

    this.isDrawing = true;
    const wp = this.ctx.stageOps.screenToWorld(p.x, p.y);
    this.pts = [wp];

    const layer = this.ctx.stageOps.getDrawingLayer();
    if (!layer) return;

    // read stroke settings from the shared settings ref (if present)
    const stroke = this.ctx.toolSettingsRef?.current?.stroke ?? "#000";
    const strokeWidth = this.ctx.toolSettingsRef?.current?.strokeWidth ?? 2;
    const color = this.ctx.toolSettingsRef?.current?.color ?? "#000";

    this.line = new Konva.Line({
      points: this.flattenPoints(this.pts),
      stroke,
      strokeWidth,
      fill: color,
      tension: 0.45,
      lineCap: "round",
      lineJoin: "round",
      listening: false,
      perfectDrawEnabled: false,
      strokeScaleEnabled: false,
    });
    layer.add(this.line);
    layer.batchDraw();
  }

  onPointerMove(e: KonvaEventObject<PointerEvent>) {
    if (!this.isDrawing) return;

    const stage = this.ctx.stageOps.getStage();
    if (!stage || !this.line) return;

    const p = stage.getPointerPosition();
    if (!p) return;

    const wp = this.ctx.stageOps.screenToWorld(p.x, p.y);

    // simple screen-space sampling
    const last = this.pts[this.pts.length - 1];
    const screenLast = this.ctx.stageOps.worldToScreen(last.x, last.y);
    const dx = p.x - screenLast.x;
    const dy = p.y - screenLast.y;

    if (Math.hypot(dx, dy) < 2) return; // skip close points

    this.pts.push(wp);
    this.line.points(this.flattenPoints(this.pts));
    this.ctx.stageOps.getDrawingLayer()?.batchDraw();
  }

  onPointerUp(e: KonvaEventObject<PointerEvent>) {
    if (!this.isDrawing) return;

    this.isDrawing = false;
    // finalize: we keep the Konva.Line in the layer as the permanent stroke
    this.line = null;
    this.pts = [];
  }
}

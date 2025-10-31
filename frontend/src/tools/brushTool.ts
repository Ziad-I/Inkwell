import type { Point } from "@/types/common";
import { type CommandID, type StrokePayload } from "@/types/command";
import { Tools, type ToolContext } from "@/types/tool";
import type { KonvaEventObject } from "konva/lib/Node";
import { BaseTool } from "./baseTool";
import { Brush } from "lucide-react";
import { generateId } from "@/lib/utils";

export class BrushTool extends BaseTool {
  meta = {
    id: Tools.Brush,
    label: "Brush",
    icon: Brush,
    cursor: "crosshair",
    exclusive: true,
  };

  private strokeCommandId: CommandID | null = null;
  private strokeCommandPayload: StrokePayload | null = null;

  private isDrawing = false;
  private pts: Point[] = [];

  private readonly MIN_POINT_DISTANCE = 2; // px: Minimum distance between points to consider them distinct
  private readonly RDP_EPSILON = 1; // px: Ramer-Douglas-Peucker simplification threshold
  private readonly CHAIKIN_ITERATIONS = 1; // Number of iterations for Chaikin's algorithm

  constructor(ctx: ToolContext) {
    super(ctx);
  }

  private flattenPoints(pts: Point[]) {
    return pts.flatMap((p) => [p.x, p.y]);
  }

  private dist2(p1: Point, p2: Point): number {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  private perpendicularDistance(p: Point, p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx === 0 && dy === 0) return this.dist2(p, p1);
    const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy);
    const proj = { x: p1.x + t * dx, y: p1.y + t * dy };
    return this.dist2(p, proj);
  }

  private rdp(points: Point[], epsilon: number): Point[] {
    if (points.length < 3) return points.slice();

    let maxDist = 0;
    let index = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const d = this.perpendicularDistance(
        points[i],
        points[0],
        points[points.length - 1]
      );
      if (d > maxDist) {
        index = i;
        maxDist = d;
      }
    }

    if (maxDist > epsilon) {
      const left = this.rdp(points.slice(0, index + 1), epsilon);
      const right = this.rdp(points.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    } else {
      return [points[0], points[points.length - 1]];
    }
  }

  private chaikin(points: Point[]): Point[] {
    if (points.length < 2) return points.slice();
    let pts = points.slice();
    for (let it = 0; it < this.CHAIKIN_ITERATIONS; it++) {
      const next: Point[] = [];
      next.push(pts[0]); // keep endpoints
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const q = {
          x: 0.75 * p0.x + 0.25 * p1.x,
          y: 0.75 * p0.y + 0.25 * p1.y,
        };
        const r = {
          x: 0.25 * p0.x + 0.75 * p1.x,
          y: 0.25 * p0.y + 0.75 * p1.y,
        };
        next.push(q, r);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }
    return pts;
  }

  onActivate() {}

  onDeactivate() {
    // Cancel any pending operation when tool is deactivated
    if (this.isDrawing && this.strokeCommandId) {
      this.ctx.commandManager.cancelCommand(this.strokeCommandId);
      this.isDrawing = false;
      this.pts = [];
      this.strokeCommandId = null;
      this.strokeCommandPayload = null;
    }
  }

  initPayload() {
    const { strokeWidth, color, lineCap, lineJoin, opacity } =
      this.getSettings();

    this.strokeCommandPayload = {
      nodeId: generateId(),
      points: this.flattenPoints(this.pts),
      color: color,
      opacity: opacity,
      strokeWidth: strokeWidth,
      lineCap: (lineCap as CanvasLineCap) ?? "round",
      lineJoin: (lineJoin as CanvasLineJoin) ?? "round",
    } as StrokePayload;
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

    this.initPayload();

    this.strokeCommandId = this.ctx.commandManager.startCommand(
      "stroke",
      this.strokeCommandPayload!
    );
  }

  onPointerMove(e: KonvaEventObject<PointerEvent>) {
    if (!this.isDrawing || !this.strokeCommandId) return;

    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const p = stage.getPointerPosition();
    if (!p) return;

    const wp = this.ctx.stageOps.screenToWorld(p.x, p.y);

    // simple screen-space sampling
    const last = this.pts[this.pts.length - 1];
    const screenLast = this.ctx.stageOps.worldToScreen(last.x, last.y);
    const dx = p.x - screenLast.x;
    const dy = p.y - screenLast.y;
    const screenDist = Math.hypot(dx, dy);

    if (screenDist < this.MIN_POINT_DISTANCE) return; // skip close points

    this.pts.push(wp);
    this.ctx.commandManager.updateCommand(this.strokeCommandId!, {
      points: this.flattenPoints(this.pts),
    });
  }

  onPointerUp(e: KonvaEventObject<PointerEvent>) {
    if (!this.isDrawing || !this.strokeCommandId) return;

    const scale = this.ctx.stageOps.getScale();
    const simplifiedPoints = this.rdp(this.pts, this.RDP_EPSILON / scale);
    const finalPoints = this.chaikin(simplifiedPoints);

    this.ctx.commandManager.updateCommand(this.strokeCommandId!, {
      points: this.flattenPoints(finalPoints),
    });

    this.ctx.commandManager.finalizeCommand(this.strokeCommandId!);

    this.isDrawing = false;
    this.pts = [];
    this.strokeCommandId = null;
    this.strokeCommandPayload = null;
  }
}

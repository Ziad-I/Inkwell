import type { Point, ToolContext } from "@/lib/definations";
import Konva from "konva";
import { Tools } from "@/Tools/loaders";
import type { KonvaEventObject } from "konva/lib/Node";

function flattenPoints(pts: Point[]) {
  return pts.flatMap((p) => [p.x, p.y]);
}

export function createBrushTool(ctx: ToolContext) {
  let isDrawing = false;
  let pts: Point[] = [];
  let line: Konva.Line | null = null;

  return {
    id: Tools.Brush,
    label: "Brush",
    exclusive: true,
    cursor: "crosshair",
    onActivate() {},
    onDeactivate() {
      const layer = ctx.stageOps.getDrawingLayer();
      layer?.getStage()?.container().style.removeProperty("cursor");
      if (line) {
        line.destroy();
        line = null;
      }
      pts = [];
      isDrawing = false;
    },
    onPointerDown(e: KonvaEventObject<PointerEvent>) {
      const stage = ctx.stageOps.getStage();
      if (!stage) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      isDrawing = true;
      const wp = ctx.stageOps.screenToWorld(p.x, p.y);
      pts = [wp];

      const layer = ctx.stageOps.getDrawingLayer();
      if (!layer) return;

      // read stroke settings from the shared settings ref (if present)
      const stroke = ctx.toolSettingsRef?.current?.stroke ?? "#000";
      const strokeWidth = ctx.toolSettingsRef?.current?.strokeWidth ?? 2;
      const color = ctx.toolSettingsRef?.current?.color ?? "#000";

      line = new Konva.Line({
        points: flattenPoints(pts),
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
      layer.add(line);
      layer.batchDraw();
    },
    onPointerMove(e: KonvaEventObject<PointerEvent>) {
      if (!isDrawing) return;
      const stage = ctx.stageOps.getStage();
      if (!stage || !line) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      const wp = ctx.stageOps.screenToWorld(p.x, p.y);

      // simple screen-space sampling
      const last = pts[pts.length - 1];
      const screenLast = ctx.stageOps.worldToScreen(last.x, last.y);
      const dx = p.x - screenLast.x;
      const dy = p.y - screenLast.y;
      if (Math.hypot(dx, dy) < 2) return; // skip close points

      pts.push(wp);
      line.points(flattenPoints(pts));
      ctx.stageOps.getDrawingLayer()?.batchDraw();
    },
    onPointerUp(e: KonvaEventObject<PointerEvent>) {
      if (!isDrawing) return;
      isDrawing = false;

      // finalize: we keep the Konva.Line in the layer as the permanent stroke
      // In a real app you'd run RDP simplification and store stroke metadata
      line = null;
      pts = [];
    },
  };
}

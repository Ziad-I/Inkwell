import { useRef } from "react";
import Konva from "konva";
import type { Point, StageOperations } from "@/lib/definations";
import type { Shape, ShapeConfig } from "konva/lib/Shape";
import {
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_SCALE,
  DEFAULT_VIEWPOINT_POS,
} from "@/lib/constants";

export function useStageOperations() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const drawingLayerRef = useRef<Konva.Layer | null>(null);

  const stageOperations = useRef<StageOperations>({
    getScale: () => stageRef.current?.scaleX() || DEFAULT_SCALE,

    getViewpointPos: () =>
      stageRef.current?.position() || DEFAULT_VIEWPOINT_POS,

    getStage: () => stageRef.current,

    setScale: (newScale: number, pivotPoint?: Point) => {
      const stage = stageRef.current;
      if (!stage) return;

      const clamped = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));

      if (pivotPoint) {
        const oldScale = stage.scaleX();
        const worldPos = {
          x: (pivotPoint.x - stage.x()) / oldScale,
          y: (pivotPoint.y - stage.y()) / oldScale,
        };

        const newPos = {
          x: pivotPoint.x - worldPos.x * clamped,
          y: pivotPoint.y - worldPos.y * clamped,
        };

        stage.position(newPos);
      }

      stage.scale({ x: clamped, y: clamped });
      stage.batchDraw();
    },

    getDrawingLayer: () => drawingLayerRef.current,

    setViewpointPos: (newPos: Point) => {
      const stage = stageRef.current;
      if (!stage) return;

      stage.position(newPos);
      stage.batchDraw();
    },

    translate: (dx: number, dy: number) => {
      const stage = stageRef.current;
      if (!stage) return;

      const pos = stage.position();
      stage.position({ x: pos.x + dx, y: pos.y + dy });
      stage.batchDraw();
    },

    screenToWorld: (sx: number, sy: number) => {
      const stage = stageRef.current;
      if (!stage) return { x: sx, y: sy };

      const scale = stage.scaleX();
      const pos = stage.position();
      return {
        x: (sx - pos.x) / scale,
        y: (sy - pos.y) / scale,
      };
    },

    worldToScreen: (wx: number, wy: number) => {
      const stage = stageRef.current;
      if (!stage) return { x: wx, y: wy };

      const scale = stage.scaleX();
      const pos = stage.position();
      return {
        x: wx * scale + pos.x,
        y: wy * scale + pos.y,
      };
    },

    addPermanentNode: (node: Konva.Node) => {
      drawingLayerRef.current?.add(node as unknown as Shape<ShapeConfig>);
    },

    redrawLayer: () => {
      const layer = drawingLayerRef.current;
      if (layer) {
        layer.batchDraw();
      }
    },
  });

  return {
    stageOperations: stageOperations.current,
    stageRef,
    drawingLayerRef,
  };
}

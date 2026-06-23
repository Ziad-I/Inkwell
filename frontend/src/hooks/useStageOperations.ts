import { useRef } from "react";
import Konva from "konva";
import type { Point, StageOperations } from "@/types/common";
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
  const overlayLayerRef = useRef<Konva.Layer | null>(null);

  const removedNodesRegistry = useRef<Map<string, Konva.Node>>(new Map());

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

    getOverlayLayer: () => overlayLayerRef.current,

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createNode<CTOR extends new (...args: any[]) => any>(
      Ctor: CTOR,
      ...args: ConstructorParameters<CTOR>
    ): InstanceType<CTOR> {
      return new Ctor(...args) as InstanceType<CTOR>;
    },

    addDrawingNode: (node: Konva.Node) => {
      drawingLayerRef.current?.add(node as unknown as Shape<ShapeConfig>);
      if (removedNodesRegistry.current.has(node.id())) {
        removedNodesRegistry.current.delete(node.id());
      }
      stageOperations.current.redrawDrawingLayer();
    },

    addOverlayNode: (node: Konva.Node) => {
      overlayLayerRef.current?.add(node as unknown as Shape<ShapeConfig>);
      if (removedNodesRegistry.current.has(node.id())) {
        removedNodesRegistry.current.delete(node.id());
      }
      stageOperations.current.redrawOverlayLayer();
    },

    removeNode: (node: Konva.Node, destroy: boolean = true) => {
      if (!node) return;
      if (destroy) {
        node.destroy();
        removedNodesRegistry.current.delete(node.id());
      } else {
        node.remove();
        removedNodesRegistry.current.set(node.id(), node);
      }
      stageOperations.current.redrawDrawingLayer();
    },

    removeNodeById: (id: string, destroy: boolean = true) => {
      const node = stageOperations.current.getNodeById(id);
      if (node) {
        stageOperations.current.removeNode(node, destroy);
      }
    },

    getNodeById: (id: string): Konva.Node | null => {
      const stage = stageRef.current;
      if (!stage) return null;

      const node = stage.findOne(`#${id}`) || null;
      if (node) {
        return node;
      }
      const removedNode = removedNodesRegistry.current.get(id) || null;
      if (removedNode) {
        return removedNode;
      }
      return null;
    },

    redrawDrawingLayer: () => {
      const layer = drawingLayerRef.current;
      if (layer) {
        layer.batchDraw();
      }
    },

    redrawOverlayLayer: () => {
      const layer = overlayLayerRef.current;
      if (layer) {
        layer.batchDraw();
      }
    },

    toggleDrawing: (enabled: boolean) => {
      const layer = drawingLayerRef.current;
      if (layer) {
        layer.listening(enabled);
      }
    },
  });

  return {
    stageOperations: stageOperations.current,
    stageRef,
    drawingLayerRef,
    overlayLayerRef,
  };
}

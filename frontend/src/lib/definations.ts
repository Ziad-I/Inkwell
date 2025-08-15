import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

export interface Point {
  x: number;
  y: number;
}

export interface StageOperations {
  getScale: () => number;
  getStage: () => Konva.Stage | null;
  getDrawingLayer: () => Konva.Layer | null;
  getViewpointPos: () => Point;
  setScale: (newScale: number, pivot?: Point) => void;
  setViewpointPos: (newPos: Point) => void;
  screenToWorld: (sx: number, sy: number) => Point;
  worldToScreen: (wx: number, wy: number) => Point;
  translate: (dx: number, dy: number) => void;
  addPermanentNode: (node: Konva.Node) => void;
}

export interface toolSettings {
  stroke?: string;
  strokeWidth?: number;
  color?: string;
}

export interface ToolContext {
  stageOps: StageOperations;
  toolSettingsRef?: React.RefObject<toolSettings>;
}

export interface Tool {
  id: string;
  label?: string;
  icon?: string;
  cursor?: string; // CSS cursor style
  onActivate?: () => void;
  onDeactivate?: () => void;
  onPointerDown?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerMove?: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerUp?: (e: KonvaEventObject<PointerEvent>) => void;
  exclusive?: boolean; // whether it blocks others
}

export const Tools = {
  Brush: "brush",
  Eraser: "eraser",
  Shape: "shape",
};
export type Tools = (typeof Tools)[keyof typeof Tools];

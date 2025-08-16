import type Konva from "konva";

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

import type Konva from "konva";

export interface Point {
  x: number;
  y: number;
}

export interface StageOperations {
  getScale: () => number;
  getStage: () => Konva.Stage | null;
  getDrawingLayer: () => Konva.Layer | null;
  getOverlayLayer: () => Konva.Layer | null;
  getViewpointPos: () => Point;
  setScale: (newScale: number, pivot?: Point) => void;
  setViewpointPos: (newPos: Point) => void;
  screenToWorld: (sx: number, sy: number) => Point;
  worldToScreen: (wx: number, wy: number) => Point;
  translate: (dx: number, dy: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createNode<CTOR extends new (...args: any[]) => any>(
    Ctor: CTOR,
    ...args: ConstructorParameters<CTOR>
  ): InstanceType<CTOR>;
  getNodeById: (id: string) => Konva.Node | null;
  addDrawingNode: (node: Konva.Node) => void;
  addOverlayNode: (node: Konva.Node) => void;
  removeNode: (node: Konva.Node, destroy: boolean) => void;
  removeNodeById: (id: string, destroy: boolean) => void;
  redrawDrawingLayer: () => void;
  redrawOverlayLayer: () => void;
  toggleDrawing: (enabled: boolean) => void;
}

export interface Settings {
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  lineCap?: "butt" | "round" | "square";
  showGrid?: boolean;
  darkMode?: boolean;
}

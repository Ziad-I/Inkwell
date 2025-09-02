import type Konva from "konva";
import type { Command } from "@/types/command";

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
  addDrawingNode: (node: Konva.Node) => void;
  addOverlayNode: (node: Konva.Node) => void;
  removeNode: (node: Konva.Node, destroy: boolean) => void;
  redrawDrawingLayer: () => void;
  redrawOverlayLayer: () => void;
}

export interface HistoryOperations {
  startCommand(command: Command): void;
  updatePendingCommand(): void;
  commitPendingCommand(): boolean;
  cancelPendingCommand(): void;
  hasPendingCommand(): boolean;
  undo(): boolean;
  redo(): boolean;
  clear(): void;
}

export interface Settings {
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  lineCap?: "butt" | "round" | "square";
  showGrid?: boolean;
  darkMode?: boolean;
}

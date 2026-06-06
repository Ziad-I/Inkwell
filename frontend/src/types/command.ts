import type { ShapeKind } from "@/lib/constants";
import type { Point } from "@/types/common";

export type CommandID = string;

export type CommandType =
  | "stroke"
  | "shape"
  | "erase"
  | "transform"
  | "tombstone"
  | "restore";

export type CommandStatus = "pending" | "applied" | "reverted";

export interface StrokePayload {
  nodeId: string;
  points: number[];
  color: string;
  strokeWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  opacity: number;
}

export interface ShapePayload {
  nodeId: string;
  kind: ShapeKind;
  start: Point;
  end: Point;
  color: string;
  strokeWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  opacity: number;
}

export interface ErasePayload {
  erasedNodes: Set<string>;
}

export interface NodeState {
  width: number;
  height: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
  offsetX: number;
  offsetY: number;
}

export interface TransformPayload {
  transforms: {
    nodeId: string;
    before: NodeState;
    after: NodeState;
  }[];
}

export interface TombstonePayload {
  targetCommandId: CommandID;
  reason?: string;
}
export interface RestorePayload {
  targetCommandId: CommandID;
  reason?: string;
}

export interface BaseCommand {
  id: CommandID;
  type: CommandType;
  payload: CommandPayload;
  owner: string;
  status: CommandStatus;
  timestamp: number;
  seq?: number;
}

export interface StrokeCommand extends BaseCommand {
  type: "stroke";
  payload: StrokePayload;
}

export interface ShapeCommand extends BaseCommand {
  type: "shape";
  payload: ShapePayload;
}

export interface EraseCommand extends BaseCommand {
  type: "erase";
  payload: ErasePayload;
}

export interface TransformCommand extends BaseCommand {
  type: "transform";
  payload: TransformPayload;
}

export interface TombstoneCommand extends BaseCommand {
  type: "tombstone";
  payload: TombstonePayload;
}

export interface RestoreCommand extends BaseCommand {
  type: "restore";
  payload: RestorePayload;
}

export type CommandPayload =
  | StrokePayload
  | ShapePayload
  | ErasePayload
  | TransformPayload
  | TombstonePayload
  | RestorePayload;

export type Command =
  | StrokeCommand
  | ShapeCommand
  | EraseCommand
  | TransformCommand
  | TombstoneCommand
  | RestoreCommand;

// helpers
export interface CommandPayloadMap {
  stroke: StrokePayload;
  shape: ShapePayload;
  erase: ErasePayload;
  transform: TransformPayload;
  tombstone: TombstonePayload;
  restore: RestorePayload;
}

export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

export type PresenceMeta = {
  userColor: string;
  userName: string;
};

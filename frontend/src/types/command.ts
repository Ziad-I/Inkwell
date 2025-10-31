/* eslint-disable @typescript-eslint/no-empty-object-type */

export type CommandID = string;

export type CommandType =
  | "stroke"
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

export interface ErasePayload {
  erasedNodes: string[];
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

export interface TombstonePayload {}
export interface RestorePayload {}

export interface BaseCommand {
  id: CommandID;
  type: CommandType;
  payload: OperationPayload;
  owner: string;
  status: CommandStatus;
  timestamp: number;
  seq?: number;
}

export interface StrokeCommand extends BaseCommand {
  type: "stroke";
  payload: StrokePayload;
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

export type OperationPayload =
  | StrokePayload
  | ErasePayload
  | TransformPayload
  | TombstonePayload
  | RestorePayload;

export type Command =
  | StrokeCommand
  | EraseCommand
  | TransformCommand
  | TombstoneCommand
  | RestoreCommand;

// helpers
export interface CommandPayloadMap {
  stroke: StrokePayload;
  erase: ErasePayload;
  transform: TransformPayload;
  tombstone: TombstonePayload;
  restore: RestorePayload;
}

export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

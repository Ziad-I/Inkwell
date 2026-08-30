import type { CommandID, RenderableCommand } from "@/types/command";

export type OperationKind = "finalize" | "undo" | "redo";

export type OperationStatus =
  | "pending"
  | "acknowledged"
  | "rejected"
  | "uncertain";

export type UncertainReason = "ack-timeout" | "disconnect" | "malformed-ack";

export type AckErrorCategory = "timeout" | "protocol" | "server";

export type OperationRecord = {
  operationId: string;
  commandId: CommandID;
  kind: OperationKind;
  status: OperationStatus;
  previousCanonical: RenderableCommand | undefined;
  optimisticCanonical: RenderableCommand;
  deadlineAt: number;
  seq?: number;
};

export type OperationResolution =
  | { type: "acknowledged"; record: OperationRecord; seq: number }
  | { type: "rejected"; record: OperationRecord; reason: string }
  | { type: "uncertain"; record: OperationRecord; reason: UncertainReason }
  | { type: "already-resolved"; record: OperationRecord }
  | { type: "not-found" };

export type MutationCapability = {
  epoch: string;
  ready: boolean;
  canDraw: boolean;
};

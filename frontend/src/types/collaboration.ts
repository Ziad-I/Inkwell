import type { ZodError } from "zod";
import type { CommandID, RenderableCommand } from "@/types/command";

export type TransitionKind = "finalize" | "undo" | "redo";

export type DurableTransition = {
  kind: TransitionKind;
  commandId: CommandID;
  command: RenderableCommand;
  seq: number;
};

export type ProtocolErrorReason =
  | "sequence-reuse"
  | "invalid-transition"
  | "ambiguous-delta";

export type TransitionResult =
  | { type: "applied"; transitions: readonly DurableTransition[] }
  | { type: "buffered"; missingSeq: number }
  | { type: "duplicate"; seq: number }
  | { type: "protocol-error"; reason: ProtocolErrorReason };

export type ReplacementResult = {
  removedCommandIds: readonly CommandID[];
};

export type OperationStatus =
  | "pending"
  | "acknowledged"
  | "rejected"
  | "uncertain";

export type UncertainReason = "ack-timeout" | "disconnect" | "malformed-ack";

export type OperationRecord = {
  operationId: string;
  commandId: CommandID;
  kind: TransitionKind;
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
  generation: string;
  ready: boolean;
  canDraw: boolean;
};

export type AckErrorCategory = "timeout" | "protocol" | "server";

export type ProtocolParseResult<T> =
  | { success: true; data: T }
  | { success: false; schemaName: string; error: ZodError };

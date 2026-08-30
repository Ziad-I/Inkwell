import type { BoardPermissions, BoardRole } from "@/types/events";

/** Lifecycle phases of one board session generation. */
export type SessionPhase =
  | "idle"
  | "connecting"
  | "joining"
  | "syncing"
  | "ready"
  | "offline"
  | "reconciling"
  | "error";

export type SessionErrorCode =
  | "join-rejected"
  | "join-timeout"
  | "protocol"
  | "connection";

/** Reactive session state published by the BoardSessionCoordinator. */
export type BoardSessionSnapshot = {
  epoch: string;
  roomId: string;
  phase: SessionPhase;
  role: BoardRole | null;
  permissions: BoardPermissions;
  canDraw: boolean;
  error: SessionErrorCode | null;
};

export type ReconciliationReason =
  | "protocol-validation"
  | "sequence-gap"
  | "sequence-conflict"
  | "ack-timeout"
  | "malformed-ack"
  | "disconnect-with-pending-operation"
  | "ambiguous-delta";

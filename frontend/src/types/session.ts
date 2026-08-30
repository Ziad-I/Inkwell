import type { BoardPermissions, BoardRole } from "@/types/events";

export type SessionStatus = {
  status: Status;
  role?: BoardRole;
  permissions?: BoardPermissions;
  error?: string;
};

export type Status =
  | "idle"
  | "connecting"
  | "joining"
  | "syncing"
  | "ready"
  | "error";

export type ReconciliationReason =
  | "protocol-validation"
  | "sequence-gap"
  | "sequence-conflict"
  | "ack-timeout"
  | "malformed-ack"
  | "disconnect-with-pending-operation"
  | "ambiguous-delta";

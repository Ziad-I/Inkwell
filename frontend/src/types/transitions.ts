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

import type {
  CommandID,
  CommandStatus,
  RenderableCommand,
} from "@/types/command";
import type { DurableTransition, TransitionKind } from "@/types/transitions";
import type { ReplacementResult, TransitionResult } from "@/types/transitions";

type DocumentSnapshot = {
  commands: Map<CommandID, RenderableCommand>;
  previews: Map<CommandID, RenderableCommand>;
  bufferedTransitions: Map<number, DurableTransition>;
  durableTransitions: Map<number, DurableTransition>;
  contiguousSeq: number;
};

type DeltaInference = TransitionKind | "duplicate" | "ambiguous";

const RESULTING_STATUS: Record<TransitionKind, CommandStatus> = {
  finalize: "applied",
  undo: "reverted",
  redo: "applied",
};

// How many past durable transitions we keep around purely for duplicate
// detection (acceptTransition's `seq <= contiguousSeq` path). Bounding this
// keeps memory flat over a long-lived session and keeps installDelta's
// snapshot/rollback cost bounded. If a client can plausibly resend a
// transition older than this window, bump the constant rather than
// removing the prune step.
const MAX_DURABLE_HISTORY = 100;

/**
 * BoardDocument manages the state of commands and their transitions.
 * It tracks both durable commands and ephemeral
 * previews, handles the application of transitions,
 * and ensures the integrity of command sequences.
 * Used for maintaining the state of a collaborative board document,
 * including handling command previews and applying transitions in a consistent manner.
 */
export class BoardDocument {
  private commands = new Map<CommandID, RenderableCommand>();
  private previews = new Map<CommandID, RenderableCommand>();
  private bufferedTransitions = new Map<number, DurableTransition>();
  private durableTransitions = new Map<number, DurableTransition>();
  private contiguousSeq = 0;

  getCommand(id: CommandID): RenderableCommand | undefined {
    return this.commands.get(id) ?? this.previews.get(id);
  }

  getCommands(): readonly RenderableCommand[] {
    return [...this.commands.values()].sort(compareCommands);
  }

  // Deliberately excludes previews (ephemeral/optimistic, not yet durable).
  // Use getCommand(id) or getAllRenderable() if you need previews merged in.
  getPreviews(): readonly RenderableCommand[] {
    return [...this.previews.values()].sort(compareCommands);
  }

  // Merged view: durable commands with any in-flight preview overlaid on
  // top, mirroring the fallback order used by getCommand().
  getAllRenderable(): readonly RenderableCommand[] {
    const merged = new Map(this.commands);
    for (const preview of this.previews.values()) {
      merged.set(preview.id, preview);
    }
    return [...merged.values()].sort(compareCommands);
  }

  getHighestContiguousSeq(): number {
    return this.contiguousSeq;
  }

  getBufferedSequences(): readonly number[] {
    return [...this.bufferedTransitions.keys()].sort((a, b) => a - b);
  }

  setPreview(command: RenderableCommand): void {
    this.previews.set(command.id, command);
  }

  removePreview(id: CommandID): void {
    this.previews.delete(id);
  }

  clearPreviews(): void {
    this.previews.clear();
  }

  clear(): void {
    this.commands.clear();
    this.previews.clear();
    this.bufferedTransitions.clear();
    this.durableTransitions.clear();
    this.contiguousSeq = 0;
  }

  acceptTransition(transition: DurableTransition): TransitionResult {
    // Sequence numbers are expected to start at 1. A seq <= 0 can never be
    // legitimate and, left unguarded, would be misclassified below as
    // "sequence-reuse" against an empty durableTransitions lookup.
    if (transition.seq <= 0) {
      return { type: "protocol-error", reason: "invalid-transition" };
    }

    if (transition.seq <= this.contiguousSeq) {
      const confirmed = this.durableTransitions.get(transition.seq);
      if (confirmed && sameTransition(confirmed, transition)) {
        return { type: "duplicate", seq: transition.seq };
      }
      // Note: if transition.seq falls outside our pruned history window
      // (see MAX_DURABLE_HISTORY), `confirmed` will be undefined here even
      // for a legitimate resend, and this will report sequence-reuse. This
      // is the accepted tradeoff for bounded memory; widen the window if
      // your transport can replay transitions older than the window.
      return { type: "protocol-error", reason: "sequence-reuse" };
    }

    const buffered = this.bufferedTransitions.get(transition.seq);
    if (buffered) {
      if (sameTransition(buffered, transition)) {
        return { type: "duplicate", seq: transition.seq };
      }
      return { type: "protocol-error", reason: "sequence-reuse" };
    }

    if (transition.seq > this.contiguousSeq + 1) {
      this.bufferedTransitions.set(transition.seq, transition);
      return { type: "buffered", missingSeq: this.contiguousSeq + 1 };
    }

    return this.applyFrom(transition);
  }

  replaceCurrentState(
    commands: readonly RenderableCommand[],
  ): ReplacementResult {
    const next = new Map<CommandID, RenderableCommand>();
    for (const command of [...commands].sort(compareCommands)) {
      next.set(command.id, command);
    }

    const removed = [...this.commands.values()]
      .filter((command) => !next.has(command.id))
      .sort(compareCommands)
      .map((command) => command.id);

    this.commands = next;
    this.previews.clear();
    this.bufferedTransitions.clear();
    // Fix: durableTransitions must be cleared too. Otherwise stale entries
    // from before this replace can be matched against (or mismatched with)
    // future transitions that legitimately reuse a seq number relative to
    // the new baseline, corrupting acceptTransition's duplicate/reuse logic.
    this.durableTransitions.clear();
    this.contiguousSeq = commands.reduce(
      (highest, command) => Math.max(highest, command.seq ?? 0),
      0,
    );

    return { removedCommandIds: removed };
  }

  installDelta(commands: readonly RenderableCommand[]): TransitionResult {
    if (commands.length === 0) {
      return { type: "applied", transitions: [] };
    }

    const snapshot = this.snapshot();
    const applied: DurableTransition[] = [];
    const records = [...commands].sort(compareCommands);

    for (const record of records) {
      if (record.seq === undefined || record.status === "pending") {
        return this.rollback(snapshot);
      }

      const known = this.commands.get(record.id);
      const kind = inferDeltaTransitionKind(record, known);
      if (kind === "ambiguous") {
        return this.rollback(snapshot);
      }
      if (kind === "duplicate") {
        continue;
      }

      const result = this.acceptTransition({
        kind,
        commandId: record.id,
        command: record,
        seq: record.seq,
      });
      if (result.type === "applied") {
        applied.push(...result.transitions);
      } else if (result.type !== "duplicate") {
        return this.rollback(snapshot);
      }
    }

    return { type: "applied", transitions: applied };
  }

  private applyFrom(first: DurableTransition): TransitionResult {
    const applied: DurableTransition[] = [];
    let current: DurableTransition | undefined = first;

    while (current) {
      const outcome = this.applyOne(current);
      if (!outcome) {
        return { type: "protocol-error", reason: "invalid-transition" };
      }
      applied.push(outcome);
      this.bufferedTransitions.delete(current.seq);
      current = this.bufferedTransitions.get(this.contiguousSeq + 1);
    }

    this.pruneDurableHistory();

    return { type: "applied", transitions: applied };
  }

  private applyOne(
    transition: DurableTransition,
  ): DurableTransition | undefined {
    const known = this.commands.get(transition.commandId);
    if (!isTransitionAllowed(transition.kind, known)) {
      return undefined;
    }

    const command: RenderableCommand = {
      ...transition.command,
      status: RESULTING_STATUS[transition.kind],
      seq: transition.seq,
    };
    this.commands.set(transition.commandId, command);
    this.durableTransitions.set(transition.seq, transition);
    this.contiguousSeq = transition.seq;

    return {
      seq: transition.seq,
      kind: transition.kind,
      commandId: transition.commandId,
      command,
    };
  }

  // Bounds the size of durableTransitions (and therefore the cost of
  // snapshot()/rollback() in installDelta) by dropping entries older than
  // MAX_DURABLE_HISTORY behind the current contiguous seq. See the note in
  // acceptTransition about the resulting tradeoff for very late duplicates.
  private pruneDurableHistory(): void {
    const floor = this.contiguousSeq - MAX_DURABLE_HISTORY;
    if (floor <= 0 || this.durableTransitions.size <= MAX_DURABLE_HISTORY) {
      return;
    }
    for (const seq of this.durableTransitions.keys()) {
      if (seq <= floor) {
        this.durableTransitions.delete(seq);
      }
    }
  }

  private snapshot(): DocumentSnapshot {
    return {
      commands: new Map(this.commands),
      previews: new Map(this.previews),
      bufferedTransitions: new Map(this.bufferedTransitions),
      durableTransitions: new Map(this.durableTransitions),
      contiguousSeq: this.contiguousSeq,
    };
  }

  private rollback(snapshot: DocumentSnapshot): TransitionResult {
    this.commands = snapshot.commands;
    this.previews = snapshot.previews;
    this.bufferedTransitions = snapshot.bufferedTransitions;
    this.durableTransitions = snapshot.durableTransitions;
    this.contiguousSeq = snapshot.contiguousSeq;
    return { type: "protocol-error", reason: "ambiguous-delta" };
  }
}

function isTransitionAllowed(
  kind: TransitionKind,
  known: RenderableCommand | undefined,
): boolean {
  if (kind === "finalize") {
    return known === undefined || known.status === "pending";
  }
  if (kind === "undo") {
    return known?.status === "applied";
  }
  return known?.status === "reverted";
}

function inferDeltaTransitionKind(
  record: RenderableCommand,
  known: RenderableCommand | undefined,
): DeltaInference {
  if (record.seq === undefined || record.status === "pending") {
    return "ambiguous";
  }
  if (!known) {
    return record.status === "applied" ? "finalize" : "ambiguous";
  }
  if (known.status === record.status) {
    return record.seq === known.seq && structurallyEqual(known, record)
      ? "duplicate"
      : "ambiguous";
  }
  if (record.seq <= (known.seq ?? Number.NEGATIVE_INFINITY)) {
    return "ambiguous";
  }
  if (known.status === "applied" && record.status === "reverted") {
    return "undo";
  }
  if (known.status === "reverted" && record.status === "applied") {
    return "redo";
  }
  if (known.status === "pending" && record.status === "applied") {
    return "finalize";
  }
  return "ambiguous";
}

function sameTransition(a: DurableTransition, b: DurableTransition): boolean {
  return (
    a.seq === b.seq &&
    a.kind === b.kind &&
    a.commandId === b.commandId &&
    structurallyEqual(a.command, b.command)
  );
}

function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => structurallyEqual(item, b[index]))
    );
  }
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && structurallyEqual(left[key], right[key]),
    )
  );
}

function compareCommands(a: RenderableCommand, b: RenderableCommand): number {
  return (
    (a.seq ?? 0) - (b.seq ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

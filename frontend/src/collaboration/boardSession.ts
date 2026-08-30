import type { CommandManager } from "@/core/commandManager";
import {
  ACK_DEADLINE_MS,
  AckError,
  type ConnectionManager,
} from "@/core/connectionManager";
import type {
  PresenceMeta,
  Point,
  Command,
  CommandID,
  RenderableCommand,
} from "@/types/command";
import type {
  BoardSessionSnapshot,
  ReconciliationReason,
  SessionErrorCode,
  SessionPhase,
} from "@/types/session";
import type { BoardDocument } from "./boardDocument";
import type { OperationJournal } from "./operationJournal";
import type { BoardPermissions, BoardRole } from "@/types/events";
import type { DurableTransition, TransitionKind } from "@/types/transitions";
import {
  roomSyncArgsSchema,
  commandFinalizeArgsSchema,
  commandUndoArgsSchema,
  commandRedoArgsSchema,
  commandRejectArgsSchema,
  presenceJoinArgsSchema,
  presenceLeaveArgsSchema,
  presenceMoveArgsSchema,
  joinAckSchema,
} from "./schemas";

/** Deadline for resolving a buffered sequence gap before reconciliation. */
export const GAP_DEADLINE_MS = 1_500;

type TimerHandle = ReturnType<typeof setTimeout>;

export type BoardSessionOptions = {
  epoch: string;
  roomId: string;
  connection: ConnectionManager;
  commands: CommandManager;
  document: BoardDocument;
  journal: OperationJournal;
  cancelGesture: () => void;
  clearPresence: () => void;
  /**
   * Validated inbound presence notifications. The presence display model
   * (remote user store) is owned by the UI layer; the coordinator only
   * forwards events it has validated centrally.
   */
  onPresenceJoin?: (userId: string, meta: PresenceMeta) => void;
  onPresenceMove?: (userId: string, pos: Point) => void;
  onPresenceLeave?: (userId: string) => void;
  publish: (snapshot: BoardSessionSnapshot) => void;
  setTimeout?: (handler: () => void, timeoutMs: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
};

type JoinKind = "initial" | "replacement" | "delta";

type JoinAttempt = {
  id: number;
  kind: JoinKind;
  ack: { role: BoardRole; permissions: BoardPermissions } | null;
  synced: boolean;
};

const NO_PERMISSIONS: BoardPermissions = { read: false, draw: false };

/**
 * Owns the connection/join/sync/reconciliation lifecycle for one board
 * session epoch. Readiness requires both a successful `room:join`
 * acknowledgement and a `room:sync` for the same join attempt, in either
 * arrival order; role, permissions, and `canDraw` are published atomically
 * with readiness. Any uncertain outcome (unresolved sequence gap, protocol
 * validation failure, pending operation at disconnect) freezes editing and
 * deliberately rejoins without `lastSeq` to replace local state.
 */
export class BoardSession {
  private readonly epoch: string;
  private readonly roomId: string;
  private readonly connection: ConnectionManager;
  private readonly commands: CommandManager;
  private readonly document: BoardDocument;
  private readonly journal: OperationJournal;
  private readonly cancelGesture: () => void;
  private readonly clearPresence: () => void;
  private readonly onPresenceJoin?: (
    userId: string,
    meta: PresenceMeta,
  ) => void;
  private readonly onPresenceMove?: (userId: string, pos: Point) => void;
  private readonly onPresenceLeave?: (userId: string) => void;
  private readonly publish: (snapshot: BoardSessionSnapshot) => void;
  private readonly schedule: (
    handler: () => void,
    timeoutMs: number,
  ) => TimerHandle;
  private readonly cancelSchedule: (handle: TimerHandle) => void;

  private phase: SessionPhase = "idle";
  private role: BoardRole | null = null;
  private permissions: BoardPermissions = NO_PERMISSIONS;
  private errorCode: SessionErrorCode | null = null;
  private gapFrozen = false;
  private gapTimer: TimerHandle | null = null;
  private joinTimer: TimerHandle | null = null;

  private connected = false;
  private started = false;
  private disposed = false;
  private everSynced = false;

  private attempt: JoinAttempt | null = null;
  private nextAttemptId = 1;
  private durableBuffer: DurableTransition[] = [];

  private lastPublished: BoardSessionSnapshot | null = null;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(options: BoardSessionOptions) {
    this.epoch = options.epoch;
    this.roomId = options.roomId;
    this.connection = options.connection;
    this.commands = options.commands;
    this.document = options.document;
    this.journal = options.journal;
    this.cancelGesture = options.cancelGesture;
    this.clearPresence = options.clearPresence;
    this.onPresenceJoin = options.onPresenceJoin;
    this.onPresenceMove = options.onPresenceMove;
    this.onPresenceLeave = options.onPresenceLeave;
    this.publish = options.publish;
    this.schedule =
      options.setTimeout ?? ((handler, ms) => setTimeout(handler, ms));
    this.cancelSchedule =
      options.clearTimeout ?? ((handle) => clearTimeout(handle));
  }

  /** Registers every server listener, then opens the connection. */
  start(): void {
    if (this.disposed || this.started) {
      return;
    }
    this.started = true;

    this.registerListeners();
    this.setPhase("connecting");
    this.connection.connect();
  }

  getSnapshot(): BoardSessionSnapshot {
    return {
      epoch: this.epoch,
      roomId: this.roomId,
      phase: this.phase,
      role: this.role,
      permissions: { ...this.permissions },
      canDraw:
        this.phase === "ready" && this.permissions.draw && !this.gapFrozen,
      error: this.errorCode,
    };
  }

  /**
   * Deliberate full-state replacement. Idempotent while a replacement is
   * already pending or in flight. While the transport is down the join is
   * deferred until reconnection (which then joins without `lastSeq`).
   */
  requestReconciliation(_reason: ReconciliationReason): void {
    if (this.disposed || !this.started) {
      return;
    }
    if (this.phase === "reconciling" || this.phase === "error") {
      return;
    }

    this.clearGapTimer();
    this.gapFrozen = false;
    this.safeCancelGesture("reconciliation");
    this.clearPresence();
    this.document.clearPreviews();
    // Uncertain and resolved records alike are released here: every
    // in-flight acknowledgement that settles later finds the journal empty
    // and is safely dropped, and the replacement snapshot is authoritative.
    this.journal.clear();

    if (this.connected) {
      this.beginJoin("replacement");
    } else {
      // Transport is down: publish the freeze and defer the replacement
      // join until the socket reconnects.
      this.setPhase("reconciling");
    }
  }

  /** Volatile presence emission; allowed only while the session is ready. */
  emitPresence(pos: Point): boolean {
    if (this.disposed || this.phase !== "ready") {
      return false;
    }
    this.connection.emitVolatile("presence:move", { pos });
    return true;
  }

  /** Idempotent teardown: removes listeners and timers, publishes nothing. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.clearGapTimer();
    this.clearJoinTimer();
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.attempt = null;
    this.durableBuffer = [];
  }

  /** Registers every server listener, then opens the connection. */
  private registerListeners(): void {
    this.unsubscribers.push(
      this.connection.subscribeLifecycle({
        connect: this.handleConnect,
        disconnect: this.handleDisconnect,
        connectError: this.handleConnectError,
      }),
      this.connection.onValidated(
        "room:sync",
        "roomSyncArgs",
        roomSyncArgsSchema,
        this.handleSync,
        this.handleProtocolError,
      ),
      this.connection.onValidated(
        "command:finalize",
        "commandFinalizeArgs",
        commandFinalizeArgsSchema,
        this.makeDurableHandler("finalize"),
        this.handleProtocolError,
      ),
      this.connection.onValidated(
        "command:undo",
        "commandUndoArgs",
        commandUndoArgsSchema,
        this.makeDurableHandler("undo"),
        this.handleProtocolError,
      ),
      this.connection.onValidated(
        "command:redo",
        "commandRedoArgs",
        commandRedoArgsSchema,
        this.makeDurableHandler("redo"),
        this.handleProtocolError,
      ),
      this.connection.onValidated(
        "command:reject",
        "commandRejectArgs",
        commandRejectArgsSchema,
        this.handleReject,
        this.handleProtocolError,
      ),
      this.connection.onValidated(
        "presence:join",
        "presenceJoinArgs",
        presenceJoinArgsSchema,
        this.handlePresenceJoin,
        this.handleProtocolError,
      ),
      this.connection.onValidated(
        "presence:leave",
        "presenceLeaveArgs",
        presenceLeaveArgsSchema,
        this.handlePresenceLeave,
        this.handleProtocolError,
      ),
      this.connection.onValidated(
        "presence:move",
        "presenceMoveArgs",
        presenceMoveArgsSchema,
        this.handlePresenceMove,
        this.handleProtocolError,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Transport lifecycle
  // ---------------------------------------------------------------------------

  /**
   * A tool callback that throws must never abort a session-safety path
   * (disconnect reconciliation, journal clearing, join attempts): the
   * failure is logged and the path continues.
   */
  private safeCancelGesture(context: string): void {
    try {
      this.cancelGesture();
    } catch (error) {
      console.error(`cancelGesture failed during ${context}`, error);
    }
  }

  private handleConnect = (): void => {
    if (this.disposed || !this.started) {
      return;
    }
    this.connected = true;
    if (this.phase === "error") {
      // Terminal: failed joins are never retried automatically.
      return;
    }
    if (this.phase === "reconciling") {
      // A deferred or interrupted replacement join.
      if (!this.attempt) {
        this.beginJoin("replacement");
      }
      return;
    }
    if (this.phase === "offline") {
      this.beginJoin(this.everSynced ? "delta" : "initial");
      return;
    }
    if (this.phase === "connecting") {
      this.beginJoin("initial");
    }
    // joining/syncing/ready: spurious connect while already in session.
  };

  private handleDisconnect = (): void => {
    if (this.disposed || !this.started) {
      return;
    }
    if (this.phase === "error") {
      return;
    }

    this.connected = false;
    this.clearGapTimer();
    this.gapFrozen = false;
    this.clearJoinTimer();
    this.attempt = null;
    this.durableBuffer = [];
    this.clearPresence();

    // A pending replacement stays pending; the join re-emits on reconnect.
    if (this.phase !== "reconciling") {
      this.setPhase("offline");
    }

    // Capability has now dropped: cancel the effective tool's in-flight
    // gesture before the command manager sees the disconnect. The tool's
    // cancelCommand rolls its preview back locally even though the
    // (capability-gated) command:cancel emission is suppressed — without
    // this, an interrupted drag would keep moving nodes or leave a ghost.
    // A throwing tool callback must never abort the disconnect flow
    // (journal uncertainty, reconciliation request) — see safeCancelGesture.
    this.safeCancelGesture("disconnect");

    // May synchronously request reconciliation when operations were pending
    // (disconnect-with-pending-operation); while offline that request only
    // publishes the freeze and defers the replacement join.
    this.commands.handleDisconnect();
  };

  private handleConnectError = (): void => {
    if (this.disposed || !this.started) {
      return;
    }
    if (this.phase === "error") {
      return;
    }
    // Documented choice: after the session has been established, a failed
    // reconnection attempt keeps the (already frozen) waiting phase — the
    // transport retries automatically and a later connect resumes via
    // delta or replacement join. Failures before any connection succeeded
    // are terminal session errors.
    if (this.phase === "offline" || this.phase === "reconciling") {
      return;
    }

    this.clearJoinTimer();
    this.clearGapTimer();
    this.gapFrozen = false;
    this.attempt = null;
    this.durableBuffer = [];
    this.errorCode = "connection";
    this.setPhase("error");
  };

  // ---------------------------------------------------------------------------
  // Join flow
  // ---------------------------------------------------------------------------

  private beginJoin(kind: JoinKind): void {
    this.clearJoinTimer();

    const attempt: JoinAttempt = {
      id: this.nextAttemptId++,
      kind,
      ack: null,
      synced: false,
    };
    this.attempt = attempt;
    // Live events buffered before this attempt are superseded by the
    // snapshot the incoming sync will install.
    this.durableBuffer = [];

    this.setPhase(kind === "replacement" ? "reconciling" : "joining");

    const payload: { roomId: string; lastSeq?: number } = {
      roomId: this.roomId,
    };
    if (kind === "delta") {
      payload.lastSeq = this.document.getHighestContiguousSeq();
    }

    this.connection
      .emitWithAck("room:join", payload, joinAckSchema, ACK_DEADLINE_MS)
      .then(
        (ack) => this.handleJoinAck(attempt, ack),
        (error: unknown) => this.handleJoinFailure(attempt, error),
      );

    this.joinTimer = this.schedule(() => {
      this.joinTimer = null;
      this.handleJoinFailure(
        attempt,
        new AckError(
          "room:join",
          "timeout",
          `Join deadline of ${ACK_DEADLINE_MS} ms expired`,
        ),
      );
    }, ACK_DEADLINE_MS);
  }

  private handleJoinAck(
    attempt: JoinAttempt,
    ack: { role: BoardRole; permissions: BoardPermissions },
  ): void {
    if (this.disposed || this.attempt !== attempt) {
      return;
    }
    this.clearJoinTimer();
    attempt.ack = ack;
    this.completeIfReady(attempt);
  }

  private handleJoinFailure(attempt: JoinAttempt, error: unknown): void {
    if (this.disposed || this.attempt !== attempt) {
      return;
    }
    this.clearJoinTimer();
    this.attempt = null;
    this.durableBuffer = [];
    this.errorCode = joinErrorCode(error);
    this.setPhase("error");
  }

  // ---------------------------------------------------------------------------
  // Synchronization flow
  // ---------------------------------------------------------------------------

  private handleSync = (state: Command[]): void => {
    if (this.disposed || !this.started) {
      return;
    }
    if (this.phase === "error") {
      return;
    }

    const attempt = this.attempt;
    if (!attempt || attempt.synced) {
      return;
    }

    attempt.synced = true;
    this.commands.installSync(state, attempt.kind !== "delta");

    if (this.attempt !== attempt) {
      // The install escalated to reconciliation and superseded this attempt.
      return;
    }

    if (attempt.kind !== "replacement" && this.phase === "joining") {
      this.setPhase("syncing");
    }

    this.completeIfReady(attempt);
  };

  private completeIfReady(attempt: JoinAttempt): void {
    if (this.disposed || this.attempt !== attempt) {
      return;
    }
    if (!attempt.ack || !attempt.synced) {
      return;
    }

    this.attempt = null;
    this.role = attempt.ack.role;
    this.permissions = attempt.ack.permissions;
    this.everSynced = true;

    this.drainDurableBuffer(attempt.kind);

    if (this.disposed || this.attempt !== null) {
      // Reconciliation began mid-drain and now owns the session.
      return;
    }
    if (this.phase === "error") {
      return;
    }

    // Reaching here from a replacement attempt legitimately transitions
    // from "reconciling" straight to "ready".
    this.setPhase("ready");
  }

  /**
   * Applies buffered live transitions in sequence order. After a
   * replacement install, transitions covered by the snapshot baseline are
   * discarded (they are already materialized in the installed state and
   * carry no fingerprint to prove identity).
   */
  private drainDurableBuffer(kind: JoinKind): void {
    if (this.durableBuffer.length === 0) {
      return;
    }
    const transitions = [...this.durableBuffer].sort((a, b) => a.seq - b.seq);
    this.durableBuffer = [];

    const baseline = this.document.getHighestContiguousSeq();
    for (const transition of transitions) {
      if (kind !== "delta" && transition.seq <= baseline) {
        continue;
      }
      this.applyDurable(transition);
      if (this.disposed || this.attempt !== null) {
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Durable events, rejections, presence
  // ---------------------------------------------------------------------------

  private makeDurableHandler(kind: TransitionKind) {
    return (commandId: CommandID, command: RenderableCommand): void => {
      if (this.disposed || !this.started) {
        return;
      }
      if (
        this.phase === "error" ||
        this.phase === "offline" ||
        this.phase === "connecting" ||
        this.phase === "idle"
      ) {
        return;
      }

      if (command.seq === undefined) {
        // A durable event without a sequence cannot be ordered safely.
        this.handleProtocolError();
        return;
      }

      const transition: DurableTransition = {
        kind,
        commandId,
        command,
        seq: command.seq,
      };

      if (this.phase === "ready") {
        this.applyDurable(transition);
      } else {
        // Live transitions received while joining/syncing/reconciling wait
        // for the sync install; they are drained at readiness.
        this.durableBuffer.push(transition);
      }
    };
  }

  private applyDurable(transition: DurableTransition): void {
    const result = this.commands.applyRemoteTransition(transition);
    if (result.type === "buffered") {
      this.onGapOpened();
    } else if (result.type === "applied") {
      this.onGapMaybeResolved();
    }
    // Protocol errors escalate through the CommandManager's own
    // requestReconciliation wiring; duplicates need no action.
  }

  private handleReject = (commandId: CommandID, reason: string): void => {
    if (this.disposed || !this.started) {
      return;
    }
    if (this.phase === "error") {
      return;
    }
    this.commands.handleRejection(commandId, reason);
  };

  private handlePresenceJoin = (userId: string, meta: PresenceMeta): void => {
    if (this.disposed) return;
    // Presence joins arrive from the moment of connect (the server
    // replays every room member), so they are forwarded regardless of
    // the current phase; validation already happened centrally.
    this.onPresenceJoin?.(userId, meta);
  };

  private handlePresenceLeave = (userId: string): void => {
    if (this.disposed) return;
    this.onPresenceLeave?.(userId);
  };

  private handlePresenceMove = (userId: string, pos: Point): void => {
    if (this.disposed) return;
    this.onPresenceMove?.(userId, pos);
  };

  private handleProtocolError = (): void => {
    // A protocol validation error transitions the board into
    // reconciliation rather than throwing through the socket listener.
    this.requestReconciliation("protocol-validation");
  };

  // ---------------------------------------------------------------------------
  // Sequence-gap handling
  // ---------------------------------------------------------------------------

  private onGapOpened(): void {
    if (this.gapFrozen) {
      // One timer governs the whole gap episode.
      return;
    }
    this.gapFrozen = true;
    this.gapTimer = this.schedule(() => {
      this.gapTimer = null;
      this.requestReconciliation("sequence-gap");
    }, GAP_DEADLINE_MS);
    if (this.phase === "ready") {
      this.commit();
    }
  }

  private onGapMaybeResolved(): void {
    if (!this.gapFrozen) {
      return;
    }
    if (this.document.getBufferedSequences().length > 0) {
      // A later gap is still open; the running timer still governs.
      return;
    }
    this.gapFrozen = false;
    this.clearGapTimer();
    if (this.phase === "ready") {
      this.commit();
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot delivery
  // ---------------------------------------------------------------------------

  private setPhase(phase: SessionPhase): void {
    this.phase = phase;
    this.commit();
  }

  private commit(): void {
    const snapshot = this.getSnapshot();
    const last = this.lastPublished;
    if (
      last &&
      last.phase === snapshot.phase &&
      last.role === snapshot.role &&
      last.error === snapshot.error &&
      last.canDraw === snapshot.canDraw &&
      last.permissions.read === snapshot.permissions.read &&
      last.permissions.draw === snapshot.permissions.draw
    ) {
      return;
    }
    this.lastPublished = snapshot;
    this.publish(snapshot);
  } // ---------------------------------------------------------------------------
  // Timers
  // ---------------------------------------------------------------------------

  private clearGapTimer(): void {
    if (this.gapTimer === null) {
      return;
    }
    this.cancelSchedule(this.gapTimer);
    this.gapTimer = null;
  }

  private clearJoinTimer(): void {
    if (this.joinTimer === null) {
      return;
    }
    this.cancelSchedule(this.joinTimer);
    this.joinTimer = null;
  }
}

function joinErrorCode(error: unknown): SessionErrorCode {
  if (error instanceof AckError) {
    if (error.category === "server") {
      return "join-rejected";
    }
    if (error.category === "timeout") {
      return "join-timeout";
    }
    return "protocol";
  }
  return "protocol";
}

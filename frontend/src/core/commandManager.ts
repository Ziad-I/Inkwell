import { throttle } from "lodash-es";
import { CommandFactory } from "@/core/commandFactory";
import type { BaseCommand } from "@/commands/baseCommand";
import type { BoardDocument } from "@/collaboration/boardDocument";
import type { OperationJournal } from "@/collaboration/operationJournal";
import type {
  MutationCapability,
  OperationKind,
  OperationRecord,
  UncertainReason,
} from "@/types/operations";
import type { ReconciliationReason } from "@/types/session";
import type {
  CommandID,
  Command,
  CommandPayload,
  CommandType,
  RenderableCommand,
} from "@/types/command";
import type { ClientEmitEvents } from "@/types/events";
import type { StageOperations } from "@/types/common";
import {
  ACK_DEADLINE_MS,
  AckError,
  ProtocolValidationError,
  type ConnectionManager,
} from "./connectionManager";
import {
  commandCancelArgsSchema,
  commandCreateArgsSchema,
  commandUpdateArgsSchema,
  durableAckSchema,
} from "@/collaboration/schemas";
import { generateId } from "@/lib/utils";
import type { DurableTransition, TransitionResult } from "@/types/transitions";

type EventKey = keyof ClientEmitEvents;

export type CommandManagerOptions = {
  epoch: string;
  userId: string;
  stageOps: StageOperations;
  connection: ConnectionManager;
  document: BoardDocument;
  journal: OperationJournal;
  getCapability: () => MutationCapability;
  requestReconciliation: (reason: ReconciliationReason) => void;
  notifyCommandFailure: (message: string) => void;
};

type HistorySnapshot = {
  undoStack: CommandID[];
  redoStack: CommandID[];
};

type OperationContext = HistorySnapshot & {
  deadlineTimer: ReturnType<typeof setTimeout>;
};

type DurableEmission = {
  event: string;
  payload: unknown;
};

export class CommandManager {
  private static readonly MAX_UNDO_STACK_SIZE = 50;
  private static readonly UPDATE_THROTTLE_MS = 100;

  // ---------------------------------------------------------------------------
  // dependencies
  // ---------------------------------------------------------------------------

  private readonly epoch: string;
  private readonly userId: string;
  private readonly stageOps: StageOperations;
  private readonly connection: ConnectionManager;
  private readonly document: BoardDocument;
  private readonly journal: OperationJournal;
  private readonly getCapability: () => MutationCapability;
  private readonly requestReconciliation: (
    reason: ReconciliationReason,
  ) => void;
  private readonly notifyCommandFailure: (message: string) => void;
  private readonly factory: CommandFactory;

  // ---------------------------------------------------------------------------
  // Command state
  // ---------------------------------------------------------------------------

  /** All commands known by the client, keyed by command ID. */
  private readonly commands = new Map<CommandID, Command>();

  /** Commands currently being created/updated (local and remote previews). */
  private readonly pendingCommands = new Map<CommandID, BaseCommand>();

  /** Per-command update throttles. */
  private readonly throttles = new Map<
    CommandID,
    ReturnType<typeof throttle>
  >();

  /** Per-operation history snapshots and deadline timers, keyed by operation ID. */
  private readonly operationContexts = new Map<string, OperationContext>();

  /** Command IDs belonging to the local user's undo/redo history. */
  private undoStack: CommandID[] = [];
  private redoStack: CommandID[] = [];

  private destroyed = false;

  // ---------------------------------------------------------------------------
  // Local events
  // ---------------------------------------------------------------------------

  private readonly listeners = new Map<EventKey, Set<() => void>>();
  private readonly listenerUnsubscribers: Array<() => void> = [];

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  constructor(options: CommandManagerOptions) {
    this.epoch = options.epoch;
    this.userId = options.userId;
    this.stageOps = options.stageOps;
    this.connection = options.connection;
    this.document = options.document;
    this.journal = options.journal;
    this.getCapability = options.getCapability;
    this.requestReconciliation = options.requestReconciliation;
    this.notifyCommandFailure = options.notifyCommandFailure;
    this.factory = new CommandFactory();

    this.registerServerListeners();
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    for (const throttled of this.throttles.values()) {
      throttled.cancel();
    }
    this.throttles.clear();

    for (const instance of this.pendingCommands.values()) {
      instance.destroy();
    }
    this.pendingCommands.clear();

    for (const context of this.operationContexts.values()) {
      clearTimeout(context.deadlineTimer);
    }
    this.operationContexts.clear();

    this.commands.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.document.clear();
    this.journal.clear();
    this.listeners.clear();

    for (const unsubscribe of this.listenerUnsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  // ---------------------------------------------------------------------------
  // Local event emitter
  // ---------------------------------------------------------------------------

  public on(events: EventKey | EventKey[], handler: () => void): void {
    for (const event of this.normalizeEvents(events)) {
      let handlers = this.listeners.get(event);

      if (!handlers) {
        handlers = new Set();
        this.listeners.set(event, handlers);
      }

      handlers.add(handler);
    }
  }

  public off(events: EventKey | EventKey[], handler: () => void): void {
    for (const event of this.normalizeEvents(events)) {
      const handlers = this.listeners.get(event);

      if (!handlers) {
        continue;
      }

      handlers.delete(handler);

      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit(events: EventKey | EventKey[]): void {
    for (const event of this.normalizeEvents(events)) {
      const handlers = this.listeners.get(event);

      if (!handlers) {
        continue;
      }

      // Copy so a handler can safely call off() while iterating.
      for (const handler of Array.from(handlers)) {
        try {
          handler();
        } catch (error) {
          console.error("Listener error for", event, error);
        }
      }
    }
  }

  private normalizeEvents(events: EventKey | EventKey[]): EventKey[] {
    return Array.isArray(events) ? events : [events];
  }

  // ---------------------------------------------------------------------------
  // Capability gate
  // ---------------------------------------------------------------------------

  private ensureCanMutate(): boolean {
    if (this.destroyed) {
      console.warn("Command manager is destroyed; mutations are blocked");
      return false;
    }

    const capability = this.getCapability();

    if (capability.epoch !== this.epoch) {
      console.warn("Command epoch does not match the active session epoch");
      return false;
    }

    if (!capability.ready) {
      console.warn("Session is not ready; mutations are blocked");
      return false;
    }

    if (!capability.canDraw) {
      console.warn("User does not have permission to draw in this room");
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Local command lifecycle
  // ---------------------------------------------------------------------------

  public startCommand(
    type: CommandType,
    initialPayload: CommandPayload,
  ): CommandID | null {
    if (!this.ensureCanMutate()) {
      return null;
    }

    const command = this.factory.createCommand(
      type,
      initialPayload,
      this.userId,
    );

    const instance = this.factory.createInstance(command, this.stageOps);

    this.commands.set(command.id, command);
    this.pendingCommands.set(command.id, instance);

    instance.apply();

    this.connection.emit("command:create", {
      id: command.id,
      command: instance.serialize(),
    });

    return command.id;
  }

  /**
   * Updates a pending command's payload.
   *
   * Contract: returns `true` when the update was applied locally, and
   * `false` — without throwing — when mutations are currently blocked or
   * the command is no longer pending (for example, the server already
   * rejected it). Tools treat `false` as a signal to reset their gesture
   * state so a stale command ID can never wedge a gesture.
   */
  public updateCommand(
    commandId: CommandID,
    updatedPayload: Partial<CommandPayload>,
  ): boolean {
    if (!this.ensureCanMutate()) {
      return false;
    }

    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      console.warn(`No pending command found with ID: ${commandId}`);
      return false;
    }

    const command = this.requireCommand(commandId);

    instance.update(updatedPayload);

    const serialized = instance.serialize();
    this.commands.set(command.id, serialized);

    this.throttleFor(commandId)(commandId, serialized);
    return true;
  }

  /**
   * Finalizes a pending command into a durable operation.
   *
   * Contract: returns `true` when the finalize was started, and `false` —
   * without throwing — when mutations are currently blocked or the
   * command is no longer pending. Throws only for the internal
   * invariant of a live command that `canFinalize()` rejects.
   */
  public finalizeCommand(commandId: CommandID): boolean {
    if (!this.ensureCanMutate()) {
      return false;
    }

    this.flushUpdateThrottle(commandId);

    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      console.warn(`No pending command found with ID: ${commandId}`);
      return false;
    }

    if (!instance.canFinalize()) {
      throw new Error(`Command with ID ${commandId} cannot be finalized yet`);
    }

    const previousCanonical: Command = { ...instance.serialize() };
    const optimisticCanonical: RenderableCommand = {
      ...previousCanonical,
      status: "applied",
    };
    const history: HistorySnapshot = {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };

    this.commands.set(commandId, optimisticCanonical);
    this.pendingCommands.delete(commandId);

    this.pushUndo(commandId);
    this.redoStack = [];

    this.beginDurableOperation(
      "finalize",
      commandId,
      previousCanonical,
      optimisticCanonical,
      {
        event: "command:finalize",
        payload: { id: commandId, command: previousCanonical },
      },
      history,
    );
    return true;
  }

  /**
   * Cancels a pending command. The LOCAL rollback is unconditional: it
   * must run even when capability (or the transport) was lost mid-gesture,
   * otherwise the preview node would survive as a ghost on the stage. Only
   * the `command:cancel` emission stays capability-gated — a cancel sent
   * while disconnected or unauthorized can never be delivered usefully, so
   * it is deliberately skipped.
   *
   * Contract: tolerant of unknown or already-removed command IDs (the
   * server may have rejected the preview and rolled it back first): the
   * call warns once and returns `false` instead of throwing, matching the
   * documented idempotency of tool `cancelGesture`. Returns `true` when a
   * pending command was rolled back.
   */
  public cancelCommand(commandId: CommandID): boolean {
    if (this.destroyed) {
      return false;
    }

    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      console.warn(`No pending command found with ID: ${commandId}`);
      return false;
    }

    const throttled = this.throttles.get(commandId);
    throttled?.cancel();
    this.throttles.delete(commandId);

    instance.undo();
    instance.destroy();

    this.commands.delete(commandId);
    this.pendingCommands.delete(commandId);

    if (this.ensureCanMutate()) {
      this.connection.emit("command:cancel", {
        id: commandId,
      });
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Undo / redo
  // ---------------------------------------------------------------------------

  public undo(): void {
    if (!this.ensureCanMutate()) {
      return;
    }

    const commandId = this.undoStack[this.undoStack.length - 1];

    if (!commandId) {
      console.warn("Undo stack is empty");
      return;
    }

    if (this.journal.findPendingByCommand(commandId)) {
      console.warn(
        `Command with ID ${commandId} still has a pending durable operation`,
      );
      return;
    }

    const history: HistorySnapshot = {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };

    this.undoStack.pop();

    const command = this.requireCommand(commandId);
    const instance = this.createCommandInstance(commandId);

    instance.undo();

    const previousCanonical: Command = { ...command };
    const optimisticCanonical: RenderableCommand = {
      ...command,
      status: "reverted",
    };

    this.redoStack.push(commandId);
    this.commands.set(commandId, optimisticCanonical);

    this.emit("command:undo");

    this.beginDurableOperation(
      "undo",
      commandId,
      previousCanonical,
      optimisticCanonical,
      { event: "command:undo", payload: { id: commandId } },
      history,
    );
  }

  public redo(): void {
    if (!this.ensureCanMutate()) {
      return;
    }

    const commandId = this.redoStack[this.redoStack.length - 1];

    if (!commandId) {
      console.warn("Redo stack is empty");
      return;
    }

    if (this.journal.findPendingByCommand(commandId)) {
      console.warn(
        `Command with ID ${commandId} still has a pending durable operation`,
      );
      return;
    }

    const history: HistorySnapshot = {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };

    this.redoStack.pop();

    const command = this.requireCommand(commandId);
    const instance = this.createCommandInstance(commandId);

    instance.redo();

    const previousCanonical: Command = { ...command };
    const optimisticCanonical: RenderableCommand = {
      ...command,
      status: "applied",
    };

    this.pushUndo(commandId);
    this.commands.set(commandId, optimisticCanonical);

    this.emit("command:redo");

    this.beginDurableOperation(
      "redo",
      commandId,
      previousCanonical,
      optimisticCanonical,
      { event: "command:redo", payload: { id: commandId } },
      history,
    );
  }

  // ---------------------------------------------------------------------------
  // Command history / queries
  // ---------------------------------------------------------------------------

  public getUndoStack(): CommandID[] {
    return [...this.undoStack];
  }

  public getRedoStack(): CommandID[] {
    return [...this.redoStack];
  }

  public getLastSeq(): number {
    return this.document.getHighestContiguousSeq();
  }

  public getOperation(commandId: CommandID): Command | undefined {
    return this.commands.get(commandId);
  }

  private pushUndo(commandId: CommandID): void {
    this.undoStack.push(commandId);

    if (this.undoStack.length > CommandManager.MAX_UNDO_STACK_SIZE) {
      this.undoStack.shift();
    }
  }

  // ---------------------------------------------------------------------------
  // Durable operation lifecycle (journal + acknowledgement)
  // ---------------------------------------------------------------------------

  private beginDurableOperation(
    kind: OperationKind,
    commandId: CommandID,
    previousCanonical: Command | undefined,
    optimisticCanonical: RenderableCommand,
    emission: DurableEmission,
    history: HistorySnapshot,
  ): void {
    const operationId = generateId();

    this.journal.begin({
      operationId,
      commandId,
      kind,
      previousCanonical,
      optimisticCanonical,
      deadlineAt: Date.now() + ACK_DEADLINE_MS,
    });

    const deadlineTimer = setTimeout(() => {
      this.resolveUncertain(operationId, "ack-timeout", "ack-timeout");
    }, ACK_DEADLINE_MS);

    this.operationContexts.set(operationId, {
      deadlineTimer,
      undoStack: history.undoStack,
      redoStack: history.redoStack,
    });

    this.connection
      .emitWithAck(emission.event, emission.payload, durableAckSchema)
      .then(
        (ack) => {
          this.handleAckSuccess(
            operationId,
            commandId,
            kind,
            optimisticCanonical,
            ack.seq,
          );
        },
        (error: unknown) => {
          this.handleAckError(operationId, commandId, error);
        },
      );
  }

  private handleAckSuccess(
    operationId: string,
    commandId: CommandID,
    kind: OperationKind,
    optimisticCanonical: RenderableCommand,
    seq: number,
  ): void {
    this.clearOperationContext(operationId);

    if (this.destroyed) {
      return;
    }

    const resolution = this.journal.acknowledge(operationId, seq);

    if (resolution.type !== "acknowledged") {
      return;
    }

    const confirmed: RenderableCommand = { ...optimisticCanonical, seq };
    this.commands.set(commandId, confirmed);

    const result = this.document.acceptTransition({
      kind,
      commandId,
      command: confirmed,
      seq,
    });

    this.applyTransitionResult(result, "sequence-conflict", {
      commandId,
      kind,
    });
  }

  private handleAckError(
    operationId: string,
    commandId: CommandID,
    error: unknown,
  ): void {
    if (this.destroyed) {
      this.clearOperationContext(operationId);
      return;
    }

    if (error instanceof AckError) {
      if (error.category === "server") {
        const reason =
          typeof error.cause === "string" ? error.cause : "server-rejection";
        this.resolveRejection(commandId, reason);
        this.clearOperationContext(operationId);
        return;
      }

      if (error.category === "timeout") {
        this.resolveUncertain(operationId, "ack-timeout", "ack-timeout");
        return;
      }

      this.resolveUncertain(operationId, "malformed-ack", "malformed-ack");
      return;
    }

    console.error("Unexpected acknowledgement error", error);
    this.resolveUncertain(operationId, "malformed-ack", "malformed-ack");
  }

  private resolveUncertain(
    operationId: string,
    journalReason: UncertainReason,
    reconciliationReason: ReconciliationReason,
  ): void {
    const resolution = this.journal.markUncertain(operationId, journalReason);

    this.clearOperationContext(operationId);

    if (resolution.type === "uncertain") {
      this.requestReconciliation(reconciliationReason);
    }
  }

  private resolveRejection(commandId: CommandID, reason: string): void {
    const resolution = this.journal.rejectByCommand(commandId, reason);

    if (resolution.type === "rejected") {
      this.rollbackRejectedOperation(resolution.record);
      return;
    }

    if (resolution.type === "not-found") {
      this.rollbackPendingCommand(commandId, reason);
    }
  }

  private rollbackRejectedOperation(record: OperationRecord): void {
    const { kind, commandId, previousCanonical, optimisticCanonical } = record;

    const instance = this.factory.createInstance(
      optimisticCanonical,
      this.stageOps,
    );

    if (kind === "undo") {
      instance.redo();
    } else {
      instance.undo();
    }

    if (kind === "finalize") {
      instance.destroy();
      this.commands.delete(commandId);
    } else if (previousCanonical) {
      this.commands.set(commandId, previousCanonical);
    }

    const context = this.operationContexts.get(record.operationId);

    if (context) {
      clearTimeout(context.deadlineTimer);
      // A snapshot taken before this operation may reference commands that a
      // concurrently-resolved rejection has since removed; history stacks
      // must never hold IDs absent from the commands map.
      this.undoStack = context.undoStack.filter((entryId) =>
        this.commands.has(entryId),
      );
      this.redoStack = context.redoStack.filter((entryId) =>
        this.commands.has(entryId),
      );
      this.operationContexts.delete(record.operationId);
    }

    this.notifyCommandFailure(
      "Your board change was rejected and has been reverted.",
    );
  }

  private rollbackPendingCommand(commandId: CommandID, reason: string): void {
    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      console.warn(
        `Command with ID ${commandId} was rejected by server: ${reason}`,
      );
      return;
    }

    const throttled = this.throttles.get(commandId);
    throttled?.cancel();
    this.throttles.delete(commandId);

    instance.undo();
    instance.destroy();

    this.pendingCommands.delete(commandId);
    this.commands.delete(commandId);

    this.notifyCommandFailure(
      "Your board change was rejected and has been reverted.",
    );
  }

  private clearOperationContext(operationId: string): void {
    const context = this.operationContexts.get(operationId);

    if (context) {
      clearTimeout(context.deadlineTimer);
      this.operationContexts.delete(operationId);
    }
  }

  // ---------------------------------------------------------------------------
  // Server-driven reconciliation entry points
  // ---------------------------------------------------------------------------

  /** Resolves a server `command:reject` event against the journal exactly once. */
  public handleRejection(commandId: CommandID, reason: string): void {
    if (this.destroyed) {
      return;
    }

    console.warn(
      `Command with ID ${commandId} was rejected by server: ${reason}`,
    );

    this.resolveRejection(commandId, reason);
  }

  /** Marks pending operations uncertain and requests reconciliation on disconnect. */
  public handleDisconnect(): void {
    if (this.destroyed) {
      return;
    }

    let hadPending = false;

    for (const record of this.journal.pending()) {
      const resolution = this.journal.markUncertain(
        record.operationId,
        "disconnect",
      );

      this.clearOperationContext(record.operationId);

      if (resolution.type === "uncertain") {
        hadPending = true;
      }
    }

    // Un-finalized previews can never complete while disconnected: roll
    // every one of them back (local and remote alike — their updates stop
    // with the transport) so no ghost survives the offline period or the
    // eventual reconnect. Any non-empty pending set makes local state
    // uncertain, which is exactly what reconciliation replaces.
    if (this.pendingCommands.size > 0) {
      hadPending = true;
      this.rollbackAllPendingCommands();
    }

    if (hadPending) {
      this.requestReconciliation("disconnect-with-pending-operation");
    }
  }

  /**
   * Rolls back every pending preview without emitting anything: throttles
   * are cancelled, instances undone and destroyed, and bookkeeping maps
   * cleared.
   */
  private rollbackAllPendingCommands(): void {
    for (const [commandId, instance] of this.pendingCommands) {
      const throttled = this.throttles.get(commandId);
      throttled?.cancel();
      this.throttles.delete(commandId);

      instance.undo();
      instance.destroy();

      this.commands.delete(commandId);
      this.pendingCommands.delete(commandId);
    }
  }

  /** Installs a `room:sync` payload as a full replacement or a delta. */
  public installSync(commands: readonly Command[], replacement: boolean): void {
    if (this.destroyed) {
      return;
    }

    if (replacement) {
      this.installReplacement(commands);
      return;
    }

    const result = this.document.installDelta(commands);
    this.applyTransitionResult(result, "ambiguous-delta");
  }

  private installReplacement(commands: readonly Command[]): void {
    for (const [commandId, instance] of this.pendingCommands) {
      const throttled = this.throttles.get(commandId);
      throttled?.cancel();
      this.throttles.delete(commandId);

      instance.undo();
      instance.destroy();
    }
    this.pendingCommands.clear();

    this.document.clearPreviews();
    this.stageOps.resetRoomScene();

    this.document.replaceCurrentState(commands);

    this.commands.clear();

    for (const command of this.document.getCommands()) {
      this.commands.set(command.id, command);

      if (command.status !== "applied") {
        continue;
      }

      const instance = this.factory.createInstance(command, this.stageOps);
      instance.apply();
      instance.finalize();
    }

    this.rebuildHistory();

    for (const context of this.operationContexts.values()) {
      clearTimeout(context.deadlineTimer);
    }
    this.operationContexts.clear();
    this.journal.clear();
  }

  private rebuildHistory(): void {
    const undo: CommandID[] = [];
    const redo: CommandID[] = [];

    for (const command of this.document.getCommands()) {
      if (command.owner !== this.userId) {
        continue;
      }

      if (command.status === "applied") {
        undo.push(command.id);
      } else if (command.status === "reverted") {
        redo.push(command.id);
      }
    }

    this.undoStack = undo;
    this.redoStack = redo;
  }

  /** Applies a remote durable transition; returns the document result. */
  public applyRemoteTransition(
    transition: DurableTransition,
  ): TransitionResult {
    if (this.destroyed) {
      return { type: "duplicate", seq: transition.seq };
    }

    const result = this.document.acceptTransition(transition);
    this.applyTransitionResult(result, "sequence-conflict");
    return result;
  }

  private applyTransitionResult(
    result: TransitionResult,
    conflictReason: ReconciliationReason,
    skip?: { commandId: CommandID; kind: OperationKind },
  ): void {
    if (result.type === "applied") {
      for (const transition of result.transitions) {
        if (
          skip &&
          transition.commandId === skip.commandId &&
          transition.kind === skip.kind
        ) {
          continue;
        }

        this.projectTransition(transition);
      }
      return;
    }

    if (result.type === "protocol-error") {
      this.requestReconciliation(conflictReason);
    }
  }

  private projectTransition(transition: DurableTransition): void {
    const { kind, commandId, command } = transition;

    if (kind === "finalize") {
      const instance = this.pendingCommands.get(commandId);

      if (instance) {
        instance.finalize();
        this.pendingCommands.delete(commandId);
      } else {
        const created = this.factory.createInstance(command, this.stageOps);
        created.apply();
        created.finalize();
      }

      this.document.removePreview(commandId);
    } else {
      const instance = this.factory.createInstance(command, this.stageOps);

      if (kind === "undo") {
        instance.undo();
      } else {
        instance.redo();
      }
    }

    this.commands.set(commandId, command);
  }

  // ---------------------------------------------------------------------------
  // Server listeners (remote previews)
  // ---------------------------------------------------------------------------

  /**
   * Register inbound remote-preview handlers on the ConnectionManager.
   * Durable events, sync, and rejection handling are driven by the session
   * coordinator through installSync/applyRemoteTransition/handleRejection.
   */
  public registerServerListeners(): void {
    this.listenerUnsubscribers.push(
      this.connection.onValidated(
        "command:create",
        "commandCreateArgs",
        commandCreateArgsSchema,
        this.onRemoteCreate,
        this.onPreviewProtocolError,
      ),
      this.connection.onValidated(
        "command:update",
        "commandUpdateArgs",
        commandUpdateArgsSchema,
        this.onRemoteUpdate,
        this.onPreviewProtocolError,
      ),
      this.connection.onValidated(
        "command:cancel",
        "commandCancelArgs",
        commandCancelArgsSchema,
        this.onRemoteCancel,
        this.onPreviewProtocolError,
      ),
    );
  }

  private onPreviewProtocolError = (_error: ProtocolValidationError): void => {
    if (this.destroyed) {
      return;
    }

    this.requestReconciliation("protocol-validation");
  };

  /** Another user started a new command — show it as a live preview. */
  private onRemoteCreate = (
    commandId: CommandID,
    command: RenderableCommand,
  ): void => {
    if (this.destroyed) {
      return;
    }

    if (command.owner === this.userId || this.commands.has(commandId)) {
      return;
    }

    const instance = this.factory.createInstance(command, this.stageOps);

    instance.apply();

    this.commands.set(commandId, command);
    this.pendingCommands.set(commandId, instance);
    this.document.setPreview(command);
  };

  /** Another user updated their in-flight command — update the live preview. */
  private onRemoteUpdate = (
    commandId: CommandID,
    command: RenderableCommand,
  ): void => {
    if (this.destroyed) {
      return;
    }

    if (command.owner === this.userId) {
      return;
    }

    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      return;
    }

    instance.update(command.payload);
    this.commands.set(commandId, command);
    this.document.setPreview(command);
  };

  /** Another user cancelled their in-flight command — remove the preview. */
  private onRemoteCancel = (commandId: CommandID): void => {
    if (this.destroyed) {
      return;
    }

    const command = this.commands.get(commandId);

    if (command?.owner === this.userId) {
      return;
    }

    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      return;
    }

    instance.undo();
    instance.destroy();

    this.commands.delete(commandId);
    this.pendingCommands.delete(commandId);
    this.document.removePreview(commandId);
  };

  // ---------------------------------------------------------------------------
  // Internal command helpers
  // ---------------------------------------------------------------------------

  private throttleFor(commandId: CommandID): ReturnType<typeof throttle> {
    let throttled = this.throttles.get(commandId);

    if (!throttled) {
      throttled = throttle(
        (id: CommandID, command: Command) => {
          if (this.destroyed) {
            return;
          }

          if (!this.pendingCommands.has(id)) {
            return;
          }

          if (!this.ensureCanMutate()) {
            return;
          }

          this.connection.emit("command:update", {
            id,
            command,
          });
        },
        CommandManager.UPDATE_THROTTLE_MS,
        { leading: true, trailing: true },
      );

      this.throttles.set(commandId, throttled);
    }

    return throttled;
  }

  private flushUpdateThrottle(commandId: CommandID): void {
    const throttled = this.throttles.get(commandId);

    if (!throttled) {
      return;
    }

    throttled.flush();
    this.throttles.delete(commandId);
  }

  private requireCommand(commandId: CommandID): Command {
    const command = this.commands.get(commandId);

    if (!command) {
      throw new Error(`No command found with ID: ${commandId}`);
    }

    return command;
  }

  private createCommandInstance(commandId: CommandID): BaseCommand {
    const command = this.requireCommand(commandId);
    return this.factory.createInstance(command, this.stageOps);
  }
}

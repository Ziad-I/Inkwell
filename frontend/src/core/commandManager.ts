import { throttle } from "lodash-es";
import { CommandFactory } from "@/core/commandFactory";
import type { BaseCommand } from "@/commands/baseCommand";
import type {
  CommandID,
  Command,
  CommandPayload,
  CommandType,
} from "@/types/command";
import type { ClientEmitEvents } from "@/types/events";
import type {
  BoardPermissions,
  BoardRole,
} from "@/types/events";
import type { StageOperations } from "@/types/common";
import type { SessionStatus } from "@/types/session";
import type { ConnectionManager } from "./connectionManager";

type EventKey = keyof ClientEmitEvents;

type CommandAckResponse = {
  seq: number;
};

type JoinAckResponse = {
  role: BoardRole;
  permissions: BoardPermissions;
};

export class CommandManager {
  private static readonly MAX_UNDO_STACK_SIZE = 50;
  private static readonly UPDATE_THROTTLE_MS = 100;

  // ---------------------------------------------------------------------------
  // Session / dependencies
  // ---------------------------------------------------------------------------

  private readonly userId: string;
  private readonly roomId: string;
  private readonly stageOps: StageOperations;
  private readonly connectionManager: ConnectionManager;
  private readonly factory: CommandFactory;
  private readonly setSessionStatus: (status: SessionStatus) => void;

  private permissions: BoardPermissions = { read: false, draw: false };
  private joinRole: BoardRole | null = null;

  // ---------------------------------------------------------------------------
  // Command state
  // ---------------------------------------------------------------------------

  /** All commands known by the client, keyed by command ID. */
  private readonly commands = new Map<CommandID, Command>();

  /** Commands that have been successfully applied to the stage. */
  private readonly appliedCommands = new Set<CommandID>();

  /** Commands currently being created/updated. */
  private readonly pendingCommands = new Map<CommandID, BaseCommand>();

  /** Command IDs belonging to the local user's undo/redo history. */
  private undoStack: CommandID[] = [];
  private redoStack: CommandID[] = [];

  // ---------------------------------------------------------------------------
  // Local events
  // ---------------------------------------------------------------------------

  private readonly listeners = new Map<EventKey, Set<() => void>>();

  private readonly throttledEmitUpdate = throttle(
    (commandId: CommandID, command: Command) => {
      this.connectionManager.emit("command:update", {
        id: commandId,
        command,
      });
    },
    CommandManager.UPDATE_THROTTLE_MS,
    { leading: true, trailing: true },
  );

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  constructor(
    userId: string,
    roomId: string,
    stageOps: StageOperations,
    connectionManager: ConnectionManager,
    setSessionStatus: (status: SessionStatus) => void,
  ) {
    this.userId = userId;
    this.roomId = roomId;
    this.stageOps = stageOps;
    this.connectionManager = connectionManager;
    this.setSessionStatus = setSessionStatus;
    this.factory = new CommandFactory();

    this.registerServerListeners();
  }

  public destroy(): void {
    this.throttledEmitUpdate.cancel();

    this.commands.clear();
    this.appliedCommands.clear();

    for (const instance of this.pendingCommands.values()) {
      instance.destroy();
    }

    this.pendingCommands.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners.clear();
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
  // Permissions
  // ---------------------------------------------------------------------------

  public setPermissions(permissions: BoardPermissions): void {
    this.permissions = permissions;
    this.stageOps.toggleDrawing(permissions.draw);
  }

  private ensureCanDraw(): boolean {
    if (this.permissions.draw) {
      return true;
    }

    console.warn("User does not have permission to draw in this room");
    return false;
  }

  // ---------------------------------------------------------------------------
  // Local command lifecycle
  // ---------------------------------------------------------------------------

  public startCommand(
    type: CommandType,
    initialPayload: CommandPayload,
  ): CommandID | null {
    if (!this.ensureCanDraw()) {
      return null;
    }

    const command = this.factory.createCommand(
      type,
      initialPayload,
      this.userId,
    );

    const instance = this.factory.createInstance(command, this.stageOps);

    if (!instance) {
      throw new Error(`Failed to create command instance for type: ${type}`);
    }

    this.commands.set(command.id, command);
    this.pendingCommands.set(command.id, instance);

    instance.apply();

    this.connectionManager.emit("command:create", {
      id: command.id,
      command: instance.serialize(),
    });

    return command.id;
  }

  public updateCommand(
    commandId: CommandID,
    updatedPayload: Partial<CommandPayload>,
  ): void {
    const command = this.requireCommand(commandId);
    const instance = this.requirePendingCommand(commandId);

    instance.update(updatedPayload);

    const serialized = instance.serialize();
    this.commands.set(command.id, serialized);

    this.throttledEmitUpdate(commandId, serialized);
  }

  public finalizeCommand(commandId: CommandID): void {
    this.throttledEmitUpdate.flush();

    const command = this.requireCommand(commandId);
    const instance = this.requirePendingCommand(commandId);

    if (!instance.canFinalize()) {
      throw new Error(`Command with ID ${commandId} cannot be finalized yet`);
    }

    const serialized = instance.serialize();
    const appliedCommand: Command = {
      ...serialized,
      status: "applied",
    };

    this.commands.set(commandId, appliedCommand);
    this.appliedCommands.add(commandId);
    this.pendingCommands.delete(commandId);

    if (command.owner === this.userId) {
      this.pushUndo(commandId);
      this.redoStack = [];
    }

    this.connectionManager.emit(
      "command:finalize",
      {
        id: commandId,
        command: serialized,
      },
      (error?: unknown, response?: CommandAckResponse) => {
        if (error) {
          console.error(`Server rejected command with ID: ${commandId}`, error);
          return;
        }

        this.updateCommandSequence(commandId, response?.seq);
      },
    );
  }

  public cancelCommand(commandId: CommandID): void {
    const instance = this.requirePendingCommand(commandId);

    instance.undo();
    instance.destroy();

    this.commands.delete(commandId);
    this.pendingCommands.delete(commandId);

    this.connectionManager.emit("command:cancel", {
      id: commandId,
    });
  }

  // ---------------------------------------------------------------------------
  // Undo / redo
  // ---------------------------------------------------------------------------

  public undo(): void {
    if (!this.ensureCanDraw()) {
      return;
    }

    const commandId = this.undoStack.pop();

    if (!commandId) {
      console.warn("Undo stack is empty");
      return;
    }

    const command = this.requireCommand(commandId);
    const instance = this.createCommandInstance(commandId);

    instance.undo();

    this.redoStack.push(commandId);
    this.commands.set(commandId, {
      ...command,
      status: "reverted",
    });
    this.appliedCommands.delete(commandId);

    this.emit("command:undo");

    this.connectionManager.emit(
      "command:undo",
      { id: commandId },
      (error?: unknown, response?: CommandAckResponse) => {
        if (error) {
          console.error(
            `Server rejected undo command with ID: ${commandId}`,
            error,
          );
          return;
        }

        this.updateCommandSequence(commandId, response?.seq);
      },
    );
  }

  public redo(): void {
    if (!this.ensureCanDraw()) {
      return;
    }

    const commandId = this.redoStack.pop();

    if (!commandId) {
      console.warn("Redo stack is empty");
      return;
    }

    const command = this.requireCommand(commandId);
    const instance = this.createCommandInstance(commandId);

    instance.redo();

    this.pushUndo(commandId);
    this.commands.set(commandId, {
      ...command,
      status: "applied",
    });
    this.appliedCommands.add(commandId);

    this.emit("command:redo");

    this.connectionManager.emit(
      "command:redo",
      { id: commandId },
      (error?: unknown, response?: CommandAckResponse) => {
        if (error) {
          console.error(
            `Server rejected redo command with ID: ${commandId}`,
            error,
          );
          return;
        }

        this.updateCommandSequence(commandId, response?.seq);
      },
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
    let maxSequence = 0;

    for (const command of this.commands.values()) {
      if (command.seq !== undefined && command.seq > maxSequence) {
        maxSequence = command.seq;
      }
    }

    return maxSequence;
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

  private updateCommandSequence(
    commandId: CommandID,
    sequence: number | undefined,
  ): void {
    if (sequence === undefined) {
      return;
    }

    const command = this.commands.get(commandId);

    if (command) {
      this.commands.set(commandId, {
        ...command,
        seq: sequence,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Server listeners
  // ---------------------------------------------------------------------------

  /**
   * Register all incoming server event handlers on the ConnectionManager.
   * Cleanup is handled by destroy()/ConnectionManager cleanup.
   */
  public registerServerListeners(): void {
    this.connectionManager.onConnect(this.onConnect);

    this.connectionManager.on("room:sync", this.onRoomSync);
    this.connectionManager.on("command:create", this.onRemoteCreate);
    this.connectionManager.on("command:update", this.onRemoteUpdate);
    this.connectionManager.on("command:finalize", this.onRemoteFinalize);
    this.connectionManager.on("command:cancel", this.onRemoteCancel);
    this.connectionManager.on("command:undo", this.onRemoteUndo);
    this.connectionManager.on("command:redo", this.onRemoteRedo);
    this.connectionManager.on("command:reject", this.onCommandReject);
  }

  private onConnect = (): void => {
    this.setSessionStatus({ status: "joining" });

    this.connectionManager.emit(
      "room:join",
      {
        roomId: this.roomId,
        lastSeq: this.getLastSeq(),
      },
      (error?: unknown, response?: JoinAckResponse) => {
        if (error) {
          console.error("[room:join] failed:", error);
          this.setSessionStatus({
            status: "error",
            error: String(error),
          });
          return;
        }

        const permissions =
          response?.permissions ?? { read: false, draw: false };

        this.setPermissions(permissions);
        this.joinRole = response?.role ?? null;
      },
    );
  };

  /**
   * Initial board state from the server when joining a room.
   * Replays every finalized command that the client doesn't already have.
   */
  private onRoomSync = (state: Command[]): void => {
    this.setSessionStatus({ status: "syncing" });

    //TODO: find a better way to handle this instead of sorting.
    //! this is a temporary solution to ensure that
    //! the commands are applied in the correct order.
    // Commands must be applied in sequence order.
    const sortedCommands = [...state].sort(
      (a, b) => (a.seq ?? 0) - (b.seq ?? 0),
    );

    for (const command of sortedCommands) {
      if (this.commands.has(command.id)) {
        continue;
      }

      if (command.status !== "applied") {
        // Reverted commands are stored for history, but are not applied.
        this.commands.set(command.id, command);
        continue;
      }
      const instance = this.factory.createInstance(command, this.stageOps);
      instance.apply();
      instance.finalize();

      this.commands.set(command.id, {
        ...command,
        status: "applied",
      });
      this.appliedCommands.add(command.id);
    }

    this.setSessionStatus({
      status: "ready",
      role: this.joinRole ?? undefined,
      permissions: this.permissions,
    });
  };

  /** Another user started a new command — show it as a live preview. */
  private onRemoteCreate = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId || this.commands.has(commandId)) {
      return;
    }

    const instance = this.factory.createInstance(command, this.stageOps);

    instance.apply();

    this.commands.set(commandId, command);
    this.pendingCommands.set(commandId, instance);
  };

  /** Another user updated their in-flight command — update the live preview. */
  private onRemoteUpdate = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) {
      return;
    }

    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      return;
    }

    instance.update(command.payload);
    this.commands.set(commandId, command);
  };

  /**
   * Another user finalized their command.
   * If we missed the create (late join/reconnect), create and apply first.
   */
  private onRemoteFinalize = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) {
      return;
    }

    let instance = this.pendingCommands.get(commandId);

    if (!instance) {
      instance = this.factory.createInstance(command, this.stageOps);
      instance.apply();
    }

    instance.finalize();

    this.commands.set(commandId, {
      ...command,
      status: "applied",
    });
    this.appliedCommands.add(commandId);
    this.pendingCommands.delete(commandId);
  };

  /** Another user cancelled their in-flight command — remove the preview. */
  private onRemoteCancel = (commandId: CommandID): void => {
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
  };

  /** Another user undid one of their commands — reverse its visual effect. */
  private onRemoteUndo = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) {
      return;
    }

    const storedCommand = this.commands.get(commandId);

    if (!storedCommand) {
      return;
    }

    const instance = this.factory.createInstance(storedCommand, this.stageOps);

    instance.undo();

    this.appliedCommands.delete(commandId);
    this.commands.set(commandId, {
      ...storedCommand,
      status: "reverted",
    });
  };

  /** Another user redid one of their commands — reapply its visual effect. */
  private onRemoteRedo = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) {
      return;
    }

    const storedCommand = this.commands.get(commandId);

    if (!storedCommand) {
      return;
    }

    const instance = this.factory.createInstance(storedCommand, this.stageOps);

    instance.redo();

    this.appliedCommands.add(commandId);
    this.commands.set(commandId, {
      ...storedCommand,
      status: "applied",
    });
  };

  /**
   * Server rejected one of our commands — roll it back.
   * Handles both pending (not yet finalized) and optimistically-applied commands.
   */
  private onCommandReject = (commandId: CommandID, reason: string): void => {
    console.warn(
      `Command with ID ${commandId} was rejected by server: ${reason}`,
    );

    const pendingInstance = this.pendingCommands.get(commandId);

    if (pendingInstance) {
      pendingInstance.undo();
      pendingInstance.destroy();
      this.pendingCommands.delete(commandId);
    } else {
      const storedCommand = this.commands.get(commandId);

      if (!storedCommand) {
        return;
      }

      const rollbackInstance = this.factory.createInstance(
        storedCommand,
        this.stageOps,
      );

      rollbackInstance.undo();
      this.appliedCommands.delete(commandId);

      this.removeFromHistory(this.undoStack, commandId);
      this.removeFromHistory(this.redoStack, commandId);
    }

    this.commands.delete(commandId);
  };

  // ---------------------------------------------------------------------------
  // Internal command helpers
  // ---------------------------------------------------------------------------

  private requireCommand(commandId: CommandID): Command {
    const command = this.commands.get(commandId);

    if (!command) {
      throw new Error(`No command found with ID: ${commandId}`);
    }

    return command;
  }

  private requirePendingCommand(commandId: CommandID): BaseCommand {
    const instance = this.pendingCommands.get(commandId);

    if (!instance) {
      throw new Error(`No pending command found with ID: ${commandId}`);
    }

    return instance;
  }

  private createCommandInstance(commandId: CommandID): BaseCommand {
    const command = this.requireCommand(commandId);
    const instance = this.factory.createInstance(command, this.stageOps);

    if (!instance) {
      throw new Error(`Failed to create command instance for ID: ${commandId}`);
    }

    return instance;
  }

  private removeFromHistory(history: CommandID[], commandId: CommandID): void {
    const index = history.indexOf(commandId);

    if (index !== -1) {
      history.splice(index, 1);
    }
  }
}

import { CommandFactory } from "@/core/commandFactory";
import type { StageOperations } from "@/types/common";
import {
  type CommandID,
  type Command,
  type CommandType,
  type CommandPayload,
} from "@/types/command";
import type { BaseCommand } from "@/commands/baseCommand";
import type { ConnectionManager } from "./connectionManager";
import type { ClientEmitEvents } from "@/types/events";

type EventKey = keyof ClientEmitEvents;

export class CommandManager {
  private userId: string;
  private stageOps: StageOperations;
  // private networkOps: NetworkOperations;
  private connectionManager: ConnectionManager;
  private factory: CommandFactory;

  // All commands by their ID
  private commands = new Map<CommandID, Command>();
  // Commands that have been successfully applied
  private appliedCommands: Set<CommandID> = new Set();
  // Commands that are in the process of being applied
  private pendingCommands: Map<CommandID, BaseCommand> = new Map();

  private undoStack: CommandID[] = [];
  private redoStack: CommandID[] = [];

  private readonly MAX_UNDO_STACK_SIZE = 50;

  private listeners = new Map<keyof ClientEmitEvents, Set<() => void>>();

  public on(events: EventKey | EventKey[], handler: () => void): void {
    const eventList = Array.isArray(events) ? events : [events];
    for (const evt of eventList) {
      let set = this.listeners.get(evt);
      if (!set) {
        set = new Set();
        this.listeners.set(evt, set);
      }
      set.add(handler);
    }
  }

  public off(events: EventKey | EventKey[], handler: () => void): void {
    const eventList = Array.isArray(events) ? events : [events];
    for (const evt of eventList) {
      const set = this.listeners.get(evt);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.listeners.delete(evt);
        }
      }
    }
  }

  public emit(events: EventKey | EventKey[]): void {
    const eventList = Array.isArray(events) ? events : [events];
    for (const evt of eventList) {
      const set = this.listeners.get(evt);
      if (!set) continue; // continue instead of returning early
      // copy handlers to avoid mutation issues if a handler calls off()
      const handlers = Array.from(set);
      for (const handler of handlers) {
        try {
          handler();
        } catch (err) {
          // swallow or log errors according to your policy
          console.error("listener error for", evt, err);
        }
      }
    }
  }

  constructor(
    userId: string,
    stageOps: StageOperations,
    connectionManager: ConnectionManager,
  ) {
    this.userId = userId;
    this.stageOps = stageOps;
    this.connectionManager = connectionManager;
    this.factory = new CommandFactory();
  }

  public startCommand(type: CommandType, initialPayload: CommandPayload) {
    const cmd = this.factory.createCommand(type, initialPayload, this.userId);
    const cmdInstance = this.factory.createInstance(cmd, this.stageOps);

    if (!cmdInstance) {
      throw new Error(`Failed to create command instance for type: ${type}`);
    }

    this.commands.set(cmd.id, cmd);
    this.pendingCommands.set(cmd.id, cmdInstance);

    cmdInstance.apply();

    // use networkOps to send command to server here...
    // this.networkOps.sendCommand(cmd.id, cmdInstance.serialize());
    this.connectionManager.emit("command:create", {
      id: cmd.id,
      command: cmdInstance.serialize(),
    });

    return cmd.id;
  }

  public updateCommand(
    commandId: CommandID,
    updatedPayload: Partial<CommandPayload>,
  ) {
    const cmd = this.commands.get(commandId);
    const cmdInstance = this.pendingCommands.get(commandId);

    if (!cmd || !cmdInstance) {
      throw new Error(`No pending command found with ID: ${commandId}`);
    }

    cmdInstance.update(updatedPayload);
    this.commands.set(commandId, cmdInstance.serialize());

    // console.log("Updated command:", cmdInstance.serialize());
    // use networkOps to send command update to server here...
    // this.networkOps.updateCommand(commandId, cmdInstance.serialize());
    this.connectionManager.emit("command:update", {
      id: commandId,
      command: cmdInstance.serialize(),
    });
  }

  public finalizeCommand(commandId: CommandID) {
    const cmd = this.commands.get(commandId);
    const cmdInstance = this.pendingCommands.get(commandId);

    if (!cmd || !cmdInstance) {
      throw new Error(`No pending command found with ID: ${commandId}`);
    }

    if (!cmdInstance.canFinalize()) {
      throw new Error(`Command with ID: ${commandId} cannot be finalized yet`);
    }

    const serialized = cmdInstance.serialize();
    const appliedCmd: Command = { ...serialized, status: "applied" };
    this.commands.set(commandId, appliedCmd);

    this.appliedCommands.add(commandId);
    this.pendingCommands.delete(commandId);

    if (cmd.owner === this.userId) {
      this.undoStack.push(commandId);
      this.redoStack = []; // Clear redo stack on new operation
      if (this.undoStack.length > this.MAX_UNDO_STACK_SIZE) {
        this.undoStack.shift();
      }
    }

    // use networkOps to send command finalization to server here...
    // this.networkOps.finalizeCommand(commandId, cmdInstance.serialize());
    this.connectionManager.emit("command:finalize", {
      id: commandId,
      command: cmdInstance.serialize(),
    });
  }

  public cancelCommand(commandId: CommandID) {
    const cmd = this.commands.get(commandId);
    const cmdInstance = this.pendingCommands.get(commandId);

    if (!cmd || !cmdInstance) {
      throw new Error(`No pending command found with ID: ${commandId}`);
    }

    cmdInstance.undo();
    cmdInstance.destroy();

    this.commands.delete(commandId);
    this.pendingCommands.delete(commandId);

    // use networkOps to send command cancellation to server here...
    // this.networkOps.cancelCommand(commandId);
    this.connectionManager.emit("command:cancel", { id: commandId });
  }

  public undo() {
    if (this.undoStack.length === 0) {
      console.warn("Undo stack is empty");
      return;
    }
    const commandId = this.undoStack.pop() as CommandID;
    const cmd = this.commands.get(commandId);

    if (!cmd) {
      throw new Error(`No command found with ID: ${commandId}`);
    }

    const cmdInstance = this.factory.createInstance(cmd, this.stageOps);
    if (!cmdInstance) {
      throw new Error(`Failed to create command instance for ID: ${commandId}`);
    }

    cmdInstance.undo();
    this.redoStack.push(commandId);
    const undoneCmd = this.commands.get(commandId);
    if (undoneCmd)
      this.commands.set(commandId, { ...undoneCmd, status: "reverted" });

    const ack = (success: boolean) => {
      if (!success) {
        console.error(`Server rejected undo command with ID: ${commandId}`);
      }
      //TODO: We could add logic here to revert the undo if the server rejects it, but that can be complex
    };

    this.emit("command:undo");
    this.connectionManager.emit("command:undo", { id: commandId }, ack);
  }

  public redo() {
    if (this.redoStack.length === 0) {
      console.warn("Redo stack is empty");
      return;
    }

    const commandId = this.redoStack.pop() as CommandID;
    const cmd = this.commands.get(commandId);

    // console.log("Redoing command:", commandId, cmd);
    if (!cmd) {
      throw new Error(`No command found with ID: ${commandId}`);
    }

    const cmdInstance = this.factory.createInstance(cmd, this.stageOps);
    if (!cmdInstance) {
      throw new Error(`Failed to create command instance for ID: ${commandId}`);
    }
    cmdInstance.redo();
    this.undoStack.push(commandId);
    const redoneCmd = this.commands.get(commandId);
    if (redoneCmd)
      this.commands.set(commandId, { ...redoneCmd, status: "applied" });

    const ack = (success: boolean) => {
      if (!success) {
        console.error(`Server rejected redo command with ID: ${commandId}`);
      }
      // TODO: We could add logic here to revert the redo if the server rejects it, but that can be complex
    };

    this.emit("command:redo");
    this.connectionManager.emit("command:redo", { id: commandId }, ack);
  }

  public getUndoStack(): CommandID[] {
    return [...this.undoStack];
  }
  public getRedoStack(): CommandID[] {
    return [...this.redoStack];
  }
  public getOperation(id: CommandID): Command | undefined {
    return this.commands.get(id);
  }

  // ─── Server → client listeners ──────────────────────────────────────────────

  /**
   * Register all incoming server event handlers on the ConnectionManager.
   * Call once after both managers are initialised. Cleanup is handled by
   * ConnectionManager.cleanup() (removeAllListeners) on unmount.
   */
  public registerServerListeners(): void {
    this.connectionManager.on("room:sync", this.onRoomSync);
    this.connectionManager.on("command:create", this.onRemoteCreate);
    this.connectionManager.on("command:update", this.onRemoteUpdate);
    this.connectionManager.on("command:finalize", this.onRemoteFinalize);
    this.connectionManager.on("command:cancel", this.onRemoteCancel);
    this.connectionManager.on("command:undo", this.onRemoteUndo);
    this.connectionManager.on("command:redo", this.onRemoteRedo);
    this.connectionManager.on("command:reject", this.onCommandReject);
  }

  /**
   * Initial board state from the server when joining a room.
   * Replays every finalized command that the client doesn't already have.
   */
  private onRoomSync = (state: Command[]): void => {
    for (const command of state) {
      if (this.commands.has(command.id)) continue;
      const instance = this.factory.createInstance(command, this.stageOps);
      instance.apply();
      instance.finalize();
      this.commands.set(command.id, { ...command, status: "applied" });
      this.appliedCommands.add(command.id);
    }
  };

  /** Another user started a new command — show it as a live preview. */
  private onRemoteCreate = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) return;
    if (this.commands.has(commandId)) return;
    const instance = this.factory.createInstance(command, this.stageOps);
    instance.apply();
    this.commands.set(commandId, command);
    this.pendingCommands.set(commandId, instance);
  };

  /** Another user updated their in-flight command — update the live preview. */
  private onRemoteUpdate = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) return;
    const instance = this.pendingCommands.get(commandId);
    if (!instance) return;
    instance.update(command.payload);
    this.commands.set(commandId, command);
  };

  /**
   * Another user finalised their command.
   * If we missed the create (late join / reconnect), create and apply first.
   */
  private onRemoteFinalize = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) return;
    let instance = this.pendingCommands.get(commandId);
    if (!instance) {
      instance = this.factory.createInstance(command, this.stageOps);
      instance.apply();
    }
    instance.finalize();
    this.commands.set(commandId, { ...command, status: "applied" });
    this.appliedCommands.add(commandId);
    this.pendingCommands.delete(commandId);
  };

  /** Another user cancelled their in-flight command — remove the preview. */
  private onRemoteCancel = (commandId: CommandID): void => {
    const stored = this.commands.get(commandId);
    if (stored?.owner === this.userId) return;
    const instance = this.pendingCommands.get(commandId);
    if (!instance) return;
    instance.undo();
    instance.destroy();
    this.commands.delete(commandId);
    this.pendingCommands.delete(commandId);
  };

  /** Another user undid one of their commands — reverse its visual effect. */
  private onRemoteUndo = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) return;
    const stored = this.commands.get(commandId);
    if (!stored) return;
    const instance = this.factory.createInstance(stored, this.stageOps);
    instance.undo();
    this.appliedCommands.delete(commandId);
    this.commands.set(commandId, { ...stored, status: "reverted" });
  };

  /** Another user redid one of their commands — reapply its visual effect. */
  private onRemoteRedo = (commandId: CommandID, command: Command): void => {
    if (command.owner === this.userId) return;
    const stored = this.commands.get(commandId);
    if (!stored) return;
    const instance = this.factory.createInstance(stored, this.stageOps);
    instance.redo();
    this.appliedCommands.add(commandId);
    this.commands.set(commandId, { ...stored, status: "applied" });
  };

  /**
   * Server rejected one of our own commands — roll it back.
   * Handles both pending (not yet finalised) and optimistically-applied commands.
   */
  private onCommandReject = (commandId: CommandID, _reason: string): void => {
    console.warn(
      `Command with ID ${commandId} was rejected by server: ${_reason}`,
    );

    const pendingInstance = this.pendingCommands.get(commandId);
    if (pendingInstance) {
      pendingInstance.undo();
      pendingInstance.destroy();
      this.pendingCommands.delete(commandId);
    } else {
      const stored = this.commands.get(commandId);
      if (!stored) return;
      const rollbackInstance = this.factory.createInstance(
        stored,
        this.stageOps,
      );
      rollbackInstance.undo();
      this.appliedCommands.delete(commandId);
      const idx = this.undoStack.indexOf(commandId);
      if (idx !== -1) this.undoStack.splice(idx, 1);
    }
    this.commands.delete(commandId);
  };

  destroy() {
    this.commands.clear();
    this.appliedCommands.clear();
    this.pendingCommands.forEach((instance) => instance.destroy());
    this.pendingCommands.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners.clear();
  }
}

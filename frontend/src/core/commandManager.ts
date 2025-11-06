import { CommandFactory } from "@/core/commandFactory";
import type { CommandEvents, StageOperations } from "@/types/common";
import {
  type CommandID,
  type Command,
  type CommandType,
  type CommandPayload,
} from "@/types/command";
import type { BaseCommand } from "@/commands/baseCommand";

export class CommandManager {
  private userId: string;
  private stageOps: StageOperations;
  // private networkOps: NetworkOperations;
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

  private listeners = new Map<CommandEvents, Set<() => void>>();

  public on(
    events: CommandEvents | CommandEvents[],
    handler: () => void
  ): void {
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

  public off(
    events: CommandEvents | CommandEvents[],
    handler: () => void
  ): void {
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

  public emit(events: CommandEvents | CommandEvents[]): void {
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
    stageOps: StageOperations
    // networkOps: NetworkOperations,
    // factory: CommandFactory
  ) {
    this.userId = userId;
    this.stageOps = stageOps;
    // this.networkOps = networkOps;
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

    return cmd.id;
  }

  public updateCommand(
    commandId: CommandID,
    updatedPayload: Partial<CommandPayload>
  ) {
    const cmd = this.commands.get(commandId);
    const cmdInstance = this.pendingCommands.get(commandId);

    if (!cmd || !cmdInstance) {
      throw new Error(`No pending command found with ID: ${commandId}`);
    }

    cmdInstance.update(updatedPayload);
    this.commands.set(commandId, cmdInstance.serialize());

    console.log("Updated command:", cmdInstance.serialize());
    // use networkOps to send command update to server here...
    // this.networkOps.updateCommand(commandId, cmdInstance.serialize());
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

    this.emit("undo");
  }

  public redo() {
    if (this.redoStack.length === 0) {
      console.warn("Redo stack is empty");
      return;
    }

    const commandId = this.redoStack.pop() as CommandID;
    const cmd = this.commands.get(commandId);

    console.log("Redoing command:", commandId, cmd);
    if (!cmd) {
      throw new Error(`No command found with ID: ${commandId}`);
    }

    const cmdInstance = this.factory.createInstance(cmd, this.stageOps);
    if (!cmdInstance) {
      throw new Error(`Failed to create command instance for ID: ${commandId}`);
    }

    cmdInstance.redo();
    this.undoStack.push(commandId);

    this.emit("redo");
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
}

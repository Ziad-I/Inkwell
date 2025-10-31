import { CommandFactory } from "@/core/commandFactory";
import type { StageOperations } from "@/types/common";
import {
  type CommandID,
  type Command,
  type CommandType,
  type OperationPayload,
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

  private MAX_UNDO_STACK_SIZE = 50;

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

  public startCommand(type: CommandType, initialPayload: OperationPayload) {
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
    updatedPayload: Partial<OperationPayload>
  ) {
    const cmd = this.pendingCommands.get(commandId);
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

    cmdInstance.finalize();
    this.commands.set(commandId, cmdInstance.serialize());

    this.appliedCommands.add(commandId);
    this.pendingCommands.delete(commandId);

    this.undoStack.push(cmd.id);
    this.redoStack = []; // Clear redo stack on new operation
    if (this.undoStack.length > this.MAX_UNDO_STACK_SIZE) {
      this.undoStack.shift();
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
    throw new Error("Undo not implemented yet");
  }

  public redo() {
    throw new Error("Redo not implemented yet");
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

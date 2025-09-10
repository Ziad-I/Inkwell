import type { Command } from "@/types/command";

export class CommandManager {
  private history: Command[] = [];
  private currentIndex = -1;
  private maxHistorySize: number = 50;
  private pendingCommand: Command | null = null;

  // Start a new pending command
  startCommand(command: Command): void {
    // If there's already a pending command, commit it first
    if (this.pendingCommand) {
      this.commitPendingCommand();
    }

    this.pendingCommand = command;
    // Execute immediately to show visual feedback
    command.execute();
  }

  // Update the current pending command
  updatePendingCommand(): void {
    if (this.pendingCommand && this.pendingCommand.update) {
      this.pendingCommand.update();
    }
  }

  // Commit the pending command to history
  commitPendingCommand(): boolean {
    if (!this.pendingCommand) return false;

    if (!this.pendingCommand.canCommit || !this.pendingCommand.canCommit()) {
      // Cancel the command
      this.cancelPendingCommand();
      return false;
    }

    // Remove any commands after current index
    this.history.splice(this.currentIndex + 1);

    // Mark as committed and add to history
    if (this.pendingCommand.commit) {
      this.pendingCommand.commit();
    }

    this.history.push(this.pendingCommand);
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      const removed = this.history.shift();
      if (removed) removed.destroy?.();
      this.currentIndex--;
    }

    this.pendingCommand = null;
    // this.notifyChange();
    return true;
  }

  // Cancel the pending command
  cancelPendingCommand(): void {
    if (this.pendingCommand) {
      this.pendingCommand.undo();
      this.pendingCommand = null;
      // this.notifyChange();
    }
  }

  execute(command: Command): void {
    this.startCommand(command);
    this.commitPendingCommand();
  }

  undo(): boolean {
    // First, cancel any pending command
    if (this.pendingCommand) {
      this.cancelPendingCommand();
      return true;
    }

    if (!this.canUndo()) return false;

    const command = this.history[this.currentIndex];
    command.undo();
    this.currentIndex--;

    // this.notifyChange();
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;

    this.currentIndex++;
    const command = this.history[this.currentIndex];

    if (command.redo) {
      command.redo();
    } else {
      command.execute();
    }

    // this.notifyChange();
    return true;
  }

  canUndo(): boolean {
    return this.pendingCommand !== null || this.currentIndex >= 0;
  }

  canRedo(): boolean {
    return (
      this.pendingCommand === null &&
      this.currentIndex < this.history.length - 1
    );
  }

  hasPendingCommand(): boolean {
    return this.pendingCommand !== null;
  }

  clear(): void {
    this.cancelPendingCommand();
    this.history = [];
    this.currentIndex = -1;
    // this.notifyChange();
  }

  //   private notifyChange(): void {
  //     // Emit events or update stores as needed
  //     useHistoryStore.getState().setCanUndo(this.canUndo());
  //     useHistoryStore.getState().setCanRedo(this.canRedo());
  //   }
}

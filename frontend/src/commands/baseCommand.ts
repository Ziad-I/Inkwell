import type { Command } from "@/types/command";

export abstract class BaseCommand implements Command {
  protected isPending = true;

  abstract execute(): void;
  abstract undo(): void;

  redo(): void {
    this.execute();
  }

  update(): void {
    // Default implementation - just execute to update visuals
    if (this.isPending) {
      this.execute();
    }
  }

  canCommit(): boolean {
    return true;
  }

  commit(): void {
    this.isPending = false;
  }

  get isCommitted(): boolean {
    return !this.isPending;
  }
}

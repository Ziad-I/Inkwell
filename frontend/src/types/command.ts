export interface Command {
  execute(): void;
  undo(): void;
  redo?(): void;
  description?: string;

  commit?(): void;
  update?(): void; // Called during operation to update visual state
  canCommit?(): boolean; // Whether the command is in a valid state to commit
}

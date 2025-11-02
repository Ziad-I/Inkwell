import type { Command, CommandPayload } from "@/types/command";
import type { StageOperations } from "@/types/common";

export abstract class BaseCommand {
  protected stageOps: StageOperations;
  protected finalized: boolean = false;

  constructor(stageOps: StageOperations) {
    this.stageOps = stageOps;
  }

  abstract apply(): void;
  abstract undo(): void;
  abstract redo(): void;
  abstract destroy(): void;
  abstract update(opdate: Partial<CommandPayload>): void;
  abstract finalize(): void;
  abstract canFinalize(): boolean;

  abstract serialize(): Command;

  get isFinalized(): boolean {
    return this.finalized;
  }
}

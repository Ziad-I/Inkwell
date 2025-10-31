import type {
  TransformCommand as TransformCommandData,
  TransformPayload,
} from "@/types/command";
import type { StageOperations } from "@/types/common";
import { BaseCommand } from "@/commands/baseCommand";

export class TransformCommand extends BaseCommand {
  private cmd: TransformCommandData;
  constructor(cmd: TransformCommandData, stageOps: StageOperations) {
    super(stageOps);
    this.cmd = cmd;
  }

  private get payload(): TransformPayload {
    return this.cmd.payload;
  }

  transformNodes(mode: "before" | "after"): void {
    for (const transform of this.payload.transforms) {
      const node = this.stageOps.getNodeById(transform.nodeId);
      if (!node) continue;
      const state = mode === "before" ? transform.before : transform.after;
      node.setAttrs(state);
    }
  }

  apply(): void {
    this.transformNodes("after");
  }

  update(update: Partial<TransformPayload>): void {
    this.cmd.payload = { ...this.cmd.payload, ...update };
    this.transformNodes("after");
  }

  redo(): void {
    this.apply();
  }

  undo(): void {
    this.transformNodes("before");
  }

  destroy(): void {
    // No-op
  }

  canFinalize(): boolean {
    return this.payload.transforms.length > 0;
  }

  finalize(): void {
    this.finalized = true;
  }

  serialize(): TransformCommandData {
    return this.cmd;
  }
}

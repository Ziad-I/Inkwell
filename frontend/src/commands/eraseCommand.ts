import type { StageOperations } from "@/types/common";
import type {
  EraseCommand as EraseCommandData,
  ErasePayload,
} from "@/types/command";
import { BaseCommand } from "@/commands/baseCommand";

export class EraseCommand extends BaseCommand {
  private cmd: EraseCommandData;

  constructor(cmd: EraseCommandData, stageOps: StageOperations) {
    super(stageOps);
    this.cmd = {
      ...cmd,
      payload: this.clonePayload(cmd.payload),
    };
  }

  private get payload(): ErasePayload {
    return this.cmd.payload;
  }

  private clonePayload(payload: Partial<ErasePayload>): ErasePayload {
    return {
      erasedNodes: [...new Set(payload.erasedNodes ?? [])],
    };
  }

  eraseNodes(): void {
    for (const nodeId of this.payload.erasedNodes) {
      this.stageOps.removeNodeById(nodeId, false);
    }
  }

  apply(): void {
    this.eraseNodes();
  }

  update(opdate: Partial<ErasePayload>): void {
    this.cmd.payload = this.clonePayload({ ...this.cmd.payload, ...opdate });
    this.eraseNodes();
  }

  redo(): void {
    this.apply();
  }

  undo(): void {
    for (const nodeId of this.payload.erasedNodes) {
      const node = this.stageOps.getNodeById(nodeId);
      if (node) {
        this.stageOps.addDrawingNode(node);
      }
    }
  }

  destroy(): void {
    for (const nodeId of this.payload.erasedNodes) {
      const node = this.stageOps.getNodeById(nodeId);
      if (node && !node.getParent()) {
        this.stageOps.removeNodeById(nodeId, true);
      }
    }
  }

  canFinalize(): boolean {
    return this.payload.erasedNodes.length > 0;
  }

  finalize(): void {
    this.finalized = true;
  }

  serialize(): EraseCommandData {
    return {
      ...this.cmd,
      payload: this.clonePayload(this.cmd.payload),
    };
  }
}

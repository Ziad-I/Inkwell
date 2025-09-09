import { BaseCommand } from "@/commands/baseCommand";
import type { StageOperations } from "@/types/common";
import type Konva from "konva";

export class EraseCommand extends BaseCommand {
  private stageOps: StageOperations;
  private erasedNodes: Map<Konva.Node, number> = new Map();

  constructor(stageOps: StageOperations) {
    super();
    this.stageOps = stageOps;
  }

  execute(): void {
    this.erasedNodes.forEach((_, node) => {
      this.stageOps.removeNode(node, false);
    });
    this.stageOps.redrawDrawingLayer();
  }

  undo(): void {
    this.erasedNodes.forEach((_, node) => {
      this.stageOps.addDrawingNode(node);
    });
    this.stageOps.redrawDrawingLayer();
  }

  destroy(): void {
    this.erasedNodes.forEach((_, node) => {
      if (!node.getParent()) {
        this.stageOps.removeNode(node, true);
      }
    });
    this.erasedNodes.clear();
  }

  canCommit(): boolean {
    return this.erasedNodes.size > 0;
  }

  addErasedNode(node: Konva.Node): void {
    if (this.isPending && !this.erasedNodes.has(node)) {
      this.erasedNodes.set(node, this.erasedNodes.size);
    }
    this.stageOps.removeNode(node, false);
    this.stageOps.redrawDrawingLayer();
  }
}

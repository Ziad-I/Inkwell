import type { StageOperations } from "@/types/common";
import { BaseCommand } from "@/commands//baseCommand";
import Konva from "konva";

export class StrokeCommand extends BaseCommand {
  private node: Konva.Line | null = null;
  private stageOps: StageOperations;
  private initialPoints: number[] = [];

  constructor(node: Konva.Line, stageOps: StageOperations) {
    super();
    this.node = node;
    this.stageOps = stageOps;

    if (this.node.points().length > 0) {
      this.initialPoints = [...this.node.points()];
    }
  }

  execute(): void {
    if (this.node && !this.node.getParent()) {
      this.stageOps.addDrawingNode(this.node);
    }
    this.stageOps.redrawDrawingLayer();
  }

  destroy(): void {
    if (this.node && !this.node.getParent()) {
      this.stageOps.removeNode(this.node, true);
      this.node = null;
    }
  }

  undo(): void {
    if (!this.node) return;
    this.stageOps.removeNode(this.node, false);
    this.stageOps.redrawDrawingLayer();
  }

  update(): void {
    this.stageOps.redrawDrawingLayer();
  }

  canCommit(): boolean {
    if (!this.node) return false;
    return this.node.points().length > 4; // At least two points (x1,y1,x2,y2)
  }

  updatePoints(newPoints: number[]): void {
    if (!this.node) return;
    this.node.points(newPoints);
    this.stageOps.redrawDrawingLayer();
  }

  //   get json(): object {
  //     if (!this.node) return {};
  //     return {
  //       type: "stroke",
  //       points: this.node.points(),
  //       stroke: this.node.stroke(),
  //       width: this.node.strokeWidth(),
  //       lineCap: this.node.lineCap(),
  //       lineJoin: this.node.lineJoin(),
  //     };
  //   }
}

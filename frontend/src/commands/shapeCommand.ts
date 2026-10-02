import type {
  ShapeCommand as ShapeCommandData,
  ShapePayload,
} from "@/types/command";
import { BaseCommand } from "@/commands/baseCommand";
import type { Point, StageOperations } from "@/types/common";
import Konva from "konva";

type ShapeNode = Konva.Rect | Konva.Circle | Konva.Line | Konva.Arrow;

export class ShapeCommand extends BaseCommand {
  private cmd: ShapeCommandData;
  private cachedNode: ShapeNode | null = null;

  constructor(cmd: ShapeCommandData, stageOps: StageOperations) {
    super(stageOps);
    this.cmd = cmd;
  }

  private get payload(): ShapePayload {
    return this.cmd.payload;
  }

  private getSharedConfig() {
    return {
      id: this.payload.nodeId,
      stroke: this.payload.color,
      strokeWidth: this.payload.strokeWidth,
      opacity: this.payload.opacity,
      lineCap: this.payload.lineCap as CanvasLineCap,
      lineJoin: this.payload.lineJoin as CanvasLineJoin,
      listening: true,
      hitStrokeWidth: (this.payload.strokeWidth ?? 1) + 12,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      erasable: true,
      selectable: true,
      hasGuideLines: true,
    };
  }

  private normalizeBounds(
    start: Point = this.payload.start,
    end: Point = this.payload.end,
  ) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      deltaX: end.x - start.x,
      deltaY: end.y - start.y,
    };
  }

  private getRectangleConfig(): Konva.RectConfig {
    const { x, y, width, height } = this.normalizeBounds();

    return {
      ...this.getSharedConfig(),
      x,
      y,
      width,
      height,
      fillEnabled: false,
    };
  }

  private getCircleConfig(): Konva.CircleConfig {
    const { deltaX, deltaY } = this.normalizeBounds();
    const size = Math.min(Math.abs(deltaX), Math.abs(deltaY));
    const x = deltaX >= 0 ? this.payload.start.x : this.payload.start.x - size;
    const y = deltaY >= 0 ? this.payload.start.y : this.payload.start.y - size;

    return {
      ...this.getSharedConfig(),
      x: x + size / 2,
      y: y + size / 2,
      radius: size / 2,
      fillEnabled: false,
    };
  }

  private getLinePoints(): number[] {
    return [
      this.payload.start.x,
      this.payload.start.y,
      this.payload.end.x,
      this.payload.end.y,
    ];
  }

  private getLineConfig(): Konva.LineConfig {
    return {
      ...this.getSharedConfig(),
      points: this.getLinePoints(),
    };
  }

  private getArrowConfig(): Konva.ArrowConfig {
    const pointerLength = Math.max(10, this.payload.strokeWidth * 4);
    const pointerWidth = Math.max(8, this.payload.strokeWidth * 3);

    return {
      ...this.getSharedConfig(),
      points: this.getLinePoints(),
      fill: this.payload.color,
      pointerLength,
      pointerWidth,
    };
  }

  private isCompatibleNode(node: Konva.Node | null): node is ShapeNode {
    if (!node) return false;

    switch (this.payload.kind) {
      case "rectangle":
        return node instanceof Konva.Rect;
      case "circle":
        return node instanceof Konva.Circle;
      case "line":
        return node instanceof Konva.Line && !(node instanceof Konva.Arrow);
      case "arrow":
        return node instanceof Konva.Arrow;
      default:
        return false;
    }
  }

  private createNodeForKind(): ShapeNode {
    switch (this.payload.kind) {
      case "rectangle":
        return this.stageOps.createNode(Konva.Rect, this.getRectangleConfig());
      case "circle":
        return this.stageOps.createNode(Konva.Circle, this.getCircleConfig());
      case "line":
        return this.stageOps.createNode(Konva.Line, this.getLineConfig());
      case "arrow":
        return this.stageOps.createNode(Konva.Arrow, this.getArrowConfig());
    }
  }

  private getOrCreateShapeNode(): ShapeNode {
    if (
      this.cachedNode &&
      this.cachedNode.id() === this.payload.nodeId &&
      this.isCompatibleNode(this.cachedNode)
    ) {
      return this.cachedNode;
    }

    const existingNode = this.stageOps.getNodeById(this.payload.nodeId);
    if (this.isCompatibleNode(existingNode)) {
      this.cachedNode = existingNode;
      return this.cachedNode;
    }

    if (existingNode) {
      this.stageOps.removeNode(existingNode, true);
    }

    const node = this.createNodeForKind();
    this.cachedNode = node;
    return node;
  }

  private updateShapeNode(): void {
    const shapeNode = this.getOrCreateShapeNode();

    switch (this.payload.kind) {
      case "rectangle":
        shapeNode.setAttrs(this.getRectangleConfig());
        return;
      case "circle":
        shapeNode.setAttrs(this.getCircleConfig());
        return;
      case "line":
        shapeNode.setAttrs(this.getLineConfig());
        return;
      case "arrow":
        shapeNode.setAttrs(this.getArrowConfig());
        return;
    }
  }

  apply(): void {
    const shapeNode = this.getOrCreateShapeNode();
    this.stageOps.addDrawingNode(shapeNode);
  }

  undo(): void {
    this.stageOps.removeNodeById(this.payload.nodeId, false);
    this.cachedNode = null;
  }

  redo(): void {
    this.apply();
  }

  destroy(): void {
    this.stageOps.removeNodeById(this.payload.nodeId, true);
    this.cachedNode = null;
  }

  update(update: Partial<ShapePayload>): void {
    const kindChanged = !!update.kind && update.kind !== this.payload.kind;
    this.cmd.payload = { ...this.cmd.payload, ...update };

    if (kindChanged && this.cachedNode) {
      this.stageOps.removeNode(this.cachedNode, true);
      this.cachedNode = null;
    }

    this.updateShapeNode();
    this.stageOps.redrawDrawingLayer();
  }

  finalize(): void {
    this.finalized = true;
  }

  canFinalize(): boolean {
    const { width, height } = this.normalizeBounds();

    switch (this.payload.kind) {
      case "rectangle":
        return width > 0.5 && height > 0.5;
      case "circle":
        return Math.min(width, height) > 0.5;
      case "line":
      case "arrow":
        return Math.hypot(width, height) > 0.5;
    }
  }

  serialize(): ShapeCommandData {
    return this.cmd;
  }
}

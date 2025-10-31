import type {
  StrokeCommand as StrokeCommandData,
  StrokePayload,
} from "@/types/command";
import { BaseCommand } from "@/commands/baseCommand";
import type { StageOperations } from "@/types/common";
import Konva from "konva";

export class StrokeCommand extends BaseCommand {
  private cmd: StrokeCommandData;
  private cachedNode: Konva.Line | null = null;

  constructor(cmd: StrokeCommandData, stageOps: StageOperations) {
    super(stageOps);
    this.cmd = cmd;
  }

  // convenience getter to avoid repeating this.cmd.payload
  private get payload(): StrokePayload {
    return this.cmd.payload;
  }

  // central place for Konva config — used for both create and updates
  getLineConfig(): Konva.LineConfig {
    return {
      id: this.payload.nodeId,
      stroke: this.payload.color,
      strokeWidth: this.payload.strokeWidth,
      points: this.payload.points,
      lineCap: this.payload.lineCap as CanvasLineCap,
      lineJoin: this.payload.lineJoin as CanvasLineJoin,
      opacity: this.payload.opacity,

      tension: 0.45,
      listening: true,
      hitStrokeWidth: (this.payload.strokeWidth ?? 1) + 12,

      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,

      erasable: true,
      selectable: true,
    };
  }

  // prefer cached node when safe — verify it still matches id and stageOps
  getOrCreateLineNode(): Konva.Line {
    // return cached if valid
    if (this.cachedNode && this.cachedNode.id() === this.payload.nodeId) {
      return this.cachedNode;
    }

    const existingNode = this.stageOps.getNodeById(this.payload.nodeId);
    if (existingNode && existingNode instanceof Konva.Line) {
      this.cachedNode = existingNode;
      return this.cachedNode;
    }

    const config = this.getLineConfig();
    const node = this.stageOps.createNode(Konva.Line, config);
    this.cachedNode = node;
    return node;
  }

  apply(): void {
    const lineNode = this.getOrCreateLineNode();
    this.stageOps.addDrawingNode(lineNode);
  }

  undo(): void {
    // remove but keep cached behavior consistent
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

  // merge payload changes, then update the node attributes
  update(opdate: Partial<StrokePayload>): void {
    this.cmd.payload = { ...this.cmd.payload, ...opdate };
    this.updateLineNode();
    this.stageOps.redrawDrawingLayer();
  }

  finalize(): void {
    this.finalized = true;
  }

  canFinalize(): boolean {
    return this.payload.points.length >= 4;
  }

  // single place to sync Konva node attributes from payload
  updateLineNode(): void {
    const lineNode = this.getOrCreateLineNode();

    const { points } = this.payload;
    lineNode.setAttrs({
      ...this.getLineConfig(),
      points,
    } as Konva.LineConfig);
  }

  serialize(): StrokeCommandData {
    return this.cmd;
  }
}

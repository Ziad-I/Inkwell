import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Tools, type ToolContext } from "@/types/tool";
import type { Point } from "@/types/common";
import { BaseTool } from "./baseTool";
import { Move } from "lucide-react";
import type { CommandID, TransformPayload, NodeState } from "@/types/command";

export class SelectionTool extends BaseTool {
  meta = {
    id: Tools.Selection,
    label: "Selection",
    icon: Move,
    cursor: "move",
    exclusive: false,
  };

  private readonly MIN_DRAG = 4; // px: minimum drag distance

  private transformCommandId: CommandID | null = null;
  private transformPayload: TransformPayload | null = null;

  // private currentSelectCommand: TransformCommand | null = null;
  private isSelecting = false;
  private isTransforming = false;
  private startPoint: Point | null = null;
  private selectionBox: Konva.Rect | null = null;
  private transformer: Konva.Transformer | null = null;

  constructor(ctx: ToolContext) {
    super(ctx);
  }

  private createTransformer() {
    if (this.transformer) return;

    this.transformer = new Konva.Transformer({
      shouldOverdrawWholeArea: true,
      boundBoxFunc: (oldBox, newBox) => {
        if (newBox.width < 5 || newBox.height < 5) return oldBox;
        return newBox;
      },
    });

    this.transformer.on("transformstart dragstart", () => {
      if (this.transformPayload || this.transformCommandId) return;

      this.initPPayload();
      this.transformCommandId = this.ctx.commandManager.startCommand(
        "transform",
        this.transformPayload!
      );

      // this.currentSelectCommand = new TransformCommand(
      //   this.ctx.stageOps,
      //   this.transformer!.nodes()
      // );
      // this.currentSelectCommand.setInitialState(this.transformer!.nodes());
      // this.ctx.commandManager.startCommand(this.currentSelectCommand);
    });

    this.transformer.on("transformend dragend", () => {
      if (!this.transformPayload || !this.transformCommandId) return;

      // Update the current state (but don't finalize yet)
      for (const transform of this.transformPayload.transforms) {
        const node = this.ctx.stageOps.getNodeById(transform.nodeId);
        if (!node) continue;
        const afterState = this.getNodeState(node);
        transform.after = afterState;
      }

      this.ctx.commandManager.updateCommand(
        this.transformCommandId,
        this.transformPayload
      );

      // Don't finalize here - let clearSelection or onDeactivate handle it
    });

    this.ctx.stageOps.addDrawingNode(this.transformer);
    this.ctx.stageOps.redrawDrawingLayer();
  }

  private removeTransformer() {
    if (!this.transformer) return;
    this.ctx.stageOps.removeNode(this.transformer, true);
    this.transformer.off("transformstart transformend dragstart dragend");
    this.transformer = null;
  }

  private getNodeState(node: Konva.Node): NodeState {
    return {
      width: node.width(),
      height: node.height(),
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
      skewX: node.skewX(),
      skewY: node.skewY(),
      offsetX: node.offsetX(),
      offsetY: node.offsetY(),
    };
  }

  private createSelectionRect(x: number, y: number) {
    this.selectionBox = new Konva.Rect({
      x,
      y,
      width: 0,
      height: 0,
      stroke: "blue",
      strokeWidth: 1,
      dash: [4, 3],
      listening: false,
    });

    this.ctx.stageOps.addOverlayNode(this.selectionBox);
    this.ctx.stageOps.redrawOverlayLayer();
  }

  private cleanupSelectionBox() {
    if (!this.selectionBox) return;
    this.ctx.stageOps.removeNode(this.selectionBox, true);
    this.selectionBox = null;
  }

  private isSelectableNode(node: Konva.Node | null): boolean {
    if (!node) return false;
    if (node === this.selectionBox) return false;
    if (node === this.transformer) return false;

    return node.getAttr("selectable") === true;
  }

  private startSelection() {
    this.isSelecting = true;
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const p = stage.getPointerPosition();
    if (!p) return;

    const wp = this.ctx.stageOps.screenToWorld(p.x, p.y);

    this.startPoint = wp;
    this.createSelectionRect(wp.x, wp.y);
  }

  private updateSelection() {
    if (!this.selectionBox || !this.isSelecting || !this.startPoint) return;

    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const p = stage.getPointerPosition();
    if (!p) return;

    const wp = this.ctx.stageOps.screenToWorld(p.x, p.y);

    const x = Math.min(this.startPoint.x, wp.x);
    const y = Math.min(this.startPoint.y, wp.y);
    const width = Math.abs(wp.x - this.startPoint.x);
    const height = Math.abs(wp.y - this.startPoint.y);

    this.selectionBox.width(width);
    this.selectionBox.height(height);
    this.selectionBox.x(x);
    this.selectionBox.y(y);

    this.ctx.stageOps.redrawOverlayLayer();
  }

  private endSelection() {
    const stage = this.ctx.stageOps.getStage();
    const layer = this.ctx.stageOps.getDrawingLayer();

    if (!this.startPoint || !this.selectionBox || !stage || !layer) {
      this.cleanupSelectionBox();
      this.isSelecting = false;
      return;
    }

    const box = this.selectionBox.getClientRect();

    // If the drag was tiny, treat it as a single click
    if (Math.max(box.width, box.height) < this.MIN_DRAG) {
      // remove the selection box before performing singleSelect so it doesn't interfere
      this.cleanupSelectionBox();
      this.isSelecting = false;
      this.startPoint = null;

      // perform a single-click selection at current pointer pos
      this.singleSelect();
      return;
    }

    // Normal box selection path
    const intersections = layer.find((node: Konva.Node) => {
      if (!this.isSelectableNode(node)) return false;
      if (!Konva.Util.haveIntersection(box, node.getClientRect())) return false;
      return true;
    });

    this.transformer?.nodes(intersections);
    this.isTransforming = true;

    this.cleanupSelectionBox();
    this.isSelecting = false;
    this.startPoint = null;

    this.ctx.stageOps.redrawDrawingLayer();
  }

  private singleSelect() {
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const p = stage.getPointerPosition();
    if (!p) return;

    const layer = this.ctx.stageOps.getDrawingLayer();
    if (!layer) return;

    const intersection = layer.getIntersection(p);

    if (intersection && this.isSelectableNode(intersection)) {
      this.transformer?.nodes([intersection]);
      this.isTransforming = true;
    } else {
      this.transformer?.nodes([]);
      this.isTransforming = false;
    }

    this.ctx.stageOps.redrawDrawingLayer();
  }

  private clearSelection() {
    if (this.transformer) {
      this.transformer.nodes([]);
      this.isTransforming = false;

      // Only finalize if we have a pending command (not already finalized in transformend)
      if (this.transformCommandId && this.transformPayload) {
        // Update the final state before finalizing
        for (const transform of this.transformPayload.transforms) {
          const node = this.ctx.stageOps.getNodeById(transform.nodeId);
          if (!node) continue;
          const afterState = this.getNodeState(node);
          transform.after = afterState;
        }

        this.ctx.commandManager.updateCommand(
          this.transformCommandId,
          this.transformPayload
        );
        this.ctx.commandManager.finalizeCommand(this.transformCommandId);
      }

      this.transformPayload = null;
      this.transformCommandId = null;
    }
    this.ctx.stageOps.redrawDrawingLayer();
  }

  onActivate(): void {
    this.createTransformer();
  }

  onDeactivate(): void {
    this.cleanupSelectionBox();

    // Finalize any pending transform command before removing transformer
    if (this.transformCommandId && this.transformPayload) {
      // Update the transform with final state
      for (const transform of this.transformPayload.transforms) {
        const node = this.ctx.stageOps.getNodeById(transform.nodeId);
        if (!node) continue;
        const afterState = this.getNodeState(node);
        transform.after = afterState;
      }

      this.ctx.commandManager.updateCommand(
        this.transformCommandId,
        this.transformPayload
      );
      this.ctx.commandManager.finalizeCommand(this.transformCommandId);
    }

    this.removeTransformer();
    this.isSelecting = false;
    this.startPoint = null;
    this.isTransforming = false;
    this.transformPayload = null;
    this.transformCommandId = null;
  }

  initPPayload() {
    this.transformPayload = { transforms: [] } as TransformPayload;

    for (const node of this.transformer!.nodes()) {
      const beforeState = this.getNodeState(node);
      this.transformPayload!.transforms.push({
        nodeId: node.id(),
        before: beforeState,
        after: {} as NodeState, // to be filled on transformend
      });
    }
  }

  onPointerDown(event: KonvaEventObject<PointerEvent>) {
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    if (event.target === stage) {
      if (this.isTransforming) {
        this.clearSelection();
      }
      this.startSelection();
      return;
    }

    if (event.target.id() === this.transformer?.id()) {
      return;
    }

    this.singleSelect();
  }

  onPointerMove(event: KonvaEventObject<PointerEvent>) {
    if (!this.isSelecting) return;
    this.updateSelection();
  }

  onPointerUp(event: KonvaEventObject<PointerEvent>) {
    if (this.isSelecting) {
      this.endSelection();
      return;
    }

    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    if (event.target.id() === this.transformer?.id()) {
      return;
    }

    if (event.target === stage) {
      this.clearSelection();
    }
  }
}

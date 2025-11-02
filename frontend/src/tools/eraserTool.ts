import Konva from "konva";
import { Tools, type ToolContext } from "@/types/tool";
import type { KonvaEventObject } from "konva/lib/Node";
import { BaseTool } from "./baseTool";
import { Eraser as EraserIcon } from "lucide-react";
import type { CommandID, ErasePayload } from "@/types/command";

export class EraserTool extends BaseTool {
  meta = {
    id: Tools.Eraser,
    label: "Eraser",
    icon: EraserIcon,
    cursor: "cell",
    exclusive: true,
  };

  private eraseCommandId: CommandID | null = null;
  private eraseCommandPayload: ErasePayload | null = null;
  private erasedNodeIds: string[] = [];
  private isErasing = false;

  constructor(ctx: ToolContext) {
    super(ctx);
  }

  private isErasableShape(shape: Konva.Shape | null): boolean {
    if (!shape) return false;
    const erasable = shape.getAttr("erasable");
    return erasable === true;
  }

  private eraseAtPointer() {
    this.ctx.stageOps.redrawDrawingLayer();
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const layer = this.ctx.stageOps.getDrawingLayer();
    if (!layer) return;

    const shape = layer.getIntersection(pointer);
    if (shape && this.isErasableShape(shape)) {
      this.erasedNodeIds.push(shape.id());
      this.ctx.commandManager.updateCommand(this.eraseCommandId!, {
        erasedNodes: this.erasedNodeIds,
      });
    }
  }

  onActivate(): void {
    // this.ctx.stageOps.getDrawingLayer()?.toggleHitCanvas();
    // this.ctx.stageOps.redrawDrawingLayer();
  }

  onDeactivate(): void {
    // Only cancel if we have a pending command (isErasing means still in progress)
    if (this.isErasing && this.eraseCommandId) {
      this.ctx.commandManager.cancelCommand(this.eraseCommandId);
    }

    // Clean up state
    this.erasedNodeIds = [];
    this.isErasing = false;
    this.eraseCommandId = null;
    this.eraseCommandPayload = null;
  }

  initPayload() {
    this.eraseCommandPayload = {
      erasedNodes: this.erasedNodeIds,
    } as ErasePayload;
  }

  onPointerDown(event: KonvaEventObject<PointerEvent>) {
    this.isErasing = true;
    this.initPayload();
    this.eraseCommandId = this.ctx.commandManager.startCommand(
      "erase",
      this.eraseCommandPayload!
    );

    this.eraseAtPointer();
  }

  onPointerMove(event: KonvaEventObject<PointerEvent>) {
    if (!this.isErasing) return;
    this.eraseAtPointer();
  }

  onPointerUp(event: KonvaEventObject<PointerEvent>) {
    if (!this.isErasing || !this.eraseCommandId) return;

    this.isErasing = false;

    // Check if any nodes were actually erased
    if (this.erasedNodeIds.length > 0) {
      this.ctx.commandManager.finalizeCommand(this.eraseCommandId);
    } else {
      // Cancel the command if nothing was erased
      this.ctx.commandManager.cancelCommand(this.eraseCommandId);
    }

    this.erasedNodeIds = [];
    this.eraseCommandId = null;
    this.eraseCommandPayload = null;
  }
}

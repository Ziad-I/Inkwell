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
    mutating: true,
  };

  private eraseCommandId: CommandID | null = null;
  private eraseCommandPayload: ErasePayload | null = null;
  private erasedNodeIds: Set<string> = new Set();
  private isErasing = false;

  constructor(ctx: ToolContext) {
    super(ctx);
  }

  private createPayloadSnapshot(): ErasePayload {
    return {
      erasedNodes: [...this.erasedNodeIds],
    };
  }

  private isErasableShape(shape: Konva.Shape | null): boolean {
    if (!shape) return false;
    const erasable = shape.getAttr("erasable");
    return erasable === true;
  }

  private eraseAtPointer() {
    if (this.eraseCommandId === null) return;

    this.ctx.stageOps.redrawDrawingLayer();
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const layer = this.ctx.stageOps.getDrawingLayer();
    if (!layer) return;

    const shape = layer.getIntersection(pointer);
    if (shape && this.isErasableShape(shape)) {
      const erasedCount = this.erasedNodeIds.size;
      this.erasedNodeIds.add(shape.id());

      if (this.erasedNodeIds.size === erasedCount) {
        return;
      }

      const updated = this.ctx.commandManager.updateCommand(
        this.eraseCommandId,
        {
          erasedNodes: [...this.erasedNodeIds],
        },
      );
      if (!updated) {
        // The pending command is gone (e.g. the server rejected it) or
        // mutations are blocked: reset the gesture so no stale command ID
        // survives into later pointer events.
        this.cancelGesture();
      }
    }
  }

  onActivate(): void {
    // this.ctx.stageOps.getDrawingLayer()?.toggleHitCanvas();
    // this.ctx.stageOps.redrawDrawingLayer();
  }

  /**
   * Cancels any in-flight erase: resets local gesture state first,
   * then cancels the pending command. Idempotent; never finalizes.
   */
  cancelGesture(): void {
    const commandId = this.eraseCommandId;

    this.isErasing = false;
    this.erasedNodeIds.clear();
    this.eraseCommandId = null;
    this.eraseCommandPayload = null;

    if (commandId !== null) {
      this.ctx.commandManager.cancelCommand(commandId);
    }
  }

  onDeactivate(): void {
    // Cancel any pending erase when the tool is deactivated; never
    // commit an erase that did not complete through pointer-up.
    this.cancelGesture();
  }

  initPayload() {
    this.eraseCommandPayload = this.createPayloadSnapshot();
  }

  onPointerDown(_event: KonvaEventObject<PointerEvent>) {
    this.initPayload();

    const commandId = this.ctx.commandManager.startCommand(
      "erase",
      this.eraseCommandPayload!,
    );

    // Transaction boundary: the gesture only starts once a command
    // exists. On denial every local flag is reset before any node or
    // manager operation (no erase pass, no redraw).
    if (commandId === null) {
      this.erasedNodeIds.clear();
      this.eraseCommandId = null;
      this.eraseCommandPayload = null;
      this.isErasing = false;
      return;
    }

    this.eraseCommandId = commandId;
    this.isErasing = true;

    this.eraseAtPointer();
  }

  onPointerMove(_event: KonvaEventObject<PointerEvent>) {
    if (!this.isErasing || !this.eraseCommandId) return;
    this.eraseAtPointer();
  }

  onPointerUp(_event: KonvaEventObject<PointerEvent>) {
    if (!this.isErasing || !this.eraseCommandId) return;

    this.isErasing = false;

    // Check if any nodes were actually erased
    if (this.erasedNodeIds.size > 0) {
      const finalized = this.ctx.commandManager.finalizeCommand(
        this.eraseCommandId,
      );
      if (!finalized) {
        // The pending command is gone (e.g. the server rejected it) or
        // mutations are blocked: reset the gesture so no stale state
        // survives.
        this.cancelGesture();
        return;
      }
    } else {
      // Cancel the command if nothing was erased
      this.ctx.commandManager.cancelCommand(this.eraseCommandId);
    }

    this.erasedNodeIds.clear();
    this.eraseCommandId = null;
    this.eraseCommandPayload = null;
  }
}

import type { Tool, ToolContext } from "@/lib/definations";
import type { KonvaEventObject } from "konva/lib/Node";

export class ToolManager {
  private tools = new Map<string, Tool>();
  private activeTool: Tool | null = null;

  private overrideStack: Tool[] = [];
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  register(tool: Tool) {
    this.tools.set(tool.id, tool);
  }

  unregister(id: string) {
    if (this.tools.has(id)) {
      if (this.activeTool?.id === id) {
        this.tools.get(id)?.onDeactivate?.();
        this.activeTool = null;
      }
      this.tools.delete(id);
    }
  }

  getTool(id: string): Tool | null {
    return this.tools.get(id) ?? null;
  }

  applyCursor(tool: Tool | null) {
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const container = stage.container();
    if (!container) return;

    const cursor = tool?.cursor ?? "";
    if (cursor) {
      container.style.cursor = cursor;
    } else {
      container.style.removeProperty("cursor");
    }
  }

  setActiveTool(id: string) {
    if (this.activeTool?.id === id) {
      return;
    }
    this.activeTool?.onDeactivate?.();
    this.activeTool = id ? this.tools.get(id) ?? null : null;
    this.activeTool?.onActivate?.();
    this.applyCursor(this.getEffectiveTool());
  }

  pushOverride(tool: Tool) {
    this.overrideStack.push(tool);
    this.setActiveTool(tool.id);
    this.applyCursor(this.getEffectiveTool());
  }

  popOverride() {
    const tool = this.overrideStack.pop();
    tool?.onDeactivate?.();
    this.applyCursor(this.getEffectiveTool());
  }

  getEffectiveTool(): Tool | null {
    if (this.overrideStack.length > 0) {
      return this.overrideStack[this.overrideStack.length - 1];
    }
    return this.activeTool;
  }

  handlePointerDown(e: KonvaEventObject<PointerEvent>) {
    this.getEffectiveTool()?.onPointerDown?.(e);
  }

  handlePointerMove(e: KonvaEventObject<PointerEvent>) {
    this.getEffectiveTool()?.onPointerMove?.(e);
  }

  handlePointerUp(e: KonvaEventObject<PointerEvent>) {
    this.getEffectiveTool()?.onPointerUp?.(e);
  }

  listTools() {
    return Array.from(this.tools.values());
  }
}

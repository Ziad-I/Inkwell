import { type Tool, type ToolContext, Tools } from "@/Tools/types";
import type { KonvaEventObject } from "konva/lib/Node";
import { toolLoaders, type ToolLoader } from "@/Tools/loaders";

export class ToolManager {
  private tools = new Map<Tools, Tool>();
  private activeTool: Tool | null = null;
  private overrideStack: Tools[] = [];
  private loaders: Record<Tools, ToolLoader>;
  private ctx: ToolContext;

  constructor(ctx: ToolContext, loaders?: Record<Tools, ToolLoader>) {
    this.ctx = ctx;
    this.loaders = loaders ?? toolLoaders;
  }

  private setActiveTool(id: Tools | null) {
    if (id !== null && this.activeTool?.id === id) return;

    this.activeTool?.onDeactivate?.();
    this.activeTool = id ? this.tools.get(id) ?? null : null;
    this.activeTool?.onActivate?.();
    this.applyCursor(this.getEffectiveTool()?.id ?? null);
  }

  async initTools() {
    const entries = Object.entries(this.loaders) as [Tools, ToolLoader][];
    for (const [id, loader] of entries) {
      if (loader.eager) {
        const maybe = loader.load(this.ctx);
        const tool = maybe instanceof Promise ? await maybe : maybe;
        this.register(tool);
      }
    }
    if (this.loaders[Tools.Brush]) {
      await this.activateTool(Tools.Brush);
    } else {
      this.setActiveTool(null);
    }
  }

  async activateTool(id: Tools): Promise<void> {
    if (this.activeTool?.id === id) return;

    let tool = this.tools.get(id) ?? null;
    if (!tool) {
      const loader = this.loaders[id];
      if (!loader) throw new Error(`No loader for tool ${id}`);
      const maybe = loader.load(this.ctx);
      tool = maybe instanceof Promise ? await maybe : maybe;
      this.register(tool);
    }
    if (this.activeTool?.id === id) return;
    this.setActiveTool(id);
  }

  register(tool: Tool) {
    this.tools.set(tool.id, tool);
    console.log(`Registered tool: ${tool.id}`);
  }

  unregister(id: Tools) {
    const tool = this.tools.get(id);
    if (!tool) return;

    if (this.overrideStack.length > 0) {
      if (this.overrideStack[this.overrideStack.length - 1] === id) {
        tool.onDeactivate?.();
      }
      this.overrideStack = this.overrideStack.filter((toolId) => toolId !== id);
    }

    if (this.activeTool?.id === id) {
      this.tools.get(id)?.onDeactivate?.();
      this.activeTool = null;
    }
    this.tools.delete(id);
    console.log(`Unregistered tool: ${id}`);
    this.applyCursor(this.getEffectiveTool()?.id ?? null);
  }

  getTool(id: Tools): Tool | null {
    return this.tools.get(id) ?? null;
  }

  applyCursor(id: Tools | null) {
    const stage = this.ctx.stageOps.getStage();
    if (!stage) return;

    const container = stage.container();
    if (!container) return;

    const tool = id ? this.tools.get(id) : null;
    const cursor = tool?.cursor ?? "";
    if (cursor) {
      container.style.cursor = cursor;
    } else {
      container.style.removeProperty("cursor");
    }
  }

  pushOverride(id: Tools) {
    const tool = this.tools.get(id);
    if (tool === undefined) {
      console.warn("Cannot push override for unregistered tool:", id);
      return;
    }

    const currentTool = this.getEffectiveTool();
    if (currentTool?.id === tool.id) {
      console.warn(`Tool ${tool.id} is already active, cannot override`);
      return;
    }

    if (this.overrideStack.includes(tool.id)) {
      console.warn(`Tool ${tool.id} is already on the override stack`);
      return;
    }

    currentTool?.onDeactivate?.();
    this.overrideStack.push(tool.id);
    tool.onActivate?.();
    this.applyCursor(tool.id);
  }

  popOverride() {
    const toolId = this.overrideStack.pop();
    if (toolId) {
      const tool = this.tools.get(toolId);
      tool?.onDeactivate?.();
    }
    const effectiveTool = this.getEffectiveTool();
    effectiveTool?.onActivate?.();
    this.applyCursor(effectiveTool?.id ?? null);
  }

  getEffectiveTool(): Tool | null {
    if (this.overrideStack.length > 0) {
      const topToolId = this.overrideStack[this.overrideStack.length - 1];
      return this.tools.get(topToolId) ?? null;
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

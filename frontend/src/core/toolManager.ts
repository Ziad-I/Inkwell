import {
  type Tool,
  type ToolContext,
  type ToolMetadata,
  type ToolLoader,
  Tools,
} from "@/types/tool";
import type { KonvaEventObject } from "konva/lib/Node";
import { toolLoaders } from "@/core/toolLoaders";
import { useToolStore } from "@/stores/toolStore";

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

  private updateStore() {
    useToolStore
      .getState()
      .setActiveTool(this.getEffectiveTool()?.meta.id ?? null);
    useToolStore.getState().setAllTools(this.getTools());
  }

  private setActiveTool(id: Tools | null) {
    if (id !== null && this.activeTool?.meta.id === id) return;

    this.activeTool?.onDeactivate?.();
    this.activeTool = id ? this.tools.get(id) ?? null : null;
    this.activeTool?.onActivate?.();
    this.applyCursor(this.getEffectiveTool()?.meta.id ?? null);

    this.updateStore();
  }

  async initTools() {
    const entries = Object.entries(this.loaders) as [Tools, ToolLoader][];
    for (const [_id, loader] of entries) {
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

    this.updateStore();
  }

  async activateTool(id: Tools): Promise<void> {
    if (this.activeTool?.meta.id === id) return;

    let tool = this.tools.get(id) ?? null;
    if (!tool) {
      const loader = this.loaders[id];
      if (!loader) throw new Error(`No loader for tool ${id}`);
      const maybe = loader.load(this.ctx);
      tool = maybe instanceof Promise ? await maybe : maybe;
      this.register(tool);
    }
    if (this.activeTool?.meta.id === id) return;
    this.setActiveTool(id);
    console.log(`Activated tool: ${id}`);
  }

  register(tool: Tool) {
    this.tools.set(tool.meta.id, tool);
    console.log(`Registered tool: ${tool.meta.id}`);
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

    if (this.activeTool?.meta.id === id) {
      this.tools.get(id)?.onDeactivate?.();
      this.activeTool = null;
    }
    this.tools.delete(id);
    console.log(`Unregistered tool: ${id}`);
    this.applyCursor(this.getEffectiveTool()?.meta.id ?? null);
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
    const cursor = tool?.meta.cursor ?? "";
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
    if (currentTool?.meta?.id === tool.meta.id) {
      console.warn(`Tool ${tool.meta.id} is already active, cannot override`);
      return;
    }

    if (this.overrideStack.includes(tool.meta.id)) {
      console.warn(`Tool ${tool.meta.id} is already on the override stack`);
      return;
    }

    currentTool?.onDeactivate?.();
    this.overrideStack.push(tool.meta.id);
    tool.onActivate?.();
    this.applyCursor(tool.meta.id);

    this.updateStore();
  }

  popOverride() {
    const toolId = this.overrideStack.pop();
    if (toolId) {
      const tool = this.tools.get(toolId);
      tool?.onDeactivate?.();
    }
    const effectiveTool = this.getEffectiveTool();
    effectiveTool?.onActivate?.();
    this.applyCursor(effectiveTool?.meta?.id ?? null);

    this.updateStore();
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

  getTools(): ToolMetadata[] {
    return Array.from(this.tools.values()).map((t) => t.meta);
  }
}

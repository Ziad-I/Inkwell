import type { LucideProps } from "lucide-react";
import type { Tool, ToolContext, Tools } from "@/types/tool";
import { useSettingsStore } from "@/stores/settingsStore";
import Konva from "konva";

export abstract class BaseTool implements Tool {
  public abstract id: Tools;
  public label?: string;
  public cursor?: string;
  public icon?: React.ComponentType<LucideProps>;
  public exclusive?: boolean;

  protected ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  protected getSettings() {
    return useSettingsStore.getState();
  }

  // default lifecycle hooks (no-op)
  onActivate() {}
  onDeactivate() {}
  onPointerDown(_: Konva.KonvaEventObject<PointerEvent>) {}
  onPointerMove(_: Konva.KonvaEventObject<PointerEvent>) {}
  onPointerUp(_: Konva.KonvaEventObject<PointerEvent>) {}
}

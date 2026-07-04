import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "@/types/tool";
import { createMockStageOps } from "@/__tests__/util/mockStageOps";

vi.mock("@/stores/toolStore", () => ({
  useToolStore: {
    getState: vi.fn(() => ({
      setActiveTool: vi.fn(),
      setAllTools: vi.fn(),
    })),
  },
}));

function createMockContext(): ToolContext {
  return {
    stageOps: createMockStageOps(),
    commandManager: {} as never,
  };
}

describe("ToolManager", async () => {
  const { ToolManager } = await import("@/core/toolManager");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates and registers tools", () => {
    const tm = new ToolManager(createMockContext(), {});
    const tool = {
      meta: { id: "brush" as const, label: "Brush", cursor: "crosshair" },
      onActivate: vi.fn(),
      onDeactivate: vi.fn(),
    };

    tm.register(tool);

    expect(tm.getTool("brush")).toBe(tool);
  });

  it("activates a registered tool", async () => {
    const tm = new ToolManager(createMockContext(), {});
    const activate = vi.fn();
    tm.register({
      meta: { id: "brush" as const, label: "Brush" },
      onActivate: activate,
    });

    await tm.activateTool("brush");

    expect(activate).toHaveBeenCalled();
  });

  it("getEffectiveTool returns active tool when no override", async () => {
    const tm = new ToolManager(createMockContext(), {});
    const tool = {
      meta: { id: "brush" as const, label: "Brush" },
      onActivate: vi.fn(),
    };
    tm.register(tool);
    await tm.activateTool("brush");

    expect(tm.getEffectiveTool()?.meta.id).toBe("brush");
  });

  it("pushOverride activates the override tool", async () => {
    const tm = new ToolManager(createMockContext(), {});
    const deactivate = vi.fn();
    const brushTool = {
      meta: { id: "brush" as const, label: "Brush" },
      onActivate: vi.fn(),
      onDeactivate: deactivate,
    };
    const eraserTool = {
      meta: { id: "eraser" as const, label: "Eraser" },
      onActivate: vi.fn(),
    };
    tm.register(brushTool);
    tm.register(eraserTool);
    await tm.activateTool("brush");

    tm.pushOverride("eraser");

    expect(deactivate).toHaveBeenCalled();
    expect(tm.getEffectiveTool()?.meta.id).toBe("eraser");
  });

  it("popOverride restores the previous tool", () => {
    const tm = new ToolManager(createMockContext(), {});
    const brushTool = {
      meta: { id: "brush" as const, label: "Brush" },
      onActivate: vi.fn(),
      onDeactivate: vi.fn(),
    };
    const eraserTool = {
      meta: { id: "eraser" as const, label: "Eraser" },
      onActivate: vi.fn(),
      onDeactivate: vi.fn(),
    };
    tm.register(brushTool);
    tm.register(eraserTool);

    tm.pushOverride("eraser");
    tm.popOverride();

    expect(tm.getEffectiveTool()).toBeNull();
  });

  it("handlePointerDown dispatches to effective tool", async () => {
    const tm = new ToolManager(createMockContext(), {});
    const onPointerDown = vi.fn();
    tm.register({
      meta: { id: "brush" as const },
      onPointerDown,
    });
    await tm.activateTool("brush");

    tm.handlePointerDown({} as never);

    expect(onPointerDown).toHaveBeenCalled();
  });

  it("unregister removes tool and deactivates it if active", async () => {
    const tm = new ToolManager(createMockContext(), {});
    const deactivate = vi.fn();
    tm.register({
      meta: { id: "brush" as const },
      onDeactivate: deactivate,
    });
    await tm.activateTool("brush");

    tm.unregister("brush");

    expect(deactivate).toHaveBeenCalled();
    expect(tm.getTool("brush")).toBeNull();
  });

  it("destroy clears all tools", async () => {
    const tm = new ToolManager(createMockContext(), {});
    const deactivate = vi.fn();
    tm.register({
      meta: { id: "brush" as const },
      onDeactivate: deactivate,
    });
    await tm.activateTool("brush");

    tm.destroy();

    expect(deactivate).toHaveBeenCalled();
    expect(tm.getTool("brush")).toBeNull();
  });
});

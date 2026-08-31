import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tool, ToolContext, ToolLoader, Tools } from "@/types/tool";
import type { MutationCapability } from "@/types/operations";
import { createMockStageOps } from "@/__tests__/util/mockStageOps";

const toolStoreMock = vi.hoisted(() => ({
  setActiveTool: vi.fn(),
  setAllTools: vi.fn(),
}));

vi.mock("@/stores/toolStore", () => ({
  useToolStore: {
    getState: vi.fn(() => ({
      setActiveTool: toolStoreMock.setActiveTool,
      setAllTools: toolStoreMock.setAllTools,
    })),
  },
}));

function createMockContext(): ToolContext {
  return {
    stageOps: createMockStageOps(),
    commandManager: {} as never,
  };
}

function capability(
  overrides: Partial<MutationCapability>,
): () => MutationCapability {
  return () => ({
    epoch: "gen-1",
    ready: true,
    canDraw: true,
    ...overrides,
  });
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

  describe("destroyed flag", () => {
    it("activateTool is a rejected no-op after destroy", async () => {
      const tm = new ToolManager(createMockContext(), {});
      const tool: Tool = {
        meta: { id: "brush" as const },
        onActivate: vi.fn(),
      };
      tm.register(tool);
      tm.destroy();

      await expect(tm.activateTool("brush")).resolves.toBe(false);

      expect(tool.onActivate).not.toHaveBeenCalled();
      expect(tm.getTool("brush")).toBeNull();
    });

    it("handlePointerDown does not dispatch after destroy", async () => {
      const tm = new ToolManager(createMockContext(), {});
      const onPointerDown = vi.fn();
      tm.register({
        meta: { id: "brush" as const },
        onPointerDown,
      });
      await tm.activateTool("brush");
      tm.destroy();

      tm.handlePointerDown({} as never);
      tm.handlePointerMove({} as never);
      tm.handlePointerUp({} as never);

      expect(onPointerDown).not.toHaveBeenCalled();
    });

    it("a late initTools continuation after destroy registers nothing and does not write the tool store", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tool: Tool = { meta: { id: "brush" as const } };
      const loaders = {
        brush: {
          load: () => gate.then(() => tool),
          eager: true,
        },
      } as unknown as Record<Tools, ToolLoader>;
      const tm = new ToolManager(createMockContext(), loaders);

      const init = tm.initTools();
      tm.destroy();
      release();
      await init;

      expect(tm.getTool("brush")).toBeNull();
      // Only destroy's clearing write reaches the store.
      expect(toolStoreMock.setActiveTool).toHaveBeenCalledTimes(1);
      expect(toolStoreMock.setAllTools).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancelActiveGesture", () => {
    it("cancels the active tool's gesture", async () => {
      const tm = new ToolManager(createMockContext(), {});
      const cancelGesture = vi.fn();
      tm.register({
        meta: { id: "brush" as const },
        cancelGesture,
      });
      await tm.activateTool("brush");

      tm.cancelActiveGesture();

      expect(cancelGesture).toHaveBeenCalledTimes(1);
    });

    it("targets the override tool while an override is active", async () => {
      const tm = new ToolManager(createMockContext(), {});
      const brushCancel = vi.fn();
      const eraserCancel = vi.fn();
      tm.register({
        meta: { id: "brush" as const },
        cancelGesture: brushCancel,
      });
      tm.register({
        meta: { id: "eraser" as const },
        cancelGesture: eraserCancel,
      });
      await tm.activateTool("brush");
      tm.pushOverride("eraser");

      tm.cancelActiveGesture();

      expect(eraserCancel).toHaveBeenCalledTimes(1);
      expect(brushCancel).not.toHaveBeenCalled();
    });

    it("is a safe no-op when no tool is active", () => {
      const tm = new ToolManager(createMockContext(), {});

      expect(() => tm.cancelActiveGesture()).not.toThrow();
    });
  });

  describe("capability-gated activation", () => {
    it("rejects a mutating tool while the session is not ready", async () => {
      const tm = new ToolManager(
        createMockContext(),
        {},
        capability({ ready: false, canDraw: false }),
      );
      const onActivate = vi.fn();
      tm.register({
        meta: { id: "brush" as const },
        onActivate,
      });

      await expect(tm.activateTool("brush")).resolves.toBe(false);

      expect(onActivate).not.toHaveBeenCalled();
      expect(tm.getEffectiveTool()).toBeNull();
    });

    it("rejects a mutating tool when drawing is denied", async () => {
      const tm = new ToolManager(
        createMockContext(),
        {},
        capability({ canDraw: false }),
      );
      const onActivate = vi.fn();
      tm.register({
        meta: { id: "brush" as const },
        onActivate,
      });

      await expect(tm.activateTool("brush")).resolves.toBe(false);

      expect(onActivate).not.toHaveBeenCalled();
    });

    it("activates a mutating tool when capability allows", async () => {
      const tm = new ToolManager(createMockContext(), {}, capability({}));
      tm.register({ meta: { id: "brush" as const } });

      await expect(tm.activateTool("brush")).resolves.toBe(true);

      expect(tm.getEffectiveTool()?.meta.id).toBe("brush");
    });

    it("still activates non-mutating tools when capability denies", async () => {
      const tm = new ToolManager(
        createMockContext(),
        {},
        capability({ canDraw: false }),
      );
      const onActivate = vi.fn();
      tm.register({
        meta: { id: "selection" as const, mutating: false },
        onActivate,
      });

      await expect(tm.activateTool("selection")).resolves.toBe(true);

      expect(onActivate).toHaveBeenCalled();
    });

    it("activation without an injected capability gate is allowed", async () => {
      const tm = new ToolManager(createMockContext(), {});
      tm.register({ meta: { id: "brush" as const } });

      await expect(tm.activateTool("brush")).resolves.toBe(true);
    });
  });
});

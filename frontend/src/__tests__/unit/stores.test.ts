import { describe, it, expect, vi, beforeEach } from "vitest";

describe("settingsStore", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("creates store with default values", async () => {
    const { useSettingsStore } = await import("@/stores/settingsStore");
    const state = useSettingsStore.getState();
    expect(state.color).toBe("#000");
    expect(state.strokeWidth).toBe(2);
    expect(state.opacity).toBe(1);
    expect(state.lineCap).toBe("round");
    expect(state.lineJoin).toBe("miter");
    expect(state.shapeKind).toBe("rectangle");
    expect(state.showGrid).toBe(false);
  });

  it("updates color", async () => {
    const { useSettingsStore } = await import("@/stores/settingsStore");
    useSettingsStore.getState().setColor("#ff0000");
    expect(useSettingsStore.getState().color).toBe("#ff0000");
  });

  it("clamps strokeWidth between 1 and 50", async () => {
    const { useSettingsStore } = await import("@/stores/settingsStore");
    useSettingsStore.getState().setStrokeWidth(100);
    expect(useSettingsStore.getState().strokeWidth).toBe(50);
    useSettingsStore.getState().setStrokeWidth(0);
    expect(useSettingsStore.getState().strokeWidth).toBe(1);
  });

  it("clamps opacity between 0 and 1", async () => {
    const { useSettingsStore } = await import("@/stores/settingsStore");
    useSettingsStore.getState().setOpacity(2);
    expect(useSettingsStore.getState().opacity).toBe(1);
    useSettingsStore.getState().setOpacity(-1);
    expect(useSettingsStore.getState().opacity).toBe(0);
  });

  it("validates shapeKind against allowed values", async () => {
    const { useSettingsStore } = await import("@/stores/settingsStore");
    useSettingsStore.getState().setShapeKind("circle" as never);
    expect(useSettingsStore.getState().shapeKind).toBe("circle");
    useSettingsStore.getState().setShapeKind("invalid" as never);
    expect(useSettingsStore.getState().shapeKind).toBe("rectangle");
  });

  it("resets to initial values", async () => {
    const { useSettingsStore } = await import("@/stores/settingsStore");
    useSettingsStore.getState().setColor("#fff");
    useSettingsStore.getState().setStrokeWidth(10);
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().color).toBe("#000");
    expect(useSettingsStore.getState().strokeWidth).toBe(2);
  });
});

describe("toolStore", () => {
  it("initializes with null activeTool and empty allTools", async () => {
    const { useToolStore } = await import("@/stores/toolStore");
    const state = useToolStore.getState();
    expect(state.activeToolId).toBeNull();
    expect(state.allTools).toEqual([]);
  });

  it("sets active tool", async () => {
    const { useToolStore } = await import("@/stores/toolStore");
    useToolStore.getState().setActiveTool("brush");
    expect(useToolStore.getState().activeToolId).toBe("brush");
  });
});

describe("presenceStore", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("initializes with defined values", async () => {
    const { usePresenceStore } = await import("@/stores/presenceStore");
    const state = usePresenceStore.getState();
    expect(state.anonymousId).toBeDefined();
    expect(typeof state.anonymousId).toBe("string");
    expect(state.anonymousName).toBeDefined();
    expect(state.presenceColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("updates anonymous name", async () => {
    const { usePresenceStore } = await import("@/stores/presenceStore");
    usePresenceStore.getState().setAnonymousName("Alice");
    expect(usePresenceStore.getState().anonymousName).toBe("Alice");
  });
});

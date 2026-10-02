import { describe, it, expect, beforeEach } from "vitest";
import { usePresenceStore } from "@/stores/presenceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToolStore } from "@/stores/toolStore";

describe("store interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset zustand stores to initial state
    usePresenceStore.setState({
      anonymousId: "test-user",
      anonymousName: "Test User",
      presenceColor: "#ff0000",
    });
    useSettingsStore.setState({
      color: "#000",
      strokeWidth: 2,
      opacity: 1,
      lineCap: "round",
      lineJoin: "miter",
      shapeKind: "rectangle",
      showGrid: false,
    });
    useToolStore.setState({
      activeToolId: null,
      allTools: [],
    });
  });

  it("user can set name and it persists across store operations", () => {
    usePresenceStore.getState().setAnonymousName("Alice");
    expect(usePresenceStore.getState().anonymousName).toBe("Alice");

    useSettingsStore.getState().setColor("#00ff00");
    expect(useSettingsStore.getState().color).toBe("#00ff00");

    // Presence store unaffected by settings store changes
    expect(usePresenceStore.getState().anonymousName).toBe("Alice");
    expect(usePresenceStore.getState().presenceColor).toBe("#ff0000");
  });

  it("toolStore and settingsStore work independently", () => {
    useToolStore.getState().setActiveTool("brush");
    useSettingsStore.getState().setStrokeWidth(5);

    expect(useToolStore.getState().activeToolId).toBe("brush");
    expect(useSettingsStore.getState().strokeWidth).toBe(5);
    expect(useSettingsStore.getState().color).toBe("#000"); // unchanged
  });

  it("settings validation clamps values and does not affect other stores", () => {
    useSettingsStore.getState().setStrokeWidth(100);
    expect(useSettingsStore.getState().strokeWidth).toBe(50);

    usePresenceStore.setState({ anonymousId: "new-id" });
    expect(usePresenceStore.getState().anonymousId).toBe("new-id");
  });
});

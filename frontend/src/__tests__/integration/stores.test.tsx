import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUserStore } from "@/stores/userStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToolStore } from "@/stores/toolStore";

describe("store interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset zustand stores to initial state
    useUserStore.setState({
      userId: "test-user",
      userName: "Test User",
      userColor: "#ff0000",
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
    useUserStore.getState().setUserName("Alice");
    expect(useUserStore.getState().userName).toBe("Alice");

    useSettingsStore.getState().setColor("#00ff00");
    expect(useSettingsStore.getState().color).toBe("#00ff00");

    // User store unaffected by settings store changes
    expect(useUserStore.getState().userName).toBe("Alice");
    expect(useUserStore.getState().userColor).toBe("#ff0000");
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

    useUserStore.getState().setUserId("new-id");
    expect(useUserStore.getState().userId).toBe("new-id");
  });
});

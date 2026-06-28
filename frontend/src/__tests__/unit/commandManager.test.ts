import { describe, it, expect, vi } from "vitest";
import { CommandFactory } from "@/core/commandFactory";
import type { StageOperations } from "@/types/common";
import type { ConnectionManager } from "@/core/connectionManager";

const mockStageOps = {
  getNodeById: vi.fn(),
  createNode: vi.fn(),
  addDrawingNode: vi.fn(),
  addOverlayNode: vi.fn(),
  removeNodeById: vi.fn(),
  removeNode: vi.fn(),
  redrawDrawingLayer: vi.fn(),
  redrawOverlayLayer: vi.fn(),
  getStage: vi.fn(),
  getDrawingLayer: vi.fn(),
  getOverlayLayer: vi.fn(),
  getViewpointPos: vi.fn(),
  getScale: vi.fn(),
  setScale: vi.fn(),
  setViewpointPos: vi.fn(),
  screenToWorld: vi.fn(),
  worldToScreen: vi.fn(),
  translate: vi.fn(),
  toggleDrawing: vi.fn(),
};

function createMockConnectionManager(): ConnectionManager {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    cleanup: vi.fn(),
    onConnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
  } as unknown as ConnectionManager;
}

describe("CommandManager", async () => {
  const { CommandManager } = await import("@/core/commandManager");

  describe("constructor", () => {
    it("registers server listeners on creation", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      expect(cm.on).toHaveBeenCalledWith("room:sync", expect.any(Function));
      expect(cm.on).toHaveBeenCalledWith(
        "command:create",
        expect.any(Function),
      );
    });
  });

  describe("startCommand", () => {
    it("creates and emits a command when canDraw is true", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      manager.setCanDraw(true);

      const commandId = manager.startCommand("stroke", {
        nodeId: "n-1",
        points: [0, 0],
        color: "#000",
        strokeWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        opacity: 1,
      });

      expect(commandId).toBeDefined();
      expect(typeof commandId).toBe("string");
      expect(cm.emit).toHaveBeenCalledWith(
        "command:create",
        expect.objectContaining({ id: commandId }),
      );
    });

    it("returns undefined and warns when canDraw is false", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = manager.startCommand("stroke", {
        nodeId: "n-1",
        points: [0, 0],
        color: "#000",
        strokeWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        opacity: 1,
      });

      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("permission"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("undo / redo", () => {
    it("undo stack is populated after finalizeCommand", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      manager.setCanDraw(true);

      const cmdId = manager.startCommand("stroke", {
        nodeId: "n-1",
        points: [0, 0, 10, 10],
        color: "#000",
        strokeWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        opacity: 1,
      });

      expect(manager.getUndoStack()).toEqual([]);
      expect(manager.getRedoStack()).toEqual([]);
    });

    it("getLastSeq returns 0 when no commands have seq", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      expect(manager.getLastSeq()).toBe(0);
    });

    it("getOperation returns undefined for unknown id", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      expect(manager.getOperation("nonexistent")).toBeUndefined();
    });
  });

  describe("event emitter pattern", () => {
    it("registers and fires listeners", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      const handler = vi.fn();

      manager.on("command:create", handler);
      manager.emit("command:create");

      expect(handler).toHaveBeenCalled();
    });

    it("removes listeners via off", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      const handler = vi.fn();

      manager.on("command:create", handler);
      manager.off("command:create", handler);
      manager.emit("command:create");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("clears all internal state", () => {
      const cm = createMockConnectionManager();
      const manager = new CommandManager("user-1", "room-1", mockStageOps, cm);
      manager.setCanDraw(true);
      manager.startCommand("stroke", {
        nodeId: "n-1",
        points: [0, 0],
        color: "#000",
        strokeWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        opacity: 1,
      });

      manager.destroy();

      expect(manager.getUndoStack()).toEqual([]);
      expect(manager.getRedoStack()).toEqual([]);
      expect(manager.getLastSeq()).toBe(0);
    });
  });
});

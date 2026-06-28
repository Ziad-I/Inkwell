import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShapeKind } from "@/lib/constants";
import { ShapeCommand } from "@/commands/shapeCommand";
import type { StageOperations } from "@/types/common";

function mockNode(id: string) {
  return { id: vi.fn().mockReturnValue(id), setAttrs: vi.fn(), getLayer: vi.fn() };
}

const createNode: StageOperations["createNode"] = vi.fn(
  () => mockNode("n-1") as unknown as ReturnType<StageOperations["createNode"]>,
);

function createMockStageOps(): StageOperations {
  return {
    getNodeById: vi.fn(),
    createNode,
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
}

function makeShapeCmd(kind: ShapeKind, overrides?: Record<string, unknown>) {
  return {
    id: "sh-1",
    type: "shape" as const,
    payload: {
      nodeId: "n-1",
      kind,
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
      color: "#000",
      strokeWidth: 2,
      lineCap: "round" as CanvasLineCap,
      lineJoin: "round" as CanvasLineJoin,
      opacity: 1,
    },
    owner: "u1",
    status: "pending" as const,
    timestamp: 0,
    ...overrides,
  };
}

describe("ShapeCommand", () => {
  let stageOps: ReturnType<typeof createMockStageOps>;

  beforeEach(() => {
    stageOps = createMockStageOps();
  });

  describe("apply", () => {
    it.each([
      ["rectangle" as ShapeKind],
      ["circle" as ShapeKind],
      ["line" as ShapeKind],
      ["arrow" as ShapeKind],
    ])("creates and adds a %s node", (kind) => {
      const cmd = new ShapeCommand(makeShapeCmd(kind), stageOps);

      cmd.apply();

      expect(stageOps.createNode).toHaveBeenCalledTimes(1);
      expect(stageOps.addDrawingNode).toHaveBeenCalledTimes(1);
    });
  });

  describe("undo / redo / destroy", () => {
    it("undo removes node without destroying", () => {
      const cmd = new ShapeCommand(makeShapeCmd("rectangle"), stageOps);

      cmd.undo();

      expect(stageOps.removeNodeById).toHaveBeenCalledWith("n-1", false);
    });

    it("redo applies again", () => {
      const cmd = new ShapeCommand(makeShapeCmd("rectangle"), stageOps);

      cmd.redo();

      expect(stageOps.createNode).toHaveBeenCalledTimes(1);
      expect(stageOps.addDrawingNode).toHaveBeenCalledTimes(1);
    });

    it("destroy removes node with destroy flag", () => {
      const cmd = new ShapeCommand(makeShapeCmd("rectangle"), stageOps);

      cmd.destroy();

      expect(stageOps.removeNodeById).toHaveBeenCalledWith("n-1", true);
    });
  });

  describe("update", () => {
    it("updates payload and redraws", () => {
      stageOps.getNodeById = vi.fn().mockReturnValue(mockNode("n-1"));
      const cmd = new ShapeCommand(makeShapeCmd("rectangle"), stageOps);
      cmd.apply();

      cmd.update({ end: { x: 200, y: 200 } });

      expect(stageOps.redrawDrawingLayer).toHaveBeenCalled();
    });

    it("recreates node when kind changes", () => {
      stageOps.getNodeById = vi.fn().mockReturnValue(mockNode("n-1"));
      const cmd = new ShapeCommand(makeShapeCmd("rectangle"), stageOps);
      cmd.apply();

      cmd.update({ kind: "circle" });

      expect(stageOps.removeNode).toHaveBeenCalled();
    });
  });

  describe("finalize", () => {
    it("sets finalized flag", () => {
      const cmd = new ShapeCommand(makeShapeCmd("rectangle"), stageOps);

      expect(cmd.isFinalized).toBe(false);
      cmd.finalize();
      expect(cmd.isFinalized).toBe(true);
    });
  });

  describe("canFinalize", () => {
    it("returns true for rectangle with sufficient size", () => {
      const cmd = new ShapeCommand(makeShapeCmd("rectangle"), stageOps);
      expect(cmd.canFinalize()).toBe(true);
    });

    it("returns false for rectangle with zero width", () => {
      const cmd = new ShapeCommand(
        makeShapeCmd("rectangle", {
          payload: {
            nodeId: "n-1", kind: "rectangle",
            start: { x: 0, y: 0 }, end: { x: 0, y: 0 },
            color: "#000", strokeWidth: 2,
            lineCap: "round", lineJoin: "round", opacity: 1,
          },
        }),
        stageOps,
      );
      expect(cmd.canFinalize()).toBe(false);
    });

    it("returns true for circle with sufficient size", () => {
      const cmd = new ShapeCommand(makeShapeCmd("circle"), stageOps);
      expect(cmd.canFinalize()).toBe(true);
    });

    it("returns false for circle with zero size", () => {
      const cmd = new ShapeCommand(
        makeShapeCmd("circle", {
          payload: {
            nodeId: "n-1", kind: "circle",
            start: { x: 0, y: 0 }, end: { x: 0, y: 0 },
            color: "#000", strokeWidth: 2,
            lineCap: "round", lineJoin: "round", opacity: 1,
          },
        }),
        stageOps,
      );
      expect(cmd.canFinalize()).toBe(false);
    });

    it("returns true for line with sufficient length", () => {
      const cmd = new ShapeCommand(makeShapeCmd("line"), stageOps);
      expect(cmd.canFinalize()).toBe(true);
    });

    it("returns true for arrow with sufficient length", () => {
      const cmd = new ShapeCommand(makeShapeCmd("arrow"), stageOps);
      expect(cmd.canFinalize()).toBe(true);
    });
  });

  describe("serialize", () => {
    it.each([
      "rectangle" as ShapeKind,
      "circle" as ShapeKind,
      "line" as ShapeKind,
      "arrow" as ShapeKind,
    ])("serializes %s command data", (kind) => {
      const data = makeShapeCmd(kind);
      const cmd = new ShapeCommand(data, stageOps);

      const serialized = cmd.serialize();

      expect(serialized.type).toBe("shape");
      expect(serialized.payload.kind).toBe(kind);
    });
  });
});

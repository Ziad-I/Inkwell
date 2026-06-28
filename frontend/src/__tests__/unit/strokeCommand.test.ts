import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrokeCommand } from "@/commands/strokeCommand";
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

function makeStrokeCmd(overrides?: Record<string, unknown>) {
  return {
    id: "s-1",
    type: "stroke" as const,
    payload: {
      nodeId: "n-1",
      points: [0, 0, 10, 10, 20, 20],
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

describe("StrokeCommand", () => {
  let stageOps: ReturnType<typeof createMockStageOps>;

  beforeEach(() => {
    stageOps = createMockStageOps();
  });

  it("applies by creating and adding a line node", () => {
    const cmd = new StrokeCommand(makeStrokeCmd(), stageOps);

    cmd.apply();

    expect(stageOps.createNode).toHaveBeenCalledTimes(1);
    expect(stageOps.addDrawingNode).toHaveBeenCalledTimes(1);
  });

  it("undo removes node without destroying", () => {
    const cmd = new StrokeCommand(makeStrokeCmd(), stageOps);

    cmd.undo();

    expect(stageOps.removeNodeById).toHaveBeenCalledWith("n-1", false);
  });

  it("redo applies again", () => {
    const cmd = new StrokeCommand(makeStrokeCmd(), stageOps);

    cmd.redo();

    expect(stageOps.createNode).toHaveBeenCalledTimes(1);
    expect(stageOps.addDrawingNode).toHaveBeenCalledTimes(1);
  });

  it("destroy removes node with destroy flag", () => {
    const cmd = new StrokeCommand(makeStrokeCmd(), stageOps);

    cmd.destroy();

    expect(stageOps.removeNodeById).toHaveBeenCalledWith("n-1", true);
  });

  it("update merges payload and redraws", () => {
    stageOps.getNodeById = vi.fn().mockReturnValue(mockNode("n-1"));
    const cmd = new StrokeCommand(makeStrokeCmd(), stageOps);
    cmd.apply();

    cmd.update({ points: [0, 0, 100, 100] });

    expect(stageOps.redrawDrawingLayer).toHaveBeenCalled();
  });

  it("finalize sets finalized flag", () => {
    const cmd = new StrokeCommand(makeStrokeCmd(), stageOps);

    expect(cmd.isFinalized).toBe(false);
    cmd.finalize();
    expect(cmd.isFinalized).toBe(true);
  });

  it("canFinalize returns true when points.length >= 4", () => {
    const cmd = new StrokeCommand(makeStrokeCmd(), stageOps);
    expect(cmd.canFinalize()).toBe(true);
  });

  it("canFinalize returns false when points.length < 4", () => {
    const cmd = new StrokeCommand(
      makeStrokeCmd({ payload: { nodeId: "n-2", points: [0, 0], color: "#000", strokeWidth: 1, lineCap: "round", lineJoin: "round", opacity: 1 } }),
      stageOps,
    );
    expect(cmd.canFinalize()).toBe(false);
  });

  it("serializes command data", () => {
    const data = makeStrokeCmd();
    const cmd = new StrokeCommand(data, stageOps);

    const serialized = cmd.serialize();

    expect(serialized.type).toBe("stroke");
    expect(serialized.payload.points).toEqual([0, 0, 10, 10, 20, 20]);
  });
});

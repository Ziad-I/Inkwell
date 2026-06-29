import { describe, it, expect, vi, beforeEach } from "vitest";
import { EraseCommand } from "@/commands/eraseCommand";
import type { StageOperations } from "@/types/common";

const createNode: StageOperations["createNode"] = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <CTOR extends new (...args: any[]) => any>(
    Ctor: CTOR,
    ...args: ConstructorParameters<CTOR>
  ): InstanceType<CTOR> => {
    return new Ctor(...args) as InstanceType<CTOR>;
  },
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

describe("EraseCommand", () => {
  let stageOps: ReturnType<typeof createMockStageOps>;

  beforeEach(() => {
    stageOps = createMockStageOps();
  });

  it("removes nodes on apply", () => {
    const cmd = new EraseCommand(
      {
        id: "erase-1",
        type: "erase",
        payload: { erasedNodes: ["node-1", "node-2"] },
        owner: "u1",
        status: "pending",
        timestamp: Date.now(),
      },
      stageOps,
    );

    cmd.apply();

    expect(stageOps.removeNodeById).toHaveBeenCalledTimes(2);
    expect(stageOps.removeNodeById).toHaveBeenCalledWith("node-1", false);
    expect(stageOps.removeNodeById).toHaveBeenCalledWith("node-2", false);
  });

  it("canFinalize returns true when erasedNodes is non-empty", () => {
    const cmd = new EraseCommand(
      {
        id: "e1",
        type: "erase",
        payload: { erasedNodes: ["n1"] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    expect(cmd.canFinalize()).toBe(true);
  });

  it("canFinalize returns false when erasedNodes is empty", () => {
    const cmd = new EraseCommand(
      {
        id: "e1",
        type: "erase",
        payload: { erasedNodes: [] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    expect(cmd.canFinalize()).toBe(false);
  });

  it("sets finalized flag", () => {
    const cmd = new EraseCommand(
      {
        id: "e1",
        type: "erase",
        payload: { erasedNodes: ["n1"] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    expect(cmd.isFinalized).toBe(false);
    cmd.finalize();
    expect(cmd.isFinalized).toBe(true);
  });

  it("serializes with unique erasedNodes", () => {
    const cmd = new EraseCommand(
      {
        id: "e1",
        type: "erase",
        payload: { erasedNodes: ["n1", "n1"] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    const serialized = cmd.serialize();
    expect(serialized.payload.erasedNodes).toEqual(["n1"]);
  });

  it("undo restores nodes", () => {
    const cmd = new EraseCommand(
      {
        id: "e1",
        type: "erase",
        payload: { erasedNodes: ["n1"] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );

    stageOps.getNodeById = vi.fn().mockReturnValue({ id: "n1" });

    cmd.undo();

    expect(stageOps.addDrawingNode).toHaveBeenCalledWith({ id: "n1" });
  });
});

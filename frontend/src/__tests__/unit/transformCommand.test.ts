import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransformCommand } from "@/commands/transformCommand";
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

describe("TransformCommand", () => {
  let stageOps: ReturnType<typeof createMockStageOps>;

  beforeEach(() => {
    stageOps = createMockStageOps();
  });

  const nodeData = {
    nodeId: "node-1",
    before: {
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      offsetX: 0,
      offsetY: 0,
    },
    after: {
      width: 200,
      height: 200,
      x: 50,
      y: 50,
      scaleX: 2,
      scaleY: 2,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      offsetX: 0,
      offsetY: 0,
    },
  };

  it("applies after state on apply", () => {
    const mockNode = { setAttrs: vi.fn(), id: "node-1" };
    stageOps.getNodeById = vi.fn().mockReturnValue(mockNode);

    const cmd = new TransformCommand(
      {
        id: "t1",
        type: "transform",
        payload: { transforms: [nodeData] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );

    cmd.apply();

    expect(mockNode.setAttrs).toHaveBeenCalledWith(nodeData.after);
  });

  it("applies before state on undo", () => {
    const mockNode = { setAttrs: vi.fn(), id: "node-1" };
    stageOps.getNodeById = vi.fn().mockReturnValue(mockNode);

    const cmd = new TransformCommand(
      {
        id: "t1",
        type: "transform",
        payload: { transforms: [nodeData] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );

    cmd.undo();

    expect(mockNode.setAttrs).toHaveBeenCalledWith(nodeData.before);
  });

  it("canFinalize returns true with valid transforms", () => {
    const cmd = new TransformCommand(
      {
        id: "t1",
        type: "transform",
        payload: { transforms: [nodeData] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    expect(cmd.canFinalize()).toBe(true);
  });

  it("canFinalize returns false when transforms are empty", () => {
    const cmd = new TransformCommand(
      {
        id: "t1",
        type: "transform",
        payload: { transforms: [] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    expect(cmd.canFinalize()).toBe(false);
  });

  it("canFinalize returns false when after state is missing", () => {
    const cmd = new TransformCommand(
      {
        id: "t1",
        type: "transform",
        payload: {
          transforms: [{ nodeId: "n1", before: nodeData.before }],
        } as never,
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    expect(cmd.canFinalize()).toBe(false);
  });

  it("destroy is a no-op", () => {
    const cmd = new TransformCommand(
      {
        id: "t1",
        type: "transform",
        payload: { transforms: [nodeData] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    expect(() => cmd.destroy()).not.toThrow();
  });

  it("serializes command data", () => {
    const cmd = new TransformCommand(
      {
        id: "t1",
        type: "transform",
        payload: { transforms: [nodeData] },
        owner: "u1",
        status: "pending",
        timestamp: 0,
      },
      stageOps,
    );
    const serialized = cmd.serialize();
    expect(serialized.type).toBe("transform");
    expect(serialized.payload.transforms).toHaveLength(1);
  });
});

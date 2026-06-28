import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandFactory } from "@/core/commandFactory";
import { StrokeCommand } from "@/commands/strokeCommand";
import { ShapeCommand } from "@/commands/shapeCommand";
import { EraseCommand } from "@/commands/eraseCommand";
import { TransformCommand } from "@/commands/transformCommand";

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "mock-id-001"),
}));

describe("CommandFactory", () => {
  let factory: CommandFactory;

  beforeEach(() => {
    factory = new CommandFactory();
  });

  describe("createCommand", () => {
    it("creates a stroke command", () => {
      const cmd = factory.createCommand(
        "stroke",
        {
          nodeId: "node-1",
          points: [0, 0, 10, 10],
          color: "#000",
          strokeWidth: 2,
          lineCap: "round",
          lineJoin: "round",
          opacity: 1,
        },
        "user-1",
      );

      expect(cmd.type).toBe("stroke");
      expect(cmd.owner).toBe("user-1");
      expect(cmd.status).toBe("pending");
      expect(cmd.id).toBe("mock-id-001");
      expect(cmd.payload).toHaveProperty("points");
    });

    it("creates a shape command", () => {
      const cmd = factory.createCommand(
        "shape",
        {
          nodeId: "node-2",
          kind: "rectangle",
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
          color: "#000",
          strokeWidth: 2,
          lineCap: "round",
          lineJoin: "round",
          opacity: 1,
        },
        "user-1",
      );

      expect(cmd.type).toBe("shape");
      expect(cmd.payload.kind).toBe("rectangle");
    });

    it("creates an erase command", () => {
      const cmd = factory.createCommand(
        "erase",
        {
          erasedNodes: ["node-1"],
        },
        "user-1",
      );

      expect(cmd.type).toBe("erase");
      expect(cmd.payload.erasedNodes).toEqual(["node-1"]);
    });

    it("creates a transform command", () => {
      const cmd = factory.createCommand(
        "transform",
        {
          transforms: [],
        },
        "user-1",
      );

      expect(cmd.type).toBe("transform");
      expect(cmd.payload.transforms).toEqual([]);
    });

    it("accepts custom status and timestamp", () => {
      const ts = 1234567890;
      const cmd = factory.createCommand(
        "stroke",
        {
          nodeId: "n",
          points: [0],
          color: "#000",
          strokeWidth: 1,
          lineCap: "round",
          lineJoin: "round",
          opacity: 1,
        },
        "u1",
        "applied",
        ts,
      );

      expect(cmd.status).toBe("applied");
      expect(cmd.timestamp).toBe(ts);
    });
  });

  describe("createInstance", () => {
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

    it("creates a StrokeCommand for stroke type", () => {
      const cmd = factory.createCommand(
        "stroke",
        {
          nodeId: "n",
          points: [0],
          color: "#000",
          strokeWidth: 1,
          lineCap: "round",
          lineJoin: "round",
          opacity: 1,
        },
        "u1",
      );
      const instance = factory.createInstance(cmd, mockStageOps);
      expect(instance).toBeInstanceOf(StrokeCommand);
    });

    it("creates a ShapeCommand for shape type", () => {
      const cmd = factory.createCommand(
        "shape",
        {
          nodeId: "n",
          kind: "rectangle",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
          color: "#000",
          strokeWidth: 1,
          lineCap: "round",
          lineJoin: "round",
          opacity: 1,
        },
        "u1",
      );
      const instance = factory.createInstance(cmd, mockStageOps);
      expect(instance).toBeInstanceOf(ShapeCommand);
    });

    it("creates an EraseCommand for erase type", () => {
      const cmd = factory.createCommand("erase", { erasedNodes: [] }, "u1");
      const instance = factory.createInstance(cmd, mockStageOps);
      expect(instance).toBeInstanceOf(EraseCommand);
    });

    it("creates a TransformCommand for transform type", () => {
      const cmd = factory.createCommand("transform", { transforms: [] }, "u1");
      const instance = factory.createInstance(cmd, mockStageOps);
      expect(instance).toBeInstanceOf(TransformCommand);
    });

    it("throws for unknown command type", () => {
      expect(() =>
        factory.createInstance({ type: "unknown" } as never, mockStageOps),
      ).toThrow("Unknown operation type");
    });
  });
});

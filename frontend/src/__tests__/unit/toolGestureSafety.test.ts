import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CommandManager } from "@/core/commandManager";
import type { StageOperations } from "@/types/common";
import type { CommandID } from "@/types/command";
import { BrushTool } from "@/tools/brushTool";
import { ShapesTool } from "@/tools/shapesTool";
import { EraserTool } from "@/tools/eraserTool";
import { SelectionTool } from "@/tools/selectionTool";

// ---------------------------------------------------------------------------
// Konva double with a recording Transformer/Rect for the selection tool
// ---------------------------------------------------------------------------

const konvaState = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class RecordingTransformer {
    handlers = new Map<string, Handler[]>();
    private _nodes: unknown[] = [];

    on(event: string, handler: Handler): this {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
      return this;
    }

    off(): this {
      return this;
    }

    nodes(next?: unknown[]): unknown[] {
      if (next !== undefined) {
        this._nodes = next;
      }
      return this._nodes;
    }

    id(): string {
      return "transformer-1";
    }
  }

  class RecordingRect {
    attrs: Record<string, unknown>;
    constructor(attrs: Record<string, unknown>) {
      this.attrs = attrs;
    }
  }

  const transformers: RecordingTransformer[] = [];
  const rects: RecordingRect[] = [];

  return { RecordingTransformer, RecordingRect, transformers, rects };
});

vi.mock("konva", () => {
  const Transformer = class extends konvaState.RecordingTransformer {
    constructor(...args: unknown[]) {
      super();
      void args;
      konvaState.transformers.push(this);
    }
  };
  const Rect = class extends konvaState.RecordingRect {
    constructor(...args: unknown[]) {
      super((args[0] ?? {}) as Record<string, unknown>);
      konvaState.rects.push(this);
    }
  };
  const konva = {
    Transformer,
    Rect,
    Line: class {},
    Util: { haveIntersection: () => true },
  };
  return { default: konva, ...konva };
});

function fireTransformerEvent(
  transformer: InstanceType<typeof konvaState.RecordingTransformer>,
  event: string,
): void {
  for (const handler of transformer.handlers.get(event) ?? []) {
    handler();
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function createCommands(startId: CommandID | null = "cmd-1") {
  return {
    startCommand: vi.fn((): CommandID | null => startId),
    updateCommand: vi.fn(),
    finalizeCommand: vi.fn(),
    cancelCommand: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

type CommandsMock = ReturnType<typeof createCommands>;

function createHarness(commands: CommandsMock) {
  const pointer: { current: { x: number; y: number } | null } = {
    current: { x: 10, y: 10 },
  };
  const erasableShape = {
    id: vi.fn(() => "node-9"),
    getAttr: vi.fn(() => true),
  };
  const layer = {
    getIntersection: vi.fn(() => erasableShape),
    find: vi.fn(() => [] as unknown[]),
  };
  const stage = {
    getPointerPosition: vi.fn(() => pointer.current),
    id: vi.fn(() => "stage-1"),
  };
  const stageOps = {
    getStage: vi.fn(() => stage),
    getDrawingLayer: vi.fn(() => layer),
    getOverlayLayer: vi.fn(() => layer),
    addDrawingNode: vi.fn(),
    addOverlayNode: vi.fn(),
    removeNode: vi.fn(),
    removeNodeById: vi.fn(),
    getNodeById: vi.fn(() => null),
    redrawDrawingLayer: vi.fn(),
    redrawOverlayLayer: vi.fn(),
    screenToWorld: vi.fn((x: number, y: number) => ({ x, y })),
    worldToScreen: vi.fn((x: number, y: number) => ({ x, y })),
    getScale: vi.fn(() => 1),
    createNode: vi.fn(),
  };

  return {
    ctx: {
      stageOps: stageOps as unknown as StageOperations,
      commandManager: commands as unknown as CommandManager,
    },
    pointer,
    stageOps,
    layer,
    stage,
  };
}

const evt = () => ({}) as never;

beforeEach(() => {
  konvaState.transformers.length = 0;
  konvaState.rects.length = 0;
});

// ---------------------------------------------------------------------------
// Brush
// ---------------------------------------------------------------------------

describe("BrushTool gesture safety", () => {
  it("issues no manager calls and leaves no gesture after a denied start", () => {
    const commands = createCommands(null);
    const { ctx, pointer } = createHarness(commands);
    const brush = new BrushTool(ctx);

    brush.onPointerDown(evt());
    pointer.current = { x: 40, y: 40 };
    brush.onPointerMove(evt());
    brush.onPointerUp(evt());
    brush.onDeactivate();

    expect(commands.startCommand).toHaveBeenCalledTimes(1);
    expect(commands.updateCommand).not.toHaveBeenCalled();
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
    expect(commands.cancelCommand).not.toHaveBeenCalled();
  });

  it("cancelGesture cancels a pending stroke without finalizing and is idempotent", () => {
    const commands = createCommands("cmd-1");
    const { ctx, pointer } = createHarness(commands);
    const brush = new BrushTool(ctx);

    brush.onPointerDown(evt());
    pointer.current = { x: 42, y: 42 };
    brush.onPointerMove(evt());
    expect(commands.updateCommand).toHaveBeenCalledTimes(1);

    brush.cancelGesture();
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();

    brush.cancelGesture();
    expect(commands.cancelCommand).toHaveBeenCalledTimes(1);

    // Late pointer events after cancellation issue no further calls.
    brush.onPointerMove(evt());
    brush.onPointerUp(evt());
    expect(commands.updateCommand).toHaveBeenCalledTimes(1);
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
  });

  it("onDeactivate cancels a pending stroke without finalizing it", () => {
    const commands = createCommands("cmd-1");
    const { ctx } = createHarness(commands);
    const brush = new BrushTool(ctx);

    brush.onPointerDown(evt());
    brush.onDeactivate();

    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
  });

  it("finalizes a completed stroke on pointer-up", () => {
    const commands = createCommands("cmd-1");
    const { ctx, pointer } = createHarness(commands);
    const brush = new BrushTool(ctx);

    brush.onPointerDown(evt());
    pointer.current = { x: 60, y: 60 };
    brush.onPointerMove(evt());
    brush.onPointerUp(evt());

    expect(commands.finalizeCommand).toHaveBeenCalledWith("cmd-1");
  });
});

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

describe("ShapesTool gesture safety", () => {
  it("issues no manager calls and leaves no gesture after a denied start", () => {
    const commands = createCommands(null);
    const { ctx, pointer } = createHarness(commands);
    const shapes = new ShapesTool(ctx);

    shapes.onPointerDown(evt());
    pointer.current = { x: 40, y: 40 };
    shapes.onPointerMove(evt());
    shapes.onPointerUp(evt());
    shapes.onDeactivate();

    expect(commands.startCommand).toHaveBeenCalledTimes(1);
    expect(commands.updateCommand).not.toHaveBeenCalled();
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
    expect(commands.cancelCommand).not.toHaveBeenCalled();
  });

  it("cancelGesture cancels a pending shape without finalizing and is idempotent", () => {
    const commands = createCommands("cmd-1");
    const { ctx, pointer } = createHarness(commands);
    const shapes = new ShapesTool(ctx);

    shapes.onPointerDown(evt());
    pointer.current = { x: 30, y: 30 };
    shapes.onPointerMove(evt());

    shapes.cancelGesture();
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();

    shapes.cancelGesture();
    expect(commands.cancelCommand).toHaveBeenCalledTimes(1);

    shapes.onPointerUp(evt());
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
  });

  it("finalizes a shape with sufficient size on pointer-up", () => {
    const commands = createCommands("cmd-1");
    const { ctx, pointer } = createHarness(commands);
    const shapes = new ShapesTool(ctx);

    shapes.onPointerDown(evt());
    pointer.current = { x: 70, y: 70 };
    shapes.onPointerMove(evt());
    shapes.onPointerUp(evt());

    expect(commands.finalizeCommand).toHaveBeenCalledWith("cmd-1");
  });
});

// ---------------------------------------------------------------------------
// Eraser
// ---------------------------------------------------------------------------

describe("EraserTool gesture safety", () => {
  it("performs no erase work and issues no manager calls after a denied start", () => {
    const commands = createCommands(null);
    const harness = createHarness(commands);
    const eraser = new EraserTool(harness.ctx);

    eraser.onPointerDown(evt());

    expect(commands.startCommand).toHaveBeenCalledTimes(1);
    expect(commands.updateCommand).not.toHaveBeenCalled();
    expect(harness.stageOps.redrawDrawingLayer).not.toHaveBeenCalled();

    // Pointer-move after the denied start stays inert.
    eraser.onPointerMove(evt());
    eraser.onPointerUp(evt());
    eraser.onDeactivate();

    expect(commands.updateCommand).not.toHaveBeenCalled();
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
    expect(commands.cancelCommand).not.toHaveBeenCalled();
  });

  it("cancelGesture cancels a pending erase without finalizing and is idempotent", () => {
    const commands = createCommands("cmd-1");
    const { ctx } = createHarness(commands);
    const eraser = new EraserTool(ctx);

    eraser.onPointerDown(evt());
    expect(commands.updateCommand).toHaveBeenCalledWith("cmd-1", {
      erasedNodes: ["node-9"],
    });

    eraser.cancelGesture();
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();

    eraser.cancelGesture();
    expect(commands.cancelCommand).toHaveBeenCalledTimes(1);

    eraser.onPointerUp(evt());
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
  });

  it("finalizes an erase that removed nodes", () => {
    const commands = createCommands("cmd-1");
    const { ctx } = createHarness(commands);
    const eraser = new EraserTool(ctx);

    eraser.onPointerDown(evt());
    eraser.onPointerUp(evt());

    expect(commands.finalizeCommand).toHaveBeenCalledWith("cmd-1");
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

describe("SelectionTool gesture safety", () => {
  it("cancelGesture destroys overlay nodes and cancels a pending transform without finalizing", () => {
    const commands = createCommands("cmd-1");
    const harness = createHarness(commands);
    const selection = new SelectionTool(harness.ctx);

    selection.onActivate();
    const transformer = konvaState.transformers.at(-1)!;
    expect(harness.stageOps.addDrawingNode).toHaveBeenCalledWith(transformer);

    // A rubber-band selection box is on the overlay layer...
    selection.onPointerDown({ target: harness.stage } as never);
    const selectionBox = konvaState.rects.at(-1)!;
    expect(harness.stageOps.addOverlayNode).toHaveBeenCalledWith(selectionBox);

    // ...and a transform command was started by the transformer.
    fireTransformerEvent(transformer, "transformstart dragstart");
    expect(commands.startCommand).toHaveBeenCalledWith(
      "transform",
      expect.anything(),
    );

    selection.cancelGesture();

    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
    expect(harness.stageOps.removeNode).toHaveBeenCalledWith(
      selectionBox,
      true,
    );
    expect(harness.stageOps.removeNode).toHaveBeenCalledWith(transformer, true);

    // Idempotent: a second cancel is a no-op.
    selection.cancelGesture();
    expect(commands.cancelCommand).toHaveBeenCalledTimes(1);
  });

  it("onDeactivate cancels a pending transform instead of finalizing it", () => {
    const commands = createCommands("cmd-1");
    const harness = createHarness(commands);
    const selection = new SelectionTool(harness.ctx);

    selection.onActivate();
    const transformer = konvaState.transformers.at(-1)!;
    fireTransformerEvent(transformer, "transformstart dragstart");

    selection.onDeactivate();

    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
    expect(harness.stageOps.removeNode).toHaveBeenCalledWith(transformer, true);
  });

  it("a denied transform start leaves no pending command state", () => {
    const commands = createCommands(null);
    const harness = createHarness(commands);
    const selection = new SelectionTool(harness.ctx);

    selection.onActivate();
    const transformer = konvaState.transformers.at(-1)!;

    fireTransformerEvent(transformer, "transformstart dragstart");
    fireTransformerEvent(transformer, "transformend dragend");
    selection.onDeactivate();

    expect(commands.updateCommand).not.toHaveBeenCalled();
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
    expect(commands.cancelCommand).not.toHaveBeenCalled();
  });

  it("still commits a completed transform through pointer-up", () => {
    const commands = createCommands("cmd-1");
    const harness = createHarness(commands);
    const selection = new SelectionTool(harness.ctx);

    selection.onActivate();
    const transformer = konvaState.transformers.at(-1)!;
    fireTransformerEvent(transformer, "transformstart dragstart");
    fireTransformerEvent(transformer, "transformend dragend");

    // Pointer-up on the empty stage commits via clearSelection.
    selection.onPointerUp({ target: harness.stage } as never);

    expect(commands.finalizeCommand).toHaveBeenCalledWith("cmd-1");
  });
});

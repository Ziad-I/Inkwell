import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandManager } from "@/core/commandManager";
import type { MutationCapability } from "@/types/operations";
import { BoardDocument } from "@/collaboration/boardDocument";
import { OperationJournal } from "@/collaboration/operationJournal";
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
    updateCommand: vi.fn((): boolean => true),
    finalizeCommand: vi.fn((): boolean => true),
    cancelCommand: vi.fn((): boolean => true),
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
    createNode: vi.fn(
      (_Ctor: unknown, config: { id?: string } | undefined) => ({
        id: vi.fn(() => config?.id ?? "node-anon"),
        setAttrs: vi.fn(),
      }),
    ),
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

  it("treats a false update result on pointer-move as a gesture reset", () => {
    const commands = createCommands("cmd-1");
    commands.updateCommand.mockReturnValue(false);
    const { ctx, pointer } = createHarness(commands);
    const brush = new BrushTool(ctx);

    brush.onPointerDown(evt());
    pointer.current = { x: 42, y: 42 };
    brush.onPointerMove(evt());

    // The manager could not apply the update (e.g. the server rejected the
    // preview): the gesture resets and cancels the stale command.
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();

    // Later pointer events stay inert.
    pointer.current = { x: 70, y: 70 };
    brush.onPointerMove(evt());
    brush.onPointerUp(evt());
    expect(commands.updateCommand).toHaveBeenCalledTimes(1);
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
  });

  it("treats a false finalize result on pointer-up as a gesture reset", () => {
    const commands = createCommands("cmd-1");
    commands.finalizeCommand.mockReturnValue(false);
    const { ctx, pointer } = createHarness(commands);
    const brush = new BrushTool(ctx);

    brush.onPointerDown(evt());
    pointer.current = { x: 60, y: 60 };
    brush.onPointerMove(evt());
    brush.onPointerUp(evt());

    expect(commands.finalizeCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
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

  it("treats a false update result on pointer-move as a gesture reset", () => {
    const commands = createCommands("cmd-1");
    commands.updateCommand.mockReturnValue(false);
    const { ctx, pointer } = createHarness(commands);
    const shapes = new ShapesTool(ctx);

    shapes.onPointerDown(evt());
    pointer.current = { x: 30, y: 30 };
    shapes.onPointerMove(evt());

    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.finalizeCommand).not.toHaveBeenCalled();

    // Later pointer events stay inert.
    pointer.current = { x: 70, y: 70 };
    shapes.onPointerMove(evt());
    shapes.onPointerUp(evt());
    expect(commands.updateCommand).toHaveBeenCalledTimes(1);
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
  });

  it("treats a false finalize result on pointer-up as a gesture reset", () => {
    const commands = createCommands("cmd-1");
    commands.finalizeCommand.mockReturnValue(false);
    const { ctx, pointer } = createHarness(commands);
    const shapes = new ShapesTool(ctx);

    shapes.onPointerDown(evt());
    pointer.current = { x: 70, y: 70 };
    shapes.onPointerMove(evt());
    shapes.onPointerUp(evt());

    expect(commands.finalizeCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
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

  it("treats a false update result on pointer-move as a gesture reset", () => {
    const commands = createCommands("cmd-1");
    commands.updateCommand.mockReturnValue(false);
    const harness = createHarness(commands);
    const eraser = new EraserTool(harness.ctx);

    eraser.onPointerDown(evt());
    expect(commands.updateCommand).toHaveBeenCalledTimes(1);

    // The manager could not apply the erase update: the gesture resets
    // and cancels the stale command.
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");

    // Later pointer events stay inert.
    harness.pointer.current = { x: 40, y: 40 };
    eraser.onPointerMove(evt());
    eraser.onPointerUp(evt());
    expect(commands.updateCommand).toHaveBeenCalledTimes(1);
    expect(commands.finalizeCommand).not.toHaveBeenCalled();
  });

  it("treats a false finalize result on pointer-up as a gesture reset", () => {
    const commands = createCommands("cmd-1");
    commands.finalizeCommand.mockReturnValue(false);
    const { ctx } = createHarness(commands);
    const eraser = new EraserTool(ctx);

    eraser.onPointerDown(evt());
    eraser.onPointerUp(evt());

    expect(commands.finalizeCommand).toHaveBeenCalledWith("cmd-1");
    expect(commands.cancelCommand).toHaveBeenCalledWith("cmd-1");
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

// ---------------------------------------------------------------------------
// Rejected-preview recovery against a REAL CommandManager
// ---------------------------------------------------------------------------

describe("rejected preview recovery (real CommandManager)", () => {
  function realManagerHarness() {
    const harness = createHarness({
      startCommand: vi.fn(),
      updateCommand: vi.fn(),
      finalizeCommand: vi.fn(),
      cancelCommand: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    });
    const capability: MutationCapability = {
      epoch: "gen-1",
      ready: true,
      canDraw: true,
    };
    const connection = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      cleanup: vi.fn(),
      onConnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      setAuth: vi.fn(),
      subscribeLifecycle: vi.fn(() => () => {}),
      emitVolatile: vi.fn(),
      emit: vi.fn(),
      onValidated: vi.fn(() => () => {}),
      emitWithAck: vi.fn(() => new Promise<never>(() => {})),
    };

    const manager = new CommandManager({
      epoch: "gen-1",
      userId: "user-1",
      stageOps: harness.ctx.stageOps,
      connection: connection as never,
      document: new BoardDocument(),
      journal: new OperationJournal(),
      getCapability: () => capability,
      requestReconciliation: vi.fn(),
      notifyCommandFailure: vi.fn(),
    });

    const createdCommandId = (): CommandID => {
      const creation = connection.emit.mock.calls.find(
        (call) => call[0] === "command:create",
      );
      if (!creation) throw new Error("no command:create emission recorded");
      return (creation[1] as { id: CommandID }).id;
    };

    return {
      manager,
      connection,
      pointer: harness.pointer,
      ctx: {
        stageOps: harness.ctx.stageOps,
        commandManager: manager,
      },
      createdCommandId,
    };
  }

  it("a rejected preview no longer breaks the tool gesture path", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manager, connection, pointer, ctx, createdCommandId } =
      realManagerHarness();
    const brush = new BrushTool(ctx);

    // Start a stroke through the tool, exactly like a real gesture.
    brush.onPointerDown(evt());
    pointer.current = { x: 42, y: 42 };
    expect(() => brush.onPointerMove(evt())).not.toThrow();
    const commandId = createdCommandId();
    expect(manager.getOperation(commandId)).toBeDefined();

    // The server rejects the un-finalized preview.
    const emissionsBeforeRejection = connection.emit.mock.calls.filter(
      (call) => call[0] !== "command:create",
    ).length;
    manager.handleRejection(commandId, "INVALID_COMMAND");
    expect(manager.getOperation(commandId)).toBeUndefined();

    // The tool still holds the stale command ID: pointer events and
    // gesture cancellation must complete without throwing.
    pointer.current = { x: 80, y: 80 };
    expect(() => brush.onPointerMove(evt())).not.toThrow();
    expect(() => brush.onPointerUp(evt())).not.toThrow();
    expect(() => brush.cancelGesture()).not.toThrow();

    // No further emissions reference the rejected command.
    const emissionsAfterRejection = connection.emit.mock.calls.filter(
      (call) => call[0] !== "command:create",
    ).length;
    expect(emissionsAfterRejection).toBe(emissionsBeforeRejection);
    warnSpy.mockRestore();
  });

  it("a shapes tool gesture survives a rejected preview", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manager, pointer, ctx, createdCommandId } = realManagerHarness();
    const shapes = new ShapesTool(ctx);

    shapes.onPointerDown(evt());
    pointer.current = { x: 42, y: 42 };
    shapes.onPointerMove(evt());
    manager.handleRejection(createdCommandId(), "INVALID_COMMAND");

    pointer.current = { x: 80, y: 80 };
    expect(() => shapes.onPointerMove(evt())).not.toThrow();
    expect(() => shapes.onPointerUp(evt())).not.toThrow();
    expect(() => shapes.cancelGesture()).not.toThrow();
    warnSpy.mockRestore();
  });

  it("an eraser gesture survives a rejected preview", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manager, ctx, createdCommandId } = realManagerHarness();
    const eraser = new EraserTool(ctx);

    eraser.onPointerDown(evt());
    manager.handleRejection(createdCommandId(), "INVALID_COMMAND");

    expect(() => eraser.onPointerMove(evt())).not.toThrow();
    expect(() => eraser.onPointerUp(evt())).not.toThrow();
    expect(() => eraser.cancelGesture()).not.toThrow();
    warnSpy.mockRestore();
  });
});

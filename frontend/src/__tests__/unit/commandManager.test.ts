import { describe, it, expect, vi, afterEach } from "vitest";
import { BoardDocument } from "@/collaboration/boardDocument";
import { OperationJournal } from "@/collaboration/operationJournal";
import { AckError } from "@/core/connectionManager";
import type { ConnectionManager } from "@/core/connectionManager";
import { CommandManager } from "@/core/commandManager";
import type { DurableTransition } from "@/types/transitions";
import type { MutationCapability } from "@/types/operations";
import type {
  Command,
  CommandID,
  CommandStatus,
  StrokePayload,
} from "@/types/command";
import type { StageOperations } from "@/types/common";
import { createMockStageOps } from "@/__tests__/util/mockStageOps";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const EPOCH = "epoch-1";
const REJECTION_MESSAGE =
  "Your board change was rejected and has been reverted.";

type SpyFn = ReturnType<typeof vi.fn>;

type ConnectionSpy = ConnectionManager & {
  emit: SpyFn;
  emitWithAck: SpyFn;
  onValidated: SpyFn;
};

type PreviewEntry = {
  handler: (...args: unknown[]) => void;
  onProtocolError: (error: unknown) => void;
};

interface Harness {
  manager: CommandManager;
  connection: ConnectionSpy;
  document: BoardDocument;
  journal: OperationJournal;
  stageOps: StageOperations;
  reconcile: SpyFn;
  notify: SpyFn;
  setCapability: (partial: Partial<MutationCapability>) => void;
  previewHandler: (event: string) => (...args: unknown[]) => void;
  previewProtocolError: (event: string) => void;
  resolveAck: (seq: number) => Promise<void>;
  rejectAck: (error: unknown) => Promise<void>;
}

const activeHarnesses: Harness[] = [];

function mockKonvaNode(id: string | undefined): unknown {
  return {
    id: vi.fn(() => id ?? "mock-node"),
    setAttrs: vi.fn(),
    getLayer: vi.fn(),
    getParent: vi.fn(),
    destroy: vi.fn(),
    remove: vi.fn(),
  };
}

function readyHarness(
  capabilityOverrides: Partial<MutationCapability> = {},
): Harness {
  const stageOps = createMockStageOps({
    createNode: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <CTOR extends new (...args: any[]) => any>(
        _Ctor: CTOR,
        ...args: ConstructorParameters<CTOR>
      ): InstanceType<CTOR> =>
        mockKonvaNode(
          (args[0] as { id?: string } | undefined)?.id,
        ) as unknown as InstanceType<CTOR>,
    ),
  });
  const document = new BoardDocument();
  const journal = new OperationJournal();
  const reconcile = vi.fn();
  const notify = vi.fn();
  const capability: MutationCapability = {
    epoch: EPOCH,
    ready: true,
    canDraw: true,
    ...capabilityOverrides,
  };
  const previewListeners = new Map<string, PreviewEntry>();
  const pendingAcks: Array<{
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

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
    onValidated: vi.fn(
      (
        event: string,
        _schemaName: string,
        _schema: unknown,
        handler: (...args: unknown[]) => void,
        onProtocolError: (error: unknown) => void,
      ) => {
        previewListeners.set(event, { handler, onProtocolError });
        return () => previewListeners.delete(event);
      },
    ),
    emitWithAck: vi.fn(
      (_event: string, _payload: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          pendingAcks.push({ resolve, reject });
        }),
    ),
  } as unknown as ConnectionSpy;

  const manager = new CommandManager({
    epoch: EPOCH,
    userId: USER_ID,
    stageOps,
    connection,
    document,
    journal,
    getCapability: () => capability,
    requestReconciliation: reconcile,
    notifyCommandFailure: notify,
  });

  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  const harness: Harness = {
    manager,
    connection,
    document,
    journal,
    stageOps,
    reconcile,
    notify,
    setCapability: (partial) => Object.assign(capability, partial),
    previewHandler: (event) => {
      const entry = previewListeners.get(event);
      if (!entry) throw new Error(`no listener registered for "${event}"`);
      return entry.handler;
    },
    previewProtocolError: (event) => {
      const entry = previewListeners.get(event);
      if (!entry) throw new Error(`no listener registered for "${event}"`);
      entry.onProtocolError(new Error("invalid payload"));
    },
    resolveAck: async (seq) => {
      const ack = pendingAcks.shift();
      if (!ack) throw new Error("no pending acknowledgement");
      ack.resolve({ seq });
      await flush();
    },
    rejectAck: async (error) => {
      const ack = pendingAcks.shift();
      if (!ack) throw new Error("no pending acknowledgement");
      ack.reject(error);
      await flush();
    },
  };

  activeHarnesses.push(harness);
  return harness;
}

afterEach(() => {
  for (const harness of activeHarnesses.splice(0)) {
    harness.manager.destroy();
  }
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

function strokePayload(nodeId: string): StrokePayload {
  return {
    nodeId,
    points: [0, 0, 10, 10],
    color: "#3366ff",
    strokeWidth: 2,
    lineCap: "round",
    lineJoin: "round",
    opacity: 1,
  };
}

function validLocalStroke(
  manager: CommandManager,
  nodeId = "node-local",
): CommandID {
  const id = manager.startCommand("stroke", strokePayload(nodeId));
  if (id === null) throw new Error("startCommand was denied");
  return id;
}

function remoteStroke(
  id: string,
  overrides: {
    owner?: string;
    status?: CommandStatus;
    seq?: number;
    payload?: StrokePayload;
  } = {},
): Command {
  const command: Command = {
    id,
    type: "stroke",
    owner: overrides.owner ?? OTHER_USER_ID,
    status: overrides.status ?? "applied",
    timestamp: 1_000,
    payload: overrides.payload ?? strokePayload(`node-${id}`),
  };
  if (overrides.seq !== undefined) command.seq = overrides.seq;
  return command;
}

function finalizeTransition(
  id: string,
  seq: number,
  owner = OTHER_USER_ID,
): DurableTransition {
  return {
    kind: "finalize",
    commandId: id,
    command: remoteStroke(id, { seq, owner }),
    seq,
  };
}

function events(connection: ConnectionSpy, event: string): unknown[][] {
  return [
    ...connection.emit.mock.calls.filter((call) => call[0] === event),
    ...connection.emitWithAck.mock.calls.filter((call) => call[0] === event),
  ];
}

function createdNodeIds(stageOps: StageOperations): (string | undefined)[] {
  return vi
    .mocked(stageOps.createNode)
    .mock.calls.map((call) => (call[1] as { id?: string }).id);
}

function removeNodeByIdCalls(
  stageOps: StageOperations,
  nodeId: string,
): unknown[][] {
  return vi
    .mocked(stageOps.removeNodeById)
    .mock.calls.filter((call) => call[0] === nodeId);
}

describe("CommandManager", () => {
  describe("construction", () => {
    it("registers validated remote preview listeners", () => {
      const h = readyHarness();
      const registered = h.connection.onValidated.mock.calls.map(
        (call) => call[0],
      );
      expect(registered).toContain("command:create");
      expect(registered).toContain("command:update");
      expect(registered).toContain("command:cancel");
    });
  });

  describe("capability gate", () => {
    it("creates and emits a command when ready and permitted", () => {
      const h = readyHarness();
      const commandId = validLocalStroke(h.manager);
      expect(commandId).toBeDefined();
      expect(events(h.connection, "command:create")).toHaveLength(1);
      expect(events(h.connection, "command:create")[0][1]).toMatchObject({
        id: commandId,
      });
    });

    it("returns null from startCommand when not ready", () => {
      const h = readyHarness({ ready: false });
      expect(h.manager.startCommand("stroke", strokePayload("n-1"))).toBeNull();
      expect(events(h.connection, "command:create")).toHaveLength(0);
    });

    it("returns null from startCommand when drawing is not permitted", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const h = readyHarness({ canDraw: false });
      expect(h.manager.startCommand("stroke", strokePayload("n-1"))).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("permission"),
      );
      warnSpy.mockRestore();
    });

    it("returns null from startCommand for a stale epoch", () => {
      const h = readyHarness();
      h.setCapability({ epoch: "epoch-2" });
      expect(h.manager.startCommand("stroke", strokePayload("n-1"))).toBeNull();
      expect(events(h.connection, "command:create")).toHaveLength(0);
    });

    it("blocks updateCommand outside readiness", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.setCapability({ ready: false });
      h.manager.updateCommand(id, { points: [0, 0, 5, 5] });
      expect(events(h.connection, "command:update")).toHaveLength(0);
    });

    it("blocks finalizeCommand outside readiness", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.setCapability({ ready: false });
      h.manager.finalizeCommand(id);
      expect(events(h.connection, "command:finalize")).toHaveLength(0);
      expect(h.manager.getUndoStack()).toEqual([]);
    });

    it("rolls back a pending preview when capability is lost but suppresses the cancel emission", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-lost");
      h.setCapability({ canDraw: false });
      h.manager.cancelCommand(id);
      expect(events(h.connection, "command:cancel")).toHaveLength(0);
      expect(h.manager.getOperation(id)).toBeUndefined();
    });

    it("blocks undo outside readiness", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);
      const undoListener = vi.fn();
      h.manager.on("command:undo", undoListener);
      h.setCapability({ ready: false });
      h.manager.undo();
      expect(events(h.connection, "command:undo")).toHaveLength(0);
      expect(undoListener).not.toHaveBeenCalled();
      expect(h.manager.getUndoStack()).toEqual([id]);
    });

    it("blocks redo outside readiness", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);
      h.manager.undo();
      await h.resolveAck(2);
      h.setCapability({ ready: false });
      h.manager.redo();
      expect(events(h.connection, "command:redo")).toHaveLength(0);
      expect(h.manager.getRedoStack()).toEqual([id]);
    });

    it("blocks every mutation after destroy", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.destroy();
      expect(h.manager.startCommand("stroke", strokePayload("n-2"))).toBeNull();
      h.manager.updateCommand(id, { points: [0, 0, 5, 5] });
      h.manager.finalizeCommand(id);
      h.manager.cancelCommand(id);
      h.manager.undo();
      h.manager.redo();
      expect(events(h.connection, "command:update")).toHaveLength(0);
      expect(events(h.connection, "command:finalize")).toHaveLength(0);
      expect(events(h.connection, "command:cancel")).toHaveLength(0);
      expect(events(h.connection, "command:undo")).toHaveLength(0);
      expect(events(h.connection, "command:redo")).toHaveLength(0);
    });
  });

  describe("cancel without capability", () => {
    it("rolls back a pending preview locally when the session is not ready", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-offline");
      h.setCapability({ ready: false });

      h.manager.cancelCommand(id);

      expect(h.manager.getOperation(id)).toBeUndefined();
      expect(removeNodeByIdCalls(h.stageOps, "node-offline")).toEqual([
        ["node-offline", false],
        ["node-offline", true],
      ]);
      expect(events(h.connection, "command:cancel")).toHaveLength(0);
    });

    it("cancels a pending preview's throttle when capability is lost", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-throttle");
      h.manager.updateCommand(id, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(id, { points: [0, 0, 2, 2] });

      h.setCapability({ ready: false });
      h.manager.cancelCommand(id);

      await vi.advanceTimersByTimeAsync(200);
      expect(events(h.connection, "command:update")).toHaveLength(1);
      expect(h.manager.getOperation(id)).toBeUndefined();
    });
  });

  describe("stale pending command tolerance", () => {
    it("cancelCommand with an unknown ID warns once and returns false instead of throwing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const h = readyHarness();

      let cancelled = true;
      expect(() => {
        cancelled = h.manager.cancelCommand("cmd-unknown");
      }).not.toThrow();

      expect(cancelled).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("cmd-unknown"),
      );
      warnSpy.mockRestore();
    });

    it("updateCommand with an unknown ID returns false instead of throwing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const h = readyHarness();

      let updated = true;
      expect(() => {
        updated = h.manager.updateCommand("cmd-unknown", {
          points: [0, 0, 1, 1],
        });
      }).not.toThrow();

      expect(updated).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("cmd-unknown"),
      );
      expect(events(h.connection, "command:update")).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it("finalizeCommand with an unknown ID returns false instead of throwing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const h = readyHarness();

      let finalized = true;
      expect(() => {
        finalized = h.manager.finalizeCommand("cmd-unknown");
      }).not.toThrow();

      expect(finalized).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("cmd-unknown"),
      );
      expect(events(h.connection, "command:finalize")).toHaveLength(0);
      expect(h.manager.getUndoStack()).toEqual([]);
      warnSpy.mockRestore();
    });

    it("updateCommand and finalizeCommand return true while the command is live", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      expect(h.manager.updateCommand(id, { points: [0, 0, 5, 5] })).toBe(true);
      expect(h.manager.finalizeCommand(id)).toBe(true);
      expect(h.manager.getUndoStack()).toEqual([id]);
    });

    it("a rejected preview leaves update, finalize, and cancel all returning false", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-rejected");

      h.manager.handleRejection(id, "INVALID_COMMAND");
      expect(h.manager.getOperation(id)).toBeUndefined();

      expect(h.manager.updateCommand(id, { points: [0, 0, 5, 5] })).toBe(false);
      expect(h.manager.finalizeCommand(id)).toBe(false);
      expect(h.manager.cancelCommand(id)).toBe(false);
      expect(h.notify).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it("cancelCommand returns true after cancelling a live pending command", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-live");
      expect(h.manager.cancelCommand(id)).toBe(true);
      expect(h.manager.getOperation(id)).toBeUndefined();
      expect(events(h.connection, "command:cancel")).toHaveLength(1);
    });
  });

  describe("per-command throttles", () => {
    it("emits the first update of each command immediately", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const a = validLocalStroke(h.manager, "node-a");
      const b = validLocalStroke(h.manager, "node-b");
      h.manager.updateCommand(a, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(b, { points: [0, 0, 2, 2] });
      expect(events(h.connection, "command:update")).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(150);
      expect(events(h.connection, "command:update")).toHaveLength(2);
    });

    it("coalesces rapid updates of one command into leading and trailing emissions", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.updateCommand(id, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(id, { points: [0, 0, 2, 2] });
      expect(events(h.connection, "command:update")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(events(h.connection, "command:update")).toHaveLength(2);
    });

    it("cancels the trailing update before emitting command:cancel", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-c");
      h.manager.updateCommand(id, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(id, { points: [0, 0, 2, 2] });
      h.manager.cancelCommand(id);
      expect(events(h.connection, "command:cancel")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(events(h.connection, "command:update")).toHaveLength(1);
      expect(h.manager.getOperation(id)).toBeUndefined();
    });

    it("suppresses the trailing update when capability drops", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.updateCommand(id, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(id, { points: [0, 0, 2, 2] });
      h.setCapability({ ready: false });
      await vi.advanceTimersByTimeAsync(150);
      expect(events(h.connection, "command:update")).toHaveLength(1);
    });

    it("flushes only the finalized command's trailing update", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const a = validLocalStroke(h.manager, "node-a");
      h.manager.updateCommand(a, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(a, { points: [0, 0, 2, 2] });
      h.manager.finalizeCommand(a);
      expect(events(h.connection, "command:update")).toHaveLength(2);
      expect(events(h.connection, "command:finalize")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(150);
      expect(events(h.connection, "command:update")).toHaveLength(2);
    });

    it("does not flush another command's throttle on finalize", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const a = validLocalStroke(h.manager, "node-a");
      const b = validLocalStroke(h.manager, "node-b");
      h.manager.updateCommand(a, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(a, { points: [0, 0, 2, 2] });
      h.manager.finalizeCommand(b);
      expect(events(h.connection, "command:update")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(150);
      expect(events(h.connection, "command:update")).toHaveLength(2);
    });
  });

  describe("finalize with operation journal", () => {
    it("pushes undo history optimistically", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      expect(h.manager.getUndoStack()).toEqual([id]);
      expect(h.manager.getRedoStack()).toEqual([]);
      expect(h.manager.getOperation(id)).toMatchObject({ status: "applied" });
    });

    it("stores the acknowledged sequence and advances the cursor", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-ack");
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);
      expect(h.manager.getOperation(id)).toMatchObject({
        id,
        status: "applied",
        seq: 1,
      });
      expect(h.manager.getLastSeq()).toBe(1);
    });

    it("rolls back a rejected finalize exactly once", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-rb");
      h.manager.finalizeCommand(id);
      await h.rejectAck(
        new AckError("command:finalize", "server", "Server rejected", {
          cause: "INVALID_COMMAND",
        }),
      );
      expect(h.notify).toHaveBeenCalledTimes(1);
      expect(h.notify).toHaveBeenCalledWith(REJECTION_MESSAGE);
      expect(h.manager.getOperation(id)).toBeUndefined();
      expect(h.manager.getUndoStack()).toEqual([]);
      expect(
        vi
          .mocked(h.stageOps.removeNodeById)
          .mock.calls.filter((call) => call[1] === true),
      ).toHaveLength(1);

      h.manager.handleRejection(id, "INVALID_COMMAND");
      expect(h.notify).toHaveBeenCalledTimes(1);
      expect(
        vi
          .mocked(h.stageOps.removeNodeById)
          .mock.calls.filter((call) => call[1] === true),
      ).toHaveLength(1);
      expect(events(h.connection, "command:finalize")).toHaveLength(1);
    });

    it("rolls back a rejected finalize triggered by the reject event", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-er");
      h.manager.finalizeCommand(id);
      h.manager.handleRejection(id, "UNAUTHORIZED_NO_PERMISSION_TO_DRAW");
      expect(h.notify).toHaveBeenCalledTimes(1);
      expect(h.manager.getOperation(id)).toBeUndefined();
      expect(h.manager.getUndoStack()).toEqual([]);
      expect(events(h.connection, "command:finalize")).toHaveLength(1);
    });

    it("keeps history consistent when interleaved rejections restore stale snapshots", async () => {
      const h = readyHarness();
      const survivor = validLocalStroke(h.manager, "node-survivor");
      h.manager.finalizeCommand(survivor);
      await h.resolveAck(1);

      const a = validLocalStroke(h.manager, "node-a");
      const b = validLocalStroke(h.manager, "node-b");
      h.manager.finalizeCommand(a);
      h.manager.finalizeCommand(b);

      await h.rejectAck(
        new AckError("command:finalize", "server", "Server rejected", {
          cause: "INVALID_COMMAND",
        }),
      );
      await h.rejectAck(
        new AckError("command:finalize", "server", "Server rejected", {
          cause: "INVALID_COMMAND",
        }),
      );

      expect(h.manager.getUndoStack()).toEqual([survivor]);
      expect(() => h.manager.undo()).not.toThrow();
      expect(h.manager.getOperation(survivor)).toMatchObject({
        status: "reverted",
      });
      expect(h.manager.getUndoStack()).toEqual([]);
      expect(h.manager.getRedoStack()).toEqual([survivor]);
    });

    it("causes no rollback when a reject event arrives after a successful acknowledgement", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-late");
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);

      h.manager.handleRejection(id, "STALE_REJECT");

      expect(h.manager.getOperation(id)).toMatchObject({
        status: "applied",
        seq: 1,
      });
      expect(h.manager.getUndoStack()).toEqual([id]);
      expect(h.notify).not.toHaveBeenCalled();
      expect(events(h.connection, "command:finalize")).toHaveLength(1);
    });

    it("rolls back a rejected pending command create", () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-pc");
      h.manager.handleRejection(id, "INVALID_COMMAND");
      expect(h.manager.getOperation(id)).toBeUndefined();
      expect(h.notify).toHaveBeenCalledWith(REJECTION_MESSAGE);
      expect(events(h.connection, "command:create")).toHaveLength(1);
    });

    it("freezes an uncertain finalize without retry", async () => {
      vi.useFakeTimers();
      const { manager, connection, reconcile } = readyHarness();
      const id = validLocalStroke(manager);
      manager.finalizeCommand(id);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(reconcile).toHaveBeenCalledWith("ack-timeout");
      expect(events(connection, "command:finalize")).toHaveLength(1);
    });

    it("keeps the optimistic state while a finalize is uncertain", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(h.manager.getOperation(id)).toMatchObject({ status: "applied" });
      expect(h.manager.getUndoStack()).toEqual([id]);
      expect(h.notify).not.toHaveBeenCalled();
    });

    it("marks a malformed acknowledgement uncertain and reconciles", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      await h.rejectAck(
        new AckError("command:finalize", "protocol", "Malformed ack"),
      );
      expect(h.reconcile).toHaveBeenCalledWith("malformed-ack");
      expect(events(h.connection, "command:finalize")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(h.reconcile).toHaveBeenCalledTimes(1);
    });

    it("does not start a second durable operation on a command with a pending one", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      h.manager.undo();
      expect(events(h.connection, "command:undo")).toHaveLength(0);
      expect(h.manager.getRedoStack()).toEqual([]);
      await h.resolveAck(1);
      expect(h.manager.getOperation(id)).toMatchObject({
        status: "applied",
        seq: 1,
      });
    });

    it("projects buffered remote transitions drained by a local acknowledgement", async () => {
      const h = readyHarness();
      h.manager.applyRemoteTransition(finalizeTransition("b", 2));
      expect(h.manager.getOperation("b")).toBeUndefined();

      const id = validLocalStroke(h.manager, "node-local");
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);

      expect(h.manager.getLastSeq()).toBe(2);
      expect(h.manager.getOperation(id)).toMatchObject({
        status: "applied",
        seq: 1,
      });
      expect(h.manager.getOperation("b")).toMatchObject({
        status: "applied",
        seq: 2,
      });
      expect(createdNodeIds(h.stageOps)).toEqual(["node-local", "node-b"]);
    });
  });

  describe("undo and redo with operation journal", () => {
    it("reverts optimistically, emits once, and records the acknowledged sequence", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-u");
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);

      const undoListener = vi.fn();
      h.manager.on("command:undo", undoListener);
      h.manager.undo();

      expect(events(h.connection, "command:undo")).toHaveLength(1);
      expect(undoListener).toHaveBeenCalledTimes(1);
      expect(h.manager.getOperation(id)).toMatchObject({ status: "reverted" });
      expect(h.manager.getUndoStack()).toEqual([]);
      expect(h.manager.getRedoStack()).toEqual([id]);

      await h.resolveAck(2);
      expect(h.manager.getOperation(id)).toMatchObject({
        status: "reverted",
        seq: 2,
      });
      expect(h.manager.getLastSeq()).toBe(2);
    });

    it("restores state and history when an undo is rejected", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-ur");
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);
      h.manager.undo();
      await h.rejectAck(
        new AckError("command:undo", "server", "Server rejected", {
          cause: "COMMAND_NOT_APPLIED",
        }),
      );

      expect(h.notify).toHaveBeenCalledTimes(1);
      expect(h.notify).toHaveBeenCalledWith(REJECTION_MESSAGE);
      expect(h.manager.getOperation(id)).toMatchObject({ status: "applied" });
      expect(h.manager.getUndoStack()).toEqual([id]);
      expect(h.manager.getRedoStack()).toEqual([]);
      expect(
        vi.mocked(h.stageOps.addDrawingNode).mock.calls.length,
      ).toBeGreaterThanOrEqual(2);
    });

    it("reverts state and history when a redo is rejected", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-rr");
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);
      h.manager.undo();
      await h.resolveAck(2);
      h.manager.redo();
      await h.rejectAck(
        new AckError("command:redo", "server", "Server rejected", {
          cause: "COMMAND_NOT_REVERTED",
        }),
      );

      expect(h.notify).toHaveBeenCalledTimes(1);
      expect(h.manager.getOperation(id)).toMatchObject({ status: "reverted" });
      expect(h.manager.getUndoStack()).toEqual([]);
      expect(h.manager.getRedoStack()).toEqual([id]);
    });

    it("redoes optimistically and emits once", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-r");
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);
      h.manager.undo();
      await h.resolveAck(2);

      const redoListener = vi.fn();
      h.manager.on("command:redo", redoListener);
      h.manager.redo();

      expect(events(h.connection, "command:redo")).toHaveLength(1);
      expect(redoListener).toHaveBeenCalledTimes(1);
      expect(h.manager.getOperation(id)).toMatchObject({ status: "applied" });
      expect(h.manager.getUndoStack()).toEqual([id]);
      expect(h.manager.getRedoStack()).toEqual([]);
    });
  });

  describe("handleDisconnect", () => {
    it("marks pending operations uncertain and reconciles once", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      h.manager.handleDisconnect();

      expect(h.reconcile).toHaveBeenCalledTimes(1);
      expect(h.reconcile).toHaveBeenCalledWith(
        "disconnect-with-pending-operation",
      );
      expect(h.journal.pending()).toEqual([]);

      await vi.advanceTimersByTimeAsync(8_000);
      expect(h.reconcile).toHaveBeenCalledTimes(1);
      expect(events(h.connection, "command:finalize")).toHaveLength(1);
    });

    it("does not reconcile a disconnect without pending operations", () => {
      const h = readyHarness();
      h.manager.handleDisconnect();
      expect(h.reconcile).not.toHaveBeenCalled();
    });

    it("rolls back un-finalized pending commands on disconnect and reconciles", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-ghost");
      h.manager.updateCommand(id, { points: [0, 0, 5, 5] });

      h.manager.handleDisconnect();

      expect(h.manager.getOperation(id)).toBeUndefined();
      expect(removeNodeByIdCalls(h.stageOps, "node-ghost")).toEqual([
        ["node-ghost", false],
        ["node-ghost", true],
      ]);
      expect(h.reconcile).toHaveBeenCalledTimes(1);
      expect(h.reconcile).toHaveBeenCalledWith(
        "disconnect-with-pending-operation",
      );
      expect(h.journal.pending()).toEqual([]);

      // The rolled-back command's throttle never emits its trailing update.
      await vi.advanceTimersByTimeAsync(200);
      expect(events(h.connection, "command:update")).toHaveLength(1);
    });

    it("reconciles once for a disconnect with journal and preview pending", () => {
      const h = readyHarness();
      const finalized = validLocalStroke(h.manager, "node-fin");
      h.manager.finalizeCommand(finalized);
      const pending = validLocalStroke(h.manager, "node-pen");

      h.manager.handleDisconnect();

      expect(h.reconcile).toHaveBeenCalledTimes(1);
      expect(h.reconcile).toHaveBeenCalledWith(
        "disconnect-with-pending-operation",
      );
      expect(h.manager.getOperation(pending)).toBeUndefined();
      expect(h.journal.pending()).toEqual([]);
    });

    it("rolls back remote previews on disconnect and reconciles", () => {
      const h = readyHarness();
      h.previewHandler("command:create")(
        "cmd-r",
        remoteStroke("cmd-r", { status: "pending" }),
      );
      expect(h.manager.getOperation("cmd-r")).toBeDefined();

      h.manager.handleDisconnect();

      expect(h.manager.getOperation("cmd-r")).toBeUndefined();
      expect(removeNodeByIdCalls(h.stageOps, "node-cmd-r").length).toBe(2);
      expect(h.reconcile).toHaveBeenCalledWith(
        "disconnect-with-pending-operation",
      );
    });
  });

  describe("installSync", () => {
    it("replays applied commands in (seq, id) order on replacement", () => {
      const h = readyHarness();
      h.manager.installSync(
        [
          remoteStroke("r3", { seq: 4, owner: USER_ID }),
          remoteStroke("r1", { seq: 2 }),
          remoteStroke("r2", { seq: 3, status: "reverted" }),
        ],
        true,
      );

      expect(h.stageOps.resetRoomScene).toHaveBeenCalledTimes(1);
      expect(createdNodeIds(h.stageOps)).toEqual(["node-r1", "node-r3"]);
      expect(h.manager.getOperation("r1")).toMatchObject({
        status: "applied",
        seq: 2,
      });
      expect(h.manager.getOperation("r2")).toMatchObject({
        status: "reverted",
        seq: 3,
      });
      expect(h.manager.getLastSeq()).toBe(4);
    });

    it("cancels pending commands and clears absent state without finalizing", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const goneId = validLocalStroke(h.manager, "node-gone");
      h.manager.finalizeCommand(goneId);
      await h.resolveAck(1);

      const pendingStrokeId = validLocalStroke(h.manager, "node-pending");
      h.manager.updateCommand(pendingStrokeId, { points: [0, 0, 3, 3] });
      h.manager.updateCommand(pendingStrokeId, { points: [0, 0, 4, 4] });

      const uncertainId = validLocalStroke(h.manager, "node-uncertain");
      h.manager.finalizeCommand(uncertainId);

      h.manager.installSync([remoteStroke("r1", { seq: 2 })], true);

      expect(events(h.connection, "command:finalize")).toHaveLength(2);
      expect(h.manager.getOperation(goneId)).toBeUndefined();
      expect(h.manager.getOperation(pendingStrokeId)).toBeUndefined();
      expect(h.manager.getOperation(uncertainId)).toBeUndefined();
      expect(h.manager.getOperation("r1")).toBeDefined();
      expect(h.manager.getLastSeq()).toBe(2);
      expect(h.manager.getUndoStack()).toEqual([]);
      expect(h.journal.pending()).toEqual([]);

      await vi.advanceTimersByTimeAsync(8_100);
      expect(events(h.connection, "command:update")).toHaveLength(1);
      expect(h.reconcile).not.toHaveBeenCalled();
    });

    it("rebuilds undo history from owned commands after replacement", () => {
      const h = readyHarness();
      h.manager.installSync(
        [
          remoteStroke("r1", { seq: 2, owner: USER_ID }),
          remoteStroke("r2", { seq: 3, owner: OTHER_USER_ID }),
          remoteStroke("r3", {
            seq: 4,
            owner: USER_ID,
            status: "reverted",
          }),
        ],
        true,
      );
      expect(h.manager.getUndoStack()).toEqual(["r1"]);
      expect(h.manager.getRedoStack()).toEqual(["r3"]);
    });

    it("applies a delta sync contiguously", () => {
      const h = readyHarness();
      h.manager.applyRemoteTransition(finalizeTransition("a", 1));
      h.manager.installSync([remoteStroke("b", { seq: 2 })], false);
      expect(h.manager.getLastSeq()).toBe(2);
      expect(h.manager.getOperation("b")).toMatchObject({
        status: "applied",
        seq: 2,
      });
      expect(h.reconcile).not.toHaveBeenCalled();
    });

    it("requests reconciliation for an ambiguous delta", () => {
      const h = readyHarness();
      h.manager.installSync(
        [remoteStroke("a", { seq: 1, status: "pending" })],
        false,
      );
      expect(h.reconcile).toHaveBeenCalledWith("ambiguous-delta");
      expect(h.manager.getOperation("a")).toBeUndefined();
      expect(h.manager.getLastSeq()).toBe(0);
    });
  });

  describe("applyRemoteTransition", () => {
    it("returns the contiguous cursor from getLastSeq, not the max", () => {
      const h = readyHarness();
      const buffered = h.manager.applyRemoteTransition(
        finalizeTransition("b", 2),
      );
      expect(buffered).toMatchObject({ type: "buffered", missingSeq: 1 });
      expect(h.manager.getLastSeq()).toBe(0);
      expect(h.manager.getOperation("b")).toBeUndefined();

      h.manager.applyRemoteTransition(finalizeTransition("a", 1));
      expect(h.manager.getLastSeq()).toBe(2);
      expect(h.manager.getOperation("a")).toBeDefined();
      expect(h.manager.getOperation("b")).toBeDefined();
      expect(createdNodeIds(h.stageOps)).toEqual(["node-a", "node-b"]);
    });

    it("requests reconciliation when a remote transition conflicts", () => {
      const h = readyHarness();
      h.manager.applyRemoteTransition(finalizeTransition("a", 1));
      h.manager.applyRemoteTransition(finalizeTransition("b", 1));
      expect(h.reconcile).toHaveBeenCalledWith("sequence-conflict");
    });

    it("finalizes a live preview in place when its remote finalize arrives", () => {
      const h = readyHarness();
      h.previewHandler("command:create")(
        "cmd-r",
        remoteStroke("cmd-r", { status: "pending" }),
      );
      expect(h.manager.getOperation("cmd-r")).toBeDefined();

      h.manager.applyRemoteTransition(finalizeTransition("cmd-r", 1));
      expect(h.manager.getOperation("cmd-r")).toMatchObject({
        status: "applied",
        seq: 1,
      });
    });
  });

  describe("remote previews", () => {
    it("stores and updates a remote preview until it is cancelled", () => {
      const h = readyHarness();
      h.previewHandler("command:create")(
        "cmd-r",
        remoteStroke("cmd-r", { status: "pending" }),
      );
      expect(h.manager.getOperation("cmd-r")).toMatchObject({
        status: "pending",
      });

      h.previewHandler("command:update")(
        "cmd-r",
        remoteStroke("cmd-r", {
          status: "pending",
          payload: { ...strokePayload("node-cmd-r"), points: [0, 0, 8, 8] },
        }),
      );
      expect(h.manager.getOperation("cmd-r")).toMatchObject({
        payload: { points: [0, 0, 8, 8] },
      });

      h.previewHandler("command:cancel")("cmd-r");
      expect(h.manager.getOperation("cmd-r")).toBeUndefined();
    });

    it("ignores remote previews owned by the local user", () => {
      const h = readyHarness();
      h.previewHandler("command:create")(
        "cmd-self",
        remoteStroke("cmd-self", { status: "pending", owner: USER_ID }),
      );
      expect(h.manager.getOperation("cmd-self")).toBeUndefined();
    });

    it("requests reconciliation when a preview payload is invalid", () => {
      const h = readyHarness();
      h.previewProtocolError("command:create");
      expect(h.reconcile).toHaveBeenCalledWith("protocol-validation");
    });
  });

  describe("queries and local events", () => {
    it("getLastSeq returns 0 when no transitions are applied", () => {
      const h = readyHarness();
      expect(h.manager.getLastSeq()).toBe(0);
    });

    it("getOperation returns undefined for unknown id", () => {
      const h = readyHarness();
      expect(h.manager.getOperation("nonexistent")).toBeUndefined();
    });

    it("registers and fires listeners", () => {
      const h = readyHarness();
      const handler = vi.fn();
      h.manager.on("command:create", handler);
      h.manager.emit("command:create");
      expect(handler).toHaveBeenCalled();
    });

    it("removes listeners via off", () => {
      const h = readyHarness();
      const handler = vi.fn();
      h.manager.on("command:create", handler);
      h.manager.off("command:create", handler);
      h.manager.emit("command:create");
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("clears all internal state and is idempotent", async () => {
      const h = readyHarness();
      const id = validLocalStroke(h.manager);
      h.manager.finalizeCommand(id);
      await h.resolveAck(1);

      h.manager.destroy();
      h.manager.destroy();

      expect(h.manager.getUndoStack()).toEqual([]);
      expect(h.manager.getRedoStack()).toEqual([]);
      expect(h.manager.getLastSeq()).toBe(0);
      expect(h.manager.getOperation(id)).toBeUndefined();
      expect(h.journal.pending()).toEqual([]);
      expect(h.manager.startCommand("stroke", strokePayload("n-3"))).toBeNull();
    });

    it("destroys pending instances and cancels their throttles", async () => {
      vi.useFakeTimers();
      const h = readyHarness();
      const id = validLocalStroke(h.manager, "node-d");
      h.manager.updateCommand(id, { points: [0, 0, 1, 1] });
      h.manager.updateCommand(id, { points: [0, 0, 2, 2] });

      h.manager.destroy();

      expect(
        vi
          .mocked(h.stageOps.removeNodeById)
          .mock.calls.filter((call) => call[1] === true),
      ).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(events(h.connection, "command:update")).toHaveLength(1);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BoardSession } from "@/collaboration/boardSession";
import type { BoardSessionOptions } from "@/collaboration/boardSession";
import { joinAckSchema } from "@/collaboration/schemas";
import { AckError } from "@/core/connectionManager";
import type { ConnectionManager } from "@/core/connectionManager";
import type { CommandManager } from "@/core/commandManager";
import type { BoardDocument } from "@/collaboration/boardDocument";
import type { OperationJournal } from "@/collaboration/operationJournal";
import type { BoardSessionSnapshot } from "@/types/session";
import type {
  Command,
  RenderableCommand,
  StrokePayload,
} from "@/types/command";
import type { Point } from "@/types/common";

const ROOM_ID = "board-42";
const EPOCH = "gen-abc";
const JOIN_DEADLINE_MS = 8_000;
const GAP_DEADLINE_MS = 1_500;
const EDITOR_ACK = { role: "editor", permissions: { read: true, draw: true } };

type SpyFn = ReturnType<typeof vi.fn>;

type ValidatedEntry = {
  handler: (...args: unknown[]) => void;
  onProtocolError: (error: unknown) => void;
};

type LifecycleHandlers = {
  connect?: () => void;
  disconnect?: (reason: string) => void;
  connectError?: (error: Error) => void;
};

type PendingAck = {
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type RecordedTimer = { ms: number; cancelled: boolean };

interface CoordinatorHarness {
  coordinator: BoardSession;
  connect: SpyFn;
  emitVolatile: SpyFn;
  subscribeLifecycle: SpyFn;
  onValidated: SpyFn;
  emitWithAck: SpyFn;
  installSync: SpyFn;
  applyRemoteTransition: SpyFn;
  handleRejection: SpyFn;
  handleDisconnect: SpyFn;
  journalPending: SpyFn;
  journalClear: SpyFn;
  clearPreviews: SpyFn;
  getHighestContiguousSeq: SpyFn;
  getBufferedSequences: SpyFn;
  cancelGesture: SpyFn;
  clearPresence: SpyFn;
  publish: SpyFn;
  pendingOperations: unknown[];
  scheduledTimers: RecordedTimer[];
  failNextDeltaInstall: () => void;
  deliverConnect: () => void;
  deliverDisconnect: (reason?: string) => void;
  deliverConnectError: (message?: string) => void;
  handlerFor: (event: string) => (...args: unknown[]) => void;
  failProtocolOn: (event: string) => void;
  ackJoin: (index?: number, error?: unknown, ack?: unknown) => void;
  pendingJoinCount: () => number;
  joinPayloads: () => Array<{ roomId: string; lastSeq?: number }>;
  lastJoinPayload: () => { roomId: string; lastSeq?: number };
  flush: () => Promise<void>;
  snapshot: () => BoardSessionSnapshot;
}

const harnesses: CoordinatorHarness[] = [];

/**
 * Drives the coordinator against spies for every committed dependency. The
 * spies mirror the real collaborator contracts: `handleDisconnect` invokes
 * the coordinator's `requestReconciliation` when pending operations exist
 * (exactly what the real CommandManager does), and a failing delta install
 * escalates through `requestReconciliation("ambiguous-delta")`.
 */
function coordinatorHarness(
  options: Partial<BoardSessionOptions> = {},
): CoordinatorHarness {
  const validatedHandlers = new Map<string, ValidatedEntry>();
  const lifecycle: LifecycleHandlers[] = [];
  const pendingAcks: PendingAck[] = [];
  const pendingOperations: unknown[] = [];
  const scheduledTimers: RecordedTimer[] = [];
  const timerEntries = new Map<ReturnType<typeof setTimeout>, RecordedTimer>();
  let failNextDelta = false;

  const coordinatorRef: {
    current: BoardSession | null;
  } = { current: null };

  const connection = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    cleanup: vi.fn(),
    onConnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    setAuth: vi.fn(),
    emitVolatile: vi.fn(),
    emit: vi.fn(),
    subscribeLifecycle: vi.fn((handlers: LifecycleHandlers) => {
      lifecycle.push(handlers);
      return () => {
        const index = lifecycle.indexOf(handlers);
        if (index !== -1) lifecycle.splice(index, 1);
      };
    }),
    onValidated: vi.fn(
      (
        event: string,
        _schemaName: string,
        _schema: unknown,
        handler: (...args: unknown[]) => void,
        onProtocolError: (error: unknown) => void,
      ) => {
        validatedHandlers.set(event, { handler, onProtocolError });
        return () => validatedHandlers.delete(event);
      },
    ),
    emitWithAck: vi.fn(
      (_event: string, payload: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          pendingAcks.push({ payload, resolve, reject });
        }),
    ),
  };

  const installSync = vi.fn((_state: unknown, replacement: boolean) => {
    if (!replacement && failNextDelta) {
      failNextDelta = false;
      coordinatorRef.current?.requestReconciliation("ambiguous-delta");
    }
  });

  const commands = {
    installSync,
    applyRemoteTransition: vi.fn(() => ({ type: "applied", transitions: [] })),
    handleRejection: vi.fn(),
    handleDisconnect: vi.fn(() => {
      // Mirrors the real CommandManager: pending operations are marked
      // uncertain and the coordinator is asked to reconcile.
      if (pendingOperations.length > 0) {
        coordinatorRef.current?.requestReconciliation(
          "disconnect-with-pending-operation",
        );
      }
    }),
    getLastSeq: vi.fn(() => 0),
    destroy: vi.fn(),
  };

  const document = {
    getHighestContiguousSeq: vi.fn(() => 0),
    getBufferedSequences: vi.fn(() => [] as number[]),
    clearPreviews: vi.fn(),
  };

  const journal = {
    pending: vi.fn(() => pendingOperations as never[]),
    clear: vi.fn(),
  };

  const cancelGesture = vi.fn();
  const clearPresence = vi.fn();
  const publish = vi.fn();

  const coordinator = new BoardSession({
    epoch: EPOCH,
    roomId: ROOM_ID,
    connection: connection as unknown as ConnectionManager,
    commands: commands as unknown as CommandManager,
    document: document as unknown as BoardDocument,
    journal: journal as unknown as OperationJournal,
    cancelGesture,
    clearPresence,
    publish,
    setTimeout: (handler: () => void, ms: number) => {
      const id = setTimeout(handler, ms);
      const entry: RecordedTimer = { ms, cancelled: false };
      timerEntries.set(id, entry);
      scheduledTimers.push(entry);
      return id;
    },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => {
      const entry = timerEntries.get(id);
      if (entry) entry.cancelled = true;
      timerEntries.delete(id);
      clearTimeout(id);
    },
    ...options,
  });
  coordinatorRef.current = coordinator;

  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  const joinPayloads = (): { roomId: string; lastSeq?: number }[] =>
    pendingAcks.map(
      (ack) => ack.payload as { roomId: string; lastSeq?: number },
    );

  const harness: CoordinatorHarness = {
    coordinator,
    connect: connection.connect,
    emitVolatile: connection.emitVolatile,
    subscribeLifecycle: connection.subscribeLifecycle,
    onValidated: connection.onValidated,
    emitWithAck: connection.emitWithAck,
    installSync,
    applyRemoteTransition: commands.applyRemoteTransition,
    handleRejection: commands.handleRejection,
    handleDisconnect: commands.handleDisconnect,
    journalPending: journal.pending,
    journalClear: journal.clear,
    clearPreviews: document.clearPreviews,
    getHighestContiguousSeq: document.getHighestContiguousSeq,
    getBufferedSequences: document.getBufferedSequences,
    cancelGesture,
    clearPresence,
    publish,
    pendingOperations,
    scheduledTimers,
    failNextDeltaInstall: () => {
      failNextDelta = true;
    },
    deliverConnect: () => lifecycle.at(-1)?.connect?.(),
    deliverDisconnect: (reason = "transport close") =>
      lifecycle.at(-1)?.disconnect?.(reason),
    deliverConnectError: (message = "Connection failed") =>
      lifecycle.at(-1)?.connectError?.(new Error(message)),
    handlerFor: (event: string) => {
      const entry = validatedHandlers.get(event);
      if (!entry) {
        throw new Error(`no validated listener registered for "${event}"`);
      }
      return entry.handler;
    },
    failProtocolOn: (event: string) => {
      const entry = validatedHandlers.get(event);
      if (!entry) {
        throw new Error(`no validated listener registered for "${event}"`);
      }
      entry.onProtocolError(new Error("protocol violation"));
    },
    ackJoin: (index = -1, error?: unknown, ack: unknown = EDITOR_ACK) => {
      const pending = index === -1 ? pendingAcks.at(-1) : pendingAcks.at(index);
      if (!pending) throw new Error("no pending room:join acknowledgement");
      if (error !== undefined) pending.reject(error);
      else pending.resolve(ack);
    },
    pendingJoinCount: () => pendingAcks.length,
    joinPayloads,
    lastJoinPayload: () =>
      joinPayloads().at(-1) as { roomId: string; lastSeq?: number },
    flush,
    snapshot: () => coordinator.getSnapshot(),
  };

  harnesses.push(harness);
  return harness;
}

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

function strokeAt(seq: number, owner = "user-2"): RenderableCommand {
  return {
    id: `cmd-${seq}`,
    type: "stroke",
    owner,
    status: "applied",
    timestamp: seq * 1000,
    seq,
    payload: strokePayload(`node-${seq}`),
  };
}

function finalizeArgs(seq: number): [string, RenderableCommand] {
  return [`cmd-${seq}`, strokeAt(seq)];
}

/** Flows a fresh coordinator to `ready` with the default editor capability. */
async function readyHarness(
  options: Partial<BoardSessionOptions> = {},
): Promise<CoordinatorHarness> {
  const harness = coordinatorHarness(options);
  await startAndDeliver(harness, "ack-first");
  expect(harness.snapshot().phase).toBe("ready");
  return harness;
}

async function startAndDeliver(
  harness: CoordinatorHarness,
  order: "ack-first" | "sync-first",
): Promise<void> {
  harness.coordinator.start();
  harness.deliverConnect();
  await harness.flush();

  if (order === "ack-first") {
    harness.ackJoin();
    await harness.flush();
    harness.handlerFor("room:sync")([strokeAt(1)]);
    await harness.flush();
    return;
  }

  harness.handlerFor("room:sync")([strokeAt(1)]);
  await harness.flush();
  harness.ackJoin();
  await harness.flush();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const harness of harnesses.splice(0)) {
    harness.coordinator.dispose();
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("BoardSession", () => {
  describe("start and listener ordering", () => {
    it("registers every server listener before connecting", () => {
      const harness = coordinatorHarness();

      harness.coordinator.start();

      const connectOrder = harness.connect.mock.invocationCallOrder[0];
      expect(connectOrder).toBeDefined();
      for (const order of harness.onValidated.mock.invocationCallOrder) {
        expect(order).toBeLessThan(connectOrder);
      }
      expect(
        harness.subscribeLifecycle.mock.invocationCallOrder[0],
      ).toBeLessThan(connectOrder);

      const registeredEvents = harness.onValidated.mock.calls.map(
        (call) => call[0] as string,
      );
      expect(registeredEvents).toEqual(
        expect.arrayContaining([
          "room:sync",
          "command:finalize",
          "command:undo",
          "command:redo",
          "command:reject",
          "presence:join",
          "presence:leave",
          "presence:move",
        ]),
      );
      expect(harness.connect).toHaveBeenCalledTimes(1);
    });

    it("does not re-register the manager's preview listeners", () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();

      const registeredEvents = harness.onValidated.mock.calls.map(
        (call) => call[0] as string,
      );
      expect(registeredEvents).not.toContain("command:create");
      expect(registeredEvents).not.toContain("command:update");
      expect(registeredEvents).not.toContain("command:cancel");
    });

    it("starts from an idle snapshot and publishes connecting on start", () => {
      const harness = coordinatorHarness();
      expect(harness.snapshot()).toEqual({
        epoch: EPOCH,
        roomId: ROOM_ID,
        phase: "idle",
        role: null,
        permissions: { read: false, draw: false },
        canDraw: false,
        error: null,
      });
      expect(harness.publish).not.toHaveBeenCalled();

      harness.coordinator.start();

      expect(harness.snapshot().phase).toBe("connecting");
      expect(harness.snapshot().canDraw).toBe(false);
      expect(harness.publish).toHaveBeenCalledWith(
        expect.objectContaining({ phase: "connecting" }),
      );
    });

    it("ignores a second start call", () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.coordinator.start();

      expect(harness.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("join acknowledgement and sync coordination", () => {
    it.each(["ack-first", "sync-first"] as const)(
      "publishes ready only after both: %s",
      async (order) => {
        const harness = coordinatorHarness();
        await startAndDeliver(harness, order);

        expect(harness.snapshot()).toMatchObject({
          phase: "ready",
          role: "editor",
          canDraw: true,
          error: null,
        });
        expect(harness.snapshot().permissions).toEqual({
          read: true,
          draw: true,
        });
      },
    );

    it("joins with only the roomId and the exact 8000 ms deadline", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      expect(harness.emitWithAck).toHaveBeenCalledTimes(1);
      expect(harness.emitWithAck).toHaveBeenCalledWith(
        "room:join",
        { roomId: ROOM_ID },
        joinAckSchema,
        JOIN_DEADLINE_MS,
      );
      expect(harness.snapshot().phase).toBe("joining");
    });

    it("does not publish ready or role after the ack alone", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      harness.ackJoin();
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "joining",
        role: null,
        canDraw: false,
      });
      expect(harness.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ phase: "ready" }),
      );
    });

    it("does not publish ready or role after the sync alone", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      harness.handlerFor("room:sync")([strokeAt(1)]);
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "syncing",
        role: null,
        canDraw: false,
      });
    });

    it("publishes role, permissions, and canDraw atomically with ready", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      harness.ackJoin();
      await harness.flush();

      const publishedPhases = harness.publish.mock.calls.map(
        (call) => (call[0] as BoardSessionSnapshot).phase,
      );
      expect(publishedPhases).not.toContain("ready");

      harness.handlerFor("room:sync")([strokeAt(1)]);
      await harness.flush();

      expect(harness.publish).toHaveBeenCalledWith({
        epoch: EPOCH,
        roomId: ROOM_ID,
        phase: "ready",
        role: "editor",
        permissions: { read: true, draw: true },
        canDraw: true,
        error: null,
      });
    });

    it("derives canDraw false when permissions deny drawing", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      harness.ackJoin(-1, undefined, {
        role: "viewer",
        permissions: { read: true, draw: false },
      });
      await harness.flush();
      harness.handlerFor("room:sync")([]);
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        role: "viewer",
        canDraw: false,
      });
    });

    it("installs the initial sync as a replacement", async () => {
      const harness = coordinatorHarness();
      await startAndDeliver(harness, "ack-first");

      expect(harness.installSync).toHaveBeenCalledWith([strokeAt(1)], true);
    });

    it("buffers live durable events during syncing and drains them at ready", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      // sync-first: installed, still waiting for the join ack
      harness.handlerFor("room:sync")([strokeAt(1)]);
      await harness.flush();
      expect(harness.snapshot().phase).toBe("syncing");

      // live transition while still syncing (ack outstanding)
      harness.handlerFor("command:finalize")(...finalizeArgs(2));
      await harness.flush();
      expect(harness.applyRemoteTransition).not.toHaveBeenCalled();

      harness.ackJoin();
      await harness.flush();

      expect(harness.applyRemoteTransition).toHaveBeenCalledTimes(1);
      expect(harness.applyRemoteTransition).toHaveBeenCalledWith({
        kind: "finalize",
        commandId: "cmd-2",
        command: strokeAt(2),
        seq: 2,
      });
      expect(harness.snapshot().phase).toBe("ready");
    });

    it("buffers live durable events during joining and drains after install", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      harness.ackJoin();
      await harness.flush();
      expect(harness.snapshot().phase).toBe("joining");

      harness.handlerFor("command:finalize")(...finalizeArgs(2));
      expect(harness.applyRemoteTransition).not.toHaveBeenCalled();

      harness.handlerFor("room:sync")([strokeAt(1)]);
      await harness.flush();

      expect(harness.applyRemoteTransition).toHaveBeenCalledWith({
        kind: "finalize",
        commandId: "cmd-2",
        command: strokeAt(2),
        seq: 2,
      });
      expect(harness.snapshot().phase).toBe("ready");
    });

    it("discards buffered transitions covered by the replacement snapshot", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      harness.ackJoin();
      await harness.flush();

      // In-flight live transition that the replacement snapshot also covers.
      harness.handlerFor("command:finalize")(...finalizeArgs(2));
      harness.getHighestContiguousSeq.mockReturnValue(2);

      harness.handlerFor("room:sync")([strokeAt(1), strokeAt(2)]);
      await harness.flush();

      expect(harness.snapshot().phase).toBe("ready");
      expect(harness.applyRemoteTransition).not.toHaveBeenCalled();
    });
  });

  describe("join failures", () => {
    it("enters error join-rejected when the server rejects the join", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      harness.ackJoin(
        -1,
        new AckError("room:join", "server", "Server rejected room:join"),
      );
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "error",
        error: "join-rejected",
        canDraw: false,
      });
    });

    it("enters error join-timeout when the acknowledgement times out", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      harness.ackJoin(
        -1,
        new AckError("room:join", "timeout", "deadline expired"),
      );
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "error",
        error: "join-timeout",
        canDraw: false,
      });
    });

    it("enters error protocol when the join acknowledgement is malformed", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      harness.ackJoin(
        -1,
        new AckError("room:join", "protocol", "malformed ack"),
      );
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "error",
        error: "protocol",
        canDraw: false,
      });
    });

    it("expires the join at exactly 8000 ms and not at 7999 ms", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      vi.advanceTimersByTime(JOIN_DEADLINE_MS - 1);
      await harness.flush();
      expect(harness.snapshot().phase).toBe("joining");
      expect(harness.snapshot().error).toBeNull();

      vi.advanceTimersByTime(1);
      await harness.flush();
      expect(harness.snapshot()).toMatchObject({
        phase: "error",
        error: "join-timeout",
      });
    });

    it("never auto-retries a failed join, even after reconnect", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      expect(harness.pendingJoinCount()).toBe(1);

      harness.ackJoin(
        -1,
        new AckError("room:join", "timeout", "deadline expired"),
      );
      await harness.flush();

      vi.advanceTimersByTime(60_000);
      await harness.flush();
      harness.deliverConnect();
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(1);
      expect(harness.snapshot().phase).toBe("error");
    });
  });

  describe("connect errors", () => {
    it("enters error connection when connecting fails before the session is ready", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      await harness.flush();

      harness.deliverConnectError();
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "error",
        error: "connection",
        canDraw: false,
      });
    });

    it("stays offline when a reconnection attempt fails after ready", async () => {
      const harness = await readyHarness();

      harness.deliverDisconnect("transport close");
      expect(harness.snapshot().phase).toBe("offline");

      // Documented choice: the transport retries automatically; a single
      // failed reconnection attempt keeps the session waiting offline.
      harness.deliverConnectError();
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "offline",
        canDraw: false,
      });

      harness.deliverConnect();
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.snapshot().phase).toBe("joining");
    });
  });

  describe("durable and reject handlers", () => {
    it("applies validated finalize, undo, and redo transitions", async () => {
      const harness = await readyHarness();

      harness.handlerFor("command:finalize")(...finalizeArgs(2));
      harness.handlerFor("command:undo")("cmd-2", strokeAt(3));
      harness.handlerFor("command:redo")("cmd-2", strokeAt(4));

      expect(harness.applyRemoteTransition).toHaveBeenCalledTimes(3);
      expect(harness.applyRemoteTransition).toHaveBeenNthCalledWith(2, {
        kind: "undo",
        commandId: "cmd-2",
        command: strokeAt(3),
        seq: 3,
      });
      expect(harness.applyRemoteTransition).toHaveBeenNthCalledWith(3, {
        kind: "redo",
        commandId: "cmd-2",
        command: strokeAt(4),
        seq: 4,
      });
    });

    it("forwards command:reject to the command manager", async () => {
      const harness = await readyHarness();

      harness.handlerFor("command:reject")("cmd-9", "STALE_COMMAND");

      expect(harness.handleRejection).toHaveBeenCalledWith(
        "cmd-9",
        "STALE_COMMAND",
      );
    });

    it("reconciles when a validated event fails protocol validation", async () => {
      const harness = await readyHarness();

      harness.failProtocolOn("command:finalize");
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "reconciling",
        canDraw: false,
      });
      expect(harness.cancelGesture).toHaveBeenCalledTimes(1);
      expect(harness.clearPresence).toHaveBeenCalledTimes(1);
      expect(harness.clearPreviews).toHaveBeenCalledTimes(1);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });

    it("reconciles when a durable event carries no sequence", async () => {
      const harness = await readyHarness();

      const unsequenced = strokeAt(2) as Command;
      delete unsequenced.seq;
      harness.handlerFor("command:finalize")("cmd-2", unsequenced);
      await harness.flush();

      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });

    it("reconciles when a presence event fails protocol validation", async () => {
      const harness = await readyHarness();

      harness.failProtocolOn("presence:move");
      await harness.flush();

      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });
  });

  describe("presence emission", () => {
    it("emits volatile presence only while ready", async () => {
      const harness = await readyHarness();
      const pos: Point = { x: 12, y: 34 };

      expect(harness.coordinator.emitPresence(pos)).toBe(true);
      expect(harness.emitVolatile).toHaveBeenCalledWith("presence:move", {
        pos,
      });

      harness.deliverDisconnect("transport close");
      expect(harness.coordinator.emitPresence(pos)).toBe(false);
      expect(harness.emitVolatile).toHaveBeenCalledTimes(1);
    });
  });

  describe("presence model forwarding", () => {
    it("forwards validated presence events to the configured callbacks", async () => {
      const onPresenceJoin = vi.fn();
      const onPresenceMove = vi.fn();
      const onPresenceLeave = vi.fn();
      const harness = await readyHarness({
        onPresenceJoin,
        onPresenceMove,
        onPresenceLeave,
      });

      harness.handlerFor("presence:join")("user-2", {
        userColor: "#123abc",
        userName: "Ada",
      });
      harness.handlerFor("presence:move")("user-2", { x: 3, y: 4 });
      harness.handlerFor("presence:leave")("user-2");

      expect(onPresenceJoin).toHaveBeenCalledWith("user-2", {
        userColor: "#123abc",
        userName: "Ada",
      });
      expect(onPresenceMove).toHaveBeenCalledWith("user-2", { x: 3, y: 4 });
      expect(onPresenceLeave).toHaveBeenCalledWith("user-2");
    });

    it("forwards presence joins that arrive mid-join before readiness", async () => {
      const onPresenceJoin = vi.fn();
      const harness = coordinatorHarness({ onPresenceJoin });
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      harness.handlerFor("presence:join")("user-2", {
        userColor: "#123abc",
        userName: "Ada",
      });

      expect(onPresenceJoin).toHaveBeenCalledTimes(1);
    });

    it("stops forwarding presence events after disposal", async () => {
      const onPresenceMove = vi.fn();
      const harness = await readyHarness({ onPresenceMove });
      const moveHandler = harness.handlerFor("presence:move");

      harness.coordinator.dispose();
      moveHandler("user-2", { x: 1, y: 2 });

      expect(onPresenceMove).not.toHaveBeenCalled();
    });

    it("forwards no presence events when no callbacks are configured", async () => {
      const harness = await readyHarness();

      expect(() => {
        harness.handlerFor("presence:move")("user-2", { x: 1, y: 2 });
      }).not.toThrow();
    });
  });

  describe("gap handling", () => {
    it("freezes drawing and starts exactly one 1500 ms timer on a gap", async () => {
      const harness = await readyHarness();

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(3));

      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        canDraw: false,
      });
      expect(harness.publish).toHaveBeenCalledWith(
        expect.objectContaining({ phase: "ready", canDraw: false }),
      );
      const gapTimers = harness.scheduledTimers.filter(
        (timer) => timer.ms === GAP_DEADLINE_MS,
      );
      expect(gapTimers).toHaveLength(1);
      expect(gapTimers[0].cancelled).toBe(false);
    });

    it("restores canDraw when the missing transition arrives at 1499 ms", async () => {
      const harness = await readyHarness();

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(3));
      expect(harness.snapshot().canDraw).toBe(false);

      vi.advanceTimersByTime(GAP_DEADLINE_MS - 1);
      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "applied",
        transitions: [],
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(2));

      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        canDraw: true,
      });
      expect(
        harness.scheduledTimers.find((timer) => timer.ms === GAP_DEADLINE_MS),
      ).toMatchObject({ cancelled: true });

      // The cancelled timer never reconciles.
      vi.advanceTimersByTime(GAP_DEADLINE_MS);
      await harness.flush();
      expect(harness.pendingJoinCount()).toBe(1);
      expect(harness.snapshot().phase).toBe("ready");
    });

    it("requests reconciliation when the gap expires at 1500 ms", async () => {
      const harness = await readyHarness();

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(3));

      vi.advanceTimersByTime(GAP_DEADLINE_MS - 1);
      await harness.flush();
      expect(harness.snapshot().phase).toBe("ready");

      vi.advanceTimersByTime(1);
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "reconciling",
        canDraw: false,
      });
      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });

    it("keeps a single timer for repeated gaps in one episode", async () => {
      const harness = await readyHarness();

      for (const seq of [3, 4]) {
        harness.applyRemoteTransition.mockReturnValueOnce({
          type: "buffered",
          missingSeq: 2,
        });
        harness.handlerFor("command:finalize")(...finalizeArgs(seq));
      }

      expect(harness.snapshot().canDraw).toBe(false);
      expect(
        harness.scheduledTimers.filter((timer) => timer.ms === GAP_DEADLINE_MS),
      ).toHaveLength(1);

      // Missing transition arrives and closes the only gap.
      vi.advanceTimersByTime(1_000);
      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "applied",
        transitions: [],
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(2));

      expect(harness.snapshot().canDraw).toBe(true);

      vi.advanceTimersByTime(GAP_DEADLINE_MS);
      await harness.flush();
      expect(harness.snapshot().phase).toBe("ready");
      expect(harness.pendingJoinCount()).toBe(1);
    });

    it("stays frozen when a drain only partially closes the gap", async () => {
      const harness = await readyHarness();

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(3));
      vi.advanceTimersByTime(1_000);

      // seq 2 applies and drains seq 3, but seq 5 is still buffered behind
      // a new gap at seq 4.
      harness.getBufferedSequences.mockReturnValue([5]);
      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "applied",
        transitions: [],
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(2));

      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        canDraw: false,
      });

      vi.advanceTimersByTime(500);
      await harness.flush();

      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.pendingJoinCount()).toBe(2);
    });

    it("reuses the running timer for a gap opened later in the episode", async () => {
      const harness = await readyHarness();

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(3));
      vi.advanceTimersByTime(1_000);

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(4));
      expect(
        harness.scheduledTimers.filter((timer) => timer.ms === GAP_DEADLINE_MS),
      ).toHaveLength(1);

      // 1000 ms + 500 ms = the original 1500 ms deadline.
      vi.advanceTimersByTime(500);
      await harness.flush();

      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.pendingJoinCount()).toBe(2);
    });
  });

  describe("requestReconciliation", () => {
    it("cleans up local state and rejoins with only the roomId", async () => {
      const harness = await readyHarness();

      harness.coordinator.requestReconciliation("sequence-conflict");
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "reconciling",
        canDraw: false,
      });
      expect(harness.cancelGesture).toHaveBeenCalledTimes(1);
      expect(harness.clearPresence).toHaveBeenCalledTimes(1);
      expect(harness.clearPreviews).toHaveBeenCalledTimes(1);
      expect(harness.journalClear).toHaveBeenCalledTimes(1);
      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });

    it("is idempotent while a reconciliation is in flight", async () => {
      const harness = await readyHarness();

      harness.coordinator.requestReconciliation("protocol-validation");
      harness.coordinator.requestReconciliation("sequence-gap");
      harness.coordinator.requestReconciliation("ack-timeout");
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.cancelGesture).toHaveBeenCalledTimes(1);
    });

    it("defers a reconciliation requested before the transport connects", async () => {
      const harness = coordinatorHarness();

      // Before start there is no session to reconcile.
      harness.coordinator.requestReconciliation("sequence-gap");
      expect(harness.publish).not.toHaveBeenCalled();

      harness.coordinator.start();
      harness.coordinator.requestReconciliation("protocol-validation");
      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.pendingJoinCount()).toBe(0);

      harness.deliverConnect();
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(1);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });

    it("completes a replacement only after its ack and sync", async () => {
      const harness = await readyHarness();

      harness.coordinator.requestReconciliation("sequence-gap");
      await harness.flush();
      expect(harness.snapshot().phase).toBe("reconciling");

      harness.ackJoin();
      await harness.flush();
      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.snapshot().canDraw).toBe(false);

      harness.handlerFor("room:sync")([strokeAt(1)]);
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        role: "editor",
        canDraw: true,
      });
      expect(harness.installSync).toHaveBeenLastCalledWith([strokeAt(1)], true);
    });

    it("clears a running gap timer when reconciliation starts", async () => {
      const harness = await readyHarness();

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(3));

      harness.coordinator.requestReconciliation("ack-timeout");
      await harness.flush();

      vi.advanceTimersByTime(GAP_DEADLINE_MS);
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(2);
    });

    it("ignores a late acknowledgement for a superseded join attempt", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      expect(harness.pendingJoinCount()).toBe(1); // attempt A in flight

      // Reconciliation supersedes attempt A with a replacement attempt B.
      harness.coordinator.requestReconciliation("protocol-validation");
      await harness.flush();
      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.snapshot().phase).toBe("reconciling");

      // The stale attempt A acknowledgement must not complete anything.
      harness.ackJoin(0);
      await harness.flush();
      expect(harness.snapshot().phase).toBe("reconciling");

      harness.ackJoin();
      await harness.flush();
      harness.handlerFor("room:sync")([strokeAt(1)]);
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        role: "editor",
      });
      expect(harness.installSync).toHaveBeenLastCalledWith([strokeAt(1)], true);
    });
  });

  describe("safety-path hardening against throwing tool callbacks", () => {
    it("a throwing cancelGesture cannot abort the disconnect reconciliation", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const harness = await readyHarness({
        cancelGesture: () => {
          throw new Error("tool callback failed");
        },
      });
      harness.pendingOperations.push({
        operationId: "op-1",
        commandId: "cmd-local",
        kind: "finalize",
        status: "pending",
        optimisticCanonical: strokeAt(1, "user-1"),
      });

      expect(() => harness.deliverDisconnect("transport close")).not.toThrow();
      await harness.flush();

      // The command manager still saw the disconnect, so pending durable
      // operations were marked uncertain and reconciliation was requested.
      expect(harness.handleDisconnect).toHaveBeenCalledTimes(1);
      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.journalClear).toHaveBeenCalledTimes(1);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("cancelGesture"),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });

    it("a throwing cancelGesture cannot abort a requested reconciliation", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const harness = await readyHarness({
        cancelGesture: () => {
          throw new Error("tool callback failed");
        },
      });

      expect(() =>
        harness.coordinator.requestReconciliation("sequence-gap"),
      ).not.toThrow();
      await harness.flush();

      // Local state was cleared and the replacement join was emitted
      // despite the tool callback throwing.
      expect(harness.clearPresence).toHaveBeenCalledTimes(1);
      expect(harness.clearPreviews).toHaveBeenCalledTimes(1);
      expect(harness.journalClear).toHaveBeenCalledTimes(1);
      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("cancelGesture"),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });

    it("a throwing cancelGesture cannot abort the offline freeze on disconnect", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const harness = await readyHarness({
        cancelGesture: () => {
          throw new Error("tool callback failed");
        },
      });

      expect(() => harness.deliverDisconnect("transport close")).not.toThrow();

      // Without pending operations the session still freezes offline and
      // the command manager still processed the disconnect.
      expect(harness.snapshot().phase).toBe("offline");
      expect(harness.handleDisconnect).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  describe("reconnect", () => {
    it("moves to offline when the transport disconnects after ready", async () => {
      const harness = await readyHarness();

      harness.deliverDisconnect("transport close");

      expect(harness.snapshot()).toMatchObject({
        phase: "offline",
        canDraw: false,
      });
      expect(harness.handleDisconnect).toHaveBeenCalledTimes(1);
      expect(harness.clearPresence).toHaveBeenCalledTimes(1);
    });

    it("cancels the active gesture when the transport disconnects", async () => {
      const harness = await readyHarness();

      harness.deliverDisconnect("transport close");

      expect(harness.cancelGesture).toHaveBeenCalledTimes(1);
      expect(harness.handleDisconnect).toHaveBeenCalledTimes(1);
      // The gesture is cancelled before the command manager sees the
      // disconnect, so the tool's own rollback wins the race.
      expect(harness.cancelGesture.mock.invocationCallOrder[0]).toBeLessThan(
        harness.handleDisconnect.mock.invocationCallOrder[0],
      );
    });

    it("rejoins with lastSeq from the document cursor on reconnect", async () => {
      const harness = await readyHarness();
      harness.getHighestContiguousSeq.mockReturnValue(7);

      harness.deliverDisconnect("transport close");
      harness.deliverConnect();
      await harness.flush();

      expect(harness.lastJoinPayload()).toEqual({
        roomId: ROOM_ID,
        lastSeq: 7,
      });
      expect(harness.snapshot().phase).toBe("joining");
    });

    it("installs the reconnect delta without replacement", async () => {
      const harness = await readyHarness();
      harness.getHighestContiguousSeq.mockReturnValue(5);

      harness.deliverDisconnect("transport close");
      harness.deliverConnect();
      await harness.flush();
      harness.ackJoin();
      await harness.flush();
      harness.handlerFor("room:sync")([strokeAt(6)]);
      await harness.flush();

      expect(harness.installSync).toHaveBeenLastCalledWith(
        [strokeAt(6)],
        false,
      );
      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        role: "editor",
        canDraw: true,
      });
    });

    it("supports sync-first ordering on reconnect", async () => {
      const harness = await readyHarness();

      harness.deliverDisconnect("transport close");
      harness.deliverConnect();
      await harness.flush();
      harness.handlerFor("room:sync")([strokeAt(2)]);
      await harness.flush();
      expect(harness.snapshot().phase).toBe("syncing");

      harness.ackJoin();
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({ phase: "ready" });
      expect(harness.installSync).toHaveBeenLastCalledWith(
        [strokeAt(2)],
        false,
      );
    });

    it("escalates to replacement when the reconnect delta is ambiguous", async () => {
      const harness = await readyHarness();

      harness.deliverDisconnect("transport close");
      harness.deliverConnect();
      await harness.flush();
      harness.ackJoin();
      await harness.flush();

      harness.failNextDeltaInstall();
      harness.handlerFor("room:sync")([strokeAt(2)]);
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "reconciling",
        canDraw: false,
      });
      // Once from the disconnect handler and once from the reconciliation.
      expect(harness.cancelGesture).toHaveBeenCalledTimes(2);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });

    it("replaces state after reconnect when an operation was pending at disconnect", async () => {
      const harness = await readyHarness();
      harness.pendingOperations.push({
        operationId: "op-1",
        commandId: "cmd-local",
        kind: "finalize",
        status: "pending",
        optimisticCanonical: strokeAt(1, "user-1"),
      });
      harness.getHighestContiguousSeq.mockReturnValue(3);

      harness.deliverDisconnect("transport close");
      await harness.flush();

      // Reconciliation was requested but the transport is down: the join is
      // deferred, and it must be a replacement (no lastSeq) because the
      // pending operation made local state uncertain.
      expect(harness.snapshot().phase).toBe("reconciling");
      expect(harness.pendingJoinCount()).toBe(1);
      // The gesture is cancelled twice in this flow: once directly by the
      // disconnect handler and once through the requested reconciliation.
      expect(harness.cancelGesture).toHaveBeenCalledTimes(2);

      harness.deliverConnect();
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });

      harness.ackJoin();
      await harness.flush();
      harness.handlerFor("room:sync")([strokeAt(1)]);
      await harness.flush();

      expect(harness.snapshot()).toMatchObject({
        phase: "ready",
        canDraw: true,
      });
      expect(harness.installSync).toHaveBeenLastCalledWith([strokeAt(1)], true);
    });

    it("rejoins without lastSeq when disconnect precedes the first sync", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();
      expect(harness.snapshot().phase).toBe("joining");

      harness.deliverDisconnect("transport close");
      expect(harness.snapshot().phase).toBe("offline");

      harness.deliverConnect();
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(2);
      expect(harness.lastJoinPayload()).toEqual({ roomId: ROOM_ID });
    });

    it("ignores sync payloads while offline", async () => {
      const harness = await readyHarness();

      harness.deliverDisconnect("transport close");
      await harness.flush();
      harness.handlerFor("room:sync")([strokeAt(2)]);
      await harness.flush();

      expect(harness.installSync).toHaveBeenCalledTimes(1);
      expect(harness.snapshot().phase).toBe("offline");
    });

    it("ignores durable events while offline", async () => {
      const harness = await readyHarness();

      harness.deliverDisconnect("transport close");
      harness.handlerFor("command:finalize")(...finalizeArgs(2));

      expect(harness.applyRemoteTransition).not.toHaveBeenCalled();
      expect(harness.snapshot().phase).toBe("offline");
    });
  });

  describe("dispose", () => {
    it("stops all work and is idempotent", async () => {
      const harness = await readyHarness();

      // Capture the coordinator's own handlers before disposal removes the
      // socket listeners, so the internal disposed guards are also exercised.
      const syncHandler = harness.handlerFor("room:sync");
      const rejectHandler = harness.handlerFor("command:reject");
      const finalizeHandler = harness.handlerFor("command:finalize");

      harness.coordinator.dispose();
      harness.coordinator.dispose();

      syncHandler([strokeAt(2)]);
      rejectHandler("cmd-1", "LATE");
      finalizeHandler(...finalizeArgs(2));
      harness.deliverDisconnect("transport close");
      harness.deliverConnect();
      await harness.flush();

      expect(harness.installSync).toHaveBeenCalledTimes(1);
      expect(harness.applyRemoteTransition).not.toHaveBeenCalled();
      expect(harness.handleRejection).not.toHaveBeenCalled();
      expect(harness.handleDisconnect).not.toHaveBeenCalled();
      expect(harness.connect).toHaveBeenCalledTimes(1);
      expect(harness.pendingJoinCount()).toBe(1);
      expect(harness.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ phase: "offline" }),
      );
    });

    it("clears a pending gap timer", async () => {
      const harness = await readyHarness();

      harness.applyRemoteTransition.mockReturnValueOnce({
        type: "buffered",
        missingSeq: 2,
      });
      harness.handlerFor("command:finalize")(...finalizeArgs(3));

      harness.coordinator.dispose();
      vi.advanceTimersByTime(GAP_DEADLINE_MS);
      await harness.flush();

      expect(harness.pendingJoinCount()).toBe(1);
      expect(
        harness.scheduledTimers.find((timer) => timer.ms === GAP_DEADLINE_MS),
      ).toMatchObject({ cancelled: true });
    });

    it("no-ops every public method after disposal", async () => {
      const harness = await readyHarness();

      harness.coordinator.dispose();
      harness.coordinator.start();
      harness.coordinator.requestReconciliation("sequence-gap");
      expect(harness.coordinator.emitPresence({ x: 1, y: 2 })).toBe(false);

      expect(harness.connect).toHaveBeenCalledTimes(1);
      expect(harness.pendingJoinCount()).toBe(1);
      expect(harness.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ phase: "reconciling" }),
      );
    });

    it("ignores a join acknowledgement that settles after disposal", async () => {
      const harness = coordinatorHarness();
      harness.coordinator.start();
      harness.deliverConnect();
      await harness.flush();

      harness.coordinator.dispose();
      vi.advanceTimersByTime(JOIN_DEADLINE_MS);
      await harness.flush();
      harness.ackJoin();
      await harness.flush();

      expect(harness.snapshot().phase).toBe("joining");
      expect(harness.snapshot().error).toBeNull();
      expect(harness.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ phase: "error" }),
      );
    });
  });
});

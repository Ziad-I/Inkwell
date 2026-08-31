import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useBoardManagers } from "@/context/boardManagersContext";
import type { BoardManagersContextValue } from "@/context/boardManagersContext";
import Toolbar from "@/components/board/toolbar/toolbar";
import { CommandFactory } from "@/core/commandFactory";
import { useSessionStore } from "@/stores/sessionStore";
import { useToolStore } from "@/stores/toolStore";
import { useRemotePresenceStore } from "@/stores/remotePresenceStore";
import { Tools } from "@/types/tool";
import type { StageOperations } from "@/types/common";
import type { BoardSessionSnapshot } from "@/types/session";
import type {
  Command,
  RenderableCommand,
  StrokePayload,
} from "@/types/command";
import {
  serverAck,
  serverEmit,
  socketEmissions,
  type MockSocket,
} from "@/__tests__/mocks/socket-io";

const SOCKET_URL = "http://localhost:3000";
const ROOM_ID = "room-safety";
const REMOTE_USER = "user-remote";
const GAP_DEADLINE_MS = 1_500;
const ACK_DEADLINE_MS = 8_000;

const EDITOR_ACK = {
  role: "editor",
  permissions: { read: true, draw: true },
};
const VIEWER_ACK = {
  role: "viewer",
  permissions: { read: true, draw: false },
};

// ---------------------------------------------------------------------------
// Deferred tool loading with the real tools
// ---------------------------------------------------------------------------

/**
 * ToolManager.initTools() gates the coordinator start. The loaders resolve
 * immediately by default; tests that need a deferred initialization (room
 * switch) block specific mounts with `defer()`.
 */
const toolGate = vi.hoisted(() => {
  let currentGate: Promise<void> = Promise.resolve();

  return {
    defer(): () => void {
      let release!: () => void;
      currentGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    wait(): Promise<void> {
      return currentGate;
    },
  };
});

vi.mock("@/core/toolLoaders", async () => {
  const [{ BrushTool }, { EraserTool }, { ShapesTool }, { SelectionTool }] =
    await Promise.all([
      import("@/tools/brushTool"),
      import("@/tools/eraserTool"),
      import("@/tools/shapesTool"),
      import("@/tools/selectionTool"),
    ]);
  const gated =
    (Ctor: new (ctx: never) => unknown) =>
    async (ctx: never): Promise<unknown> => {
      await toolGate.wait();
      return new Ctor(ctx);
    };
  return {
    toolLoaders: {
      brush: { eager: true, load: gated(BrushTool) },
      eraser: { eager: true, load: gated(EraserTool) },
      shapes: { eager: true, load: gated(ShapesTool) },
      selection: { eager: true, load: gated(SelectionTool) },
    },
  };
});

const toastMock = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
vi.mock("sonner", () => toastMock);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const latestContext: { current: BoardManagersContextValue | null } = {
  current: null,
};

const sessionHistory: BoardSessionSnapshot[] = [];
let unsubscribeSession: (() => void) | null = null;
let activeUnmount: (() => void) | null = null;

function spyCreateInstance() {
  return vi.spyOn(CommandFactory.prototype, "createInstance");
}

let factorySpy: ReturnType<typeof spyCreateInstance> | null = null;

function ManagersProbe() {
  const ctx = useBoardManagers();
  latestContext.current = ctx;
  return null;
}

function makeKonvaNode(id: string) {
  return {
    id: vi.fn(() => id),
    setAttrs: vi.fn(),
    getAttr: vi.fn(),
    destroy: vi.fn(),
    remove: vi.fn(),
    getLayer: vi.fn(() => ({})),
    getParent: vi.fn(() => ({})),
  };
}

function createStageOperations() {
  const pointer: { current: { x: number; y: number } | null } = {
    current: { x: 10, y: 10 },
  };
  const ops = {
    getStage: vi.fn(() => ({
      getPointerPosition: () => pointer.current,
      container: () => null,
    })),
    getScale: vi.fn(() => 1),
    getViewpointPos: vi.fn(() => ({ x: 0, y: 0 })),
    getDrawingLayer: vi.fn(() => ({})),
    getOverlayLayer: vi.fn(() => ({})),
    createNode: vi.fn((_Ctor: unknown, config: { id?: string } | undefined) =>
      makeKonvaNode(config?.id ?? `node-anon`),
    ),
    addDrawingNode: vi.fn(),
    addOverlayNode: vi.fn(),
    removeNode: vi.fn(),
    removeNodeById: vi.fn(),
    getNodeById: vi.fn(() => null),
    redrawDrawingLayer: vi.fn(),
    redrawOverlayLayer: vi.fn(),
    toggleDrawing: vi.fn(),
    resetRoomScene: vi.fn(),
    screenToWorld: vi.fn((x: number, y: number) => ({ x, y })),
    worldToScreen: vi.fn((x: number, y: number) => ({ x, y })),
  };
  return {
    ops: ops as unknown as StageOperations & typeof ops,
    pointer,
  };
}

function providerElement(
  roomId: string,
  stageOps: StageOperations,
  children?: ReactNode,
) {
  return (
    <BoardManagersProvider
      url={SOCKET_URL}
      roomId={roomId}
      stageOperations={stageOps}
    >
      <ManagersProbe />
      {children}
    </BoardManagersProvider>
  );
}

function renderProvider(
  roomId: string,
  stageOps: StageOperations,
  children?: ReactNode,
) {
  const view = render(providerElement(roomId, stageOps, children));
  activeUnmount = view.unmount;
  return view;
}

function createdSockets(): MockSocket[] {
  return vi
    .mocked(io)
    .mock.results.map((result) => result.value as unknown as MockSocket);
}

async function flush(times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

function emitServer(event: string, ...args: unknown[]): void {
  act(() => {
    serverEmit(event, ...args);
  });
}

function ackServer(event: string, err?: unknown, resp?: unknown): void {
  act(() => {
    serverAck(event, err, resp);
  });
}

/** Mounts a session and lets tool initialization and start() complete. */
async function mountSession(
  options: { roomId?: string; children?: ReactNode } = {},
) {
  const stage = createStageOperations();
  renderProvider(options.roomId ?? ROOM_ID, stage.ops, options.children);
  await flush(3);

  const sockets = createdSockets();
  expect(sockets).toHaveLength(1);
  return { socket: sockets[0], stageOps: stage.ops, pointer: stage.pointer };
}

/**
 * Drives the mounted session through connect → join ack → sync and asserts
 * each phase transition so failures localize precisely.
 */
async function driveToReady(
  options: { ack?: unknown; sync?: Command[] } = {},
): Promise<void> {
  expect(useSessionStore.getState().session.phase).toBe("connecting");
  emitServer("connect");
  await flush(2);
  expect(useSessionStore.getState().session.phase).toBe("joining");

  ackServer("room:join", undefined, options.ack ?? EDITOR_ACK);
  await flush(2);

  emitServer("room:sync", options.sync ?? []);
  await flush(2);
  expect(useSessionStore.getState().session.phase).toBe("ready");
}

function commandManager() {
  const manager = latestContext.current?.commandManagerRef.current;
  expect(manager).not.toBeNull();
  return manager!;
}

function toolManager() {
  const manager = latestContext.current?.toolManagerRef.current;
  expect(manager).not.toBeNull();
  return manager!;
}

function createdNodeIds(stageOps: StageOperations): (string | undefined)[] {
  return vi
    .mocked(stageOps.createNode)
    .mock.calls.map((call) => (call[1] as { id?: string } | undefined)?.id);
}

function removeNodeByIdCalls(
  stageOps: StageOperations,
  nodeId: string,
): unknown[][] {
  return vi
    .mocked(stageOps.removeNodeById)
    .mock.calls.filter((call) => call[0] === nodeId);
}

function joinPayloads(
  socket: MockSocket,
): Array<{ roomId: string; lastSeq?: number }> {
  return socketEmissions(socket, "room:join").map(
    (call) => call[1] as { roomId: string; lastSeq?: number },
  );
}

function lastLocalCommand(socket: MockSocket): { id: string; nodeId: string } {
  const creations = socketEmissions(socket, "command:create");
  const payload = creations.at(-1)![1] as {
    id: string;
    command: { payload: { nodeId: string } };
  };
  return { id: payload.id, nodeId: payload.command.payload.nodeId };
}

async function waitForBrushTool(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (useToolStore.getState().activeToolId === "brush") {
      return;
    }
    await flush();
  }
  expect(useToolStore.getState().activeToolId).toBe("brush");
}

/** Pointer-down + one pointer-move: a stroke preview exists, un-finalized. */
async function drawPendingStroke(pointer: {
  current: { x: number; y: number } | null;
}): Promise<void> {
  await waitForBrushTool();
  const tools = toolManager();
  act(() => {
    tools.handlePointerDown({} as never);
    pointer.current = { x: 72, y: 48 };
    tools.handlePointerMove({} as never);
  });
  await flush();
}

/** Completes a pending stroke gesture through pointer-up (finalize). */
async function completeStrokeGesture(): Promise<void> {
  const tools = toolManager();
  act(() => {
    tools.handlePointerUp({} as never);
  });
  await flush();
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function remoteStrokeAt(seq: number): RenderableCommand {
  return {
    id: `cmd-${seq}`,
    type: "stroke",
    owner: REMOTE_USER,
    status: "applied",
    timestamp: seq * 1000,
    seq,
    payload: strokePayload(`node-${seq}`),
  };
}

/** Schema-valid command whose payload carries a NaN coordinate. */
function malformedStroke(id: string): RenderableCommand {
  return {
    id,
    type: "stroke",
    owner: REMOTE_USER,
    status: "applied",
    timestamp: 5_000,
    seq: 5,
    payload: { ...strokePayload(`node-${id}`), points: [0, Number.NaN, 8, 8] },
  };
}

/** Schema-valid reverted command: ambiguous in any delta it does not cover. */
function tombstoneStroke(seq: number): RenderableCommand {
  return {
    id: "cmd-tomb",
    type: "stroke",
    owner: REMOTE_USER,
    status: "reverted",
    timestamp: seq * 1_000,
    seq,
    payload: strokePayload("node-tomb"),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  sessionHistory.length = 0;
  toastMock.toast.error.mockClear();
  latestContext.current = null;
  activeUnmount = null;
  useSessionStore.getState().reset();
  useToolStore.setState({ activeToolId: null, allTools: [] });
  useRemotePresenceStore.getState().clearAll();
  unsubscribeSession = useSessionStore.subscribe((state) =>
    sessionHistory.push(state.session),
  );
});

afterEach(() => {
  unsubscribeSession?.();
  unsubscribeSession = null;
  activeUnmount?.();
  activeUnmount = null;
  if (factorySpy) {
    factorySpy.mockRestore();
    factorySpy = null;
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collaboration safety integration", () => {
  describe("join readiness", () => {
    it("publishes ready once with editor capability exposed atomically", async () => {
      await mountSession();
      await driveToReady();

      const readySnapshots = sessionHistory.filter(
        (snapshot) => snapshot.phase === "ready",
      );
      expect(readySnapshots).toHaveLength(1);
      expect(readySnapshots[0]).toMatchObject({
        roomId: ROOM_ID,
        phase: "ready",
        role: "editor",
        canDraw: true,
        error: null,
      });
      expect(readySnapshots[0].permissions).toEqual({ read: true, draw: true });

      // Atomicity: no snapshot ever exposes a role or drawing permission
      // outside the ready phase.
      for (const snapshot of sessionHistory) {
        if (snapshot.canDraw || snapshot.role !== null) {
          expect(snapshot.phase).toBe("ready");
        }
      }
    });

    it("does not publish ready when sync arrives before the join acknowledgement", async () => {
      await mountSession();

      emitServer("connect");
      await flush(2);
      emitServer("room:sync", []);
      await flush(2);

      expect(useSessionStore.getState().session).toMatchObject({
        phase: "syncing",
        role: null,
        canDraw: false,
      });
      expect(
        sessionHistory.filter((snapshot) => snapshot.phase === "ready"),
      ).toHaveLength(0);

      ackServer("room:join", undefined, EDITOR_ACK);
      await flush(2);

      expect(useSessionStore.getState().session).toMatchObject({
        phase: "ready",
        role: "editor",
        canDraw: true,
      });
      expect(
        sessionHistory.filter((snapshot) => snapshot.phase === "ready"),
      ).toHaveLength(1);
    });

    it("buffers a live sequence-2 finalize during sync and drains both in order", async () => {
      const { stageOps } = await mountSession();

      emitServer("connect");
      await flush(2);
      emitServer("room:sync", [remoteStrokeAt(1)]);
      await flush(2);
      expect(useSessionStore.getState().session.phase).toBe("syncing");
      expect(createdNodeIds(stageOps)).toEqual(["node-1"]);

      // Live transition while the join acknowledgement is outstanding:
      // buffered, never applied.
      emitServer("command:finalize", "cmd-2", remoteStrokeAt(2));
      await flush(2);
      expect(createdNodeIds(stageOps)).toEqual(["node-1"]);
      expect(commandManager().getOperation("cmd-2")).toBeUndefined();

      ackServer("room:join", undefined, EDITOR_ACK);
      await flush(2);

      expect(useSessionStore.getState().session.phase).toBe("ready");
      expect(createdNodeIds(stageOps)).toEqual(["node-1", "node-2"]);
      expect(commandManager().getOperation("cmd-2")).toMatchObject({
        status: "applied",
        seq: 2,
      });
      expect(commandManager().getLastSeq()).toBe(2);
    });
  });

  describe("sequence gaps", () => {
    it("freezes drawing and rejoins without lastSeq when the gap expires at 1500 ms", async () => {
      const { socket } = await mountSession();
      await driveToReady({ sync: [] });

      emitServer("command:finalize", "cmd-2", remoteStrokeAt(2));
      await flush(2);
      expect(useSessionStore.getState().session.canDraw).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(GAP_DEADLINE_MS);
      });

      expect(useSessionStore.getState().session).toMatchObject({
        phase: "reconciling",
        canDraw: false,
      });
      const joins = joinPayloads(socket);
      expect(joins).toHaveLength(2);
      expect(joins[1]).toEqual({ roomId: ROOM_ID });
    });

    it("restores drawing when the missing sequence arrives at 1499 ms", async () => {
      const { socket, stageOps } = await mountSession();
      await driveToReady({ sync: [] });

      emitServer("command:finalize", "cmd-2", remoteStrokeAt(2));
      await flush(2);
      expect(useSessionStore.getState().session.canDraw).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(GAP_DEADLINE_MS - 1);
      });

      emitServer("command:finalize", "cmd-1", remoteStrokeAt(1));
      await flush(2);

      expect(useSessionStore.getState().session).toMatchObject({
        phase: "ready",
        canDraw: true,
      });
      expect(createdNodeIds(stageOps)).toEqual(["node-1", "node-2"]);

      // The gap timer was cancelled: no replacement join ever happens.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(GAP_DEADLINE_MS);
      });
      expect(joinPayloads(socket)).toHaveLength(1);
      expect(useSessionStore.getState().session.phase).toBe("ready");
    });
  });

  describe("malformed sync payloads", () => {
    it("reconciles a schema-invalid sync command without creating an instance", async () => {
      factorySpy = spyCreateInstance();
      const { socket, stageOps } = await mountSession();

      emitServer("connect");
      await flush(2);
      ackServer("room:join", undefined, EDITOR_ACK);
      await flush(2);

      emitServer("room:sync", [malformedStroke("cmd-bad")]);
      await flush(2);

      expect(useSessionStore.getState().session).toMatchObject({
        phase: "reconciling",
        canDraw: false,
      });
      expect(joinPayloads(socket).at(-1)).toEqual({ roomId: ROOM_ID });
      expect(factorySpy).not.toHaveBeenCalled();
      expect(createdNodeIds(stageOps)).toEqual([]);

      // The replacement join restores the session.
      ackServer("room:join", undefined, EDITOR_ACK);
      emitServer("room:sync", []);
      await flush(2);
      expect(useSessionStore.getState().session.phase).toBe("ready");
    });

    it("escalates a tombstone command in a delta sync to a replacement join", async () => {
      factorySpy = spyCreateInstance();
      const { socket, stageOps } = await mountSession();
      await driveToReady({ sync: [remoteStrokeAt(1)] });
      expect(createdNodeIds(stageOps)).toEqual(["node-1"]);
      factorySpy.mockClear();

      emitServer("disconnect", "transport close");
      await flush(2);
      emitServer("connect");
      await flush(2);
      expect(joinPayloads(socket).at(-1)).toEqual({
        roomId: ROOM_ID,
        lastSeq: 1,
      });
      ackServer("room:join", undefined, EDITOR_ACK);
      await flush(2);

      emitServer("room:sync", [tombstoneStroke(3)]);
      await flush(2);

      expect(useSessionStore.getState().session).toMatchObject({
        phase: "reconciling",
        canDraw: false,
      });
      expect(joinPayloads(socket).at(-1)).toEqual({ roomId: ROOM_ID });
      // The tombstone never produced a stage node or a command instance.
      expect(createdNodeIds(stageOps)).toEqual(["node-1"]);
      expect(
        factorySpy.mock.calls.filter(
          (call) => (call[0] as Command).id === "cmd-tomb",
        ),
      ).toHaveLength(0);
    });
  });

  describe("durable operation safety", () => {
    it("marks a finalize uncertain after the 8000 ms deadline without retrying", async () => {
      const { socket, pointer } = await mountSession();
      await driveToReady();

      await drawPendingStroke(pointer);
      await completeStrokeGesture();

      const command = lastLocalCommand(socket);
      expect(socketEmissions(socket, "command:finalize")).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACK_DEADLINE_MS);
      });

      expect(useSessionStore.getState().session.phase).toBe("reconciling");
      expect(socketEmissions(socket, "command:finalize")).toHaveLength(1);
      // Optimistic state is retained while the outcome is uncertain.
      expect(commandManager().getOperation(command.id)).toMatchObject({
        status: "applied",
      });
      expect(commandManager().getUndoStack()).toEqual([command.id]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(socketEmissions(socket, "command:finalize")).toHaveLength(1);
    });

    it("applies the visual inverse exactly once across an ack rejection and a late reject event", async () => {
      const { socket, stageOps, pointer } = await mountSession();
      await driveToReady();

      await drawPendingStroke(pointer);
      await completeStrokeGesture();
      const command = lastLocalCommand(socket);

      ackServer("command:finalize", "INVALID_COMMAND");
      await flush(2);

      // Rejected once: the preview is removed and the user is notified.
      expect(removeNodeByIdCalls(stageOps, command.nodeId)).toEqual([
        [command.nodeId, false],
        [command.nodeId, true],
      ]);
      expect(toastMock.toast.error).toHaveBeenCalledTimes(1);
      expect(commandManager().getOperation(command.id)).toBeUndefined();
      expect(commandManager().getUndoStack()).toEqual([]);

      // The duplicate reject event must not roll anything back again.
      emitServer("command:reject", command.id, "LATE_REJECT");
      await flush(2);

      expect(removeNodeByIdCalls(stageOps, command.nodeId)).toEqual([
        [command.nodeId, false],
        [command.nodeId, true],
      ]);
      expect(toastMock.toast.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("rejected preview recovery", () => {
    it("a rejected preview no longer wedges the active tool gesture", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { socket, pointer } = await mountSession();
      await driveToReady();

      // A live, un-finalized brush gesture.
      await drawPendingStroke(pointer);
      const command = lastLocalCommand(socket);

      emitServer("command:reject", command.id, "INVALID_COMMAND");
      await flush(2);
      expect(commandManager().getOperation(command.id)).toBeUndefined();

      // The tool still holds the stale command ID: subsequent pointer
      // events and gesture cancellation must not throw, and the session
      // must remain usable.
      const tools = toolManager();
      expect(() => {
        act(() => {
          pointer.current = { x: 90, y: 60 };
          tools.handlePointerMove({} as never);
          tools.handlePointerUp({} as never);
          tools.cancelActiveGesture();
        });
      }).not.toThrow();

      expect(useSessionStore.getState().session.phase).toBe("ready");
      warnSpy.mockRestore();
    });
  });

  describe("disconnect with a pending gesture", () => {
    it("rolls back a mid-gesture brush preview and leaves no ghost after a delta rejoin", async () => {
      const { socket, stageOps, pointer } = await mountSession();
      await driveToReady();

      await drawPendingStroke(pointer);
      const command = lastLocalCommand(socket);
      expect(createdNodeIds(stageOps)).toEqual([command.nodeId]);

      emitServer("disconnect", "transport close");
      await flush(2);

      // The preview rolled back locally although the cancel emission is
      // suppressed by the lost capability.
      expect(commandManager().getOperation(command.id)).toBeUndefined();
      expect(removeNodeByIdCalls(stageOps, command.nodeId)).toEqual([
        [command.nodeId, false],
        [command.nodeId, true],
      ]);
      expect(socketEmissions(socket, "command:cancel")).toHaveLength(0);
      // The gesture cleared the pending state, so a plain delta rejoin is
      // safe: nothing uncertain remains.
      expect(useSessionStore.getState().session.phase).toBe("offline");

      emitServer("connect");
      await flush(2);
      expect(joinPayloads(socket).at(-1)).toEqual({
        roomId: ROOM_ID,
        lastSeq: 0,
      });
      ackServer("room:join", undefined, EDITOR_ACK);
      emitServer("room:sync", []);
      await flush(2);

      expect(useSessionStore.getState().session.phase).toBe("ready");
      // No ghost: the cancelled preview was never re-created.
      expect(
        createdNodeIds(stageOps).filter((id) => id === command.nodeId),
      ).toHaveLength(1);
    });

    it("rolls back a manager-held un-finalized preview and reconciles", async () => {
      const { socket, stageOps } = await mountSession();
      await driveToReady();

      const id = commandManager().startCommand(
        "stroke",
        strokePayload("node-direct"),
      );
      expect(id).not.toBeNull();
      expect(createdNodeIds(stageOps)).toEqual(["node-direct"]);

      emitServer("disconnect", "transport close");
      await flush(2);

      expect(commandManager().getOperation(id!)).toBeUndefined();
      expect(removeNodeByIdCalls(stageOps, "node-direct")).toEqual([
        ["node-direct", false],
        ["node-direct", true],
      ]);
      // The uncertain preview freezes the session into reconciliation.
      expect(useSessionStore.getState().session.phase).toBe("reconciling");

      emitServer("connect");
      await flush(2);
      // The deferred replacement join deliberately omits lastSeq.
      expect(joinPayloads(socket).at(-1)).toEqual({ roomId: ROOM_ID });
      ackServer("room:join", undefined, EDITOR_ACK);
      emitServer("room:sync", []);
      await flush(2);

      expect(useSessionStore.getState().session.phase).toBe("ready");
      expect(
        createdNodeIds(stageOps).filter((nodeId) => nodeId === "node-direct"),
      ).toHaveLength(1);
    });
  });

  describe("reconnect", () => {
    it("rejoins with the contiguous sequence cursor after reconnect", async () => {
      const { socket } = await mountSession();
      await driveToReady({ sync: [remoteStrokeAt(1)] });

      emitServer("command:finalize", "cmd-2", remoteStrokeAt(2));
      await flush(2);

      emitServer("disconnect", "transport close");
      await flush(2);
      emitServer("connect");
      await flush(2);

      expect(joinPayloads(socket).at(-1)).toEqual({
        roomId: ROOM_ID,
        lastSeq: 2,
      });

      ackServer("room:join", undefined, EDITOR_ACK);
      emitServer("room:sync", []);
      await flush(2);

      expect(useSessionStore.getState().session.phase).toBe("ready");
      expect(commandManager().getLastSeq()).toBe(2);
    });
  });

  describe("room switch", () => {
    it("disposes room A and lets room B work while A's initialization is deferred", async () => {
      const releaseRoomA = toolGate.defer();
      const stage = createStageOperations();
      const view = renderProvider("room-a", stage.ops);

      const releaseRoomB = toolGate.defer();
      view.rerender(providerElement("room-b", stage.ops));

      await act(async () => {
        releaseRoomB();
      });
      await flush(3);

      const sockets = createdSockets();
      expect(sockets).toHaveLength(2);
      // Room A was disposed: its transport is down and its scene was reset.
      expect(sockets[0].connect).not.toHaveBeenCalled();
      expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
      expect(stage.ops.resetRoomScene).toHaveBeenCalledTimes(1);

      // Room B works end to end.
      emitServer("connect");
      await flush(2);
      ackServer("room:join", undefined, EDITOR_ACK);
      emitServer("room:sync", []);
      await flush(2);
      expect(useSessionStore.getState().session).toMatchObject({
        roomId: "room-b",
        phase: "ready",
        canDraw: true,
      });
      expect(
        commandManager().startCommand("stroke", strokePayload("node-b")),
      ).not.toBeNull();

      // Room A's deferred initialization resolves late and stays inert.
      await act(async () => {
        releaseRoomA();
      });
      await flush(3);

      expect(sockets[0].connect).not.toHaveBeenCalled();
      expect(sockets[1].connect).toHaveBeenCalledTimes(1);
      expect(sockets[1].disconnect).not.toHaveBeenCalled();
      expect(useSessionStore.getState().session.phase).toBe("ready");
    });
  });

  describe("viewer capability", () => {
    it("keeps mutating toolbar buttons disabled and manager mutations inert", async () => {
      await mountSession({ children: <Toolbar /> });
      await driveToReady({ ack: VIEWER_ACK });

      expect(screen.getByRole("button", { name: "Brush" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Eraser" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Shapes" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Selection" })).toBeDisabled();

      expect(
        commandManager().startCommand("stroke", strokePayload("node-v")),
      ).toBeNull();
      expect(useToolStore.getState().activeToolId).toBeNull();

      let activated = true;
      await act(async () => {
        activated = await toolManager().activateTool(Tools.Brush);
      });
      expect(activated).toBe(false);
      expect(useToolStore.getState().activeToolId).toBeNull();
    });
  });

  describe("presence", () => {
    it("registers presence listeners before connecting and moves only while ready", async () => {
      const { socket } = await mountSession();

      // Every socket listener, presence included, is registered before the
      // transport connects and the join is emitted.
      const connectOrder = socket.connect.mock.invocationCallOrder[0];
      expect(connectOrder).toBeDefined();
      expect(socket.on.mock.calls.map((call) => call[0] as string)).toEqual(
        expect.arrayContaining([
          "presence:join",
          "presence:leave",
          "presence:move",
        ]),
      );
      for (const order of socket.on.mock.invocationCallOrder) {
        expect(order).toBeLessThan(connectOrder);
      }

      emitServer("connect");
      await flush(2);

      // Presence flows from the moment of connect, before the join
      // acknowledgement resolves.
      emitServer("presence:join", REMOTE_USER, {
        userName: "Ada",
        userColor: "#123abc",
      });
      await flush(2);
      expect(
        useRemotePresenceStore.getState().remoteUsers.get(REMOTE_USER),
      ).toMatchObject({ userName: "Ada" });

      // Movement is volatile and only allowed while ready.
      expect(latestContext.current?.emitPresence?.({ x: 1, y: 2 })).toBe(false);
      expect(socket.volatile.emit).not.toHaveBeenCalled();

      ackServer("room:join", undefined, EDITOR_ACK);
      emitServer("room:sync", []);
      await flush(2);
      expect(useSessionStore.getState().session.phase).toBe("ready");

      expect(latestContext.current?.emitPresence?.({ x: 3, y: 4 })).toBe(true);
      expect(socket.volatile.emit).toHaveBeenCalledWith("presence:move", {
        pos: { x: 3, y: 4 },
      });
    });
  });

  describe("listener failure isolation", () => {
    it("surfaces protocol failures as reconciliation without throwing through the socket callback", async () => {
      await mountSession();
      await driveToReady();

      expect(() => {
        emitServer("command:finalize", "cmd-bad", malformedStroke("cmd-bad"));
      }).not.toThrow();
      await flush(2);
      expect(useSessionStore.getState().session.phase).toBe("reconciling");

      // A second malformed event while reconciling stays contained too.
      expect(() => {
        emitServer("presence:move", REMOTE_USER, {
          x: Number.NaN,
          y: 2,
        });
      }).not.toThrow();
      expect(useSessionStore.getState().session.phase).toBe("reconciling");
    });
  });
});

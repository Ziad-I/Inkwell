import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { io } from "socket.io-client";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useBoardManagers } from "@/context/boardManagersContext";
import type { BoardManagersContextValue } from "@/context/boardManagersContext";
import { useSessionStore } from "@/stores/sessionStore";
import { useToolStore } from "@/stores/toolStore";
import type { StageOperations } from "@/types/common";
import type { BoardSessionSnapshot } from "@/types/session";
import type { CommandPayload } from "@/types/command";
import {
  serverAck,
  serverEmit,
  type MockSocket,
} from "@/__tests__/mocks/socket-io";

const SOCKET_URL = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Deferred tool loading
// ---------------------------------------------------------------------------

/**
 * The provider awaits ToolManager.initTools() before starting the session
 * coordinator. Real loaders resolve immediately, so the tool-loader module is
 * replaced with gateable loaders: initTools suspends until the current gate
 * is released, which is exactly the async window the epoch-safety
 * scenarios exercise.
 */
const toolGate = vi.hoisted(() => {
  interface GatedTool {
    meta: { id: string };
    onActivate: ReturnType<typeof vi.fn>;
    onDeactivate: ReturnType<typeof vi.fn>;
  }
  let currentGate: Promise<void> = Promise.resolve();
  const created: GatedTool[] = [];

  return {
    created,
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
    makeTool(id: string): GatedTool {
      const tool: GatedTool = {
        meta: { id },
        onActivate: vi.fn(),
        onDeactivate: vi.fn(),
      };
      created.push(tool);
      return tool;
    },
  };
});

vi.mock("@/core/toolLoaders", () => {
  const ids = ["brush", "eraser", "shapes", "selection"];
  const loaders: Record<
    string,
    { eager: boolean; load: () => Promise<unknown> }
  > = {};
  for (const id of ids) {
    loaders[id] = {
      eager: true,
      load: async () => {
        await toolGate.wait();
        return toolGate.makeTool(id);
      },
    };
  }
  return { toolLoaders: loaders };
});

const toastMock = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
vi.mock("sonner", () => toastMock);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const epochs: string[] = [];
const latestContext: { current: BoardManagersContextValue | null } = {
  current: null,
};

function ManagersProbe() {
  const ctx = useBoardManagers();
  latestContext.current = ctx;
  epochs.push(ctx.epoch);
  return null;
}

function createStageOperationsFake() {
  const fake = {
    getStage: vi.fn(() => null),
    getScale: vi.fn(() => 1),
    getViewpointPos: vi.fn(() => ({ x: 0, y: 0 })),
    getDrawingLayer: vi.fn(() => null),
    getOverlayLayer: vi.fn(() => null),
    createNode: vi.fn(
      (Ctor: new (...args: never[]) => object, ...args: never[]) =>
        new Ctor(...args),
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
  };
  return fake as unknown as StageOperations & {
    resetRoomScene: ReturnType<typeof vi.fn>;
  };
}

function providerElement(roomId: string, stageOperations: StageOperations) {
  return (
    <BoardManagersProvider
      url={SOCKET_URL}
      roomId={roomId}
      stageOperations={stageOperations}
    >
      <ManagersProbe />
    </BoardManagersProvider>
  );
}

function renderProvider(roomId: string, stageOperations: StageOperations) {
  return render(providerElement(roomId, stageOperations));
}

function renderProviderStrict(
  roomId: string,
  stageOperations: StageOperations,
) {
  return render(
    <StrictMode>{providerElement(roomId, stageOperations)}</StrictMode>,
  );
}

function rerenderProvider(
  rerender: (element: ReactElement) => void,
  roomId: string,
  stageOperations: StageOperations,
) {
  rerender(providerElement(roomId, stageOperations));
}

function createdSockets(): MockSocket[] {
  return vi
    .mocked(io)
    .mock.results.map((result) => result.value as unknown as MockSocket);
}

async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function strokePayload(): CommandPayload {
  return {
    nodeId: "node-1",
    points: [0, 0, 40, 40],
    color: "#000000",
    opacity: 1,
    strokeWidth: 2,
    lineCap: "round",
    lineJoin: "round",
  };
}

/**
 * Drives the real coordinator through connect → join ack → sync and asserts
 * each phase transition so failures localize precisely. Targets the most
 * recently created mock socket (single-session tests).
 */
async function driveSessionToReady() {
  serverEmit("connect");
  await flushAsync();
  expect(useSessionStore.getState().session.phase).toBe("joining");

  serverAck("room:join", undefined, {
    role: "editor",
    permissions: { read: true, draw: true },
  });
  serverEmit("room:sync", []);
  await flushAsync();
  expect(useSessionStore.getState().session.phase).toBe("ready");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const sessionHistory: BoardSessionSnapshot[] = [];
let unsubscribeSession: (() => void) | null = null;

beforeEach(() => {
  epochs.length = 0;
  latestContext.current = null;
  toolGate.created.length = 0;
  sessionHistory.length = 0;
  toastMock.toast.error.mockClear();
  useSessionStore.getState().reset();
  useToolStore.setState({ activeToolId: null, allTools: [] });
  unsubscribeSession = useSessionStore.subscribe((state) =>
    sessionHistory.push(state.session),
  );
});

afterEach(() => {
  unsubscribeSession?.();
  unsubscribeSession = null;
});

describe("BoardManagersProvider epoch safety", () => {
  it("connects exactly one session after deferred tool initialization under StrictMode", async () => {
    const release = toolGate.defer();
    renderProviderStrict("room-a", createStageOperationsFake());

    const sockets = createdSockets();
    expect(sockets).toHaveLength(2);

    await act(async () => {
      release();
    });
    await flushAsync();

    // The aborted first epoch must never connect; the surviving one
    // connects exactly once.
    expect(sockets[0].connect).not.toHaveBeenCalled();
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sockets[1].connect).toHaveBeenCalledTimes(1);

    // Two effect runs produced two sockets; React batches the StrictMode
    // double-mount's state updates, so consumers observe only the surviving
    // epoch.
    const observedEpochs = epochs.filter(Boolean);
    expect(observedEpochs.length).toBeGreaterThanOrEqual(1);

    const session = useSessionStore.getState().session;
    expect(session.roomId).toBe("room-a");
    expect(session.phase).toBe("connecting");
    expect(session.epoch).toBe(epochs[epochs.length - 1]);
  });

  it("room A cannot connect after rerender to room B", async () => {
    const release = toolGate.defer();
    const stageOps = createStageOperationsFake();
    const { rerender } = renderProvider("room-a", stageOps);

    rerenderProvider(rerender, "room-b", stageOps);

    await act(async () => {
      release();
    });
    await flushAsync();

    const sockets = createdSockets();
    expect(sockets).toHaveLength(2);
    expect(sockets[0].connect).not.toHaveBeenCalled();
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sockets[1].connect).toHaveBeenCalledTimes(1);

    const session = useSessionStore.getState().session;
    expect(session.roomId).toBe("room-b");
    expect(session.phase).toBe("connecting");
    expect(new Set(epochs.filter(Boolean)).size).toBe(2);
  });

  it("unmount before initTools resolution prevents late connect and finalizes exactly once", async () => {
    const release = toolGate.defer();
    const stageOps = createStageOperationsFake();
    const { unmount } = renderProvider("room-a", stageOps);

    unmount();

    await act(async () => {
      release();
    });
    await flushAsync();

    const sockets = createdSockets();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].connect).not.toHaveBeenCalled();
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sockets[0].removeAllListeners).toHaveBeenCalledTimes(1);
    expect(stageOps.resetRoomScene).toHaveBeenCalledTimes(1);

    const session = useSessionStore.getState().session;
    expect(session.phase).toBe("idle");
    expect(session.roomId).toBe("");
    expect(session.epoch).toBe("");

    // Reset exactly once: the late stale-initialization path must not reset
    // the store a second time.
    const resets = sessionHistory.filter(
      (snapshot) => snapshot.phase === "idle" && snapshot.epoch === "",
    );
    expect(resets).toHaveLength(1);
  });

  it("a late stale epoch cannot clear room B's managers or session", async () => {
    const releaseRoomA = toolGate.defer();
    const stageOps = createStageOperationsFake();
    const { rerender } = renderProvider("room-a", stageOps);

    const releaseRoomB = toolGate.defer();
    rerenderProvider(rerender, "room-b", stageOps);

    // Room B initializes and connects while room A's initialization is
    // still pending.
    await act(async () => {
      releaseRoomB();
    });
    await flushAsync();

    const sockets = createdSockets();
    expect(sockets[1].connect).toHaveBeenCalledTimes(1);

    // Room A's initialization resolves late.
    await act(async () => {
      releaseRoomA();
    });
    await flushAsync();

    expect(sockets[0].connect).not.toHaveBeenCalled();
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sockets[1].disconnect).not.toHaveBeenCalled();
    expect(sockets[1].connect).toHaveBeenCalledTimes(1);

    const session = useSessionStore.getState().session;
    expect(session.roomId).toBe("room-b");
    expect(session.phase).toBe("connecting");
    expect(session.epoch).toBe(epochs[epochs.length - 1]);

    // Room B's managers are still in place: the stale path must not have
    // cleared the refs or destroyed the current epoch's instances.
    expect(latestContext.current?.toolManagerRef?.current).not.toBeNull();
    expect(latestContext.current?.commandManagerRef?.current).not.toBeNull();
    expect(latestContext.current?.coordinatorRef?.current).not.toBeNull();
  });

  it("cleanup after a started session tears down managers, transport, scene, and session exactly once", async () => {
    const release = toolGate.defer();
    const stageOps = createStageOperationsFake();
    const { unmount } = renderProvider("room-a", stageOps);

    await act(async () => {
      release();
    });
    await flushAsync();

    const sockets = createdSockets();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].connect).toHaveBeenCalledTimes(1);

    const toolsBeforeUnmount = [...toolGate.created];
    unmount();

    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sockets[0].removeAllListeners).toHaveBeenCalledTimes(1);
    expect(stageOps.resetRoomScene).toHaveBeenCalledTimes(1);
    for (const tool of toolsBeforeUnmount) {
      expect(tool.onDeactivate).toHaveBeenCalledTimes(1);
    }

    const session = useSessionStore.getState().session;
    expect(session.phase).toBe("idle");
    expect(session.roomId).toBe("");

    const resets = sessionHistory.filter(
      (snapshot) => snapshot.phase === "idle" && snapshot.epoch === "",
    );
    expect(resets).toHaveLength(1);
  });

  it("a throwing tool onDeactivate cannot abort teardown: transport and scene are still torn down", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const release = toolGate.defer();
    const stageOps = createStageOperationsFake();
    const { unmount } = renderProvider("room-a", stageOps);

    await act(async () => {
      release();
    });
    await flushAsync();

    const sockets = createdSockets();
    expect(sockets).toHaveLength(1);

    const toolsBeforeUnmount = [...toolGate.created];
    toolsBeforeUnmount[0].onDeactivate.mockImplementation(() => {
      throw new Error("deactivate boom");
    });

    expect(() => unmount()).not.toThrow();

    // The connection was torn down and the scene reset despite the
    // throwing tool callback: finalizeLocal completed.
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sockets[0].removeAllListeners).toHaveBeenCalledTimes(1);
    expect(stageOps.resetRoomScene).toHaveBeenCalledTimes(1);
    for (const tool of toolsBeforeUnmount) {
      expect(tool.onDeactivate).toHaveBeenCalledTimes(1);
    }
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to deactivate"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

describe("BoardManagersProvider session wiring", () => {
  it("gates capability and presence on coordinator readiness", async () => {
    const release = toolGate.defer();
    renderProvider("room-a", createStageOperationsFake());

    await act(async () => {
      release();
    });
    await flushAsync();

    const socket = createdSockets()[0];

    // Not ready yet: presence is dropped and drawing is blocked by the
    // capability snapshot.
    expect(latestContext.current?.emitPresence?.({ x: 0, y: 0 })).toBe(false);
    expect(socket.volatile.emit).not.toHaveBeenCalled();
    expect(
      latestContext.current?.commandManagerRef.current?.startCommand(
        "stroke",
        strokePayload(),
      ),
    ).toBeNull();

    await driveSessionToReady();

    const session = useSessionStore.getState().session;
    expect(session.phase).toBe("ready");
    expect(session.role).toBe("editor");
    expect(session.canDraw).toBe(true);

    // Ready: presence flows through the coordinator and drawing is allowed.
    expect(latestContext.current?.emitPresence?.({ x: 12, y: 34 })).toBe(true);
    expect(socket.volatile.emit).toHaveBeenCalledWith("presence:move", {
      pos: { x: 12, y: 34 },
    });

    const commandId =
      latestContext.current?.commandManagerRef.current?.startCommand(
        "stroke",
        strokePayload(),
      );
    expect(commandId).toEqual(expect.any(String));
  });

  it("surfaces command rejection to the user through the failure notification", async () => {
    const release = toolGate.defer();
    renderProvider("room-a", createStageOperationsFake());

    await act(async () => {
      release();
    });
    await flushAsync();

    await driveSessionToReady();

    const commandId =
      latestContext.current?.commandManagerRef.current?.startCommand(
        "stroke",
        strokePayload(),
      );
    expect(commandId).not.toBeNull();

    serverEmit("command:reject", commandId, "conflict");
    await flushAsync();

    expect(toastMock.toast.error).toHaveBeenCalledWith(
      "Your board change was rejected and has been reverted.",
    );
  });

  it("freezes into reconciliation when a durable operation is pending at disconnect", async () => {
    const release = toolGate.defer();
    renderProvider("room-a", createStageOperationsFake());

    await act(async () => {
      release();
    });
    await flushAsync();

    await driveSessionToReady();

    const commands = latestContext.current?.commandManagerRef.current;
    const commandId = commands?.startCommand("stroke", strokePayload());
    commands?.finalizeCommand(commandId!);
    await flushAsync();

    serverEmit("disconnect", "transport close");
    await flushAsync();

    const session = useSessionStore.getState().session;
    expect(session.phase).toBe("reconciling");
    expect(session.canDraw).toBe(false);
  });
});

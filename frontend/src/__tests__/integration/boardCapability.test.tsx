import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { io } from "socket.io-client";
import BoardPage from "@/pages/board";
import { ThemeProvider } from "@/providers/themeProvider";
import { CommandManager } from "@/core/commandManager";
import { useSessionStore } from "@/stores/sessionStore";
import { useToolStore } from "@/stores/toolStore";
import { useRemotePresenceStore } from "@/stores/remotePresenceStore";
import type { MockSocket } from "@/__tests__/mocks/socket-io";
import { serverAck, serverEmit } from "@/__tests__/mocks/socket-io";

// ---------------------------------------------------------------------------
// Spy tools (loader mock)
// ---------------------------------------------------------------------------

const toolHarness = vi.hoisted(() => {
  interface SpyTool {
    meta: {
      id: string;
      label: string;
      icon: () => null;
      mutating: boolean;
    };
    onActivate: ReturnType<typeof vi.fn>;
    onDeactivate: ReturnType<typeof vi.fn>;
    onPointerDown: ReturnType<typeof vi.fn>;
    cancelGesture: ReturnType<typeof vi.fn>;
  }
  const labels: Record<string, string> = {
    brush: "Brush",
    eraser: "Eraser",
    shapes: "Shapes",
    selection: "Selection",
  };
  const created: SpyTool[] = [];
  const make = (id: string): SpyTool => {
    const tool: SpyTool = {
      meta: { id, label: labels[id] ?? id, icon: () => null, mutating: true },
      onActivate: vi.fn(),
      onDeactivate: vi.fn(),
      onPointerDown: vi.fn(),
      cancelGesture: vi.fn(),
    };
    created.push(tool);
    return tool;
  };
  const byId = (id: string): SpyTool | undefined =>
    created.filter((tool) => tool.meta.id === id).at(-1);
  return { created, make, byId };
});

vi.mock("@/core/toolLoaders", () => {
  const ids = ["brush", "eraser", "shapes", "selection"];
  const loaders: Record<string, unknown> = {};
  for (const id of ids) {
    loaders[id] = { eager: true, load: () => toolHarness.make(id) };
  }
  return { toolLoaders: loaders };
});

const toastMock = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
vi.mock("sonner", () => toastMock);

// ---------------------------------------------------------------------------
// Capturing react-konva mock
// ---------------------------------------------------------------------------

const stageCapture = vi.hoisted(() => ({
  handlers: {} as Record<string, (event: unknown) => void>,
  fakeStage: {
    getPointerPosition: () => ({ x: 10, y: 10 }),
    scaleX: () => 1,
    position: () => ({ x: 0, y: 0 }),
    batchDraw: () => undefined,
    container: () =>
      globalThis.document?.createElement("div") ?? { style: {} },
    on: () => undefined,
    off: () => undefined,
  },
}));

vi.mock("react-konva", async () => {
  const React = await import("react");
  type StubProps = Record<string, unknown> & { children?: React.ReactNode };

  const stub = (name: string) => {
    const Component = ({ children }: StubProps) =>
      React.createElement("div", { "data-testid": `konva-${name}` }, children);
    Component.displayName = name;
    return Component;
  };

  const Stage = ({ children, ...props }: StubProps) => {
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === "function") {
        stageCapture.handlers[key] = value as (event: unknown) => void;
      }
    }
    const ref = props.ref as { current: unknown } | undefined;
    if (ref && typeof ref === "object" && "current" in ref) {
      ref.current = stageCapture.fakeStage;
    }
    return React.createElement("div", { "data-testid": "konva-stage" }, children);
  };
  Stage.displayName = "Stage";

  return {
    Stage,
    Layer: stub("layer"),
    Rect: stub("rect"),
    Line: stub("line"),
    Circle: stub("circle"),
    Ellipse: stub("ellipse"),
    Text: stub("text"),
    Group: stub("group"),
    Transformer: stub("transformer"),
    Image: stub("image"),
    Path: stub("path"),
    Arrow: stub("arrow"),
    RegularPolygon: stub("polygon"),
  };
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const EDITOR_ACK = {
  role: "editor",
  permissions: { read: true, draw: true },
};
const VIEWER_ACK = {
  role: "viewer",
  permissions: { read: true, draw: false },
};

function renderBoard() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/board/room-cap"]}>
        <Routes>
          <Route path="/board/:roomId" element={<BoardPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function createdSockets(): MockSocket[] {
  return vi.mocked(io).mock.results.map(
    (result) => result.value as unknown as MockSocket,
  );
}

/** Drives the mounted board through connect → join ack → sync → ready. */
async function driveToReady(ack: typeof EDITOR_ACK) {
  await flushAsync();
  serverEmit("connect");
  await flushAsync();
  serverAck("room:join", undefined, ack);
  serverEmit("room:sync", []);
  await flushAsync();
  expect(useSessionStore.getState().session.phase).toBe("ready");
}

const pointerEvent = () => ({}) as never;

let undoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  undoSpy = vi.spyOn(CommandManager.prototype, "undo");
  stageCapture.handlers = {};
  toolHarness.created.length = 0;
  useSessionStore.getState().reset();
  useToolStore.setState({ activeToolId: null, allTools: [] });
  useRemotePresenceStore.getState().clearAll();
});

afterEach(() => {
  undoSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Capability gating
// ---------------------------------------------------------------------------

describe("board capability gating", () => {
  it("disables every mutating tool button for a viewer and activates none", async () => {
    renderBoard();
    await driveToReady(VIEWER_ACK);

    const brushButton = await screen.findByRole("button", { name: "Brush" });
    expect(brushButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Eraser" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Shapes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Selection" })).toBeDisabled();

    // The disabled buttons announce the reason in their titles.
    expect(brushButton.getAttribute("title")).toMatch(/^Brush — .*disabled/);
    expect(
      screen.getByRole("button", { name: "Eraser" }).getAttribute("title"),
    ).toMatch(/disabled/);

    // No mutating tool was activated for the viewer.
    expect(useToolStore.getState().activeToolId).toBeNull();
  });

  it("keeps keyboard undo inert for a viewer", async () => {
    renderBoard();
    await driveToReady(VIEWER_ACK);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });

    expect(undoSpy).not.toHaveBeenCalled();
  });

  it("blocks canvas pointer dispatch while drawing is disabled mid-session", async () => {
    renderBoard();
    await driveToReady(EDITOR_ACK);

    // Editor ready: brush is active and receives pointer-down.
    stageCapture.handlers.onPointerDown?.(pointerEvent());
    expect(toolHarness.byId("brush")?.onPointerDown).toHaveBeenCalledTimes(1);

    // The connection drops mid-session: drawing is disabled.
    serverEmit("disconnect", "transport close");
    await flushAsync();
    expect(useSessionStore.getState().session.canDraw).toBe(false);

    // Pointer dispatch to the (still active) mutating tool is blocked.
    stageCapture.handlers.onPointerDown?.(pointerEvent());
    expect(toolHarness.byId("brush")?.onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("enables controls, keyboard undo, and pointer dispatch for an editor", async () => {
    renderBoard();
    await driveToReady(EDITOR_ACK);

    expect(screen.getByRole("button", { name: "Brush" })).toBeEnabled();
    // The default tool activates once the session is ready and drawable.
    expect(useToolStore.getState().activeToolId).toBe("brush");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undoSpy).toHaveBeenCalledTimes(1);

    stageCapture.handlers.onPointerDown?.(pointerEvent());
    expect(toolHarness.byId("brush")?.onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("activates a tool from the toolbar when drawing is allowed", async () => {
    renderBoard();
    await driveToReady(EDITOR_ACK);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Eraser" }));

    expect(useToolStore.getState().activeToolId).toBe("eraser");
  });
});

// ---------------------------------------------------------------------------
// Session overlays
// ---------------------------------------------------------------------------

describe("board session overlays", () => {
  it("shows a loading overlay while connecting", async () => {
    renderBoard();
    await flushAsync();

    expect(useSessionStore.getState().session.phase).toBe("connecting");
    expect(screen.getByText("Loading board…")).toBeInTheDocument();
  });

  it("shows a reconnection overlay when the connection drops", async () => {
    renderBoard();
    await driveToReady(EDITOR_ACK);

    serverEmit("disconnect", "transport close");
    await flushAsync();

    expect(screen.getByText("Connection lost. Reconnecting…")).toBeVisible();
  });

  it("shows a reconciliation overlay while checking the board state", async () => {
    renderBoard();
    await driveToReady(EDITOR_ACK);

    // A presence event that fails protocol validation freezes the session
    // into reconciliation.
    serverEmit("presence:move", "user-2", { x: Number.NaN, y: 2 });
    await flushAsync();

    expect(useSessionStore.getState().session.phase).toBe("reconciling");
    expect(
      screen.getByText("Checking the latest board state…"),
    ).toBeVisible();
  });

  it("shows a join-error overlay whose retry remounts the board runtime", async () => {
    renderBoard();
    await flushAsync();

    serverEmit("connect");
    await flushAsync();
    serverAck("room:join", "JOIN_REJECTED");
    await flushAsync();

    expect(useSessionStore.getState().session.phase).toBe("error");
    expect(screen.getByText("Unable to join the board.")).toBeVisible();

    const socketsBefore = createdSockets().length;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await flushAsync();

    // The retry remounted the runtime with a fresh board session.
    expect(createdSockets().length).toBe(socketsBefore + 1);
    expect(useSessionStore.getState().session.phase).toBe("connecting");
    expect(screen.getByText("Loading board…")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Remote presence wiring
// ---------------------------------------------------------------------------

describe("board remote presence wiring", () => {
  it("feeds coordinator presence events into the remote presence store", async () => {
    renderBoard();
    await driveToReady(EDITOR_ACK);

    serverEmit("presence:join", "user-2", {
      userName: "Ada",
      userColor: "#123abc",
    });
    serverEmit("presence:move", "user-2", { x: 5, y: 6 });
    await flushAsync();

    expect(useRemotePresenceStore.getState().remoteUsers.get("user-2")).toEqual(
      {
        userName: "Ada",
        userColor: "#123abc",
        pos: { x: 5, y: 6 },
      },
    );

    // Disconnect clears every remote user.
    serverEmit("disconnect", "transport close");
    await flushAsync();
    expect(useRemotePresenceStore.getState().remoteUsers.size).toBe(0);
  });

  it("clears remote users when the board unmounts", async () => {
    const { unmount } = renderBoard();
    await driveToReady(EDITOR_ACK);

    serverEmit("presence:join", "user-2", {
      userName: "Ada",
      userColor: "#123abc",
    });
    await flushAsync();
    expect(useRemotePresenceStore.getState().remoteUsers.size).toBe(1);

    unmount();

    expect(useRemotePresenceStore.getState().remoteUsers.size).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { io } from "socket.io-client";
import type Konva from "konva";
import type { StageOperations } from "@/types/common";
import BoardPage from "@/pages/board";
import { useSessionStore } from "@/stores/sessionStore";
import { useToolStore } from "@/stores/toolStore";
import type { MockSocket } from "@/__tests__/mocks/socket-io";

interface CapturedRoom {
  stageOperations: StageOperations;
  stageRef: { current: unknown };
  drawingLayerRef: { current: unknown };
  overlayLayerRef: { current: unknown };
  disposed: boolean;
}

/**
 * The canvas is replaced with a recording stub so each mounted room's stage
 * operations object and stage refs can be observed from the test. The stub
 * installs a minimal fake stage so the detached-node registry is reachable
 * through StageOperations.getNodeById.
 */
const roomCapture = vi.hoisted(() => ({
  rooms: [] as CapturedRoom[],
  fakeStage: {
    findOne: () => null,
    container: () => null,
  },
}));

vi.mock("@/components/board/canvas/canvas", async () => {
  const { useEffect } = await import("react");
  type CanvasStubProps = {
    stageOperations: StageOperations;
    stageRef: { current: unknown };
    drawingLayerRef: { current: unknown };
    overlayLayerRef: { current: unknown };
  };

  function CanvasStub(props: CanvasStubProps) {
    const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
      props;
    useEffect(() => {
      const entry: CapturedRoom = {
        stageOperations,
        stageRef,
        drawingLayerRef,
        overlayLayerRef,
        disposed: false,
      };
      roomCapture.rooms.push(entry);
      stageRef.current = roomCapture.fakeStage;
      return () => {
        entry.disposed = true;
      };
    }, [stageOperations, stageRef, drawingLayerRef, overlayLayerRef]);
    return null;
  }

  return { default: CanvasStub };
});

vi.mock("@/components/board/toolbar/toolbar", () => ({
  default: () => null,
}));

vi.mock("@/components/board/toolbar/toolSettings", () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let navigateRef: ((path: string) => void) | null = null;

function NavProbe() {
  navigateRef = useNavigate();
  return null;
}

function renderBoardAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavProbe />
      <Routes>
        <Route path="/board/:roomId" element={<BoardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function createdSockets(): MockSocket[] {
  return vi
    .mocked(io)
    .mock.results.map((result) => result.value as unknown as MockSocket);
}

function makeDetachedNode(id: string) {
  return {
    id: () => id,
    remove: vi.fn(),
    destroy: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  roomCapture.rooms.length = 0;
  useSessionStore.getState().reset();
  useToolStore.setState({ activeToolId: null, allTools: [] });
});

describe("BoardPage room isolation", () => {
  it("navigating to a new room remounts the stage subtree with fresh refs and stage operations", async () => {
    renderBoardAt("/board/room-a");
    await flushAsync();

    expect(roomCapture.rooms).toHaveLength(1);
    const roomA = roomCapture.rooms[0];

    await act(async () => {
      navigateRef!("/board/room-b");
    });
    await flushAsync();

    expect(roomCapture.rooms).toHaveLength(2);
    const roomB = roomCapture.rooms[1];

    expect(roomA.disposed).toBe(true);
    expect(roomB.disposed).toBe(false);
    expect(roomB.stageOperations).not.toBe(roomA.stageOperations);
    expect(roomB.stageRef).not.toBe(roomA.stageRef);
    expect(roomB.drawingLayerRef).not.toBe(roomA.drawingLayerRef);
    expect(roomB.overlayLayerRef).not.toBe(roomA.overlayLayerRef);
  });

  it("a node detached into room A's registry is disposed with room A and invisible to room B", async () => {
    renderBoardAt("/board/room-a");
    await flushAsync();

    const roomA = roomCapture.rooms[0];
    const detachedNode = makeDetachedNode("node-from-room-a");

    roomA.stageOperations.removeNode(
      detachedNode as unknown as Konva.Node,
      false,
    );
    expect(detachedNode.remove).toHaveBeenCalledTimes(1);
    expect(roomA.stageOperations.getNodeById("node-from-room-a")).toBe(
      detachedNode,
    );

    await act(async () => {
      navigateRef!("/board/room-b");
    });
    await flushAsync();

    // Room A's detached node was destroyed exactly once along with its scene.
    expect(detachedNode.destroy).toHaveBeenCalledTimes(1);

    // And it is not visible through room B's stage operations.
    const roomB = roomCapture.rooms[1];
    expect(roomB.stageOperations.getNodeById("node-from-room-a")).toBeNull();
  });

  it("leaves room A's session behind when navigating to room B", async () => {
    renderBoardAt("/board/room-a");
    await flushAsync();

    const sockets = createdSockets();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].connect).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().session.roomId).toBe("room-a");

    await act(async () => {
      navigateRef!("/board/room-b");
    });
    await flushAsync();

    const socketsAfter = createdSockets();
    expect(socketsAfter).toHaveLength(2);
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(socketsAfter[1].connect).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().session.roomId).toBe("room-b");
  });
});

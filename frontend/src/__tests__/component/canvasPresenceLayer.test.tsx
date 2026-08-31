import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type Konva from "konva";
import InfiniteCanvas from "@/components/board/canvas/canvas";
import { BoardManagersContext } from "@/context/boardManagersContext";
import { createMockStageOps } from "@/__tests__/util/mockStageOps";
import type { StageOperations } from "@/types/common";
import { useRemotePresenceStore } from "@/stores/remotePresenceStore";

/**
 * Presence dots are declarative react-konva children. They must live in a
 * dedicated presence Layer that the imperative scene reset
 * (StageOperations.resetRoomScene) never touches — distinct from the
 * interaction overlay Layer whose nodes (selection boxes, guides,
 * transformer chrome) are owned and destroyed by the command manager.
 */

function managersValue() {
  return {
    epoch: "gen-test",
    toolManagerRef: { current: null },
    commandManagerRef: { current: null },
    coordinatorRef: { current: null },
    emitPresence: () => false,
  };
}

function renderCanvas(stageOperations: StageOperations) {
  const stageRef = { current: null } as React.RefObject<Konva.Stage | null>;
  const drawingLayerRef = {
    current: null,
  } as React.RefObject<Konva.Layer | null>;
  const overlayLayerRef = {
    current: null,
  } as React.RefObject<Konva.Layer | null>;
  const presenceLayerRef = {
    current: null,
  } as React.RefObject<Konva.Layer | null>;

  const view = render(
    <BoardManagersContext.Provider value={managersValue()}>
      <InfiniteCanvas
        stageOperations={stageOperations}
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
        overlayLayerRef={overlayLayerRef}
        presenceLayerRef={presenceLayerRef}
      />
    </BoardManagersContext.Provider>,
  );

  return {
    ...view,
    refs: { stageRef, drawingLayerRef, overlayLayerRef, presenceLayerRef },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useRemotePresenceStore.getState().clearAll();
});

describe("InfiniteCanvas presence layer isolation", () => {
  it("renders presence dots in a dedicated presence layer, not the interaction overlay", () => {
    const stageOperations = createMockStageOps();
    const { container } = renderCanvas(stageOperations);

    const overlayLayer = container.querySelector(
      '[data-testid="konva-layer"][name="overlayLayer"]',
    );
    const presenceLayer = container.querySelector(
      '[data-testid="konva-layer"][name="presenceLayer"]',
    );

    expect(overlayLayer).not.toBeNull();
    expect(presenceLayer).not.toBeNull();
    expect(overlayLayer).not.toBe(presenceLayer);

    // The local presence dot renders inside the presence layer...
    expect(
      presenceLayer!.querySelector('[data-testid="konva-group"]'),
    ).not.toBeNull();
    // ...and never inside the manager-owned interaction overlay.
    expect(
      overlayLayer!.querySelector('[data-testid="konva-group"]'),
    ).toBeNull();
  });
});

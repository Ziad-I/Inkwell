import { vi } from "vitest";
import type { StageOperations } from "@/types/common";

export function createMockCreateNode(): StageOperations["createNode"] {
  return vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <CTOR extends new (...args: any[]) => any>(
      Ctor: CTOR,
      ...args: ConstructorParameters<CTOR>
    ): InstanceType<CTOR> => {
      return new Ctor(...args) as InstanceType<CTOR>;
    },
  );
}

export function createMockStageOps(
  overrides: Partial<StageOperations> = {},
): StageOperations {
  return {
    getNodeById: vi.fn(),
    createNode: createMockCreateNode(),
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
    zoomBy: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    ...overrides,
  } as StageOperations;
}

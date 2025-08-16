import { useState, useRef, useEffect, useCallback } from "react";
import { useGesture } from "@use-gesture/react";
import { Stage, Layer, Text, Rect } from "react-konva";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

import useWindowSize from "@/hooks/useWindowSize";
import type { Point, StageOperations } from "@/lib/definations";
import type { ToolContext, toolSettings } from "@/tools/types";
import {
  ZOOM_FACTOR,
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_SCALE,
  DEFAULT_VIEWPOINT_POS,
} from "@/lib/constants";
import { ToolManager } from "@/tools/manager";
import type { Shape, ShapeConfig } from "konva/lib/Shape";

function InfiniteCanvas() {
  const { width, height } = useWindowSize();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const drawingLayerRef = useRef<Konva.Layer | null>(null);

  const spaceRef = useRef(false);
  const toolManagerRef = useRef<ToolManager | null>(null);
  const toolSettingsRef = useRef<toolSettings>({
    stroke: "#000",
    strokeWidth: 2,
    color: "#000",
  });

  const [displayState, setDisplayState] = useState({
    scale: DEFAULT_SCALE,
    viewpointPos: DEFAULT_VIEWPOINT_POS,
    cursorPos: DEFAULT_VIEWPOINT_POS as Point | null,
    // activeTool: Tools.Brush,
  });

  const stageOperations = useRef<StageOperations>({
    getScale: () => stageRef.current?.scaleX() || DEFAULT_SCALE,

    getViewpointPos: () =>
      stageRef.current?.position() || DEFAULT_VIEWPOINT_POS,

    getStage: () => stageRef.current,

    setScale: (newScale: number, pivotPoint?: Point) => {
      const stage = stageRef.current;
      if (!stage) return;

      const clamped = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));

      if (pivotPoint) {
        const oldScale = stage.scaleX();
        const worldPos = {
          x: (pivotPoint.x - stage.x()) / oldScale,
          y: (pivotPoint.y - stage.y()) / oldScale,
        };

        const newPos = {
          x: pivotPoint.x - worldPos.x * clamped,
          y: pivotPoint.y - worldPos.y * clamped,
        };

        stage.position(newPos);
      }

      stage.scale({ x: clamped, y: clamped });
      stage.batchDraw();
    },

    getDrawingLayer: () => drawingLayerRef.current,

    setViewpointPos: (newPos: Point) => {
      const stage = stageRef.current;
      if (!stage) return;

      stage.position(newPos);
      stage.batchDraw();
    },

    translate: (dx: number, dy: number) => {
      const stage = stageRef.current;
      if (!stage) return;

      const pos = stage.position();
      stage.position({ x: pos.x + dx, y: pos.y + dy });
      stage.batchDraw();
    },

    screenToWorld: (sx: number, sy: number) => {
      const stage = stageRef.current;
      if (!stage) return { x: sx, y: sy };

      const scale = stage.scaleX();
      const pos = stage.position();
      return {
        x: (sx - pos.x) / scale,
        y: (sy - pos.y) / scale,
      };
    },

    worldToScreen: (wx: number, wy: number) => {
      const stage = stageRef.current;
      if (!stage) return { x: wx, y: wy };

      const scale = stage.scaleX();
      const pos = stage.position();
      return {
        x: wx * scale + pos.x,
        y: wy * scale + pos.y,
      };
    },

    addPermanentNode: (node: Konva.Node) => {
      drawingLayerRef.current?.add(node as unknown as Shape<ShapeConfig>);
    },
  });

  const syncDisplayState = useCallback((immediate: boolean = false) => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      const scale = stage.scaleX();
      const viewpointPos = stage.position();
      const pointer = stage.getPointerPosition();

      let cursorPos = null;
      if (pointer) {
        cursorPos = stageOperations.current.screenToWorld(pointer.x, pointer.y);
      }

      setDisplayState((prev) => ({
        ...prev,
        scale,
        viewpointPos,
        cursorPos,
      }));
    };

    if (immediate) {
      update();
    } else {
      requestAnimationFrame(update);
    }
  }, []);

  useEffect(() => {
    async function initToolManager() {
      if (toolManagerRef.current) return;
      const ctx: ToolContext = {
        stageOps: stageOperations.current!,
        toolSettingsRef,
      };

      const mgr = new ToolManager(ctx);
      await mgr.initTools();
      toolManagerRef.current = mgr;
    }
    initToolManager();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        spaceRef.current = true;
        const stage = stageRef.current;
        if (stage) {
          stage.container().style.cursor = "grabbing";
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        spaceRef.current = false;
        const stage = stageRef.current;
        if (stage) {
          toolManagerRef.current?.applyCursor(
            toolManagerRef.current?.getEffectiveTool()?.id ?? null
          );
        }
      }
    };

    const onBlur = (e: FocusEvent) => {
      spaceRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) =>
    toolManagerRef.current?.handlePointerDown(e);

  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const worldPos = stageOperations.current.screenToWorld(
      pointerPos.x,
      pointerPos.y
    );
    setDisplayState((prev) => ({ ...prev, cursorPos: worldPos }));

    if (spaceRef.current) {
      return;
    }

    toolManagerRef.current?.handlePointerMove(e);
  };

  const onPointerUp = (e: KonvaEventObject<PointerEvent>) =>
    toolManagerRef.current?.handlePointerUp(e);

  const onWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const oldScale = stage.scaleX();
      const newScale =
        e.evt.deltaY < 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR;

      // Direct stage manipulation
      stageOperations.current.setScale(newScale, pointer);

      // Sync display after zoom
      syncDisplayState();
    },
    [syncDisplayState]
  );

  useGesture(
    {
      onDrag: ({ event, delta: [dx, dy], touches, first, last }) => {
        const pan = spaceRef.current && touches === 1;
        if (!pan || !stageRef.current) return;

        event.preventDefault();

        if (first) {
          setDisplayState((prev) => ({ ...prev, isDragging: true }));
        }

        stageOperations.current.translate(dx, dy);

        if (last) {
          syncDisplayState(true);
        } else {
          syncDisplayState();
        }
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
      drag: { pointer: { touch: true } },
    }
  );

  return (
    <>
      <div className="fixed top-3 left-3 z-20 bg-muted p-2">
        <div>Scale: {displayState.scale.toFixed(2)}</div>
        <div>
          World: {displayState.cursorPos?.x.toFixed(1)},{" "}
          {displayState.cursorPos?.y.toFixed(1)}
        </div>
        <div>
          Offset: {displayState.viewpointPos.x.toFixed(0)},{" "}
          {displayState.viewpointPos.y.toFixed(0)}
        </div>
      </div>
      <div ref={containerRef} style={{ touchAction: "none" }}>
        <Stage
          ref={stageRef}
          width={width}
          height={height - 1}
          className="bg-background"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <Layer ref={drawingLayerRef}>
            <Text
              text="World-space primitives (transformed by stage)."
              x={20}
              y={20}
            />
            <Rect x={100} y={100} width={200} height={200} fill="lightblue" />
          </Layer>
        </Stage>
      </div>
    </>
  );
}

export default InfiniteCanvas;

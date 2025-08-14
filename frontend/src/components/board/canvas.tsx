import { useState, useRef, useEffect, useCallback } from "react";
import { useGesture } from "@use-gesture/react";
import { Stage, Layer, Text, Rect } from "react-konva";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

import useWindowSize from "@/hooks/useWindowSize";
import { type Point, Tools } from "@/lib/definations";
import {
  ZOOM_FACTOR,
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_SCALE,
  DEFAULT_VIEWPOINT_POS,
} from "@/lib/constants";

function InfiniteCanvas() {
  const { width, height } = useWindowSize();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const spaceRef = useRef(false);

  const [displayState, setDisplayState] = useState({
    scale: DEFAULT_SCALE,
    viewpointPos: DEFAULT_VIEWPOINT_POS,
    cursorPos: null as Point | null,
  });

  const stageOperations = useRef({
    getScale: () => stageRef.current?.scaleX() || DEFAULT_SCALE,
    getViewpointPos: () =>
      stageRef.current?.position() || DEFAULT_VIEWPOINT_POS,

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        spaceRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        spaceRef.current = false;
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {};

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
  };

  const onPointerUp = (e: KonvaEventObject<PointerEvent>) => {};

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
      <div
        style={{
          position: "fixed",
          left: 12,
          top: 12,
          zIndex: 20,
          background: "rgba(255,255,255,0.9)",
          padding: 8,
        }}
      >
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
          className="bg-muted"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <Layer>
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

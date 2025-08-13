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
  const toolRef = useRef<Tools>(Tools.Brush);
  const spaceRef = useRef<boolean>(false);

  const [tool, setTool] = useState<Tools>(Tools.Brush);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [viewpointPos, updateViewpointPos] = useState<Point>(
    DEFAULT_VIEWPOINT_POS
  );
  const [cursorPos, setCursorPos] = useState<Point | null>(null);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

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

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      return {
        x: (sx - viewpointPos.x) / scale,
        y: (sy - viewpointPos.y) / scale,
      };
    },
    [scale, viewpointPos.x, viewpointPos.y]
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      return {
        x: wx * scale + viewpointPos.x,
        y: wy * scale + viewpointPos.y,
      };
    },
    [scale, viewpointPos.x, viewpointPos.y]
  );

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {};

  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const worldPos = screenToWorld(pointerPos.x, pointerPos.y);
    setCursorPos(worldPos);
  };

  const onPointerUp = (e: KonvaEventObject<PointerEvent>) => {};

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = stage.scaleX(); // current scale
    // deltaY < 0 => wheel scrolled up (zoom in). deltaY > 0 => zoom out.
    const newScale =
      e.evt.deltaY < 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR;
    const clamped = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));

    // world coordinates of the pointer (using stage.x()/y() to avoid stale state)
    const worldPos = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    // compute new stage position so zoom occurs around pointer
    const newPos = {
      x: pointer.x - worldPos.x * clamped,
      y: pointer.y - worldPos.y * clamped,
    };

    // apply directly to Konva stage
    stage.scale({ x: clamped, y: clamped });
    stage.position(newPos);
    stage.batchDraw();

    // keep React state (if you use it elsewhere) in sync
    setScale(clamped);
    updateViewpointPos(newPos);
  };

  useGesture(
    {
      onDrag: ({ event, delta: [dx, dy], touches }) => {
        const pan = spaceRef.current && touches === 1;
        if (!pan || !stageRef.current) return;

        event.preventDefault();

        const stage = stageRef.current;
        if (!stage) return;

        const pos = stage.position();
        stage.position({ x: pos.x + dx, y: pos.y + dy });
        stage.batchDraw();

        updateViewpointPos((prevPos) => ({
          x: prevPos.x + dx,
          y: prevPos.y + dy,
        }));
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
        <div>Scale: {scale.toFixed(2)}</div>
        <div>
          World: {cursorPos?.x.toFixed(1)}, {cursorPos?.y.toFixed(1)}
        </div>
        <div>
          Offset: {viewpointPos.x.toFixed(0)}, {viewpointPos.y.toFixed(0)}
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
          scaleX={scale}
          scaleY={scale}
          x={viewpointPos.x}
          y={viewpointPos.y}
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

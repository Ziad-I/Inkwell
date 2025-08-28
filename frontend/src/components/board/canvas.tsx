import { useState, useRef, useEffect, useCallback } from "react";
import { useGesture } from "@use-gesture/react";
import Konva from "konva";
import { Stage, Layer, Text, Rect } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { ToolManager } from "@/tools/manager";
import useWindowSize from "@/hooks/useWindowSize";
import type { Point, StageOperations } from "@/lib/definations";
import {
  ZOOM_FACTOR,
  DEFAULT_SCALE,
  DEFAULT_VIEWPOINT_POS,
} from "@/lib/constants";
import { Tools } from "@/tools/types";

interface InfiniteCanvasProps {
  stageOperations: StageOperations;
  toolManagerRef: React.RefObject<ToolManager | null>;
  stageRef: React.RefObject<Konva.Stage | null>;
  drawingLayerRef: React.RefObject<Konva.Layer | null>;
}

function InfiniteCanvas({
  stageOperations,
  toolManagerRef,
  stageRef,
  drawingLayerRef,
}: InfiniteCanvasProps) {
  const { width, height } = useWindowSize();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const spaceRef = useRef(false);

  const [displayState, setDisplayState] = useState({
    scale: DEFAULT_SCALE,
    viewpointPos: DEFAULT_VIEWPOINT_POS,
    cursorPos: DEFAULT_VIEWPOINT_POS as Point | null,
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
        cursorPos = stageOperations.screenToWorld(pointer.x, pointer.y);
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
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        spaceRef.current = true;
        const stage = stageRef.current;
        if (stage) {
          stage.container().style.cursor = "grabbing";
        }
      }
      if (e.code === "KeyE") {
        toolManagerRef.current?.activateTool(Tools.Eraser);
      }
      if (e.code === "KeyB") {
        console.log(toolManagerRef.current?.getTools());
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

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    if (spaceRef.current) {
      return;
    }
    toolManagerRef.current?.handlePointerDown(e);
  };

  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const worldPos = stageOperations.screenToWorld(pointerPos.x, pointerPos.y);
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
      stageOperations.setScale(newScale, pointer);

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

        stageOperations.translate(dx, dy);

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
          width={width - 1}
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

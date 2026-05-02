import { useCallback, useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import type { Context as KonvaContext } from "konva/lib/Context";
import { Layer } from "react-konva";
import {
  BASE_GRID_SPACING,
  MAX_SCREEN_GRID_SPACING,
  MIN_SCREEN_GRID_SPACING,
  MAJOR_GRID_MULTIPLIER,
  GRID_OVERSCAN_MULTIPLIER,
  GRID_FALLBACK_PALETTE,
} from "@/lib/constants";
import { useTheme } from "@/hooks/useTheme";
import { useSettingsStore } from "@/stores/settingsStore";

type GridLayerProps = {
  stageRef: RefObject<Konva.Stage | null>;
  width: number;
  height: number;
};

type GridPalette = {
  minorStroke: string;
  majorStroke: string;
  axisStroke: string;
};

function getFallbackPalette(theme: string): GridPalette {
  if (theme === "dark") {
    return GRID_FALLBACK_PALETTE.dark;
  } else {
    return GRID_FALLBACK_PALETTE.light;
  }
}

function readPalette(theme: string): GridPalette {
  const fallbackPalette = getFallbackPalette(theme);

  if (typeof window === "undefined") {
    return fallbackPalette;
  }

  const styles = window.getComputedStyle(document.documentElement);

  return {
    minorStroke:
      styles.getPropertyValue("--border").trim() || fallbackPalette.minorStroke,
    majorStroke:
      styles.getPropertyValue("--muted-foreground").trim() ||
      fallbackPalette.majorStroke,
    axisStroke:
      styles.getPropertyValue("--foreground").trim() ||
      fallbackPalette.axisStroke,
  };
}

function getAdaptiveGridSpacing(scale: number) {
  if (scale <= 0) {
    return BASE_GRID_SPACING;
  }

  let spacing = BASE_GRID_SPACING;
  let screenSpacing = spacing * scale;

  while (screenSpacing < MIN_SCREEN_GRID_SPACING) {
    spacing *= 2;
    screenSpacing = spacing * scale;
  }

  while (screenSpacing > MAX_SCREEN_GRID_SPACING && spacing > 1) {
    spacing /= 2;
    screenSpacing = spacing * scale;
  }

  return spacing;
}

function strokeBatch(
  context: KonvaContext,
  verticalPositions: number[],
  horizontalPositions: number[],
  width: number,
  height: number,
  strokeStyle: string,
  opacity: number,
  lineWidth: number,
) {
  if (verticalPositions.length === 0 && horizontalPositions.length === 0) {
    return;
  }

  context.save();
  context.beginPath();

  for (const x of verticalPositions) {
    context.moveTo(x, -1);
    context.lineTo(x, height + 1);
  }

  for (const y of horizontalPositions) {
    context.moveTo(-1, y);
    context.lineTo(width + 1, y);
  }

  context.strokeStyle = strokeStyle;
  context.globalAlpha = opacity;
  context.lineWidth = lineWidth;
  context.stroke();
  context.restore();
}

function GridLayer({ stageRef, width, height }: GridLayerProps) {
  const showGrid = useSettingsStore((state) => state.showGrid);
  const { theme } = useTheme();

  const layerRef = useRef<Konva.Layer | null>(null);
  const frameRef = useRef<number | null>(null);
  const paletteFrameRef = useRef<number | null>(null);
  const paletteRef = useRef<GridPalette>(getFallbackPalette(theme));
  const sizeRef = useRef({ width, height });
  const showGridRef = useRef(showGrid);

  const drawGrid = useCallback(() => {
    frameRef.current = null;

    const layer = layerRef.current;
    const stage = stageRef.current;
    if (!layer) {
      return;
    }

    layer.clear();

    if (!showGridRef.current || !stage) {
      return;
    }

    const { width: viewportWidth, height: viewportHeight } = sizeRef.current;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }

    const scale = stage.scaleX() || 1;
    if (scale <= 0) {
      return;
    }

    const position = stage.position();
    const worldLeft = -position.x / scale;
    const worldTop = -position.y / scale;
    const worldRight = worldLeft + viewportWidth / scale;
    const worldBottom = worldTop + viewportHeight / scale;

    const minorSpacing = getAdaptiveGridSpacing(scale);
    const overscan = minorSpacing * GRID_OVERSCAN_MULTIPLIER;
    const startX =
      Math.floor((worldLeft - overscan) / minorSpacing) * minorSpacing;
    const endX =
      Math.ceil((worldRight + overscan) / minorSpacing) * minorSpacing;
    const startY =
      Math.floor((worldTop - overscan) / minorSpacing) * minorSpacing;
    const endY =
      Math.ceil((worldBottom + overscan) / minorSpacing) * minorSpacing;
    const axisThreshold = minorSpacing / 1000;

    const minorVertical: number[] = [];
    const majorVertical: number[] = [];
    const axisVertical: number[] = [];
    const minorHorizontal: number[] = [];
    const majorHorizontal: number[] = [];
    const axisHorizontal: number[] = [];

    for (let x = startX; x <= endX; x += minorSpacing) {
      const screenX = x * scale + position.x;
      const lineIndex = Math.round(x / minorSpacing);
      const isAxis = Math.abs(x) <= axisThreshold;
      const isMajor = lineIndex % MAJOR_GRID_MULTIPLIER === 0;

      if (isAxis) {
        axisVertical.push(screenX);
      } else if (isMajor) {
        majorVertical.push(screenX);
      } else {
        minorVertical.push(screenX);
      }
    }

    for (let y = startY; y <= endY; y += minorSpacing) {
      const screenY = y * scale + position.y;
      const lineIndex = Math.round(y / minorSpacing);
      const isAxis = Math.abs(y) <= axisThreshold;
      const isMajor = lineIndex % MAJOR_GRID_MULTIPLIER === 0;

      if (isAxis) {
        axisHorizontal.push(screenY);
      } else if (isMajor) {
        majorHorizontal.push(screenY);
      } else {
        minorHorizontal.push(screenY);
      }
    }

    const context = layer.getContext();
    const { minorStroke, majorStroke, axisStroke } = paletteRef.current;

    strokeBatch(
      context,
      minorVertical,
      minorHorizontal,
      viewportWidth,
      viewportHeight,
      minorStroke,
      1,
      1,
    );
    strokeBatch(
      context,
      majorVertical,
      majorHorizontal,
      viewportWidth,
      viewportHeight,
      majorStroke,
      0.2,
      1.25,
    );
    strokeBatch(
      context,
      axisVertical,
      axisHorizontal,
      viewportWidth,
      viewportHeight,
      axisStroke,
      0.18,
      1.5,
    );
  }, [stageRef]);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(drawGrid);
  }, [drawGrid]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    scheduleDraw();
    stage.on("xChange.grid yChange.grid scaleXChange.grid", scheduleDraw);

    return () => {
      stage.off(".grid");

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [scheduleDraw, stageRef]);

  useEffect(() => {
    sizeRef.current = { width, height };
    scheduleDraw();
  }, [height, scheduleDraw, width]);

  useEffect(() => {
    showGridRef.current = showGrid;
    scheduleDraw();
  }, [scheduleDraw, showGrid]);

  useEffect(() => {
    if (paletteFrameRef.current !== null) {
      window.cancelAnimationFrame(paletteFrameRef.current);
    }

    paletteFrameRef.current = window.requestAnimationFrame(() => {
      paletteRef.current = readPalette(theme);
      paletteFrameRef.current = null;
      scheduleDraw();
    });

    return () => {
      if (paletteFrameRef.current !== null) {
        window.cancelAnimationFrame(paletteFrameRef.current);
        paletteFrameRef.current = null;
      }
    };
  }, [scheduleDraw, theme]);

  return (
    <Layer
      ref={layerRef}
      name="gridLayer"
      listening={false}
      hitGraphEnabled={false}
      clearBeforeDraw={false}
      visible={showGrid}
    />
  );
}

export default GridLayer;

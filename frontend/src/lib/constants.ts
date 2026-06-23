const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const DEFAULT_VIEWPOINT_POS = { x: 0, y: 0 };
const ZOOM_FACTOR = 1.06;
const PRESENCE_EMIT_INTERVAL_MS = 75;
const PRESET_COLORS = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#ff00ff",
  "#00ffff",
  "#808080",
  "#800000",
  "#008000",
  "#000080",
];
const SHAPE_KINDS = ["rectangle", "circle", "line", "arrow"] as const;
const LINE_CAPS = ["butt", "round", "square"];
const LINE_JOINS = ["miter", "round", "bevel"];
const BASE_GRID_SPACING = 50;
const MIN_SCREEN_GRID_SPACING = 28;
const MAX_SCREEN_GRID_SPACING = 96;
const MAJOR_GRID_MULTIPLIER = 5;
const GRID_OVERSCAN_MULTIPLIER = 5;
const GRID_FALLBACK_PALETTE = {
  dark: {
    minorStroke: "rgba(255, 255, 255, 0.08)",
    majorStroke: "rgba(255, 255, 255, 0.14)",
    axisStroke: "rgba(255, 255, 255, 0.2)",
  },
  light: {
    minorStroke: "rgba(15, 23, 42, 0.08)",
    majorStroke: "rgba(15, 23, 42, 0.14)",
    axisStroke: "rgba(15, 23, 42, 0.2)",
  },
};

export {
  DEFAULT_SCALE,
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_VIEWPOINT_POS,
  PRESENCE_EMIT_INTERVAL_MS,
  ZOOM_FACTOR,
  PRESET_COLORS,
  SHAPE_KINDS,
  LINE_CAPS,
  LINE_JOINS,
  BASE_GRID_SPACING,
  MIN_SCREEN_GRID_SPACING,
  MAX_SCREEN_GRID_SPACING,
  MAJOR_GRID_MULTIPLIER,
  GRID_OVERSCAN_MULTIPLIER,
  GRID_FALLBACK_PALETTE,
};

export type ShapeKind = (typeof SHAPE_KINDS)[number];

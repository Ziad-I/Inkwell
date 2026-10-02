import Konva from "konva";
import { GUIDELINE_OFFSET, GUIDE_COLOR, GUIDE_NAME } from "./constants";

type SnapEdge = "start" | "center" | "end";
type Orientation = "V" | "H";

interface SnapPoint {
  /** Position of this snap edge in screen coordinates. */
  guide: number;
  /**
   * absolutePosition - guide: applied to the node's absolutePosition after a snap
   * so that the correct edge lands on the guide line, not the origin.
   */
  offset: number;
  snap: SnapEdge;
}

type GuideCandidate = {
  lineGuide: number;
  diff: number;
  offset: number;
  snap: SnapEdge;
};

interface ItemBounds {
  vertical: SnapPoint[];
  horizontal: SnapPoint[];
}

interface SnapStops {
  vertical: number[];
  horizontal: number[];
}

export interface GuideResult {
  /** Screen coordinate of the guide line. */
  lineGuide: number;
  /** absolutePosition correction to align the matching edge with lineGuide. */
  offset: number;
  orientation: Orientation;
  snap: SnapEdge;
}

/**
 * Collect left/center-x/right and top/center-y/bottom snap positions
 * (in screen coordinates) for every selectable node in the drawing layer,
 * skipping any node listed in `skipNodes`.
 */
export function getSnapStops(
  drawingLayer: Konva.Layer,
  skipNodes: Konva.Node[],
): SnapStops {
  const vertical: number[] = [];
  const horizontal: number[] = [];

  for (const node of drawingLayer.getChildren()) {
    if (skipNodes.includes(node)) continue;
    if (!node.getAttr("selectable")) continue;
    if (!node.getAttr("hasGuideLines")) continue;

    const box = node.getClientRect();
    vertical.push(box.x, box.x + box.width / 2, box.x + box.width);
    horizontal.push(box.y, box.y + box.height / 2, box.y + box.height);
  }

  return { vertical, horizontal };
}

/**
 * Returns the 6 snap-edge references for the node being dragged (screen coords).
 * Uses getClientRect so rotated nodes produce correct axis-aligned bounds.
 */
export function getNodeSnapEdges(node: Konva.Node): ItemBounds {
  const box = node.getClientRect();
  const absPos = node.absolutePosition();

  return {
    vertical: [
      { guide: box.x, offset: absPos.x - box.x, snap: "start" },
      {
        guide: box.x + box.width / 2,
        offset: absPos.x - box.x - box.width / 2,
        snap: "center",
      },
      {
        guide: box.x + box.width,
        offset: absPos.x - box.x - box.width,
        snap: "end",
      },
    ],
    horizontal: [
      { guide: box.y, offset: absPos.y - box.y, snap: "start" },
      {
        guide: box.y + box.height / 2,
        offset: absPos.y - box.y - box.height / 2,
        snap: "center",
      },
      {
        guide: box.y + box.height,
        offset: absPos.y - box.y - box.height,
        snap: "end",
      },
    ],
  };
}

/**
 * Compare every snap stop against every snap edge of the dragging node.
 * Returns the N closest guides within GUIDELINE_OFFSET pixels, if any.
 */
function findClosestGuides(
  stops: number[],
  bounds: SnapPoint[],
  orientation: Orientation,
  n: number = 1,
): GuideResult[] {
  const candidates: GuideCandidate[] = [];

  for (const lineGuide of stops) {
    for (const bound of bounds) {
      const diff = Math.abs(lineGuide - bound.guide);

      if (diff >= GUIDELINE_OFFSET) continue;

      candidates.push({
        lineGuide,
        diff,
        offset: bound.offset,
        snap: bound.snap,
      });
    }
  }

  return candidates
    .sort((a, b) => a.diff - b.diff)
    .slice(0, n)
    .map((c) => ({
      lineGuide: c.lineGuide,
      offset: c.offset,
      orientation,
      snap: c.snap,
    }));
}

/**
 * Compare every snap stop against every snap edge of the dragging node.
 * Returns up to two guides per orientation within GUIDELINE_OFFSET pixels.
 */
export function getClosestGuides(
  stops: SnapStops,
  nodeBounds: ItemBounds,
): GuideResult[] {
  const verticalGuides = findClosestGuides(
    stops.vertical,
    nodeBounds.vertical,
    "V",
  );
  const horizontalGuides = findClosestGuides(
    stops.horizontal,
    nodeBounds.horizontal,
    "H",
  );

  return [...verticalGuides, ...horizontalGuides];
}

/**
 * Move the node's absolutePosition so the snapping edge lands exactly on the guide.
 */
export function applyGuideSnap(node: Konva.Node, guides: GuideResult[]): void {
  if (guides.length === 0) return;

  const absPos = node.absolutePosition();

  for (const guide of guides) {
    if (guide.orientation === "V") {
      absPos.x = guide.lineGuide + guide.offset;
    } else {
      absPos.y = guide.lineGuide + guide.offset;
    }
  }

  node.absolutePosition(absPos);
}

/**
 * Render guide lines on the overlay layer. Lines are placed with absolutePosition
 * (screen coordinates) so they sit at the correct pixel regardless of pan/zoom.
 * Each line spans ±10 000 px to cover any realistic canvas extent.
 */
export function drawGuides(
  guides: GuideResult[],
  overlayLayer: Konva.Layer,
): void {
  for (const guide of guides) {
    const line = new Konva.Line({
      points:
        guide.orientation === "H"
          ? [-10000, 0, 10000, 0]
          : [0, -10000, 0, 10000],
      stroke: GUIDE_COLOR,
      strokeWidth: 1,
      name: GUIDE_NAME,
      dash: [4, 6],
      listening: false,
    });

    overlayLayer.add(line);

    line.absolutePosition(
      guide.orientation === "H"
        ? { x: 0, y: guide.lineGuide }
        : { x: guide.lineGuide, y: 0 },
    );
  }
}

/**
 * Destroy all guide lines from the overlay layer.
 */
export function clearGuides(overlayLayer: Konva.Layer): void {
  overlayLayer.find(`.${GUIDE_NAME}`).forEach((n) => n.destroy());
}

import { vi } from "vitest";

const KonvaNode = class {};

vi.mock("konva", () => ({
  default: {
    Line: KonvaNode,
    Rect: KonvaNode,
    Circle: KonvaNode,
    Arrow: KonvaNode,
    Stage: KonvaNode,
    Layer: KonvaNode,
    Group: KonvaNode,
    Text: KonvaNode,
    Image: KonvaNode,
    Transformer: KonvaNode,
  },
  Line: KonvaNode,
  Rect: KonvaNode,
  Circle: KonvaNode,
  Arrow: KonvaNode,
  Stage: KonvaNode,
  Layer: KonvaNode,
  Group: KonvaNode,
  Text: KonvaNode,
  Image: KonvaNode,
  Transformer: KonvaNode,
}));

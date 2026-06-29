import React from "react";

type KonvaProps = Record<string, unknown> & { children?: React.ReactNode };

function createMockComponent(displayName: string, testId: string) {
  const Component = ({ children, ...props }: KonvaProps) => {
    const filteredProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value !== "function") {
        filteredProps[key] = value;
      }
    }
    return React.createElement("div", {
      "data-testid": testId,
      "data-konva-name": displayName,
      ...filteredProps,
      children,
    });
  };
  Component.displayName = displayName;
  return Component;
}

export const Stage = createMockComponent("Stage", "konva-stage");
export const Layer = createMockComponent("Layer", "konva-layer");
export const Rect = createMockComponent("Rect", "konva-rect");
export const Line = createMockComponent("Line", "konva-line");
export const Circle = createMockComponent("Circle", "konva-circle");
export const Ellipse = createMockComponent("Ellipse", "konva-ellipse");
export const Text = createMockComponent("Text", "konva-text");
export const Group = createMockComponent("Group", "konva-group");
export const Transformer = createMockComponent("Transformer", "konva-transformer");
export const Image = createMockComponent("Image", "konva-image");
export const Path = createMockComponent("Path", "konva-path");
export const Arrow = createMockComponent("Arrow", "konva-arrow");
export const RegularPolygon = createMockComponent("RegularPolygon", "konva-regular-polygon");

export default { Stage, Layer, Rect, Line, Circle, Ellipse, Text, Group, Transformer, Image, Path, Arrow, RegularPolygon };

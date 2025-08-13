export interface Point {
  x: number;
  y: number;
}

export const Tools = {
  Brush: "brush",
  Eraser: "eraser",
  Shape: "shape",
};
export type Tools = (typeof Tools)[keyof typeof Tools];

export const OperationType = {
  Stroke: "stroke",
  Erase: "erase",
  Clear: "clear",
  Shape: "shape",
  Tombstone: "tombstone",
};
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

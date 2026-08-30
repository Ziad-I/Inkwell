import { z } from "zod";

import { SHAPE_KINDS, LINE_CAPS, LINE_JOINS } from "@/lib/constants";

// ---- primitives ----

export const idSchema = z.string().min(1).max(128);
export const finiteNumberSchema = z.number().finite();
export const sequenceSchema = z.number().int().nonnegative().finite();
export const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
export const pointSchema = z.strictObject({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
});
// LINE_CAPS/LINE_JOINS/SHAPE_KINDS live in constants.ts (as const arrays) so
// UI code (toolbars, dropdowns) and these schemas read from one list.
export const lineCapSchema = z.enum(LINE_CAPS);
export const lineJoinSchema = z.enum(LINE_JOINS);
export const commandStatusSchema = z.enum(["pending", "applied", "reverted"]);
export const shapeKindSchema = z.enum(SHAPE_KINDS);

export type Point = z.infer<typeof pointSchema>;
// ShapeKind/LineCap/LineJoin still resolve to the same literal unions as
// before — they're just derived from constants.ts now instead of duplicated.
export type CommandStatus = z.infer<typeof commandStatusSchema>;
export type CommandID = string;

// ---- command payloads ----

const commandBase = {
  id: idSchema,
  owner: idSchema,
  status: commandStatusSchema,
  timestamp: finiteNumberSchema,
  seq: sequenceSchema.optional(),
};

export const strokePayloadSchema = z.strictObject({
  nodeId: idSchema,
  points: z
    .array(finiteNumberSchema)
    .max(20_000)
    .refine((points) => points.length % 2 === 0, {
      message: "Stroke points must contain coordinate pairs",
    }),
  color: colorSchema,
  strokeWidth: finiteNumberSchema.positive(),
  lineCap: lineCapSchema,
  lineJoin: lineJoinSchema,
  opacity: finiteNumberSchema.min(0).max(1),
});

export const strokeSchema = z.strictObject({
  ...commandBase,
  type: z.literal("stroke"),
  payload: strokePayloadSchema,
});

export const shapePayloadSchema = z.strictObject({
  nodeId: idSchema,
  kind: shapeKindSchema,
  start: pointSchema,
  end: pointSchema,
  color: colorSchema,
  strokeWidth: finiteNumberSchema.positive(),
  lineCap: lineCapSchema,
  lineJoin: lineJoinSchema,
  opacity: finiteNumberSchema.min(0).max(1),
});

export const shapeSchema = z.strictObject({
  ...commandBase,
  type: z.literal("shape"),
  payload: shapePayloadSchema,
});

export const erasePayloadSchema = z.strictObject({
  erasedNodes: z.array(idSchema).max(1_000),
});

export const eraseSchema = z.strictObject({
  ...commandBase,
  type: z.literal("erase"),
  payload: erasePayloadSchema,
});

export const nodeStateSchema = z.strictObject({
  width: finiteNumberSchema,
  height: finiteNumberSchema,
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  scaleX: finiteNumberSchema,
  scaleY: finiteNumberSchema,
  rotation: finiteNumberSchema,
  skewX: finiteNumberSchema,
  skewY: finiteNumberSchema,
  offsetX: finiteNumberSchema,
  offsetY: finiteNumberSchema,
});

export type NodeState = z.infer<typeof nodeStateSchema>;

export const transformPayloadSchema = z.strictObject({
  transforms: z
    .array(
      z.strictObject({
        nodeId: idSchema,
        before: nodeStateSchema,
        after: nodeStateSchema,
      }),
    )
    .max(1_000),
});

export const transformSchema = z.strictObject({
  ...commandBase,
  type: z.literal("transform"),
  payload: transformPayloadSchema,
});

export const commandSchema = z.discriminatedUnion("type", [
  strokeSchema,
  shapeSchema,
  eraseSchema,
  transformSchema,
]);

// ---- inferred types (this block replaces the old hand-written interfaces) ----

export type StrokePayload = z.infer<typeof strokePayloadSchema>;
export type ShapePayload = z.infer<typeof shapePayloadSchema>;
export type ErasePayload = z.infer<typeof erasePayloadSchema>;
export type TransformPayload = z.infer<typeof transformPayloadSchema>;

export type StrokeCommand = z.infer<typeof strokeSchema>;
export type ShapeCommand = z.infer<typeof shapeSchema>;
export type EraseCommand = z.infer<typeof eraseSchema>;
export type TransformCommand = z.infer<typeof transformSchema>;

export type RenderableCommand = z.infer<typeof commandSchema>;
export type Command = RenderableCommand;
export type CommandType = RenderableCommand["type"];
export type CommandPayload = RenderableCommand["payload"];

// ---- helpers ----

export type CommandPayloadMap = {
  stroke: StrokePayload;
  shape: ShapePayload;
  erase: ErasePayload;
  transform: TransformPayload;
};

export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

export type PresenceMeta = {
  userColor: string;
  userName: string;
};

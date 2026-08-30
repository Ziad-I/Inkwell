import { describe, expect, it } from "vitest";

import {
  commandCancelArgsSchema,
  commandCreateArgsSchema,
  commandEnvelopeSchema,
  commandFinalizeArgsSchema,
  commandRedoArgsSchema,
  commandRejectArgsSchema,
  commandUndoArgsSchema,
  commandUpdateArgsSchema,
  durableAckSchema,
  joinAckSchema,
  parseProtocol,
  presenceJoinArgsSchema,
  presenceLeaveArgsSchema,
  presenceMoveArgsSchema,
  roomSyncArgsSchema,
  syncSchema,
} from "@/collaboration/schemas";
import { commandSchema } from "@/types/command";

const validStroke = {
  id: "command-1",
  type: "stroke" as const,
  payload: {
    nodeId: "node-1",
    points: [0, 1, 2, 3],
    color: "#123abc",
    strokeWidth: 3,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    opacity: 0.75,
  },
  owner: "user-1",
  status: "pending" as const,
  timestamp: 1_000,
  seq: 0,
};

const nodeState = {
  width: 10,
  height: 20,
  x: 1,
  y: 2,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  skewX: 0,
  skewY: 0,
  offsetX: 0,
  offsetY: 0,
};

describe("command schemas", () => {
  it("accepts each renderable command type", () => {
    const commands = [
      validStroke,
      {
        ...validStroke,
        type: "shape",
        payload: {
          nodeId: "node-1",
          kind: "rectangle",
          start: { x: 0, y: 1 },
          end: { x: 2, y: 3 },
          color: "#ffffff",
          strokeWidth: 2,
          lineCap: "butt",
          lineJoin: "miter",
          opacity: 1,
        },
      },
      {
        ...validStroke,
        type: "erase",
        payload: { erasedNodes: ["node-1"] },
      },
      {
        ...validStroke,
        type: "transform",
        payload: {
          transforms: [
            { nodeId: "node-1", before: nodeState, after: nodeState },
          ],
        },
      },
    ];

    for (const command of commands) {
      expect(commandSchema.safeParse(command).success).toBe(true);
    }
  });

  it("rejects unsupported command types", () => {
    expect(
      commandSchema.safeParse({ ...validStroke, type: "tombstone" }).success,
    ).toBe(false);
  });

  it("rejects inconsistent envelope IDs", () => {
    expect(
      commandEnvelopeSchema.safeParse({ id: "other", command: validStroke })
        .success,
    ).toBe(false);
  });

  it.each([
    { ...validStroke, timestamp: Number.NaN },
    { ...validStroke, seq: -1 },
    {
      ...validStroke,
      payload: { ...validStroke.payload, points: [0, 1, 2] },
    },
    {
      ...validStroke,
      payload: { ...validStroke.payload, opacity: 1.1 },
    },
  ])("rejects malformed command %#", (command) => {
    expect(commandSchema.safeParse(command).success).toBe(false);
  });

  it.each([
    { ...validStroke, id: "x".repeat(129) },
    { ...validStroke, status: "deleted" },
    {
      ...validStroke,
      payload: { ...validStroke.payload, color: "not-a-color" },
    },
    {
      ...validStroke,
      payload: { ...validStroke.payload, lineCap: "flat" },
    },
    {
      ...validStroke,
      payload: {
        ...validStroke.payload,
        points: [0, Number.POSITIVE_INFINITY],
      },
    },
    {
      ...validStroke,
      type: "shape",
      payload: {
        nodeId: "node-1",
        kind: "triangle",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        color: "#000000",
        strokeWidth: 1,
        lineCap: "round",
        lineJoin: "round",
        opacity: 1,
      },
    },
    {
      ...validStroke,
      type: "transform",
      payload: {
        transforms: [
          {
            nodeId: "node-1",
            before: nodeState,
            after: { ...nodeState, x: Number.NEGATIVE_INFINITY },
          },
        ],
      },
    },
  ])("rejects invalid command bounds or values %#", (command) => {
    expect(commandSchema.safeParse(command).success).toBe(false);
  });

  it("rejects oversized command collections", () => {
    expect(
      commandSchema.safeParse({
        ...validStroke,
        payload: { ...validStroke.payload, points: Array(20_002).fill(0) },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        ...validStroke,
        type: "erase",
        payload: { erasedNodes: Array(1_001).fill("node-1") },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        ...validStroke,
        type: "transform",
        payload: {
          transforms: Array(1_001).fill({
            nodeId: "node-1",
            before: nodeState,
            after: nodeState,
          }),
        },
      }).success,
    ).toBe(false);
  });

  it("rejects one invalid command inside sync", () => {
    expect(
      syncSchema.safeParse([
        validStroke,
        { ...validStroke, id: "command-2", timestamp: Number.NaN },
      ]).success,
    ).toBe(false);
  });
});

describe("acknowledgement and inbound event schemas", () => {
  it("validates acknowledgement data", () => {
    expect(
      joinAckSchema.safeParse({
        role: "editor",
        permissions: { read: true, draw: true },
      }).success,
    ).toBe(true);
    expect(durableAckSchema.safeParse({ seq: 3 }).success).toBe(true);

    expect(
      joinAckSchema.safeParse({
        role: "admin",
        permissions: { read: true, draw: true },
      }).success,
    ).toBe(false);
    expect(
      joinAckSchema.safeParse({
        role: "viewer",
        permissions: { read: true, draw: "yes" },
      }).success,
    ).toBe(false);
    expect(durableAckSchema.safeParse({ seq: -1 }).success).toBe(false);
  });

  it.each([
    [commandCreateArgsSchema, [validStroke.id, validStroke]],
    [commandUpdateArgsSchema, [validStroke.id, validStroke]],
    [commandFinalizeArgsSchema, [validStroke.id, validStroke]],
    [commandCancelArgsSchema, [validStroke.id]],
    [commandUndoArgsSchema, [validStroke.id, validStroke]],
    [commandRedoArgsSchema, [validStroke.id, validStroke]],
    [commandRejectArgsSchema, [validStroke.id, "INVALID_COMMAND"]],
    [roomSyncArgsSchema, [[validStroke]]],
    [
      presenceJoinArgsSchema,
      ["user-1", { userColor: "#123abc", userName: "Ada" }],
    ],
    [presenceLeaveArgsSchema, ["user-1"]],
    [presenceMoveArgsSchema, ["user-1", { x: 10, y: 20 }]],
  ])("accepts a valid inbound event tuple %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each([
    [commandCreateArgsSchema, ["other", validStroke]],
    [
      commandUpdateArgsSchema,
      [validStroke.id, { ...validStroke, status: "bad" }],
    ],
    [commandFinalizeArgsSchema, [validStroke.id]],
    [commandCancelArgsSchema, ["x".repeat(129)]],
    [commandUndoArgsSchema, [validStroke.id, { ...validStroke, id: "other" }]],
    [commandRedoArgsSchema, [validStroke.id, validStroke, "extra"]],
    [commandRejectArgsSchema, [validStroke.id, ""]],
    [roomSyncArgsSchema, [[{ ...validStroke, seq: -1 }]]],
    [presenceJoinArgsSchema, ["user-1", { userColor: "red", userName: "Ada" }]],
    [
      presenceJoinArgsSchema,
      ["user-1", { userColor: "#123abc", userName: "" }],
    ],
    [presenceLeaveArgsSchema, []],
    [presenceMoveArgsSchema, ["user-1", { x: Number.NaN, y: 20 }]],
  ])("rejects a malformed inbound event tuple %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

describe("parseProtocol", () => {
  it("returns parsed data for a valid protocol value", () => {
    expect(parseProtocol("durable ack", durableAckSchema, { seq: 4 })).toEqual({
      success: true,
      data: { seq: 4 },
    });
  });

  it("identifies the schema when protocol validation fails", () => {
    const result = parseProtocol("durable ack", durableAckSchema, { seq: -1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.schemaName).toBe("durable ack");
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

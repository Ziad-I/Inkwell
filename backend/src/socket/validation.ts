import { z } from "zod";

const commandSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["stroke", "shape", "erase", "transform", "tombstone", "restore"]),
  payload: z.record(z.string(), z.unknown()),
  owner: z.string().min(1),
  status: z.enum(["pending", "applied", "reverted"]),
  timestamp: z.number(),
  seq: z.number().optional(),
});

export const commandEnvelopeSchema = z.object({
  id: z.string().min(1),
  command: commandSchema,
});

export const commandIdSchema = z.object({ id: z.string().min(1) });

export const roomJoinSchema = z.object({
  roomId: z.uuid(),
  lastSeq: z.number().int().nonnegative().optional(),
});

export const roomLeaveSchema = z.object({ roomId: z.uuid() });

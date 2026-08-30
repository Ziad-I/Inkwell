import { z, ZodError } from "zod";

import {
  idSchema,
  sequenceSchema,
  colorSchema,
  pointSchema,
  commandSchema,
} from "@/types/command";

export const commandEnvelopeSchema = z
  .strictObject({
    id: idSchema,
    command: commandSchema,
  })
  .superRefine(({ id, command }, context) => {
    if (id !== command.id) {
      context.addIssue({
        code: "custom",
        path: ["id"],
        message: "Envelope ID must match command ID",
      });
    }
  });

export const syncSchema = z.array(commandSchema);
export const joinAckSchema = z.strictObject({
  role: z.enum(["owner", "editor", "viewer"]),
  permissions: z.strictObject({
    read: z.boolean(),
    draw: z.boolean(),
  }),
});
export const durableAckSchema = z.strictObject({ seq: sequenceSchema });

const commandArgsSchema = z
  .tuple([idSchema, commandSchema])
  .superRefine(([id, command], context) => {
    if (id !== command.id) {
      context.addIssue({
        code: "custom",
        path: [0],
        message: "Event command ID must match command ID",
      });
    }
  });

export const commandCreateArgsSchema = commandArgsSchema;
export const commandUpdateArgsSchema = commandArgsSchema;
export const commandFinalizeArgsSchema = commandArgsSchema;
export const commandCancelArgsSchema = z.tuple([idSchema]);
export const commandUndoArgsSchema = commandArgsSchema;
export const commandRedoArgsSchema = commandArgsSchema;
export const commandRejectArgsSchema = z.tuple([
  idSchema,
  z.string().min(1).max(128),
]);
export const roomSyncArgsSchema = z.tuple([syncSchema]);
export const presenceJoinArgsSchema = z.tuple([
  idSchema,
  z.strictObject({
    userColor: colorSchema,
    userName: z.string().min(1).max(128),
  }),
]);
export const presenceLeaveArgsSchema = z.tuple([idSchema]);
export const presenceMoveArgsSchema = z.tuple([idSchema, pointSchema]);

export type ProtocolParseResult<T> =
  | { success: true; data: T }
  | { success: false; schemaName: string; error: ZodError };

export function parseProtocol<T>(
  schemaName: string,
  schema: z.ZodType<T>,
  value: unknown,
): ProtocolParseResult<T> {
  const result = schema.safeParse(value);

  return result.success
    ? { success: true, data: result.data }
    : { success: false, schemaName, error: result.error };
}

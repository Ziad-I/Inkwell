import type { Server, Socket } from "socket.io";
import type { Command, CommandID, SocketData, Ack } from "@/types/types.js";
import {
  getCommandById,
  applyFinalize,
  applyUndo,
  applyRedo,
} from "@/services/state.js";
import logger from "@/config/logger.js";

export function reject(
  socket: Socket,
  commandId: CommandID,
  reason: string,
  ack?: Ack | AckWithSeq,
): void {
  socket.emit("command:reject", commandId, reason);
  ack?.(reason);
}

type AckWithSeq = Ack<{ seq: number }>;

export async function registerCommandHandlers(socket: Socket, io: Server) {
  socket.on(
    "command:create",
    async (payload: { id: CommandID; command: Command }, ack?: Ack) => {
      const { roomId, userId, canDraw } = socket.data as SocketData;
      const { id: commandId, command } = payload;

      try {
        if (!roomId) {
          reject(socket, commandId, "NOT_IN_ROOM", ack);
          return;
        }
        if (!canDraw) {
          reject(socket, commandId, "UNAUTHORIZED_NO_PERMISSION_TO_DRAW", ack);
          return;
        }
        if (command.owner !== userId) {
          reject(socket, commandId, "UNAUTHORIZED_NOT_COMMAND_OWNER", ack);
          return;
        }
        console.log(`Broadcasting command:create for commandId: ${commandId}`);
        socket.to(roomId).emit("command:create", commandId, command);
        ack?.();
      } catch (err) {
        logger.error(`[command:create] error:`, err);
        reject(socket, commandId, "INTERNAL_SERVER_ERROR", ack);
      }
    },
  );

  socket.on(
    "command:update",
    async (payload: { id: CommandID; command: Command }, ack?: Ack) => {
      const { roomId, userId, canDraw } = socket.data as SocketData;
      const { id: commandId, command } = payload;
      try {
        if (!roomId) {
          reject(socket, commandId, "NOT_IN_ROOM", ack);
          return;
        }
        if (!canDraw) {
          reject(socket, commandId, "UNAUTHORIZED_NO_PERMISSION_TO_DRAW", ack);
          return;
        }
        if (command.owner !== userId) {
          reject(socket, commandId, "UNAUTHORIZED_NOT_COMMAND_OWNER", ack);
          return;
        }
        socket.to(roomId).emit("command:update", commandId, command);
        ack?.();
      } catch (err) {
        logger.error(`[command:update] error:`, err);
        reject(socket, commandId, "INTERNAL_SERVER_ERROR", ack);
      }
    },
  );

  socket.on(
    "command:finalize",
    async (payload: { id: CommandID; command: Command }, ack?: AckWithSeq) => {
      const { roomId, userId, canDraw } = socket.data as SocketData;
      const { id: commandId, command } = payload;
      try {
        if (!roomId) {
          reject(socket, commandId, "NOT_IN_ROOM", ack);
          return;
        }
        if (!canDraw) {
          reject(socket, commandId, "UNAUTHORIZED_NO_PERMISSION_TO_DRAW", ack);
          return;
        }
        if (command.owner !== userId) {
          reject(socket, commandId, "UNAUTHORIZED_NOT_COMMAND_OWNER", ack);
          return;
        }
        const finalized = await applyFinalize(roomId, command);
        socket.to(roomId).emit("command:finalize", commandId, finalized);
        ack?.(undefined, { seq: finalized.seq });
      } catch (err) {
        logger.error(`[command:finalize] error:`, err);
        reject(socket, commandId, "INTERNAL_SERVER_ERROR", ack);
      }
    },
  );

  socket.on("command:cancel", async (payload: { id: CommandID }, ack?: Ack) => {
    const { roomId, userId, canDraw } = socket.data as SocketData;
    const { id: commandId } = payload;
    try {
      if (!roomId) {
        reject(socket, commandId, "NOT_IN_ROOM", ack);
        return;
      }
      if (!canDraw) {
        reject(socket, commandId, "UNAUTHORIZED_NO_PERMISSION_TO_DRAW", ack);
        return;
      }
      const command = await getCommandById(roomId, commandId);
      if (!command) {
        reject(socket, commandId, "INVALID_COMMAND", ack);
        return;
      }
      if (command.owner !== userId) {
        reject(socket, commandId, "UNAUTHORIZED_NOT_COMMAND_OWNER", ack);
        return;
      }
      socket.to(roomId).emit("command:cancel", commandId);
      ack?.();
    } catch (err) {
      logger.error(`[command:cancel] error:`, err);
      reject(socket, commandId, "INTERNAL_SERVER_ERROR", ack);
    }
  });

  socket.on(
    "command:undo",
    async (payload: { id: CommandID }, ack?: AckWithSeq) => {
      const { roomId, userId, canDraw } = socket.data as SocketData;
      const { id: commandId } = payload;
      try {
        if (!roomId) {
          reject(socket, commandId, "NOT_IN_ROOM", ack);
          return;
        }
        if (!canDraw) {
          reject(socket, commandId, "UNAUTHORIZED_NO_PERMISSION_TO_DRAW", ack);
          return;
        }
        const command = await getCommandById(roomId, commandId);
        if (!command) {
          reject(socket, commandId, "INVALID_COMMAND", ack);
          return;
        }
        if (command.owner !== userId) {
          reject(socket, commandId, "UNAUTHORIZED_NOT_COMMAND_OWNER", ack);
          return;
        }
        if (command.status !== "applied") {
          reject(socket, commandId, "COMMAND_NOT_APPLIED", ack);
          return;
        }
        const undone = await applyUndo(roomId, command);
        socket.to(roomId).emit("command:undo", commandId, undone);
        ack?.(undefined, { seq: undone.seq });
      } catch (err) {
        logger.error(`[command:undo] error:`, err);
        reject(socket, commandId, "INTERNAL_SERVER_ERROR", ack);
      }
    },
  );

  socket.on(
    "command:redo",
    async (payload: { id: CommandID }, ack?: AckWithSeq) => {
      const { roomId, userId, canDraw } = socket.data as SocketData;
      const { id: commandId } = payload;
      try {
        if (!roomId) {
          reject(socket, commandId, "NOT_IN_ROOM", ack);
          return;
        }
        if (!canDraw) {
          reject(socket, commandId, "UNAUTHORIZED_NO_PERMISSION_TO_DRAW", ack);
          return;
        }
        const command = await getCommandById(roomId, commandId);
        if (!command) {
          reject(socket, commandId, "INVALID_COMMAND", ack);
          return;
        }
        if (command.owner !== userId) {
          reject(socket, commandId, "UNAUTHORIZED_NOT_COMMAND_OWNER", ack);
          return;
        }
        if (command.status !== "reverted") {
          reject(socket, commandId, "COMMAND_NOT_REVERTED", ack);
          return;
        }
        const redone = await applyRedo(roomId, command);
        socket.to(roomId).emit("command:redo", commandId, redone);
        ack?.(undefined, { seq: redone.seq });
      } catch (err) {
        logger.error(`[command:redo] error:`, err);
        reject(socket, commandId, "INTERNAL_SERVER_ERROR", ack);
      }
    },
  );
}

import type { Server, Socket } from "socket.io";
import type {
  Command,
  CommandID,
  SocketData,
  Ack,
  AckWithSeq,
} from "@/types/types.js";
import {
  getCommandById,
  applyFinalize,
  applyUndo,
  applyRedo,
} from "@/services/state.js";

export function reject(
  socket: Socket,
  commandId: CommandID,
  reason: string,
  ack?: Ack | AckWithSeq,
): void {
  socket.emit("command:reject", commandId, reason);
  ack?.(reason);
}

export async function registerCommandHandlers(socket: Socket, io: Server) {
  const { roomId, userId, canDraw } = socket.data as SocketData;

  socket.on(
    "command:create",
    async (payload: { id: CommandID; command: Command }, ack?: Ack) => {
      const { id: commandId, command } = payload;

      if (!roomId) {
        reject(socket, commandId, "User not in a room", ack);
        return;
      }

      if (!canDraw) {
        reject(socket, commandId, "User does not have permission to draw", ack);
        return;
      }

      if (command.owner !== userId) {
        reject(socket, commandId, "User does not own the command", ack);
        return;
      }

      socket.to(roomId).emit("command:create", commandId, command);
      ack?.();
    },
  );

  socket.on(
    "command:update",
    async (payload: { id: CommandID; command: Command }, ack?: Ack) => {
      const { id: commandId, command } = payload;

      if (!roomId) {
        reject(socket, commandId, "User not in a room", ack);
        return;
      }

      if (!canDraw) {
        reject(socket, commandId, "User does not have permission to draw", ack);
        return;
      }

      if (command.owner !== userId) {
        reject(socket, commandId, "User does not own the command", ack);
        return;
      }

      socket.to(roomId).emit("command:update", commandId, command);
      ack?.();
    },
  );

  socket.on(
    "command:finalize",
    async (payload: { id: CommandID; command: Command }, ack?: AckWithSeq) => {
      const { id: commandId, command } = payload;

      if (!roomId) {
        reject(socket, commandId, "User not in a room", ack);
        return;
      }

      if (!canDraw) {
        reject(socket, commandId, "User does not have permission to draw", ack);
        return;
      }

      if (command.owner !== userId) {
        reject(socket, commandId, "User does not own the command", ack);
        return;
      }

      const finalized = await applyFinalize(roomId, command);
      socket.to(roomId).emit("command:finalize", commandId, finalized);
      ack?.(undefined, { seq: finalized.seq! });
    },
  );

  socket.on("command:cancel", async (payload: { id: CommandID }, ack?: Ack) => {
    const { id: commandId } = payload;

    if (!roomId) {
      reject(socket, commandId, "User not in a room", ack);
      return;
    }

    if (!canDraw) {
      reject(socket, commandId, "User does not have permission to draw", ack);
      return;
    }

    socket.to(roomId).emit("command:cancel", commandId);
    ack?.();
  });

  socket.on(
    "command:undo",
    async (payload: { id: CommandID }, ack?: AckWithSeq) => {
      const { id: commandId } = payload;

      if (!roomId) {
        reject(socket, commandId, "User not in a room", ack);
        return;
      }

      if (!canDraw) {
        reject(socket, commandId, "User does not have permission to draw", ack);
        return;
      }

      const command = await getCommandById(roomId, commandId);
      if (!command) {
        reject(socket, commandId, "Command not found", ack);
        return;
      }

      if (command.owner !== userId) {
        reject(socket, commandId, "User does not own the command", ack);
        return;
      }

      if (command.status !== "applied") {
        reject(socket, commandId, "Command is not applied", ack);
        return;
      }

      const undone = await applyUndo(roomId, command);
      socket.to(roomId).emit("command:undo", commandId, undone);
      ack?.(undefined, { seq: undone.seq! });
    },
  );

  socket.on(
    "command:redo",
    async (payload: { id: CommandID }, ack?: AckWithSeq) => {
      const { id: commandId } = payload;

      if (!roomId) {
        reject(socket, commandId, "User not in a room", ack);
        return;
      }

      if (!canDraw) {
        reject(socket, commandId, "User does not have permission to draw", ack);
        return;
      }

      const command = await getCommandById(roomId, commandId);

      if (!command) {
        reject(socket, commandId, "Command not found", ack);
        return;
      }

      if (command.owner !== userId) {
        reject(socket, commandId, "User does not own the command", ack);
        return;
      }

      if (command.status !== "reverted") {
        reject(socket, commandId, "Command is not reverted", ack);
        return;
      }

      const redone = await applyRedo(roomId, command);
      socket.to(roomId).emit("command:redo", commandId, redone);
      ack?.(undefined, { seq: redone.seq! });
    },
  );
}

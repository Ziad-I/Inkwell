import type { Point, SocketData } from "@/types/types.js";
import type { Server, Socket } from "socket.io";
import { requirePermission } from "@/socket/authorization.js";
import logger from "@/config/logger.js";

export function registerPresenceHandlers(socket: Socket, io: Server) {
  socket.on("presence:move", (payload: { pos: Point }) => {
    const { userId, roomId } = socket.data as SocketData;
    try {
      if (!roomId) return;
      if (!requirePermission(socket, "read")) return;
      const { pos } = payload;
      socket.to(roomId).emit("presence:move", userId, pos);
    } catch (err) {
      logger.error(`[presence:move] error:`, err);
    }
  });

  // "disconnecting" (not "disconnect"): by the time "disconnect" fires,
  // Socket.IO has already removed the socket from all rooms, so the final
  // membership sweep must happen here while socket.rooms is still populated.
  socket.on("disconnecting", () => {
    const { userId } = socket.data as SocketData;
    try {
      for (const room of socket.rooms) {
        if (room === socket.id) continue;
        socket.to(room).emit("presence:leave", userId);
      }
    } catch (err) {
      logger.error(`[presence:disconnect] error:`, err);
    }
  });
}

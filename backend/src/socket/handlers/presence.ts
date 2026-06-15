import type { Point, SocketData } from "@/types/types.js";
import type { Server, Socket } from "socket.io";
import logger from "@/config/logger.js";

export function registerPresenceHandlers(socket: Socket, io: Server) {
  socket.on("presence:move", (payload: { pos: Point }) => {
    const { userId, roomId } = socket.data as SocketData;
    try {
      if (!roomId) return;
      const { pos } = payload;
      socket.to(roomId).emit("presence:move", userId, pos);
    } catch (err) {
      logger.error(`[presence:move] error:`, err);
    }
  });

  socket.on("disconnect", () => {
    const { userId, roomId } = socket.data as SocketData;
    try {
      if (!roomId) return;
      socket.to(roomId).emit("presence:leave", userId);
    } catch (err) {
      logger.error(`[presence:disconnect] error:`, err);
    }
  });
}

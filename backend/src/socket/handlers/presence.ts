import type { Point, SocketData } from "@/types/types.js";
import type { Server, Socket } from "socket.io";

export function registerPresenceHandlers(socket: Socket, io: Server) {
  const { userId, roomId } = socket.data as SocketData;

  socket.on("presence:move", (payload: { pos: Point }) => {
    if (!roomId) return;
    const { pos } = payload;
    socket.to(roomId).emit("presence:move", userId, pos);
  });

  socket.on("disconnect", async () => {
    if (!roomId) return;
    socket.to(roomId).emit("presence:leave", userId);
  });
}

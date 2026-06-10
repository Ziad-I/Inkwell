import type { SocketData } from "@/types/types.js";
import type { Server, Socket } from "socket.io";

export function registerAuthMiddleware(io: Server) {
  io.use((socket: Socket, next) => {
    const { userId, userColor, userName } = socket.handshake.auth;

    const socketData: SocketData = {
      userId,
      meta: {
        userColor: userColor || "#000000",
        userName: userName || "Anonymous",
      },
    };

    (socket.data as SocketData) = socketData;
    next();
  });
}

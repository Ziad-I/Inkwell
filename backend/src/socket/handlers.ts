import { type Server as SocketServer, Socket } from "socket.io";
import { registerAuthMiddleware } from "@/socket/handlers/auth.js";
import { registerRoomHandlers } from "@/socket/handlers/room.js";
import { registerPresenceHandlers } from "@/socket/handlers/presence.js";
import { registerCommandHandlers } from "@/socket/handlers/command.js";
import { registerRoomCleanup } from "./handlers/cleanup.js";

export function registerSocketHandlers(io: SocketServer) {
  registerAuthMiddleware(io);
  registerRoomCleanup(io);

  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    registerRoomHandlers(socket, io);
    registerPresenceHandlers(socket, io);
    registerCommandHandlers(socket, io);

    // log incoming messages for debugging
    // socket.onAny((event, ...args) => {
    //   if (event.startsWith("presence:")) return; // Ignore presence events to reduce log noise
    //   console.log(`Received event: ${event} with args:`, args);
    // });
  });
}

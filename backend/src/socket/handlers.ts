import { type Server as SocketServer, Socket } from "socket.io";

export function registerSocketHandlers(io: SocketServer) {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    //TODO: do auth
    next();
  });

  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

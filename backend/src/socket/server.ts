import { env } from "@/config/config.js";
import type { Express } from "express";
import { type Server as HttpServer, createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redisPubClient, redisSubClient } from "@/redis/client.js";
import { registerSocketHandlers } from "./handlers/room.js";

export function createSocketServer(app: Express) {
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    cors: {
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    adapter: createAdapter(redisPubClient, redisSubClient),
  });

  registerSocketHandlers(io);

  return { io, httpServer };
}

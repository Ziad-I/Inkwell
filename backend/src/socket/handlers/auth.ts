import { randomUUID } from "node:crypto";
import { verifyAccessToken } from "@/services/auth.js";
import { getUserById } from "@/services/users.js";
import type { SocketData } from "@/types/types.js";
import type { Server, Socket } from "socket.io";

export function registerAuthMiddleware(io: Server) {
  io.use(async (socket: Socket, next) => {
    const { userId, token, userColor, userName } = socket.handshake.auth ?? {};

    let effectiveUserId =
      typeof userId === "string" && userId ? userId : randomUUID();
    let principalType: "user" | "guest" = "guest";

    if (typeof token === "string" && token) {
      try {
        const accountUserId = verifyAccessToken(token);
        const user = await getUserById(accountUserId);
        if (user) {
          effectiveUserId = user.id;
          principalType = "user";
        }
      } catch {
        // Invalid or expired token: fall back to the anonymous identity.
      }
    }

    const socketData: SocketData = {
      userId: effectiveUserId,
      principalType,
      meta: {
        userColor: typeof userColor === "string" ? userColor : "#000000",
        userName: typeof userName === "string" ? userName : "Anonymous",
      },
    };

    (socket.data as SocketData) = socketData;
    next();
  });
}
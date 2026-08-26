import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { isRedisRoomAlive, port } from "./setup.js";

export const CLIENT_ORIGIN = "http://localhost:5173";

export function connectClient(
  auth?: Record<string, unknown>,
  cookie?: string,
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      auth: auth ?? { userId: "test-user" },
      extraHeaders: {
        Origin: CLIENT_ORIGIN,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("connection timeout")), 3000);
  });
}

export function roomJoin(
  socket: ClientSocket,
  roomId: string,
): Promise<{ err: unknown; data: unknown }> {
  return new Promise((resolve, reject) => {
    socket.emit("room:join", { roomId }, (err: unknown, data: unknown) => {
      resolve({ err, data });
    });
    setTimeout(() => reject(new Error("ack timeout")), 3000);
  });
}

export function roomLeave(socket: ClientSocket, roomId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit("room:leave", { roomId }, (err: unknown) => {
      if (err) reject(new Error(String(err)));
      else resolve();
    });
    setTimeout(() => reject(new Error("ack timeout")), 3000);
  });
}

export async function waitForRoomTeardown(roomId: string, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isRedisRoomAlive(roomId))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`room ${roomId} still alive after ${timeoutMs}ms`);
}

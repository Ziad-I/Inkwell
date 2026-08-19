import type { Socket } from "socket.io";
import type { BoardPermission, SocketData } from "@/types/types.js";

export function requirePermission(
  socket: Socket,
  permission: BoardPermission,
): boolean {
  const { boardAccess } = socket.data as SocketData;
  return (
    boardAccess !== undefined && boardAccess.permissions[permission] === true
  );
}
import { getBoardById } from "@/services/board.js";
import {
  isRoomInitialized,
  initBoardState,
  getCommandsInBuffer,
  getBoardStateArr,
  clearBoardState,
} from "@/services/state.js";
import type { Ack, DrawPermission, SocketData } from "@/types/types.js";
import type { Command } from "@/types/types.js";
import type { Server, Socket } from "socket.io";
import { writeBoardSnapshot } from "@/services/snapshot.js";

export function resolveCanDraw(
  drawPermission: string,
  // ownerId: string,
  // userId: string,
): boolean {
  return true; //TODO: implement draw permissions
  // if (drawPermission === "anyone") return true;
  // if (drawPermission === "owner") return userId === ownerId;
  // return false;
}

export function registerRoomHandlers(socket: Socket, io: Server) {
  socket.on(
    "room:join",
    async (payload: { roomId: string; lastSeq?: number }, ack?: Ack) => {
      const { roomId } = payload;

      const board = await getBoardById(roomId);
      if (!board) {
        ack?.("Room not found");
        return;
      }

      if (!(await isRoomInitialized(roomId))) {
        const snapshot = {}; //TODO: fetch snapshot from DB
        await initBoardState(roomId, snapshot);
      }

      socket.join(roomId);

      const canDraw = resolveCanDraw(board.drawPermission as DrawPermission);

      (socket.data as SocketData).roomId = roomId;
      (socket.data as SocketData).canDraw = canDraw;

      const socketData = socket.data as SocketData;
      if (canDraw) {
        socket
          .to(roomId)
          .emit("presence:join", socketData.userId, socketData.meta);
      }

      const existing = await io.in(roomId).fetchSockets();
      for (const peer of existing) {
        if (peer.id !== socket.id) {
          const peerData = peer.data as SocketData;
          socket.emit("presence:join", peerData.userId, peerData.meta);
        }
      }

      let syncState: Command[] = [];

      if (payload.lastSeq !== undefined) {
        const missed = await getCommandsInBuffer(roomId, payload.lastSeq);
        if (missed) {
          syncState = missed;
        } else {
          syncState = await getBoardStateArr(roomId);
        }
      } else {
        syncState = await getBoardStateArr(roomId);
      }

      socket.emit("room:sync", syncState);
      ack?.();
    },
  );

  socket.on("disconnect", async () => {
    const { roomId } = socket.data as SocketData;
    if (!roomId) return;
    const remaining = await io.in(roomId).fetchSockets();

    if (remaining.length === 0) {
      await writeBoardSnapshot(roomId);
      await clearBoardState(roomId);
    }
  });
}

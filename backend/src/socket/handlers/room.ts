import { getBoardById } from "@/services/board.js";
import {
  isRoomInitialized,
  initBoardState,
  getCommandsInBuffer,
  getBoardStateArr,
} from "@/services/state.js";
import type { Ack, DrawPermission, SocketData } from "@/types/types.js";
import type { Command } from "@/types/types.js";
import type { Server, Socket } from "socket.io";
import { getLatestSnapshot } from "@/services/snapshot.js";
import logger from "@/config/logger.js";

export function resolveCanDraw(
  drawPermission: string,
  ownerId: string,
  userId: string,
): boolean {
  if (drawPermission === "anyone") return true;
  if (drawPermission === "owner") return userId === ownerId;
  return false;
}

type AckWithDrawPerm = Ack<{ canDraw: boolean }>;

export function registerRoomHandlers(socket: Socket, io: Server) {
  socket.on(
    "room:join",
    async (
      payload: { roomId: string; lastSeq?: number },
      ack?: AckWithDrawPerm,
    ) => {
      try {
        const { roomId } = payload;

        const board = await getBoardById(roomId);
        if (!board) {
          ack?.("Room not found");
          return;
        }

        if (!(await isRoomInitialized(roomId))) {
          const snapshot = (await getLatestSnapshot(roomId)) ?? {};
          await initBoardState(roomId, snapshot);
        }

        socket.join(roomId);

        const userId = (socket.data as SocketData).userId;

        const canDraw = resolveCanDraw(
          board.drawPermission as DrawPermission,
          board.ownerId,
          userId,
        );

        (socket.data as SocketData).roomId = roomId;
        (socket.data as SocketData).canDraw = canDraw;

        const socketData = socket.data as SocketData;
        if (canDraw) {
          socket
            .to(roomId)
            .emit("presence:join", socketData.userId, socketData.meta);
        }

        ack?.(undefined, { canDraw });

        const existing = await io.in(roomId).fetchSockets();
        for (const peer of existing) {
          if (peer.id !== socket.id) {
            const peerData = peer.data as SocketData;
            if (!peerData.canDraw) continue;

            socket.emit("presence:join", peerData.userId, peerData.meta);
          }
        }

        let syncState: Command[] = [];

        if (payload.lastSeq !== undefined) {
          const missed = await getCommandsInBuffer(roomId, payload.lastSeq);
          if (missed && missed.length > 0) {
            syncState = missed;
          } else {
            syncState = await getBoardStateArr(roomId);
          }
        } else {
          syncState = await getBoardStateArr(roomId);
        }

        socket.emit("room:sync", syncState);
      } catch (err) {
        logger.error(`[room:join] error:`, err);
        ack?.("Internal server error");
      }
    },
  );

  socket.on("disconnect", () => {
    //   const { roomId } = socket.data as SocketData;
    //   if (!roomId) return;
    //   // Debounce: wait for concurrent disconnects to settle before checking
    //   setTimeout(() => {
    //     void (async () => {
    //       try {
    //         const remaining = await io.in(roomId).fetchSockets();
    //         if (remaining.length === 0) {
    //           await writeBoardSnapshot(roomId);
    //           await clearBoardState(roomId);
    //         }
    //       } catch (err) {
    //         logger.error(
    //           `[room:disconnect] cleanup error for room ${roomId}:`,
    //           err,
    //         );
    //       }
    //     })();
    //   }, 1500);
    // });
  });
}

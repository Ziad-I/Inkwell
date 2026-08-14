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
        const { roomId, lastSeq } = payload;
        const socketData = socket.data as SocketData;
        const userId = socketData.userId;

        // ─────────────────────────────────────────────────────────────
        // 1. Determine whether this is a persistent or ephemeral board
        // ─────────────────────────────────────────────────────────────

        const board = await getBoardById(roomId);

        let canDraw: boolean;

        if (board) {
          // Persistent board
          //
          // The DB row is the source of truth for the board's existence.
          // Initialize Redis state from the latest snapshot when necessary.
          if (!(await isRoomInitialized(roomId))) {
            const snapshot = (await getLatestSnapshot(roomId)) ?? {};

            await initBoardState(roomId, snapshot);
          }

          canDraw = resolveCanDraw(
            board.drawPermission as DrawPermission,
            board.ownerId,
            userId,
          );
        } else {
          // Ephemeral board
          //
          // There is no DB row, so Redis state is the source of truth.
          // If Redis state is gone, the ephemeral board no longer exists.
          if (!(await isRoomInitialized(roomId))) {
            ack?.("BOARD_NOT_FOUND");
            return;
          }

          canDraw = true;
        }

        await socket.join(roomId);

        socketData.roomId = roomId;
        socketData.canDraw = canDraw;

        if (canDraw) {
          socket
            .to(roomId)
            .emit("presence:join", socketData.userId, socketData.meta);
        }

        const existingSockets = await io.in(roomId).fetchSockets();

        for (const peer of existingSockets) {
          if (peer.id === socket.id) {
            continue;
          }

          const peerData = peer.data as SocketData;

          if (!peerData.canDraw) {
            continue;
          }

          socket.emit("presence:join", peerData.userId, peerData.meta);
        }

        let syncState: Command[];

        if (lastSeq !== undefined) {
          const missedCommands = await getCommandsInBuffer(roomId, lastSeq);

          if (missedCommands !== null) {
            syncState = missedCommands;
          } else {
            syncState = await getBoardStateArr(roomId);
          }
        } else {
          syncState = await getBoardStateArr(roomId);
        }

        ack?.(undefined, { canDraw });

        socket.emit("room:sync", syncState);
      } catch (err) {
        logger.error(`[room:join] error:`, err);
        ack?.("INTERNAL_SERVER_ERROR");
      }
    },
  );
}

import { getBoardById } from "@/services/board.js";
import {
  isRoomInitialized,
  initBoardState,
  getCommandsInBuffer,
  getBoardStateArr,
} from "@/services/state.js";
import { authorizeBoardAccess } from "@/services/boardAccess.js";
import {
  getBoardAccessCookieName,
  parseCookiesHeader,
} from "@/utils/cookies.js";
import type {
  Ack,
  SocketData,
  BoardRole,
  BoardPermission,
} from "@/types/types.js";
import type { Command } from "@/types/types.js";
import type { Server, Socket } from "socket.io";
import { getLatestSnapshot } from "@/services/snapshot.js";
import { roomJoinSchema } from "@/socket/validation.js";
import logger from "@/config/logger.js";

type AckWithAccess = Ack<{
  role: BoardRole;
  permissions: Record<BoardPermission, boolean>;
}>;

export function registerRoomHandlers(socket: Socket, io: Server) {
  socket.on(
    "room:join",
    async (
      payload: { roomId: string; lastSeq?: number },
      ack?: AckWithAccess,
    ) => {
      try {
        const parsedJoin = roomJoinSchema.safeParse(payload);
        if (!parsedJoin.success) {
          ack?.("INVALID_ROOM_ID");
          return;
        }
        const { roomId, lastSeq } = parsedJoin.data;
        const socketData = socket.data as SocketData;
        const userId = socketData.userId;

        // ─────────────────────────────────────────────────────────────
        // 1. Determine whether this is a persistent or ephemeral board
        // ─────────────────────────────────────────────────────────────

        const board = await getBoardById(roomId);

        if (!board) {
          // Ephemeral board: Redis state is the source of truth.
          // If Redis state is gone, the ephemeral board no longer exists.
          if (!(await isRoomInitialized(roomId))) {
            ack?.("BOARD_NOT_FOUND");
            return;
          }
        } else if (!(await isRoomInitialized(roomId))) {
          // Persistent board: initialize Redis state from the latest
          // snapshot when necessary.
          const snapshot = (await getLatestSnapshot(roomId)) ?? {};
          await initBoardState(roomId, snapshot);
        }

        // ─────────────────────────────────────────────────────────────
        // 2. Resolve board access from the board-specific cookie.
        //    The role is always derived server-side — never trusted
        //    from the client.
        // ─────────────────────────────────────────────────────────────

        const cookies = parseCookiesHeader(socket.handshake.headers.cookie);
        const boardAccess = await authorizeBoardAccess({
          boardId: roomId,
          board,
          principal: { type: socketData.principalType, id: userId },
          inviteToken: cookies[getBoardAccessCookieName(roomId)] ?? null,
        });

        // ─────────────────────────────────────────────────────────────
        // 3. Join the room and record access
        // ─────────────────────────────────────────────────────────────

        await socket.join(roomId);

        socketData.roomId = roomId;
        socketData.boardAccess = boardAccess;

        // ─────────────────────────────────────────────────────────────
        // 4. Presence — every member has read access, so everyone is
        //    visible to everyone else.
        // ─────────────────────────────────────────────────────────────

        socket
          .to(roomId)
          .emit("presence:join", socketData.userId, socketData.meta);

        const existingSockets = await io.in(roomId).fetchSockets();

        for (const peer of existingSockets) {
          if (peer.id === socket.id) {
            continue;
          }
          const peerData = peer.data as SocketData;
          socket.emit("presence:join", peerData.userId, peerData.meta);
        }

        // ─────────────────────────────────────────────────────────────
        // 5. Sync
        // ─────────────────────────────────────────────────────────────

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

        ack?.(undefined, {
          role: boardAccess.role,
          permissions: boardAccess.permissions,
        });

        socket.emit("room:sync", syncState);
      } catch (err) {
        logger.error(`[room:join] error:`, err);
        ack?.("INTERNAL_SERVER_ERROR");
      }
    },
  );
}

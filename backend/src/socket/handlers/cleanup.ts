import { type Server } from "socket.io";
import logger from "@/config/logger.js";
import { clearBoardState } from "@/services/state.js";
import { writeBoardSnapshot } from "@/services/snapshot.js";
import { getBoardById } from "@/services/board.js";

export function registerRoomCleanup(io: Server) {
  const BOARD_ID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  io.of("/").adapter.on("delete-room", async (roomId: string) => {
    if (!BOARD_ID_REGEX.test(roomId)) return;

    try {
      // Ephemeral (anonymous-created) rooms have no board row — their state is
      // never snapshotted, so skip the write and only clear Redis.
      const board = await getBoardById(roomId);
      if (board) {
        logger.info(`[room:cleanup] Last user left ${roomId}, persisting state`);
        await writeBoardSnapshot(roomId);
      }
      await clearBoardState(roomId);
    } catch (err) {
      logger.error(`[room:cleanup] error for room ${roomId}:`, err);
    }
  });
}

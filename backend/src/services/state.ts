import { redisStateClient } from "@/redis/client.js";
import type { Command, CommandID, BoardState } from "@/types/types.js";

// ─── Redis key schema ─────────────────────────────────────────────────────────
//
//  board:{roomId}:state   Hash   commandId → JSON(Command)
//  board:{roomId}:seq     String monotonic integer counter
//  board:{roomId}:buffer  ZSet   score=seq, member=JSON(Command)
//  dirty:rooms            Set    roomIds that need a snapshot write

const BUFFER_SIZE_LIMIT = 100;

const keys = {
  state: (roomId: string) => `board:${roomId}:state`,
  seq: (roomId: string) => `board:${roomId}:seq`,
  buffer: (roomId: string) => `board:${roomId}:buffer`,
  dirty: `dirty:rooms`,
};

export async function initBoardState(roomId: string, initialState: BoardState) {
  const maxSeq = Object.values(initialState).reduce(
    (m, c) => Math.max(m, c.seq ?? 0),
    0,
  );

  const pipeline = redisStateClient.multi();

  pipeline.del(keys.state(roomId), keys.seq(roomId), keys.buffer(roomId));

  for (const [commandId, command] of Object.entries(initialState)) {
    pipeline.hset(keys.state(roomId), commandId, JSON.stringify(command));
  }

  pipeline.set(keys.seq(roomId), maxSeq);

  await pipeline.exec();
}

export async function isRoomInitialized(roomId: string) {
  const exists = await redisStateClient.exists(keys.seq(roomId));
  return exists === 1;
}

export async function getBoardState(roomId: string): Promise<BoardState> {
  const entries = await redisStateClient.hgetall(keys.state(roomId));
  const state: BoardState = {};

  if (!entries) {
    return state;
  }

  for (const [commandId, command] of Object.entries(entries)) {
    state[commandId] = JSON.parse(command);
  }
  return state;
}

export async function getBoardStateArr(roomId: string): Promise<Command[]> {
  const state = await getBoardState(roomId);
  return state ? Object.values(state) : [];
}

export async function clearBoardState(roomId: string) {
  const pipeline = redisStateClient.multi();
  pipeline.del(keys.state(roomId), keys.seq(roomId), keys.buffer(roomId));
  pipeline.srem(keys.dirty, roomId);
  await pipeline.exec();
}

export async function markRoomClean(roomId: string) {
  await redisStateClient.srem(keys.dirty, roomId);
}

export async function getSequence(roomId: string) {
  const val = (await redisStateClient.get(keys.seq(roomId))) || "0";
  return parseInt(val, 10);
}

export async function nextSequence(roomId: string) {
  return await redisStateClient.incr(keys.seq(roomId));
}

export async function pushToBuffer(roomId: string, command: Command) {
  const pipeline = redisStateClient.multi();
  pipeline.hset(keys.state(roomId), command.id, JSON.stringify(command));
  pipeline.zadd(keys.buffer(roomId), command.seq!, JSON.stringify(command));
  pipeline.zremrangebyrank(keys.buffer(roomId), 0, -(BUFFER_SIZE_LIMIT + 1));
  pipeline.sadd(keys.dirty, roomId);
  await pipeline.exec();
}

export async function getCommandsInBuffer(roomId: string, afterSeq: number) {
  const [oldestRaw, commands] = await Promise.all([
    redisStateClient.zrange(keys.buffer(roomId), 0, 0, "WITHSCORES"),
    redisStateClient.zrangebyscore(keys.buffer(roomId), afterSeq + 1, "+inf"),
  ]);

  // oldestRaw is [member, score] when WITHSCORES is used
  const oldestSeq = oldestRaw[1] ? parseInt(oldestRaw[1], 10) : null;
  const clientIsBehindBuffer = oldestSeq !== null && afterSeq < oldestSeq - 1;

  if (clientIsBehindBuffer) {
    // Signal to caller: buffer gap detected, fall back to full state
    return null;
  }

  return commands.map((m) => JSON.parse(m) as Command);
}

export async function getCommandById(roomId: string, commandId: CommandID) {
  const commandStr = await redisStateClient.hget(keys.state(roomId), commandId);
  if (!commandStr) {
    return null;
  }
  return JSON.parse(commandStr);
}

export async function applyFinalize(roomId: string, command: Command) {
  const seq = await nextSequence(roomId);
  const finalizedCommand: Command = { ...command, status: "applied", seq };
  await pushToBuffer(roomId, finalizedCommand);
  return finalizedCommand;
}

export async function applyUndo(roomId: string, command: Command) {
  const seq = await nextSequence(roomId);
  const undoneCommand: Command = { ...command, status: "reverted", seq };
  await pushToBuffer(roomId, undoneCommand);
  return undoneCommand;
}

export async function applyRedo(roomId: string, command: Command) {
  const seq = await nextSequence(roomId);
  const redoneCommand: Command = { ...command, status: "applied", seq };
  await pushToBuffer(roomId, redoneCommand);
  return redoneCommand;
}

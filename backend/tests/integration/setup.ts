import { beforeAll, afterAll } from "vitest";
import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { Server as SocketServer } from "socket.io";
import {
  boards,
  boardInvites,
  refreshTokens,
  snapshots,
  users,
} from "@/db/schema.js";
import { eq, desc } from "drizzle-orm";

export let httpServer: HttpServer;
export let io: SocketServer;
export let port: number;

let _db: Awaited<typeof import("@/db/index.js")>["db"];
let _redisStateClient: Awaited<
  typeof import("@/redis/client.js")
>["redisStateClient"];

export async function seedUser(): Promise<string> {
  const suffix = randomUUID();
  const result = await _db
    .insert(users)
    .values({
      username: `user_${suffix}`,
      email: `${suffix}@test.local`,
      passwordHash: "not-used-in-tests",
    })
    .returning();
  return result[0]!.id;
}

export async function seedRefreshToken(
  userId: string,
  overrides?: {
    token?: string;
    expiresAt?: Date;
    revokedAt?: Date | null;
  },
): Promise<string> {
  const { hashToken, generateOpaqueToken } =
    await import("@/services/auth.js");
  const token = overrides?.token ?? generateOpaqueToken();

  await _db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60_000),
    revokedAt: overrides?.revokedAt ?? null,
  });

  return token;
}

export async function seedBoard(overrides?: {
  title?: string;
  ownerId?: string;
  defaultRole?: "editor" | "viewer";
}): Promise<string> {
  const ownerId = overrides?.ownerId ?? (await seedUser());
  const result = await _db
    .insert(boards)
    .values({
      title: overrides?.title ?? "Test Board",
      ownerId,
      defaultRole: overrides?.defaultRole ?? "editor",
    })
    .returning();
  return result[0]!.id;
}

export async function seedInvite(overrides: {
  boardId: string;
  createdBy?: string;
  role?: "editor" | "viewer";
  expiresAt?: Date;
  maxUses?: number | null;
  revokedAt?: Date | null;
}): Promise<{ id: string; rawToken: string }> {
  const { randomBytes } = await import("node:crypto");
  const { hashToken } = await import("@/services/auth.js");
  const rawToken = randomBytes(32).toString("base64url");
  const createdBy = overrides.createdBy ?? (await seedUser());

  const rows = await _db
    .insert(boardInvites)
    .values({
      boardId: overrides.boardId,
      createdBy,
      role: overrides.role ?? "editor",
      tokenHash: hashToken(rawToken),
      expiresAt: overrides.expiresAt ?? null,
      maxUses: overrides.maxUses ?? null,
      revokedAt: overrides.revokedAt ?? null,
    })
    .returning();

  return { id: rows[0]!.id, rawToken };
}

export async function getInviteByRawToken(rawToken: string) {
  const { hashToken } = await import("@/services/auth.js");
  const rows = await _db
    .select()
    .from(boardInvites)
    .where(eq(boardInvites.tokenHash, hashToken(rawToken)));
  return rows[0] ?? null;
}

export async function cleanupTestData(boardId: string) {
  // Clear Redis state first so writeBoardSnapshot finds nothing to persist
  await _redisStateClient.del(`board:${boardId}:state`);
  await _redisStateClient.del(`board:${boardId}:seq`);
  await _redisStateClient.del(`board:${boardId}:buffer`);
  await _redisStateClient.srem("dirty:rooms", boardId);

  // Then delete DB records (board must exist when snapshot cleanup fires)
  await _db.delete(boardInvites).where(eq(boardInvites.boardId, boardId));
  await _db.delete(snapshots).where(eq(snapshots.boardId, boardId));
  await _db.delete(boards).where(eq(boards.id, boardId));
}

export async function getBoardRow(roomId: string) {
  const rows = await _db.select().from(boards).where(eq(boards.id, roomId));
  return rows[0] ?? null;
}

export async function countSnapshots(roomId: string): Promise<number> {
  const rows = await _db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(eq(snapshots.boardId, roomId));
  return rows.length;
}

export async function getLatestSnapshotState(roomId: string) {
  const rows = await _db
    .select()
    .from(snapshots)
    .where(eq(snapshots.boardId, roomId))
    .orderBy(desc(snapshots.createdAt))
    .limit(1);
  return rows[0]?.state ?? null;
}

export async function isRedisRoomAlive(roomId: string): Promise<boolean> {
  const exists = await _redisStateClient.exists(`board:${roomId}:seq`);
  return exists === 1;
}

beforeAll(async () => {
  // Containers already running, env vars already set by global-setup
  // Dynamic imports ensure modules pick up the correct connection strings
  const dbModule = await import("@/db/index.js");
  await dbModule.connectDB();
  _db = dbModule.db;

  const redisModule = await import("@/redis/client.js");
  await redisModule.connectRedis();
  _redisStateClient = redisModule.redisStateClient;

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(_db, { migrationsFolder: "./drizzle" });

  const { app } = await import("@/app.js");
  const { createSocketServer } = await import("@/socket/server.js");

  ({ io, httpServer } = createSocketServer(app));

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (addr && typeof addr === "object") port = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  // Disconnect Socket.IO before HTTP server — order matters
  if (io) await new Promise<void>((resolve) => io.close(() => resolve()));
  if (httpServer)
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

  // Disconnect clients before containers stop (globalSetup teardown)
  try {
    const redisModule = await import("@/redis/client.js");
    await redisModule.disconnectRedis();
  } catch {
    /* already disconnected */
  }

  try {
    const dbModule = await import("@/db/index.js");
    await dbModule.disconnectDB();
  } catch {
    /* already disconnected */
  }

  // Containers are stopped by globalSetup teardown — not here
});

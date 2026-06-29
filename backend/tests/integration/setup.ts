import { beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { boards, snapshots } from "@/db/schema.js";
import { eq } from "drizzle-orm";

export let httpServer: HttpServer;
export let io: SocketServer;
export let port: number;

let _db: Awaited<typeof import("@/db/index.js")>["db"];
let _redisStateClient: Awaited<
  typeof import("@/redis/client.js")
>["redisStateClient"];

export async function seedBoard(overrides?: {
  title?: string;
  ownerId?: string;
  drawPermission?: "owner" | "anyone";
}): Promise<string> {
  const result = await _db
    .insert(boards)
    .values({
      title: overrides?.title ?? "Test Board",
      ownerId: overrides?.ownerId ?? "test-owner",
      drawPermission: overrides?.drawPermission ?? "anyone",
    })
    .returning();
  return result[0]!.id;
}

export async function cleanupTestData(boardId: string) {
  // Clear Redis state first so writeBoardSnapshot finds nothing to persist
  await _redisStateClient.del(`board:${boardId}:state`);
  await _redisStateClient.del(`board:${boardId}:seq`);
  await _redisStateClient.del(`board:${boardId}:buffer`);
  await _redisStateClient.srem("dirty:rooms", boardId);

  // Then delete DB records (board must exist when snapshot cleanup fires)
  await _db.delete(snapshots).where(eq(snapshots.boardId, boardId));
  await _db.delete(boards).where(eq(boards.id, boardId));
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
  const { registerSocketHandlers } = await import("@/socket/handlers.js");

  const httpSrv = createServer(app);
  io = new SocketServer(httpSrv, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });
  registerSocketHandlers(io);
  httpServer = httpSrv;

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

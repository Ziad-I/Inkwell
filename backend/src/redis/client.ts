import { Redis } from "ioredis";
import { env } from "@/config/config.js";
import logger from "@/config/logger.js";

export const redisPubClient = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});
export const redisSubClient = redisPubClient.duplicate();

redisPubClient.on("error", (err) => {
  console.error("[redis:pub] Error:", err);
});

redisSubClient.on("error", (err) => {
  console.error("[redis:sub] Error:", err);
});

export async function connectRedis(): Promise<void> {
  await Promise.all([redisPubClient.connect(), redisSubClient.connect()]);

  await Promise.all([redisPubClient.ping(), redisSubClient.ping()]);

  logger.info("[redis] Connected to Redis server successfully.");
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all([redisPubClient.quit(), redisSubClient.quit()]);
}

import { Redis } from "ioredis";
import { env } from "@/config/config.js";
import logger from "@/config/logger.js";

export const redisPubClient = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});
export const redisSubClient = redisPubClient.duplicate();
export const redisStateClient = redisPubClient.duplicate();

redisPubClient.on("error", (err) => {
  logger.error("[redis:pub] Error:", err);
});

redisSubClient.on("error", (err) => {
  logger.error("[redis:sub] Error:", err);
});

redisStateClient.on("error", (err) => {
  logger.error("[redis:state] Error:", err);
});

export async function connectRedis(): Promise<void> {
  await Promise.all([
    redisPubClient.connect(),
    redisSubClient.connect(),
    redisStateClient.connect(),
  ]);

  await Promise.all([
    redisPubClient.ping(),
    redisSubClient.ping(),
    redisStateClient.ping(),
  ]);

  logger.info("[redis] Connected to Redis server successfully.");
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all([
    redisPubClient.quit(),
    redisSubClient.quit(),
    redisStateClient.quit(),
  ]);
}

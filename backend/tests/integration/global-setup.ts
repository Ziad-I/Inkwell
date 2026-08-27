import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.SNAPSHOT_RETENTION = "3";
process.env.API_RATE_LIMIT_MAX = "100000";
process.env.TESTCONTAINERS_HOST_OVERRIDE ??= "127.0.0.1";

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;

export async function setup() {
  [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine").start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUrl();
}

export async function teardown() {
  await Promise.all([pgContainer?.stop(), redisContainer?.stop()]);
}

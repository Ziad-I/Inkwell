import { z } from "zod";

process.loadEnvFile();

function preprocessNum(val: unknown): number | undefined {
  if (typeof val === "string" && val.trim() !== "") return Number(val);
  if (typeof val === "number") return val;
  return undefined;
}

const envSchema = z.object({
  APP_NAME: z.string().default("Backend"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "http", "debug", "silly"])
    .default("info"),
  PORT: z.preprocess(preprocessNum, z.number().int().positive().default(5000)),
  DATABASE_URL: z
    .string()
    .default("postgresql://username:password@localhost:5432/inkwell_db"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SNAPSHOT_INTERVAL: z.preprocess(
    preprocessNum,
    z.number().int().positive().default(60000),
  ),
  SNAPSHOT_RETENTION: z.preprocess(
    preprocessNum,
    z.number().int().positive().default(3),
  ),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("[server]: Invalid environment variables");
  console.error(result.error.format());
  process.exit(1);
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;

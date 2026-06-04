import { z } from "zod";

process.loadEnvFile();

const envSchema = z.object({
  APP_NAME: z.string().default("Backend"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "http", "debug", "silly"])
    .default("info"),
  PORT: z.preprocess((val) => {
    if (typeof val === "string" && val.trim() !== "") return Number(val);
    if (typeof val === "number") return val;
    return undefined;
  }, z.number().int().positive().default(5000)),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("[server]: Invalid environment variables");
  console.error(result.error.format());
  process.exit(1);
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;

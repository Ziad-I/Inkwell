import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/config/config.js";
import logger from "@/config/logger.js";
import * as schema from "@/db/schema.js";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});
export const db = drizzle({ client: pool, schema: schema });

export async function connectDB() {
  try {
    await db.execute(`SELECT 1`);
    logger.info("[db]: Database connected successfully.");
  } catch (error) {
    logger.error(`[db]: Failed to connect to the database - ${error}`);
    throw error;
  }
}

export async function disconnectDB() {
  try {
    await pool.end();
    logger.info("[db]: Database connection closed successfully.");
  } catch (error) {
    logger.error(`[db]: Failed to close the database connection - ${error}`);
  }
}

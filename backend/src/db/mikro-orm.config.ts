import { env } from "@/config/config.js";
import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";

export default defineConfig({
  clientUrl: env.DATABASE_URL,
  entities: ["./src/db/entities/*.js"],
  entitiesTs: ["./src/db/entities/*.ts"],
  extensions: [Migrator],
  migrations: {
    path: "./migrations",
    pathTs: "./migrations",
  },

  debug: env.NODE_ENV === "development",
});

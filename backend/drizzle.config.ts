import { defineConfig } from "drizzle-kit";

process.loadEnvFile();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://username:password@localhost:5432/inkwell",
  },
});

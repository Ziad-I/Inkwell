import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
}

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

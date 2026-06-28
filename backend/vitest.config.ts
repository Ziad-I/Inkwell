import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/types/**"],
    },

    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          setupFiles: ["./src/__tests__/setup.ts"],
          include: ["src/__tests__/**/*.test.ts"],
          exclude: [
            "src/__tests__/setup.ts",
            "src/__tests__/mocks/**",
            "src/__tests__/integration/**",
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          globals: true,
          environment: "node",
          pool: "forks",
          fileParallelism: false,
          globalSetup: "./src/__tests__/integration/global-setup.ts",
          setupFiles: ["./src/__tests__/integration/setup.ts"],
          include: ["src/__tests__/integration/**/*.test.ts"],
          exclude: ["src/__tests__/integration/setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});

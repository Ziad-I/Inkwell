import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["tests/**", "src/types/**"],
    },

    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/**/*.test.ts"],
          exclude: [
            "tests/setup.ts",
            "tests/mocks/**",
            "tests/integration/**",
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
          globalSetup: "./tests/integration/global-setup.ts",
          setupFiles: ["./tests/integration/setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
          exclude: ["tests/integration/setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});

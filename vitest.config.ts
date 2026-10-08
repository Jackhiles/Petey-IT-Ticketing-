import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    passWithNoTests: true,
    environment: "node",
    // Integration tests share one Postgres database and reset it, so files run one at a time.
    fileParallelism: false,
    env: {
      APP_SECRET: process.env.APP_SECRET ?? "test-secret-that-is-at-least-32-characters-long",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
    },
  },
});

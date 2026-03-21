import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: "./tests/globalSetup.ts",
    fileParallelism: false,
    testTimeout: 15000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/todos_test",
      JWT_SECRET: "test-jwt-secret",
      JWT_EXPIRES_IN: "15m",
      NODE_ENV: "test",
    },
  },
});

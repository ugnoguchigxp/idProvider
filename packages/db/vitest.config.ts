import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**", "src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 0, // Drizzle schema functions are hard to track
        branches: 90,
        statements: 90,
      },
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".vitest-cache",
  test: {
    exclude: ["dist/**", "work/**", "outputs/**", "**/node_modules/**"],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});

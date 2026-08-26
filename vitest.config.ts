import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    setupFiles: [require.resolve("allure-vitest/setup")],
    reporters: [
      "default",
      ["allure-vitest/reporter", { resultsDir: "./allure-results" }],
    ],
  },
});
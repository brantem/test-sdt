import { defineConfig, coverageConfigDefaults } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["./src/**/*.test.ts"],
    setupFiles: ["vitest.setup.ts"],
    coverage: {
      exclude: [...coverageConfigDefaults.exclude, "./src/index.ts", "./src/lib/db.ts"],
    },
  },
});

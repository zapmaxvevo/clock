import { defineConfig } from "vitest/config";

/**
 * Tests de integración contra un Postgres real y descartable. La base se migra
 * una vez antes de la tanda y cada test arranca con las tablas vacías. El
 * proceso corre en UTC, como Vercel y CI, salvo que `TZ` pida otra zona.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    env: { TZ: process.env.TZ ?? "UTC" },
    include: ["src/**/*.integration.test.ts", "scripts/**/*.integration.test.ts"],
    exclude: ["node_modules/**"],
    globals: false,
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Las tablas son compartidas: los archivos no corren en paralelo.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});

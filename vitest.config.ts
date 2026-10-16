import { defineConfig } from "vitest/config";

/**
 * Tests de unidad: funciones puras, sin base de datos. El proceso corre en UTC,
 * como Vercel y CI, salvo que `TZ` pida otra zona: así un resultado no depende
 * de la zona de la máquina, y `test:time-ar` puede correr en otra a propósito.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    env: { TZ: process.env.TZ ?? "UTC" },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "e2e/**", "node_modules/**"],
    globals: false,
  },
});

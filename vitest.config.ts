import { defineConfig } from "vitest/config";

/** Tests de unidad: funciones puras, sin base de datos. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/**/*.integration.test.ts", "e2e/**", "node_modules/**"],
    globals: false,
  },
});

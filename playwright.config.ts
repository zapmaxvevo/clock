import { defineConfig, devices } from "@playwright/test";

import {
  LOCAL_DATABASE_URL,
  OWNER_EMAIL,
  TEST_EMAIL_DOMAIN,
  TEST_SESSION_SECRET,
} from "./e2e/environment";

/**
 * Sin E2E_BASE_URL, que es como corren en CI, la suite compila, levanta y baja
 * un servidor local; Postgres tiene que estar sirviendo DATABASE_URL, ya
 * migrado. Con E2E_BASE_URL corre a mano contra un servidor ya levantado, por
 * ejemplo un preview de Vercel.
 */
const previewURL = process.env.E2E_BASE_URL;
const baseURL = previewURL ?? "http://localhost:3000";

/**
 * Entorno del servidor local. Son valores de desarrollo y cada uno se puede
 * sobreescribir desde afuera. El dominio del acceso y el del owner salen de
 * TEST_EMAIL_DOMAIN, que es el mismo que usan los emails de prueba.
 */
const localServerEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "desarrollo-local-secreto-de-32-caracteres-min",
  BETTER_AUTH_URL: baseURL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "x",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "x",
  GOOGLE_WORKSPACE_DOMAINS: TEST_EMAIL_DOMAIN,
  WORKSPACE_OWNER_EMAIL: OWNER_EMAIL,
  CRON_SECRET: process.env.CRON_SECRET ?? "desarrollo-local-cron-secret",
  // El endpoint de sesión de prueba es opt-in explícito: sin esta variable no
  // se registra y la suite con sesión responde 404.
  ALLOW_TEST_SESSION: "true",
  E2E_TEST_SESSION_SECRET: TEST_SESSION_SECRET,
  // La suite prueba el MCP encendido: sin la variable, `/api/mcp`, `/conectar`
  // y las rutas OAuth responden 404 y `e2e/mcp.spec.ts` no tiene contra qué correr.
  MCP_ENABLED: "true",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: process.env.CI === "true",
  retries: process.env.CI === "true" ? 2 : 0,
  reporter: process.env.CI === "true" ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /workspace\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /workspace\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer:
    previewURL === undefined
      ? {
          command: "npm run build && npm run start",
          url: baseURL,
          env: localServerEnv,
          reuseExistingServer: process.env.CI !== "true",
          timeout: 300_000,
        }
      : undefined,
});

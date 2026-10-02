import { defineConfig, devices } from "@playwright/test";

import { TEST_EMAIL_DOMAIN, TEST_SESSION_SECRET } from "./e2e/environment";

/**
 * Los e2e corren contra el preview de Vercel del pull request, que llega en
 * E2E_BASE_URL. Sin esa variable la suite levanta y baja un servidor local;
 * en ese caso Postgres tiene que estar sirviendo DATABASE_URL, ya migrado.
 */
const previewURL = process.env.E2E_BASE_URL;
const baseURL = previewURL ?? "http://localhost:3000";

/**
 * Entorno del servidor local. Son valores de desarrollo y cada uno se puede
 * sobreescribir desde afuera. El dominio del acceso y el del owner salen de
 * TEST_EMAIL_DOMAIN, que es el mismo que usan los emails de prueba.
 */
const localServerEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://clock:clock@localhost:5432/clock",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "desarrollo-local-secreto-de-32-caracteres-min",
  BETTER_AUTH_URL: baseURL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "x",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "x",
  GOOGLE_WORKSPACE_DOMAINS: TEST_EMAIL_DOMAIN,
  WORKSPACE_OWNER_EMAIL: `owner@${TEST_EMAIL_DOMAIN}`,
  CRON_SECRET: process.env.CRON_SECRET ?? "desarrollo-local-cron-secret",
  E2E_TEST_SESSION_SECRET: TEST_SESSION_SECRET,
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

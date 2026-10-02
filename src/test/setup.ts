import { beforeEach } from "vitest";

import { testDatabaseUrl } from "./database-url";

// El cliente de base lee DATABASE_URL al importarse: en los tests apunta a la
// base de pruebas antes de que cualquier módulo de servidor se cargue.
process.env.DATABASE_URL = testDatabaseUrl;
Object.assign(process.env, { NODE_ENV: "test" });
process.env.BETTER_AUTH_SECRET ??= "test-secret-de-al-menos-32-caracteres-xx";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID ??= "test";
process.env.GOOGLE_CLIENT_SECRET ??= "test";
process.env.GOOGLE_WORKSPACE_DOMAINS ??= "empresa.com";
process.env.WORKSPACE_OWNER_EMAIL ??= "owner@empresa.com";
process.env.CRON_SECRET ??= "test-cron-secret-largo";

const { truncateAll } = await import("./database");

beforeEach(async () => {
  await truncateAll();
});

import { vi } from "vitest";

/** Las variables que `env()` exige, con valores de prueba. */
const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://clock:clock@localhost:5432/clock",
  BETTER_AUTH_SECRET: "un-secreto-de-al-menos-treinta-y-dos-caracteres",
  BETTER_AUTH_URL: "https://clock.example",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secreto",
  GOOGLE_WORKSPACE_DOMAINS: "empresa.com",
  WORKSPACE_OWNER_EMAIL: "owner@empresa.com",
  CRON_SECRET: "un-secreto-de-cron-largo",
} as const;

/**
 * Un entorno completo para los tests de unidad que llaman a `env()`, con
 * `values` encima (`undefined` borra la variable). Se deshace con
 * `vi.unstubAllEnvs()`.
 */
export function stubServerEnv(
  values: Readonly<Record<string, string | undefined>> = {},
): void {
  for (const [name, value] of Object.entries({ ...REQUIRED_ENV, ...values })) {
    vi.stubEnv(name, value);
  }
}

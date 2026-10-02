import { randomUUID } from "node:crypto";

import { expect, test as base, type BrowserContext } from "@playwright/test";

import { TEST_EMAIL_DOMAIN, TEST_SESSION_SECRET } from "./environment";

/**
 * Entra sin pasar por el login de Google. El endpoint de sesión de prueba
 * solo se registra fuera de producción y exige el secreto en la cabecera. La
 * cookie queda en el contexto, así que todas las pestañas que se abran
 * después comparten la sesión.
 */
export async function signIn(context: BrowserContext, email: string): Promise<void> {
  const response = await context.request.post("/api/auth/test-session/sign-in", {
    headers: { "x-test-session": TEST_SESSION_SECRET },
    data: { email, name: "Persona de prueba" },
  });
  expect(response.status(), await response.text()).toBe(200);
}

function slugOf(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
}

type SessionFixtures = {
  /**
   * Email propio del test. La base es compartida entre los tests que corren en
   * paralelo, así que el aislamiento sale de acá: cada test tiene su usuario y
   * por lo tanto sus propias entradas.
   */
  readonly email: string;
};

/**
 * Variante de `test` que entra con un usuario nuevo antes de cada caso. El
 * segundo parámetro de cada fixture se llama `provide` y no `use` como en la
 * documentación de Playwright: con ese nombre la regla `rules-of-hooks` lo
 * confunde con el hook de React.
 */
export const test = base.extend<SessionFixtures>({
  email: async ({}, provide, testInfo) => {
    await provide(`e2e-${slugOf(testInfo.title)}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`);
  },
  page: async ({ page, email }, provide) => {
    await signIn(page.context(), email);
    await provide(page);
  },
});

export { expect, TEST_EMAIL_DOMAIN };

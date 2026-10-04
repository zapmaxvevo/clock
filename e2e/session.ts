import { randomUUID } from "node:crypto";

import { expect, test as base, type BrowserContext } from "@playwright/test";

import { TEST_EMAIL_DOMAIN, TEST_SESSION_SECRET } from "./environment";

/** Intentos de entrar antes de dar el 429 por definitivo. */
const SIGN_IN_ATTEMPTS = 5;

/**
 * Entra sin pasar por el login de Google. El endpoint de sesión de prueba
 * solo se registra fuera de producción y exige el secreto en la cabecera. La
 * cookie queda en el contexto, así que todas las pestañas que se abran
 * después comparten la sesión.
 *
 * Better Auth limita los pedidos por IP en un build de producción, y todos
 * los workers salen de la misma: con la suite entera en paralelo, algunos
 * inicios de sesión reciben 429. No es una regla de la app que el test
 * afirme, así que se espera lo que indica `X-Retry-After` y se reintenta.
 */
export async function signIn(context: BrowserContext, email: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await context.request.post("/api/auth/test-session/sign-in", {
      headers: { "x-test-session": TEST_SESSION_SECRET },
      data: { email, name: "Persona de prueba" },
    });
    if (response.status() !== 429 || attempt === SIGN_IN_ATTEMPTS) {
      expect(response.status(), await response.text()).toBe(200);
      return;
    }
    const seconds = Number(response.headers()["x-retry-after"] ?? "1");
    await new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 1) * 1000));
  }
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

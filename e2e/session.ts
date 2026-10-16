import { randomUUID } from "node:crypto";

import {
  expect,
  test as base,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { isCompanyEmail } from "@/lib/email";

import { inviteForSignIn } from "./database";
import { PERSON_NAME, TEST_EMAIL_DOMAIN, TEST_SESSION_SECRET } from "./environment";

/** Intentos de entrar antes de dar el 429 por definitivo. */
const SIGN_IN_ATTEMPTS = 5;

const SIGN_IN_PATH = "/api/auth/test-session/sign-in";

/**
 * Pide la sesión de prueba, sin pasar por el login de Google. El endpoint
 * solo se registra fuera de producción y exige el secreto en la cabecera.
 *
 * Better Auth limita los pedidos por IP en un build de producción, y todos
 * los workers salen de la misma: con la suite entera en paralelo, algunos
 * inicios de sesión reciben 429. No es una regla de la app que el test
 * afirme, así que se espera lo que indica `X-Retry-After` y se reintenta.
 */
async function requestSession(
  context: BrowserContext,
  email: string,
): Promise<APIResponse> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await context.request.post(SIGN_IN_PATH, {
      headers: { "x-test-session": TEST_SESSION_SECRET },
      data: { email, name: PERSON_NAME },
    });
    if (response.status() !== 429 || attempt === SIGN_IN_ATTEMPTS) {
      return response;
    }
    const seconds = Number(response.headers()["x-retry-after"] ?? "1");
    await new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 1) * 1000));
  }
}

/**
 * Entra con la sesión de prueba. La cookie queda en el contexto, así que
 * todas las pestañas que se abran después comparten la sesión.
 *
 * Desde E1b solo entra quien tiene membresía o una invitación pendiente, así
 * que antes siembra la invitación de un correo del dominio que no tiene
 * ninguna de las dos (D-E1b-8). Nunca la de un externo: los recorridos de
 * invitaciones llegan a esa fila por `/equipo`.
 */
export async function signIn(context: BrowserContext, email: string): Promise<void> {
  if (isCompanyEmail(email, [TEST_EMAIL_DOMAIN])) {
    await inviteForSignIn(email);
  }
  await signInUnseeded(context, email);
}

/**
 * Entra con la sesión de prueba sin sembrar nada: para los recorridos del
 * ingreso, que llegan a la invitación por la pantalla o la siembran ellos.
 */
export async function signInUnseeded(
  context: BrowserContext,
  email: string,
): Promise<void> {
  const response = await requestSession(context, email);
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * Intenta entrar con un correo que la regla de ingreso no deja pasar. La
 * sesión de prueba no pasa por el callback de Google, así que el rechazo del
 * gancho de sesión no termina en `/login`: es el 403 del endpoint (§4.5 y
 * §9.4 de E1a). El endpoint crea la fila `user` antes del rechazo, sin sesión.
 */
export async function signInRejected(
  context: BrowserContext,
  email: string,
): Promise<void> {
  const response = await requestSession(context, email);
  expect(response.status(), await response.text()).toBe(403);
}

/** Una pestaña en un contexto propio, sin sesión: la de quien intenta entrar. */
export async function guestPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
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

export { expect, PERSON_NAME, TEST_EMAIL_DOMAIN };

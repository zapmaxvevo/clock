/**
 * La red entre el navegador y el servidor, para los recorridos de cualquier
 * pantalla: esperar una server action, perder o retener su respuesta, retener
 * las revalidaciones y abrir otra pestaña de la misma persona. Ninguna función
 * sabe de qué pantalla se trata; la que filtra pedidos recibe el predicado de
 * la URL.
 */
import { expect, type Browser, type Page, type Route } from "@playwright/test";

import { signIn } from "./session";

/** Qué pedidos de la página afecta una intercepción, por su URL. */
export type UrlPredicate = (url: URL) => boolean;

/**
 * Corre algo que dispara una server action y espera su respuesta. Se usa
 * donde la pantalla no distingue la vista optimista de lo ya escrito, y donde
 * hace falta saber que una pestaña terminó antes de que otra siga.
 */
export async function withServerAction(
  page: Page,
  act: () => Promise<void>,
): Promise<void> {
  const settled = page.waitForResponse(
    (response) => response.request().headers()["next-action"] !== undefined,
  );
  await act();
  const response = await settled;
  expect(response.ok(), `la action respondió ${response.status()}`).toBeTruthy();
}

/**
 * Segunda pestaña con la misma sesión, en su propio contexto. La pestaña del
 * test nunca pierde el foco mientras esta trabaja, así que se queda con el
 * estado que leyó al entrar: es la pestaña desactualizada que hace falta para
 * TT-35, TT-41 y TT-103. Abre en `path`, que por omisión es el rastreador.
 */
export async function openSecondTab(
  browser: Browser,
  email: string,
  path = "/",
): Promise<Page> {
  const context = await browser.newContext();
  await signIn(context, email);
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

/**
 * Corta toda server action a las URLs de `matches` antes de que salga, hasta
 * que se llame a lo que devuelve. El servidor no recibe el pedido y el
 * navegador recibe una falla de red: es el pedido que nunca llegó.
 */
export async function dropActionRequests(
  page: Page,
  matches: UrlPredicate,
): Promise<() => Promise<void>> {
  const handler = async (route: Route): Promise<void> => {
    if (route.request().headers()["next-action"] === undefined) {
      await route.fallback();
      return;
    }
    await route.abort();
  };
  await page.route(matches, handler);
  return () => page.unroute(matches, handler);
}

/**
 * Pierde la respuesta de toda server action a las URLs de `matches` hasta que
 * se llame a lo que devuelve. El pedido llega entero al servidor, que lo
 * aplica, y recién cuando el servidor contestó el navegador recibe una falla
 * de red: es una respuesta perdida de verdad, no un pedido que nunca salió.
 */
export async function loseActionResponses(
  page: Page,
  matches: UrlPredicate,
): Promise<() => Promise<void>> {
  const handler = async (route: Route): Promise<void> => {
    if (route.request().headers()["next-action"] === undefined) {
      await route.fallback();
      return;
    }
    await route.fetch();
    await route.abort();
  };
  await page.route(matches, handler);
  return () => page.unroute(matches, handler);
}

/**
 * Retiene la respuesta de toda server action a las URLs de `matches` hasta que
 * se llame a lo que devuelve. El pedido llega entero al servidor, que lo
 * aplica, y el navegador recibe la respuesta recién al soltarla: es el tramo
 * en que la pantalla muestra la vista optimista de una operación ya escrita.
 */
export async function holdActionResponses(
  page: Page,
  matches: UrlPredicate,
): Promise<() => void> {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(matches, async (route) => {
    if (route.request().headers()["next-action"] === undefined) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  return release;
}

/**
 * Retiene las revalidaciones por `GET` a las URLs de `matches` hasta que se
 * llame a lo que devuelve. Una que llegara antes traería lo que creó el
 * primer intento y bajaría el aviso, y el recorrido no llegaría a repetir el
 * pedido.
 */
export async function holdRefreshes(
  page: Page,
  matches: UrlPredicate,
): Promise<() => void> {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(matches, async (route) => {
    if (route.request().method() === "GET") {
      await held;
    }
    await route.fallback();
  });
  return release;
}

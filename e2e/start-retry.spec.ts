import type { Browser, Locator, Page } from "@playwright/test";

import {
  holdRefreshes,
  loseActionResponses,
  openSecondTab,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import { descriptionInput, todayGroup, trackerBar } from "./tracker-page";

/**
 * Recorridos del reintento de «Iniciar» (slice 2b, ADR 0007). En los tres, el
 * primer arranque llega al servidor y se aplica, y lo que se pierde es la
 * respuesta: es el caso en que un reintento sin id del cliente cerraba el timer
 * que había creado el primer intento y abría otro.
 */

function isTrackerPage(url: URL): boolean {
  return url.pathname === "/";
}

/** El aviso de falla de «Iniciar», que es un `alert` de la barra. */
function startNotice(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: "No se pudo iniciar el timer." });
}

/**
 * Arranca con la respuesta perdida y espera el aviso. La barra vuelve a
 * «Iniciar» porque la vista optimista se deshace, aunque el timer ya exista.
 */
async function startLosingResponse(page: Page, description: string): Promise<void> {
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await bar.getByRole("button", { name: "Iniciar" }).click();

  const notice = startNotice(page);
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
}

/**
 * Comprueba desde otra pestaña que el primer intento se aplicó. Sin esto, un
 * pedido que no hubiera llegado al servidor haría pasar el recorrido sin
 * probar nada: el reintento sería el primer arranque.
 */
async function expectAppliedElsewhere(
  browser: Browser,
  email: string,
  description: string,
): Promise<void> {
  const otherPage = await openSecondTab(browser, email);
  const otherBar = trackerBar(otherPage);
  await expect(otherBar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(otherBar)).toHaveValue(description);
  await otherPage.context().close();
}

/**
 * Lo que quedó en el servidor, leído de una carga nueva: un timer corriendo
 * con la descripción y ninguna entrada cerrada en el día. Si el reintento
 * hubiera cerrado el timer del primer intento, la lista tendría una entrada de
 * segundos.
 */
async function expectSingleRunningTimer(page: Page, description: string): Promise<void> {
  await page.reload();
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(description);
  const today = todayGroup(page);
  await expect(today).toBeVisible();
  await expect(today.getByRole("listitem")).toHaveCount(0);
}

test("reintentar un arranque cuya respuesta se perdió deja un solo timer", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);

  // Criterio 9 y TT-89: el aviso nombra la operación y ofrece reintentar.
  await startLosingResponse(page, "respuesta perdida");
  await expectAppliedElsewhere(browser, email, "respuesta perdida");

  await restoreResponses();
  const retry = startNotice(page).getByRole("button", { name: "Reintentar" });
  await withServerAction(page, async () => {
    await retry.click();
    releaseRefreshes();
  });

  const bar = trackerBar(page);
  await expect(startNotice(page)).toBeHidden();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("respuesta perdida");

  // ADR 0007: el reintento lleva el id del primer intento y responde ese
  // timer sin cerrar nada.
  await expectSingleRunningTimer(page, "respuesta perdida");
});

test("cuando la revalidación trae el timer del primer intento, el aviso de Iniciar baja", async ({
  page,
}) => {
  // Con el reloj emulado, la revalidación de P-11 corre solo cuando el test
  // lo adelanta: hasta entonces nada trae el timer y el aviso sigue a la vista.
  await page.clock.install();
  await page.goto("/");
  await loseActionResponses(page, isTrackerPage);

  await startLosingResponse(page, "aviso que baja");

  await page.clock.fastForward(61_000);

  // Criterio 10: el timer llegó, así que no hay nada que reintentar.
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("aviso que baja");
  await expect(startNotice(page)).toBeHidden();
});

test("apretar Iniciar otra vez con el aviso a la vista no abre otro timer", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);

  await startLosingResponse(page, "Iniciar otra vez");
  await expectAppliedElsewhere(browser, email, "Iniciar otra vez");

  // Criterio 12: el mismo control en vez de «Reintentar». Con el aviso
  // visible, el clic reusa el id pendiente.
  await restoreResponses();
  const bar = trackerBar(page);
  await withServerAction(page, async () => {
    await bar.getByRole("button", { name: "Iniciar" }).click();
    releaseRefreshes();
  });

  await expect(startNotice(page)).toBeHidden();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("Iniciar otra vez");

  await expectSingleRunningTimer(page, "Iniciar otra vez");
});

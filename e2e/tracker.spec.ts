import type { Browser, Locator, Page } from "@playwright/test";

import { expect, signIn, test } from "./session";

/** Cuánto se le da al contador para llegar a un valor, sin esperas fijas. */
const COUNTER_TIMEOUT_MS = 15_000;

function trackerBar(page: Page): Locator {
  return page.getByRole("region", { name: "Rastreador" });
}

function descriptionInput(scope: Locator): Locator {
  return scope.getByRole("textbox", { name: "Descripción de la entrada" });
}

function elapsedCounter(scope: Locator): Locator {
  return scope.getByRole("timer", { name: "Tiempo transcurrido" });
}

/** El grupo del día de hoy, que la lista encabeza con «Hoy» (TT-44). */
function todayGroup(page: Page): Locator {
  return page.getByRole("region", { name: "Hoy" });
}

function entryRow(scope: Locator, description: string): Locator {
  return scope.getByRole("listitem").filter({ hasText: description });
}

/** La descripción de una fila es un botón que la vuelve editable (TT-54). */
function editDescriptionButton(scope: Locator, description: string): Locator {
  return scope.getByRole("button", { name: `${description} — editar la descripción` });
}

/** Lee el contador en segundos, para compararlo sin depender del formato. */
async function elapsedOf(counter: Locator): Promise<number> {
  const text = (await counter.textContent()) ?? "";
  const parts = text.trim().split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`El contador no se pudo leer: «${text}»`);
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** Arranca un timer con la descripción dada y espera a que la barra lo muestre. */
async function startTimer(page: Page, description: string): Promise<void> {
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await bar.getByRole("button", { name: "Iniciar" }).click();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
}

/**
 * Detiene el timer y espera a que la entrada esté en la lista. La barra pasa
 * a «Iniciar» con la vista optimista, antes de que el servidor escriba; la
 * fila del día es lo que dice que ya escribió y revalidó.
 */
async function stopTimer(page: Page, description: string): Promise<void> {
  const bar = trackerBar(page);
  await bar.getByRole("button", { name: "Detener" }).click();
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(entryRow(todayGroup(page), description)).toBeVisible();
}

/** Borra una entrada desde el menú de su fila y confirma el diálogo (TT-60). */
async function deleteEntry(page: Page, description: string): Promise<void> {
  await todayGroup(page)
    .getByRole("button", { name: `Acciones de la entrada «${description}»` })
    .click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Borrar" }).click();
}

/**
 * Borra y espera a que el servidor haya escrito. Quedando otra entrada en el
 * día, la lista se ve igual con el borrado optimista que con el escrito: la
 * respuesta de la action es la única señal de que esta pestaña ya terminó.
 */
async function deleteEntryAndSettle(page: Page, description: string): Promise<void> {
  const settled = page.waitForResponse(
    (response) => response.request().headers()["next-action"] !== undefined,
  );
  await deleteEntry(page, description);
  await settled;
}

/**
 * Segunda pestaña con la misma sesión, en su propio contexto. La pestaña del
 * test nunca pierde el foco mientras esta trabaja, así que se queda con el
 * estado que leyó al entrar: es la pestaña desactualizada que hace falta para
 * TT-35, TT-41 y TT-103.
 */
async function openSecondTab(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  await signIn(context, email);
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

test("sin entradas ni timer, la pantalla invita a empezar", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Todavía no cargaste horas")).toBeVisible();
  await expect(
    page.getByText("Escribí en qué estás trabajando y tocá Iniciar."),
  ).toBeVisible();

  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(descriptionInput(bar)).toHaveAttribute(
    "placeholder",
    "¿En qué estás trabajando?",
  );
});

test("el timer arranca sin proyecto, cuenta y sobrevive a la recarga", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "revisar la paridad");

  const bar = trackerBar(page);
  await expect(bar.getByText("Sin proyecto")).toBeVisible();

  const counter = elapsedCounter(bar);
  await expect
    .poll(() => elapsedOf(counter), { timeout: COUNTER_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(2);
  const beforeReload = await elapsedOf(counter);

  // TT-38: la barra vuelve ya con la descripción y el contador en su valor.
  await page.reload();
  const reloaded = elapsedCounter(trackerBar(page));
  await expect(reloaded).not.toHaveText("0:00:00");
  await expect(trackerBar(page).getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(trackerBar(page))).toHaveValue("revisar la paridad");
  expect(await elapsedOf(reloaded)).toBeGreaterThanOrEqual(beforeReload);
});

test("detener el timer deja la entrada en el día con su duración", async ({ page }) => {
  await page.goto("/");
  await startTimer(page, "escribir el informe");
  await stopTimer(page, "escribir el informe");

  const row = entryRow(todayGroup(page), "escribir el informe");
  await expect(row).toBeVisible();
  // TT-49: hora de inicio, hora de fin y duración, en ese orden. TT-101:
  // detenida dentro del mismo minuto, la duración se muestra 0:00.
  await expect(row).toContainText(/\d{1,2}:\d{2} – \d{1,2}:\d{2}\s*0:00/);

  await expect(elapsedCounter(trackerBar(page))).toHaveText("0:00:00");
  await expect(page.getByText("Todavía no cargaste horas")).toBeHidden();
});

test("la descripción de una entrada se edita en la fila y queda guardada", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "borrador del informe");
  await stopTimer(page, "borrador del informe");

  const today = todayGroup(page);
  await editDescriptionButton(today, "borrador del informe").click();

  // Con la fila en edición la descripción vive en el valor del campo, así que
  // el filtro por texto ya no la encuentra: el campo se busca en el grupo.
  const field = descriptionInput(today);
  await field.fill("informe corregido");
  await field.press("Enter");

  await expect(editDescriptionButton(today, "informe corregido")).toBeVisible();
  // La fila queda atenuada mientras la escritura viaja (TT-54): cuando deja de
  // estarlo el servidor ya respondió y la recarga lee el estado guardado.
  await expect(entryRow(today, "informe corregido")).toHaveAttribute(
    "aria-busy",
    "false",
  );

  await page.reload();
  await expect(
    editDescriptionButton(todayGroup(page), "informe corregido"),
  ).toBeVisible();
  await expect(
    editDescriptionButton(todayGroup(page), "borrador del informe"),
  ).toBeHidden();
});

test("Esc descarta la edición de la descripción", async ({ page }) => {
  await page.goto("/");
  await startTimer(page, "texto original");
  await stopTimer(page, "texto original");

  const today = todayGroup(page);
  await editDescriptionButton(today, "texto original").click();

  const field = descriptionInput(today);
  await field.fill("texto descartado");
  await field.press("Escape");

  await expect(editDescriptionButton(today, "texto original")).toBeVisible();

  await page.reload();
  await expect(editDescriptionButton(todayGroup(page), "texto original")).toBeVisible();
});

test("borrar una entrada pide confirmación y no se puede deshacer", async ({ page }) => {
  await page.goto("/");
  await startTimer(page, "entrada a borrar");
  await stopTimer(page, "entrada a borrar");

  const today = todayGroup(page);
  await today
    .getByRole("button", { name: "Acciones de la entrada «entrada a borrar»" })
    .click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("¿Borrar esta entrada?");
  await expect(dialog).toContainText("entrada a borrar");

  // Cancelar deja la entrada donde estaba (TT-60).
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(entryRow(todayGroup(page), "entrada a borrar")).toBeVisible();

  await deleteEntry(page, "entrada a borrar");

  // TT-61: la fila se va y al volver a cargar sigue sin estar. El estado vacío
  // lo dibuja el servidor, así que esperarlo es esperar a que el borrado esté
  // escrito.
  await expect(page.getByText("entrada a borrar")).toBeHidden();
  await expect(page.getByText("Todavía no cargaste horas")).toBeVisible();

  await page.reload();
  await expect(page.getByText("entrada a borrar")).toBeHidden();
  await expect(page.getByText("Todavía no cargaste horas")).toBeVisible();
});

test("arrancar un segundo timer cierra el primero", async ({ page, email, browser }) => {
  // La barra alterna entre «Iniciar» y «Detener», así que el segundo arranque
  // solo llega desde una pestaña que todavía no vio el timer.
  await page.goto("/");
  await expect(trackerBar(page).getByRole("button", { name: "Iniciar" })).toBeVisible();

  const otherPage = await openSecondTab(browser, email);
  await startTimer(otherPage, "primer timer");

  await startTimer(page, "segundo timer");

  // TT-35: la vieja queda cerrada en la lista y la nueva es la única abierta.
  await expect(entryRow(todayGroup(page), "primer timer")).toBeVisible();
  await expect(descriptionInput(trackerBar(page))).toHaveValue("segundo timer");

  await otherPage.reload();
  await expect(
    trackerBar(otherPage).getByRole("button", { name: "Detener" }),
  ).toBeVisible();
  await expect(descriptionInput(trackerBar(otherPage))).toHaveValue("segundo timer");
  await expect(entryRow(todayGroup(otherPage), "primer timer")).toHaveCount(1);
  await expect(entryRow(todayGroup(otherPage), "segundo timer")).toHaveCount(0);

  await otherPage.context().close();
});

test("detener un timer ya detenido avisa y deja la pantalla al día", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "timer a detener");

  const otherPage = await openSecondTab(browser, email);
  await stopTimer(otherPage, "timer a detener");

  // Esta pestaña todavía lo muestra corriendo: es el caso de TT-41.
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await bar.getByRole("button", { name: "Detener" }).click();

  await expect(page.getByText("No se pudo detener el timer.")).toBeVisible();
  await expect(page.getByText("Este timer ya había sido detenido.")).toBeVisible();

  // La action revalida `/` también al fallar: sin eso la barra volvería a
  // mostrar el timer corriendo al deshacerse la vista optimista.
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(entryRow(todayGroup(page), "timer a detener")).toBeVisible();

  await otherPage.context().close();
});

test("borrar una entrada ya borrada avisa y deja la lista al día", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "entrada que sobrevive");
  await stopTimer(page, "entrada que sobrevive");
  await startTimer(page, "entrada ya borrada");
  await stopTimer(page, "entrada ya borrada");

  const otherPage = await openSecondTab(browser, email);
  await deleteEntryAndSettle(otherPage, "entrada ya borrada");

  // Esta pestaña todavía tiene la fila: es el caso de TT-103.
  await deleteEntry(page, "entrada ya borrada");

  await expect(page.getByText("No se pudo borrar la entrada.")).toBeVisible();
  await expect(page.getByText("Esa entrada ya no existe.")).toBeVisible();

  // La action revalida `/` también al fallar: sin eso la fila volvería a
  // aparecer al deshacerse la vista optimista. La que quedaba sigue en su
  // lugar, y es la que mantiene el grupo —y el aviso— en pantalla.
  await expect(entryRow(todayGroup(page), "entrada ya borrada")).toHaveCount(0);
  await expect(entryRow(todayGroup(page), "entrada que sobrevive")).toBeVisible();

  await otherPage.context().close();
});

test("editar una entrada borrada avisa y la saca de la lista", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "entrada que sobrevive");
  await stopTimer(page, "entrada que sobrevive");
  await startTimer(page, "entrada fantasma");
  await stopTimer(page, "entrada fantasma");

  const otherPage = await openSecondTab(browser, email);
  await deleteEntryAndSettle(otherPage, "entrada fantasma");

  // Esta pestaña todavía tiene la fila: es el caso de TT-103.
  const today = todayGroup(page);
  await editDescriptionButton(today, "entrada fantasma").click();
  const field = descriptionInput(today);
  await field.fill("nombre nuevo");
  await field.press("Enter");

  await expect(page.getByText("No se pudo guardar la descripción.")).toBeVisible();
  await expect(page.getByText("Esa entrada ya no existe.")).toBeVisible();

  // La action revalida `/` también al fallar: sin eso la fila volvería con su
  // descripción vieja al deshacerse la vista optimista.
  await expect(entryRow(today, "entrada fantasma")).toHaveCount(0);
  await expect(entryRow(today, "nombre nuevo")).toHaveCount(0);
  await expect(entryRow(today, "entrada que sobrevive")).toBeVisible();

  await otherPage.context().close();
});

import type { Browser, Locator, Page, Request } from "@playwright/test";

import {
  holdRefreshes,
  loseActionResponses,
  openSecondTab,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import {
  chooseMode,
  descriptionInput,
  duplicateFromMenu,
  elapsedCounter,
  entryRow,
  startTimer,
  stopTimer,
  todayGroup,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos del slice 4: continuar (TT-57), duplicar (TT-58), descartar el
 * timer (TT-65) y los atajos de una tecla (TT-26), con el reintento de las dos
 * altas nuevas por el ADR 0007.
 */

/** Los avisos de falla de las tres operaciones (TT-90). */
const CONTINUE_FAILED = "No se pudo continuar la entrada.";
const DUPLICATE_FAILED = "No se pudo duplicar la entrada.";
const DISCARD_FAILED = "No se pudo descartar el timer.";

function isTrackerPage(url: URL): boolean {
  return url.pathname === "/";
}

function isAction(request: Request): boolean {
  return request.headers()["next-action"] !== undefined;
}

/** Junta los pedidos de server action que salen desde que se llama. */
function recordActions(page: Page): readonly Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request)) {
      sent.push(request);
    }
  });
  return sent;
}

/** El botón de continuar de una fila, con el ícono de reproducción. */
function continueButton(scope: Locator, description: string): Locator {
  return scope.getByRole("button", { name: `Continuar «${description}»`, exact: true });
}

/** Todas las filas con una descripción, en cualquier día de la lista. */
function entriesNamed(page: Page, description: string): Locator {
  return page.getByRole("listitem").filter({ hasText: description });
}

/** El aviso de falla de una operación, que es un `alert`. */
function failureNotice(page: Page, title: string): Locator {
  return page.getByRole("alert").filter({ hasText: title });
}

/** El menú de tres puntos de la barra, con el timer corriendo. */
function timerActions(page: Page): Locator {
  return trackerBar(page).getByRole("button", { name: "Acciones del timer" });
}

/** La confirmación del descarte, que se dibuja en un portal. */
function discardDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "¿Descartar el timer?" });
}

function shortcutsDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Atajos de teclado" });
}

/** Abre la confirmación del descarte desde el menú de la barra. */
async function openDiscard(page: Page): Promise<Locator> {
  await timerActions(page).click();
  await page.getByRole("menuitem", { name: "Descartar" }).click();
  const dialog = discardDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Una entrada cerrada de hoy, que ya empezó: arranca un timer y lo detiene. */
async function closedEntry(page: Page, description: string): Promise<void> {
  await startTimer(page, description);
  await stopTimer(page, description);
}

/**
 * Saca el foco de cualquier control: los atajos se prueban con el foco en
 * `body`, que es donde queda cuando la persona no está en ningún campo.
 */
async function focusBody(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await expect
    .poll(() => page.evaluate(() => document.activeElement === document.body))
    .toBe(true);
}

/**
 * Retiene toda server action hasta que se llame a lo que devuelve: el pedido
 * sale, y el servidor recién lo recibe cuando el test lo suelta.
 */
async function holdActions(page: Page): Promise<() => void> {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isTrackerPage, async (route) => {
    if (isAction(route.request())) {
      await held;
    }
    await route.fallback();
  });
  return release;
}

/** Confirma el descarte con el pedido retenido y espera el foco en la descripción. */
async function confirmDiscardHeld(page: Page): Promise<() => void> {
  const release = await holdActions(page);
  const sent = page.waitForRequest(isAction);
  await openDiscard(page);
  await discardDialog(page).getByRole("button", { name: "Descartar" }).click();
  await sent;
  await expect(descriptionInput(trackerBar(page))).toBeFocused();
  return release;
}

/**
 * Continúa con la respuesta perdida y espera el aviso. La barra sigue
 * detenida: el timer nuevo llega con la revalidación, y está retenida o
 * todavía no corrió.
 */
async function continueLosingResponse(page: Page, description: string): Promise<void> {
  await continueButton(todayGroup(page), description).click();

  const notice = failureNotice(page, CONTINUE_FAILED);
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(trackerBar(page).getByRole("button", { name: "Iniciar" })).toBeVisible();
}

/**
 * Comprueba desde otra pestaña que la continuación se aplicó. Sin esto, un
 * pedido que no hubiera llegado al servidor haría pasar el recorrido sin
 * probar nada: el segundo pedido sería la primera continuación.
 */
async function expectContinuedElsewhere(
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
 * Lo que quedó en el servidor, leído de una carga nueva: la continuación
 * corriendo y una sola fila con la descripción, la original. Si el segundo
 * pedido hubiera llevado otro id, habría cerrado la continuación del primero
 * y la lista tendría una entrada de segundos más.
 */
async function expectSingleContinuation(page: Page, description: string): Promise<void> {
  await page.reload();
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(description);
  await expect(entriesNamed(page, description)).toHaveCount(1);
}

test("continuar una fila arranca un timer con su descripción y cierra el que corría", async ({
  page,
}) => {
  await page.goto("/");
  await closedEntry(page, "primera tarea");
  await closedEntry(page, "segunda tarea");

  const today = todayGroup(page);
  const bar = trackerBar(page);
  const original = entryRow(today, "primera tarea");
  const originalText = (await original.textContent()) ?? "";

  // Criterio 1: sin timer corriendo, la barra corre con la descripción de la
  // fila y la original no cambia. El timer no es una fila de la lista.
  await withServerAction(page, () => continueButton(today, "primera tarea").click());
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("primera tarea");
  await expect(original).toHaveCount(1);
  await expect(original).toHaveText(originalText);

  // Criterio 2: con un timer corriendo, continuar otra fila lo cierra y la
  // entrada cerrada aparece en la lista.
  await withServerAction(page, () => continueButton(today, "segunda tarea").click());
  await expect(descriptionInput(bar)).toHaveValue("segunda tarea");
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(entryRow(today, "primera tarea")).toHaveCount(2);
  await expect(entryRow(today, "segunda tarea")).toHaveCount(1);

  await page.reload();
  const reloadedBar = trackerBar(page);
  await expect(reloadedBar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(reloadedBar)).toHaveValue("segunda tarea");
  await expect(entryRow(todayGroup(page), "primera tarea")).toHaveCount(2);
  await expect(entryRow(todayGroup(page), "segunda tarea")).toHaveCount(1);
});

test("continuar con el modo manual elegido retiene lo tecleado y lo devuelve al detener", async ({
  page,
}) => {
  await page.goto("/");
  await closedEntry(page, "tarea previa");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  await descriptionInput(bar).fill("a medio escribir");

  // Criterio 3 y B-1 del slice 2: el timer continuado fuerza la barra a timer
  // con su descripción, y lo tecleado queda guardado.
  await withServerAction(page, () =>
    continueButton(todayGroup(page), "tarea previa").click(),
  );
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("tarea previa");

  // Al detener vuelve el modo elegido, con el texto retenido.
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Detener" }).click(),
  );
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("a medio escribir");
});

test("reintentar una continuación cuya respuesta se perdió deja un solo timer", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await closedEntry(page, "continuación perdida");
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);

  // TT-89: el aviso nombra la operación y ofrece reintentar.
  await continueLosingResponse(page, "continuación perdida");
  await expectContinuedElsewhere(browser, email, "continuación perdida");

  await restoreResponses();
  const retry = failureNotice(page, CONTINUE_FAILED).getByRole("button", {
    name: "Reintentar",
  });
  await withServerAction(page, async () => {
    await retry.click();
    releaseRefreshes();
  });

  const bar = trackerBar(page);
  await expect(failureNotice(page, CONTINUE_FAILED)).toBeHidden();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("continuación perdida");

  // Criterio 4: el reintento lleva el id del primer intento y responde esa
  // continuación sin cerrarla.
  await expectSingleContinuation(page, "continuación perdida");
});

test("duplicar una fila deja una más con la misma descripción y la original intacta", async ({
  page,
}) => {
  await page.goto("/");
  await closedEntry(page, "entrada a duplicar");
  const entries = entriesNamed(page, "entrada a duplicar");
  const originalText = (await entries.textContent()) ?? "";

  await withServerAction(page, () => duplicateFromMenu(page, "entrada a duplicar"));

  // Criterio 7: una fila más con esa descripción, y la original sigue como
  // estaba. Ni las horas, ni el grupo, ni el total de la copia, que dependen
  // de la regla pendiente de P-14.
  await expect(entries).toHaveCount(2);
  await expect(entries.filter({ hasText: originalText }).first()).toBeVisible();

  await page.reload();
  await expect(entries).toHaveCount(2);
  await expect(entries.filter({ hasText: originalText }).first()).toBeVisible();
});

test("descartar el timer pide confirmación, lo borra y deja el foco en la descripción", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "timer a descartar");
  const bar = trackerBar(page);

  // Criterio 9: «Cancelar» no cambia nada y devuelve el foco al menú.
  const dialog = await openDiscard(page);
  await expect(dialog).toContainText(
    "Se borra el tiempo que lleva corriendo y no se puede deshacer.",
  );
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(timerActions(page)).toBeFocused();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("timer a descartar");

  // TT-65: confirmado, la barra queda vacía y el timer no pasa a la lista.
  await openDiscard(page);
  await withServerAction(page, () =>
    discardDialog(page).getByRole("button", { name: "Descartar" }).click(),
  );
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(descriptionInput(bar)).toBeFocused();
  await expect(entriesNamed(page, "timer a descartar")).toHaveCount(0);

  await page.reload();
  await expect(trackerBar(page).getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(entriesNamed(page, "timer a descartar")).toHaveCount(0);
  await expect(page.getByText("Todavía no cargaste horas")).toBeVisible();
});

test("descartar un timer que llegó con el modo manual elegido devuelve la barra manual con lo tecleado", async ({
  page,
}) => {
  await page.goto("/");
  await closedEntry(page, "entrada de origen");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  await descriptionInput(bar).fill("texto retenido");
  await withServerAction(page, () =>
    continueButton(todayGroup(page), "entrada de origen").click(),
  );
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("entrada de origen");

  // Criterio 10: descartar es un timer que se va, y vuelve el texto de B-1.
  await openDiscard(page);
  await withServerAction(page, () =>
    discardDialog(page).getByRole("button", { name: "Descartar" }).click(),
  );
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("texto retenido");
  await expect(entriesNamed(page, "entrada de origen")).toHaveCount(1);
});

test("descartar un timer que otra pestaña detuvo avisa y deja la entrada cerrada", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "detenido en otra pestaña");

  const otherPage = await openSecondTab(browser, email);
  await stopTimer(otherPage, "detenido en otra pestaña");

  // Esta pestaña todavía lo muestra corriendo.
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await openDiscard(page);
  await withServerAction(page, () =>
    discardDialog(page).getByRole("button", { name: "Descartar" }).click(),
  );

  // Criterio 11: la entrada que otra pestaña decidió guardar no se borra, y
  // repetir no cambia el desenlace, así que no hay «Reintentar».
  const notice = failureNotice(page, DISCARD_FAILED);
  await expect(notice).toContainText("Este timer ya había sido detenido.");
  await expect(notice.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(entryRow(todayGroup(page), "detenido en otra pestaña")).toBeVisible();

  await page.reload();
  await expect(entryRow(todayGroup(page), "detenido en otra pestaña")).toBeVisible();

  await otherPage.context().close();
});

test("lo tecleado mientras viaja el descarte se queda aunque se salga del campo", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "timer a descartar");
  const bar = trackerBar(page);

  const release = await confirmDiscardHeld(page);
  await descriptionInput(bar).fill("próxima tarea");
  await focusBody(page);

  // m-1 de la segunda revisión: lo tecleado no es del timer descartado.
  await withServerAction(page, async () => release());
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("próxima tarea");
  await expect(entriesNamed(page, "timer a descartar")).toHaveCount(0);
});

test("lo tecleado mientras viaja un descarte que termina en ya detenido se queda", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "detenido mientras se descarta");

  const otherPage = await openSecondTab(browser, email);
  await stopTimer(otherPage, "detenido mientras se descarta");

  const bar = trackerBar(page);
  const release = await confirmDiscardHeld(page);
  await descriptionInput(bar).fill("próxima tarea");
  await focusBody(page);

  await withServerAction(page, async () => release());
  await expect(failureNotice(page, DISCARD_FAILED)).toContainText(
    "Este timer ya había sido detenido.",
  );
  await expect(descriptionInput(bar)).toHaveValue("próxima tarea");
  await expect(entryRow(todayGroup(page), "detenido mientras se descarta")).toBeVisible();

  await otherPage.context().close();
});

test("si otra pestaña detiene un timer forzado con el diálogo de descarte abierto, cancelar devuelve el foco a la barra manual", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await closedEntry(page, "entrada de origen");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  await descriptionInput(bar).fill("texto retenido");
  await withServerAction(page, () =>
    continueButton(todayGroup(page), "entrada de origen").click(),
  );
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();

  const dialog = await openDiscard(page);

  const otherPage = await openSecondTab(browser, email);
  await withServerAction(otherPage, () =>
    trackerBar(otherPage).getByRole("button", { name: "Detener" }).click(),
  );

  // Esta pestaña se pone al día con el diálogo abierto, que deja la barra
  // fuera del árbol accesible: se busca incluyendo lo oculto.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const hiddenBar = page.getByRole("region", { name: "Rastreador", includeHidden: true });
  await expect(
    hiddenBar.getByRole("button", { name: "Agregar", includeHidden: true }),
  ).toBeVisible();

  // m-2 de la segunda revisión: el diálogo sigue, y al cerrarlo el foco va a
  // la descripción de la barra manual, porque el menú ya no está.
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(descriptionInput(bar)).toBeFocused();
  await expect(descriptionInput(bar)).toHaveValue("texto retenido");

  await otherPage.context().close();
});

test("confirmar el descarte después de que otra pestaña continuó otra entrada no borra el timer nuevo", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await closedEntry(page, "entrada a continuar");
  // El grupo de hoy ya está dibujado: se espera la respuesta del arranque.
  await withServerAction(page, () => startTimer(page, "timer a descartar"));

  await openDiscard(page);

  const otherPage = await openSecondTab(browser, email);
  await withServerAction(otherPage, () =>
    continueButton(todayGroup(otherPage), "entrada a continuar").click(),
  );

  /*
   * Con el diálogo abierto, esta pestaña se pone al día y la barra pasa a
   * mostrar el timer continuado. El diálogo es modal y deja el resto de la
   * página fuera del árbol accesible, así que la barra se busca incluyendo
   * lo oculto.
   */
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const hiddenBar = page.getByRole("region", { name: "Rastreador", includeHidden: true });
  await expect(
    hiddenBar.getByRole("textbox", {
      name: "Descripción de la entrada",
      includeHidden: true,
    }),
  ).toHaveValue("entrada a continuar");

  // M-1 de las revisiones: el descarte apunta al timer que estaba corriendo
  // al abrir el diálogo, que la continuación ya cerró.
  await withServerAction(page, () =>
    discardDialog(page).getByRole("button", { name: "Descartar" }).click(),
  );
  await expect(failureNotice(page, DISCARD_FAILED)).toContainText(
    "Este timer ya había sido detenido.",
  );
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("entrada a continuar");
  await expect(entryRow(todayGroup(page), "timer a descartar")).toBeVisible();

  await page.reload();
  const reloadedBar = trackerBar(page);
  await expect(reloadedBar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(reloadedBar)).toHaveValue("entrada a continuar");
  await expect(entryRow(todayGroup(page), "timer a descartar")).toBeVisible();

  await otherPage.context().close();
});

test("mientras viaja el guardado de la descripción, confirmar el descarte está inactivo", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "descripción vieja");

  // El guardado se retiene hasta que el test lo suelta.
  const release = await holdActions(page);

  // Abrir el menú saca el foco del campo, y su salida manda el guardado.
  const bar = trackerBar(page);
  const saveSent = page.waitForRequest(isAction);
  await descriptionInput(bar).fill("descripción nueva");
  await timerActions(page).click();
  await saveSent;
  await page.getByRole("menuitem", { name: "Descartar" }).click();

  // Criterio 12: el descarte no puede adelantarse al guardado.
  const confirm = discardDialog(page).getByRole("button", { name: "Descartar" });
  await expect(confirm).toBeDisabled();
  release();
  await expect(confirm).toBeEnabled();

  await withServerAction(page, () => confirm.click());
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(page.getByText("Esa entrada ya no existe.")).toHaveCount(0);

  await page.reload();
  await expect(entriesNamed(page, "descripción nueva")).toHaveCount(0);
  await expect(entriesNamed(page, "descripción vieja")).toHaveCount(0);
});

test("los atajos de una tecla hacen lo que sus controles, no se disparan escribiendo y se apagan", async ({
  page,
}) => {
  await page.goto("/");
  const bar = trackerBar(page);
  const field = descriptionInput(bar);
  const actions = recordActions(page);

  /*
   * Criterio 13: `n` arranca con el foco en `body`. Cada atajo espera a que
   * termine el pedido anterior: con una operación en vuelo los controles
   * están inactivos, y sus atajos también.
   */
  await field.fill("con atajo");
  await focusBody(page);
  await withServerAction(page, () => page.keyboard.press("n"));
  await expect(bar.getByRole("button", { name: "Detener" })).toBeEnabled();
  await expect(bar.getByRole("button", { name: "Detener" })).toHaveAttribute(
    "aria-keyshortcuts",
    "S",
  );

  // Con el timer corriendo «Iniciar» no está, así que `n` no hace nada: el
  // único pedido después del arranque es la parada de `s`.
  await page.keyboard.press("n");
  await withServerAction(page, () => page.keyboard.press("s"));
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(entryRow(todayGroup(page), "con atajo")).toBeVisible();
  expect(actions).toHaveLength(2);

  // `m` cambia de modo, ida y vuelta. Con un timer corriendo el conmutador
  // está inactivo, así que `m` sirve de testigo de que nada arrancó.
  await expect(bar.getByRole("button", { name: "Iniciar" })).toHaveAttribute(
    "aria-keyshortcuts",
    "N",
  );
  // El contrato no fija qué elemento del conmutador lleva la «M».
  await expect(page.locator('[aria-keyshortcuts="M"]').first()).toBeAttached();
  await page.keyboard.press("m");
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await page.keyboard.press("m");
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();

  // Criterio 14: `n` tecleada en la descripción es texto.
  await field.click();
  await page.keyboard.press("n");
  await expect(field).toHaveValue("n");
  await focusBody(page);
  await page.keyboard.press("m");
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await page.keyboard.press("m");
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await field.fill("");

  // Con un diálogo abierto tampoco hacen nada.
  await page.getByRole("button", { name: "Atajos de teclado" }).click();
  const dialog = shortcutsDialog(page);
  await expect(
    dialog.getByRole("switch", { name: "Usar atajos de una tecla" }),
  ).toBeChecked();
  await expect(dialog).toContainText(
    "No funcionan mientras escribís en un campo ni con un menú o un diálogo abierto.",
  );
  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await focusBody(page);
  await page.keyboard.press("m");
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await page.keyboard.press("m");
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  expect(actions).toHaveLength(2);

  // `c` continúa la entrada de `lastEntryId`, la cerrada más reciente.
  const today = todayGroup(page);
  await expect(continueButton(today, "con atajo")).toHaveAttribute(
    "aria-keyshortcuts",
    "C",
  );
  await focusBody(page);
  await withServerAction(page, () => page.keyboard.press("c"));
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(field).toHaveValue("con atajo");
  await expect(entryRow(today, "con atajo")).toHaveCount(1);

  // Con otro nombre, la continuación detenida se distingue de la original.
  await field.fill("continuada");
  await withServerAction(page, () => field.press("Enter"));
  await focusBody(page);
  await withServerAction(page, () => page.keyboard.press("s"));
  await expect(entryRow(today, "continuada")).toBeVisible();
  await expect(continueButton(today, "continuada")).toHaveAttribute(
    "aria-keyshortcuts",
    "C",
  );
  await expect(continueButton(today, "con atajo")).not.toHaveAttribute(
    "aria-keyshortcuts",
  );

  // Criterio 15: apagados desde el interruptor, sin recargar, ningún control
  // los anuncia.
  await page.getByRole("button", { name: "Atajos de teclado" }).click();
  const toggle = dialog.getByRole("switch", { name: "Usar atajos de una tecla" });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(continueButton(today, "continuada")).not.toHaveAttribute(
    "aria-keyshortcuts",
  );
  await expect(page.locator("[aria-keyshortcuts]")).toHaveCount(0);

  /*
   * Y `c` no continúa nada. El testigo es «Iniciar»: si `c` hubiera
   * continuado, el arranque cerraría esa continuación y la lista tendría dos
   * filas «continuada».
   */
  await focusBody(page);
  const beforeContinue = actions.length;
  await page.keyboard.press("c");
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Iniciar" }).click(),
  );
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Detener" }).click(),
  );
  await expect(entryRow(today, "Sin descripción")).toBeVisible();
  await expect(entryRow(today, "continuada")).toHaveCount(1);
  expect(actions).toHaveLength(beforeContinue + 2);

  // La preferencia sobrevive a la recarga. La hidratación saca los
  // `aria-keyshortcuts` con que llega el HTML del servidor.
  await page.reload();
  const reloadedBar = trackerBar(page);
  await expect(reloadedBar.getByRole("button", { name: "Iniciar" })).not.toHaveAttribute(
    "aria-keyshortcuts",
  );
  await expect(page.locator("[aria-keyshortcuts]")).toHaveCount(0);

  // `n` no arranca: con un timer corriendo, el conmutador no se podría usar.
  await focusBody(page);
  const beforeStart = actions.length;
  await page.keyboard.press("n");
  await page.getByRole("button", { name: "Modo manual" }).click();
  await expect(reloadedBar.getByRole("button", { name: "Agregar" })).toBeVisible();
  expect(actions).toHaveLength(beforeStart);

  await page.getByRole("button", { name: "Atajos de teclado" }).click();
  await expect(
    shortcutsDialog(page).getByRole("switch", { name: "Usar atajos de una tecla" }),
  ).not.toBeChecked();
});

test("cuando la revalidación trae la continuación, el aviso de continuar baja", async ({
  page,
}) => {
  // Con el reloj emulado, la revalidación de P-11 corre solo cuando el test
  // lo adelanta: hasta entonces nada trae el timer y el aviso sigue a la vista.
  await page.clock.install();
  await page.goto("/");
  await closedEntry(page, "continuación que llega");
  await loseActionResponses(page, isTrackerPage);

  await continueLosingResponse(page, "continuación que llega");

  await page.clock.fastForward(61_000);

  // Criterio 22: el timer llegó, así que no hay nada que reintentar.
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("continuación que llega");
  await expect(failureNotice(page, CONTINUE_FAILED)).toBeHidden();
});

test("apretar continuar otra vez con el aviso a la vista no abre otro timer", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await closedEntry(page, "continuar otra vez");
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);

  await continueLosingResponse(page, "continuar otra vez");
  await expectContinuedElsewhere(browser, email, "continuar otra vez");

  // Criterio 23: el mismo botón en vez de «Reintentar». Con el aviso visible,
  // el clic sobre la misma fila reusa el id pendiente.
  await restoreResponses();
  await withServerAction(page, async () => {
    await continueButton(todayGroup(page), "continuar otra vez").click();
    releaseRefreshes();
  });

  const bar = trackerBar(page);
  await expect(failureNotice(page, CONTINUE_FAILED)).toBeHidden();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("continuar otra vez");

  await expectSingleContinuation(page, "continuar otra vez");
});

test("apretar Duplicar otra vez con el aviso a la vista deja una sola copia", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await closedEntry(page, "duplicar otra vez");
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);

  await duplicateFromMenu(page, "duplicar otra vez");
  const notice = failureNotice(page, DUPLICATE_FAILED);
  await expect(notice.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(entriesNamed(page, "duplicar otra vez")).toHaveCount(1);

  // La copia se creó: otra pestaña la ve.
  const otherPage = await openSecondTab(browser, email);
  await expect(entriesNamed(otherPage, "duplicar otra vez")).toHaveCount(2);
  await otherPage.context().close();

  // Criterio 23: «Duplicar» otra vez sobre la misma fila reusa el id
  // pendiente y responde la copia que ya existe.
  await restoreResponses();
  await withServerAction(page, async () => {
    await duplicateFromMenu(page, "duplicar otra vez");
    releaseRefreshes();
  });
  await expect(notice).toBeHidden();
  await expect(entriesNamed(page, "duplicar otra vez")).toHaveCount(2);

  await page.reload();
  await expect(entriesNamed(page, "duplicar otra vez")).toHaveCount(2);
});

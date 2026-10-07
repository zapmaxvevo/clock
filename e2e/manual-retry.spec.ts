import type { Browser, Locator, Page } from "@playwright/test";

import {
  addEntryButton,
  calendarHref,
  calendarRegion,
  dialogButton,
  dialogDescription,
  dialogNotice,
  entryBlocks,
  entryDialog,
  isCalendarPage,
  openLastWeek,
  PERSON_TIMEZONE,
} from "./calendar-page";
import { todayIn, type CivilDay } from "./days";
import {
  dropActionRequests,
  holdActionResponses,
  holdRefreshes,
  loseActionResponses,
  openSecondTab,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import {
  chooseMode,
  clockField,
  dateButton,
  descriptionInput,
  editDescriptionButton,
  entryRow,
  isTrackerPage,
  setClock,
  startTimer,
  todayGroup,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos del slice 2c: «Reintentar» en el alta manual, en la barra y en el
 * diálogo del calendario (§7 del contrato, «Recorridos obligatorios de
 * `e2e/manual-retry.spec.ts`», y r3-1 de su confirmación). El pedido lleva un
 * id que elige el cliente (ADR 0007), así que reintentar un alta cuya
 * respuesta se perdió responde la entrada del primer intento sin crear otra.
 *
 * La respuesta perdida es real: el pedido llega al servidor y se aplica, y
 * cada recorrido que la usa lo comprueba desde otra pestaña antes de repetir
 * el pedido; sin eso, un pedido que no llegó haría pasar el recorrido sin
 * probar nada. Las horas de hoy son 00:00–00:01, que ya pasaron a cualquier
 * hora de la corrida; las del calendario, la semana pasada. Sin reloj
 * emulado: la revalidación sin recarga se fuerza con el evento `focus`.
 */

/** El título del aviso de falla del alta, en la barra y en el diálogo (TT-90). */
const ENTRY_NOT_ADDED = "No se pudo agregar la entrada.";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** El aviso de TT-109 que el slice retira. */
const ADD_LOST = "No sabemos si la entrada se guardó.";

/** r2-1: lo mandado no se guardó porque el id ya tenía una entrada. */
const REPLAYED_IN_BAR =
  "La entrada ya se había agregado con lo que mandaste antes; lo que está en la barra no se guardó.";
const REPLAYED_IN_DIALOG =
  "La entrada ya se había agregado con lo que mandaste antes; lo que está en el diálogo no se guardó.";

/** El aviso de falla del alta en la barra, un `alert`. */
function addNotice(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: ENTRY_NOT_ADDED });
}

function retryButton(notice: Locator): Locator {
  return notice.getByRole("button", { name: "Reintentar", exact: true });
}

/** El aviso informativo de r2-1 en `scope`, un `status`. */
function replayedNotice(scope: Page | Locator, text: string): Locator {
  return scope.getByRole("status").filter({ hasText: text });
}

function addButton(bar: Locator): Locator {
  return bar.getByRole("button", { name: "Agregar", exact: true });
}

/** Teclea un borrador en la barra manual, con la fecha en hoy. */
async function typeDraft(
  bar: Locator,
  description: string,
  start: string,
  end: string,
): Promise<void> {
  await descriptionInput(bar).fill(description);
  await setClock(bar, "Hora de inicio", start);
  await setClock(bar, "Hora de fin", end);
}

/** El borrador de la barra sigue como se tecleó. */
async function expectDraft(
  bar: Locator,
  description: string,
  start: string,
  end: string,
): Promise<void> {
  await expect(descriptionInput(bar)).toHaveValue(description);
  await expect(clockField(bar, "Hora de inicio")).toHaveValue(start);
  await expect(clockField(bar, "Hora de fin")).toHaveValue(end);
}

/**
 * La barra volvió al borrador inicial (TT-25): sin descripción, en hoy y con
 * las dos horas en la de ahora.
 */
async function expectEmptyBar(bar: Locator): Promise<void> {
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(dateButton(bar)).toHaveText("Hoy");
  await expect(clockField(bar, "Duración")).toHaveValue("0:00");
}

/**
 * «Agregar» con la respuesta perdida, o con el pedido cortado, y espera el
 * aviso de falla con «Reintentar». El aviso de TT-109 ya no existe.
 */
async function addFailing(page: Page): Promise<Locator> {
  const bar = trackerBar(page);
  await addButton(bar).click();
  const notice = addNotice(page);
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(retryButton(notice)).toBeEnabled();
  await expect(page.getByText(ADD_LOST)).toHaveCount(0);
  return notice;
}

/**
 * Cuenta desde otra pestaña de la misma persona las filas de hoy con esa
 * descripción. Es lo que dice si el primer intento se aplicó.
 */
async function expectRowsElsewhere(
  browser: Browser,
  email: string,
  description: string,
  count: number,
): Promise<void> {
  const otherPage = await openSecondTab(browser, email);
  await expect(trackerBar(otherPage)).toBeVisible();
  await expect(entryRow(todayGroup(otherPage), description)).toHaveCount(count);
  await otherPage.context().close();
}

/** Lo mismo en el calendario, en la semana `week`. */
async function expectBlocksElsewhere(
  browser: Browser,
  email: string,
  week: CivilDay,
  description: string,
  count: number,
): Promise<void> {
  const otherPage = await openSecondTab(browser, email, calendarHref(week));
  await expect(calendarRegion(otherPage)).toBeVisible();
  await expect(entryBlocks(calendarRegion(otherPage), description)).toHaveCount(count);
  await otherPage.context().close();
}

/**
 * Abre el alta con «Agregar entrada» (CAL-74), que en la semana pasada la
 * propone el lunes de 08:00 a 09:00, y escribe la descripción.
 */
async function openAddDialog(page: Page, description: string): Promise<Locator> {
  await addEntryButton(page).click();
  const dialog = entryDialog(page, "Agregar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  await dialogDescription(dialog).fill(description);
  return dialog;
}

/** «Agregar» del diálogo con la respuesta perdida o el pedido cortado. */
async function addFailingInDialog(dialog: Locator): Promise<Locator> {
  await dialogButton(dialog, "Agregar").click();
  const notice = dialogNotice(dialog, ENTRY_NOT_ADDED);
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(retryButton(notice)).toBeEnabled();
  await expect(dialog.getByText(ADD_LOST)).toHaveCount(0);
  return notice;
}

test("reintentar un alta de la barra cuya respuesta se perdió deja una sola fila", async ({
  page,
  email,
  browser,
}) => {
  const description = "respuesta perdida en la barra";
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  const add = addButton(bar);
  await typeDraft(bar, description, "00:00", "00:01");

  // TT-89 y TT-90: el aviso de cualquier operación del módulo, con
  // «Reintentar», y el borrador entero.
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  const notice = await addFailing(page);
  await expectDraft(bar, description, "00:00", "00:01");
  await expectRowsElsewhere(browser, email, description, 1);

  // Mientras el reintento viaja, el foco queda en «Agregar», que está
  // inactivo sin perderlo: nunca en `body`.
  await restoreResponses();
  const releaseResponse = await holdActionResponses(page, isTrackerPage);
  await retryButton(notice).click();
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute("aria-disabled", "true");

  // TT-25: la respuesta es la entrada mandada, así que la barra se limpia y
  // el foco pasa a la descripción. Ningún aviso queda.
  await withServerAction(page, async () => releaseResponse());
  await expectEmptyBar(bar);
  await expect(descriptionInput(bar)).toBeFocused();
  await expect(notice).toHaveCount(0);
  await expect(replayedNotice(page, REPLAYED_IN_BAR)).toHaveCount(0);

  // ADR 0007: el reintento llevó el id del primer intento.
  releaseRefreshes();
  await page.reload();
  await expect(entryRow(todayGroup(page), description)).toHaveCount(1);

  // El id se renovó con el éxito: lo mismo otra vez es otra entrada.
  await typeDraft(bar, description, "00:00", "00:01");
  await withServerAction(page, () => add.click());
  await expect(entryRow(todayGroup(page), description)).toHaveCount(2);
});

test("apretar Agregar otra vez con el aviso de la respuesta perdida a la vista no duplica la entrada", async ({
  page,
  email,
  browser,
}) => {
  const description = "Agregar otra vez";
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  const add = addButton(bar);
  await typeDraft(bar, description, "00:00", "00:01");

  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  const notice = await addFailing(page);
  await expectRowsElsewhere(browser, email, description, 1);

  // D2c-1: el mismo control en vez de «Reintentar». Con el aviso a la vista,
  // el clic reusa el id pendiente con el borrador de ahora, que no cambió.
  await restoreResponses();
  await withServerAction(page, () => add.click());
  await expectEmptyBar(bar);
  await expect(notice).toHaveCount(0);
  await expect(replayedNotice(page, REPLAYED_IN_BAR)).toHaveCount(0);

  releaseRefreshes();
  await page.reload();
  await expect(entryRow(todayGroup(page), description)).toHaveCount(1);
});

test("el alta que no llegó se reintenta con el pedido que falló, aunque la barra haya cambiado", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  const add = addButton(bar);
  await typeDraft(bar, "pedido original", "00:00", "00:01");

  // El pedido nunca sale: el servidor no lo recibe. «Agregar» vuelve a estar
  // activo y lo tecleado sigue en la barra (TT-89).
  const restoreRequests = await dropActionRequests(page, isTrackerPage);
  const notice = await addFailing(page);
  await expect(add).toBeEnabled();
  await expectDraft(bar, "pedido original", "00:00", "00:01");
  await expect(clockField(bar, "Duración")).toHaveValue("0:01");
  await expectRowsElsewhere(browser, email, "pedido original", 0);

  // D2c-2 (b): «Reintentar» de la barra reenvía el pedido que falló, no lo
  // que hay ahora. La barra limpia solo lo que sigue igual a lo mandado: la
  // descripción editada queda y las horas vuelven al borrador inicial.
  await descriptionInput(bar).fill("pedido editado");
  await restoreRequests();
  await withServerAction(page, () => retryButton(notice).click());
  await expect(clockField(bar, "Duración")).toHaveValue("0:00");
  await expect(descriptionInput(bar)).toHaveValue("pedido editado");
  await expect(notice).toHaveCount(0);
  await expect(replayedNotice(page, REPLAYED_IN_BAR)).toHaveCount(0);

  const today = todayGroup(page);
  await expect(entryRow(today, "pedido original")).toHaveCount(1);
  await expect(entryRow(today, "pedido original")).toContainText(/00:00 – 00:01\s*0:01/);
  await expect(entryRow(today, "pedido editado")).toHaveCount(0);
});

test("reintentar un alta del diálogo del calendario cuya respuesta se perdió deja un solo bloque", async ({
  page,
  email,
  browser,
}) => {
  const description = "respuesta perdida en el diálogo";
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const blocks = entryBlocks(calendarRegion(page), description);

  // CAL-46: el diálogo sigue abierto con el aviso del alta y «Reintentar».
  const releaseRefreshes = await holdRefreshes(page, isCalendarPage);
  const stopLosing = await loseActionResponses(page, isCalendarPage);
  const dialog = await openAddDialog(page, description);
  const notice = await addFailingInDialog(dialog);
  await expectBlocksElsewhere(browser, email, lastWeek, description, 1);

  // El foco pasa a «Agregar» mientras el reintento viaja.
  await stopLosing();
  const releaseResponse = await holdActionResponses(page, isCalendarPage);
  await retryButton(notice).click();
  const add = dialogButton(dialog, "Agregar");
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute("aria-disabled", "true");

  // ADR 0007: la respuesta es la entrada del primer intento, que es la
  // mandada. El diálogo se cierra con el foco en el bloque.
  await withServerAction(page, async () => releaseResponse());
  releaseRefreshes();
  await expect(dialog).toBeHidden();
  await expect(blocks).toHaveCount(1);
  await expect(blocks).toBeFocused();

  // El id se renovó con el éxito: la misma alta otra vez es otra entrada. Se
  // abre con «Agregar entrada», porque la franja ya tiene un bloque.
  await openAddDialog(page, description);
  await withServerAction(page, () => dialogButton(dialog, "Agregar").click());
  await expect(dialog).toBeHidden();
  await expect(blocks).toHaveCount(2);
});

test("«Reintentar» del alta del diálogo manda el borrador actual", async ({ page }) => {
  const today = todayIn(PERSON_TIMEZONE);
  await openLastWeek(page, today);
  const region = calendarRegion(page);

  const restoreRequests = await dropActionRequests(page, isCalendarPage);
  const dialog = await openAddDialog(page, "A");
  const notice = await addFailingInDialog(dialog);

  // D2c-2 (a): el diálogo tiene un solo «Reintentar», el mismo de «Guardar»,
  // y manda lo que tiene a la vista.
  await dialogDescription(dialog).fill("B");
  await restoreRequests();
  await withServerAction(page, () => retryButton(notice).click());
  await expect(dialog).toBeHidden();
  await expect(entryBlocks(region, "B")).toHaveCount(1);
  await expect(entryBlocks(region, "A")).toHaveCount(0);
});

test("con el aviso del alta a la vista, un timer de otra pestaña, Detener y el cambio de modo no lo bajan ni duplican la entrada", async ({
  page,
  email,
  browser,
}) => {
  const description = "alta con un timer en el medio";
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await typeDraft(bar, description, "00:00", "00:01");

  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  const notice = await addFailing(page);
  const retry = retryButton(notice);

  // Otro dispositivo de la misma persona arranca un timer y ve la entrada del
  // primer intento.
  const otherPage = await openSecondTab(browser, email);
  await withServerAction(otherPage, () =>
    startTimer(otherPage, "timer de la otra pestaña"),
  );
  await expect(entryRow(todayGroup(otherPage), description)).toHaveCount(1);
  await otherPage.context().close();

  // TT-30: la barra pasa a timer y el aviso queda, con «Reintentar» inactivo.
  // En headless `bringToFront()` no dispara el evento, así que se despacha.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(notice).toBeVisible();
  await expect(retry).toBeDisabled();

  // m4: «Detener» baja sus avisos y no el del alta, que conserva su id. La
  // barra vuelve a manual con lo tecleado.
  await restoreResponses();
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Detener" }).click(),
  );
  await expect(addButton(bar)).toBeVisible();
  await expect(notice).toBeVisible();
  await expectDraft(bar, description, "00:00", "00:01");
  await expect(retry).toBeEnabled();

  // r2-2: el cambio de modo tampoco lo baja.
  await chooseMode(page, "timer");
  await expect(notice).toBeVisible();
  await expect(retry).toBeDisabled();
  await chooseMode(page, "manual");
  await expect(notice).toBeVisible();
  await expect(retry).toBeEnabled();

  // El reintento lleva el id pendiente y responde la entrada del primer
  // intento.
  await withServerAction(page, () => retry.click());
  await expect(notice).toHaveCount(0);
  await expect(replayedNotice(page, REPLAYED_IN_BAR)).toHaveCount(0);

  await page.reload();
  await expect(entryRow(todayGroup(page), description)).toHaveCount(1);
});

test("si la barra responde la entrada del primer intento y lo mandado era otra, lo tecleado queda con un aviso y el siguiente Agregar la crea", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  const add = addButton(bar);
  await typeDraft(bar, "primera", "00:00", "00:01");

  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  const notice = await addFailing(page);
  await expectRowsElsewhere(browser, email, "primera", 1);

  // m4: ir y volver de modo no baja el aviso; el id sigue pendiente.
  await chooseMode(page, "timer");
  await chooseMode(page, "manual");
  await expect(notice).toBeVisible();

  // r2-1: «Agregar» con otra entrada reusa el id pendiente y el servidor
  // responde la del primer intento. La barra no se limpia, el foco no se
  // mueve y el aviso informativo lo dice.
  await typeDraft(bar, "segunda", "00:01", "00:02");
  await restoreResponses();
  await withServerAction(page, () => add.click());
  const replayed = replayedNotice(page, REPLAYED_IN_BAR);
  await expect(replayed).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expectDraft(bar, "segunda", "00:01", "00:02");
  await expect(add).toBeFocused();

  // El id se renovó: el próximo «Agregar» crea la entrada.
  await withServerAction(page, () => add.click());
  await expectEmptyBar(bar);
  await expect(replayed).toHaveCount(0);

  releaseRefreshes();
  await page.reload();
  const today = todayGroup(page);
  await expect(entryRow(today, "primera")).toHaveCount(1);
  await expect(entryRow(today, "segunda")).toHaveCount(1);
});

test("si otra entrada con el id pendiente no llegó, reintentarla recibe la del primer intento y la barra la conserva con un aviso", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  const add = addButton(bar);
  await typeDraft(bar, "aplicada", "00:00", "00:01");

  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  await addFailing(page);
  await expectRowsElsewhere(browser, email, "aplicada", 1);

  // Con el aviso a la vista, «Agregar» con otra entrada reusa el id
  // pendiente, y ese pedido nunca llega: falla otra vez y el id sigue.
  await restoreResponses();
  const restoreRequests = await dropActionRequests(page, isTrackerPage);
  await typeDraft(bar, "no llegó", "00:01", "00:02");
  const notice = await addFailing(page);
  await expectRowsElsewhere(browser, email, "no llegó", 0);

  // «Reintentar» reenvía el pedido que falló, y el servidor responde la
  // entrada del primero. El pedido reenviado es igual al último que falló,
  // pero no a todos los que salieron con ese id: lo mandado no se guardó.
  await restoreRequests();
  const releaseResponse = await holdActionResponses(page, isTrackerPage);
  await retryButton(notice).click();
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute("aria-disabled", "true");
  await withServerAction(page, async () => releaseResponse());
  const replayed = replayedNotice(page, REPLAYED_IN_BAR);
  await expect(replayed).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expectDraft(bar, "no llegó", "00:01", "00:02");
  await expect(add).toBeFocused();

  // El id se renovó: el próximo «Agregar» crea la entrada.
  await withServerAction(page, () => add.click());
  await expectEmptyBar(bar);
  await expect(replayed).toHaveCount(0);

  releaseRefreshes();
  await page.reload();
  const today = todayGroup(page);
  await expect(entryRow(today, "aplicada")).toHaveCount(1);
  await expect(entryRow(today, "no llegó")).toHaveCount(1);
});

test("si el diálogo responde la entrada del primer intento y lo mandado era otra, sigue abierto con un aviso y el siguiente Agregar la crea", async ({
  page,
  email,
  browser,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const region = calendarRegion(page);

  const releaseRefreshes = await holdRefreshes(page, isCalendarPage);
  const stopLosing = await loseActionResponses(page, isCalendarPage);
  const dialog = await openAddDialog(page, "A");
  const notice = await addFailingInDialog(dialog);
  await expectBlocksElsewhere(browser, email, lastWeek, "A", 1);

  // r2-1 con D2c-2 (a): «Reintentar» manda «B» con el id pendiente y el
  // servidor responde «A». El diálogo sigue abierto con lo tecleado.
  await dialogDescription(dialog).fill("B");
  await stopLosing();
  await withServerAction(page, () => retryButton(notice).click());
  const add = dialogButton(dialog, "Agregar");
  await expect(replayedNotice(dialog, REPLAYED_IN_DIALOG)).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(dialogDescription(dialog)).toHaveValue("B");
  await expect(add).toBeFocused();

  // El id se renovó: «Agregar» crea «B» y cierra el diálogo.
  await withServerAction(page, () => add.click());
  await expect(dialog).toBeHidden();
  releaseRefreshes();
  await expect(entryBlocks(region, "A")).toHaveCount(1);
  await expect(entryBlocks(region, "B")).toHaveCount(1);
});

test("reintentar el mismo pedido cuando la entrada se editó en otra pestaña limpia la barra sin aviso", async ({
  page,
  email,
  browser,
}) => {
  const description = "pedido reenviado";
  const edited = "editada en otra pestaña";
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await typeDraft(bar, description, "00:00", "00:01");

  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  const notice = await addFailing(page);

  // Otro dispositivo ve la entrada del primer intento y le cambia la
  // descripción.
  const otherPage = await openSecondTab(browser, email);
  const otherToday = todayGroup(otherPage);
  await editDescriptionButton(otherToday, description).click();
  const field = descriptionInput(otherToday);
  await field.fill(edited);
  await withServerAction(otherPage, () => field.press("Enter"));
  await expect(editDescriptionButton(otherToday, edited)).toBeVisible();
  await otherPage.context().close();

  // r3-1: la respuesta trae la entrada editada, que no coincide con lo
  // mandado, pero el pedido es el mismo que falló: cuenta como mandada. La
  // barra se limpia y no hay aviso informativo, que diría algo falso.
  await restoreResponses();
  await withServerAction(page, () => retryButton(notice).click());
  await expectEmptyBar(bar);
  await expect(notice).toHaveCount(0);
  await expect(replayedNotice(page, REPLAYED_IN_BAR)).toHaveCount(0);

  releaseRefreshes();
  await page.reload();
  const today = todayGroup(page);
  await expect(entryRow(today, edited)).toHaveCount(1);
  await expect(entryRow(today, description)).toHaveCount(0);
});

import type { Browser, Locator, Page, Request } from "@playwright/test";

import {
  addDays,
  calendarDayName,
  dayKeyOf,
  dayLabel,
  monthsBetween,
  todayIn,
  weekStartOf,
  type CivilDay,
} from "./days";
import {
  holdActionResponses,
  holdRefreshes,
  loseActionResponses,
  openSecondTab,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import {
  bulkButton,
  bulkDeleteDialog,
  bulkEditDialog,
  bulkRegion,
  bulkStatus,
  chooseFormat,
  chooseMode,
  clockField,
  dateButton,
  dayCheckbox,
  deleteEntry,
  deleteEntryAndSettle,
  descriptionInput,
  editDescriptionButton,
  elapsedCounter,
  elapsedOf,
  entryCheckbox,
  entryRow,
  escapeRegExp,
  pickDate,
  setClock,
  startTimer,
  todayGroup,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos del slice 6: elegir entradas y editarlas o borrarlas en bloque
 * (TT-62, TT-63 sin proyectos, TT-64, ADR 0011, §7 del contrato). Cada
 * recorrido entra con una persona propia, con el formato de 24 h salvo el
 * último. Las entradas de hoy van de 00:00 a 00:01, que ya pasó a cualquier
 * hora de la corrida salvo durante su primer minuto.
 */

/** La zona por omisión de la persona (P-03): la que fija qué día es hoy. */
const PERSON_TIMEZONE = "America/Argentina/Buenos_Aires";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** TT-90: los títulos de los avisos de las operaciones en masa. */
const ENTRIES_NOT_EDITED = "No se pudieron editar las entradas.";
const ENTRIES_NOT_DELETED = "No se pudieron borrar las entradas.";

/** ADR 0011: el mensaje del pedido rechazado, arriba de la lista. */
const BULK_EDIT_REJECTED =
  "Ninguna entrada cambió: algunas de las elegidas no se pueden editar.";

/** Las causas de §4.5 que recorren estos tests: los textos de la fila. */
const MULTI_DAY_TIMES =
  "Esta entrada dura más de un día; sus horarios no se pueden editar acá.";
const NOT_FOUND = "Esa entrada ya no existe.";

function isTrackerPage(url: URL): boolean {
  return url.pathname === "/";
}

function isAction(request: Request): boolean {
  return request.headers()["next-action"] !== undefined;
}

/** El grupo de un día, por el rótulo exacto de su encabezado (TT-44). */
function dayGroup(page: Page, day: CivilDay, today: CivilDay): Locator {
  return page.getByRole("region", { name: dayLabel(day, today), exact: true });
}

/**
 * El mismo grupo detrás de un diálogo modal abierto, que deja todo lo de
 * afuera con `aria-hidden`. Sirve para leer su texto, no para usarlo.
 */
function dayGroupBehindDialog(page: Page, day: CivilDay, today: CivilDay): Locator {
  return page.getByRole("region", {
    name: dayLabel(day, today),
    exact: true,
    includeHidden: true,
  });
}

/** Las horas de una fila editable, un botón que abre el editor del horario. */
function timesButton(row: Locator, start: string, end: string): Locator {
  return row.getByRole("button", { name: `${start} – ${end} — editar el horario` });
}

/** Todas las filas con una descripción, en cualquier día. */
function entriesNamed(page: Page, description: string): Locator {
  return page.getByRole("listitem").filter({ hasText: description });
}

/** Un botón del diálogo abierto, por su nombre exacto. */
function dialogButton(dialog: Locator, name: string): Locator {
  return dialog.getByRole("button", { name, exact: true });
}

/** El aviso de falla de una operación en masa, por su título (TT-90). */
function bulkNotice(page: Page, title: string): Locator {
  return page.getByRole("alert").filter({ hasText: title });
}

/**
 * Inactivo por `aria-disabled` y nunca por `disabled`: un control con foco
 * que pasa a `disabled` lo pierde a `body` (§5.4).
 */
async function expectInactive(control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).not.toHaveAttribute("disabled");
}

async function expectActive(control: Locator): Promise<void> {
  await expect(control).not.toHaveAttribute("aria-disabled", "true");
  await expect(control).not.toHaveAttribute("disabled");
}

/**
 * Carga una entrada desde la barra manual, ya abierta, y espera a que el
 * servidor la haya escrito. No busca la fila: según la ventana, puede no
 * estar dibujada. La descripción vacía y la fecha de vuelta en hoy dicen que
 * la barra quedó lista para la siguiente.
 */
async function addEntry(
  page: Page,
  description: string,
  day: CivilDay,
  today: CivilDay,
  start: string,
  end: string,
): Promise<void> {
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  if (dayKeyOf(day) !== dayKeyOf(today)) {
    await pickDate(page, bar, day, today);
  }
  await setClock(bar, "Hora de inicio", start);
  await setClock(bar, "Hora de fin", end);
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(dateButton(bar)).toHaveText("Hoy");
}

/** Varias entradas de hoy, de 00:00 a 00:01, y sus filas a la vista. */
async function addTodayEntries(
  page: Page,
  today: CivilDay,
  descriptions: readonly string[],
): Promise<void> {
  for (const description of descriptions) {
    await addEntry(page, description, today, today, "00:00", "00:01");
  }
  for (const description of descriptions) {
    await expect(entryRow(todayGroup(page), description)).toBeVisible();
  }
}

/**
 * Abre el diálogo de edición desde la barra y espera el foco en
 * «Descripción», que es donde lo deja al abrir (§5.4).
 */
async function openBulkEdit(page: Page, title: string): Promise<Locator> {
  await bulkButton(page, "Editar").click();
  const dialog = bulkEditDialog(page);
  await expect(dialog).toHaveAccessibleName(title);
  await expect(descriptionField(dialog)).toBeFocused();
  return dialog;
}

function descriptionField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Descripción", exact: true });
}

/**
 * El selector de fecha del diálogo. Se nombra con su rótulo, «Fecha», y no
 * con el «Fecha de la entrada: …» de la barra y la fila (§5.2).
 */
function bulkDateButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: /^Fecha(?! de la entrada)/ });
}

/**
 * Elige un día en el selector de fecha del diálogo. Sin fecha elegida, el
 * calendario abre en el mes de hoy.
 */
async function chooseBulkDate(
  page: Page,
  dialog: Locator,
  today: CivilDay,
  target: CivilDay,
): Promise<void> {
  await bulkDateButton(dialog).click();
  const calendar = page.getByRole("grid");
  const months = monthsBetween(today, target);
  const step = page.getByRole("button", {
    name: months < 0 ? "Mes anterior" : "Mes siguiente",
  });
  for (let moved = 0; moved < Math.abs(months); moved += 1) {
    await step.click();
  }
  await calendar.getByRole("button", { name: calendarDayName(target) }).click();
  await expect(calendar).toBeHidden();
}

/** Abre el diálogo de borrado desde la barra y espera el foco en el campo. */
async function openBulkDelete(page: Page, title: string): Promise<Locator> {
  await bulkButton(page, "Borrar").click();
  const dialog = bulkDeleteDialog(page);
  await expect(dialog).toHaveAccessibleName(title);
  await expect(confirmField(dialog)).toBeFocused();
  return dialog;
}

function confirmField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Escribí BORRAR para confirmar" });
}

/**
 * Arranca un timer y espera a que la barra muestre la vista del servidor: el
 * contador que corre. Hasta que se aplica, la barra muestra la optimista, con
 * el contador quieto en cero.
 */
async function startTimerAndSettle(page: Page, description: string): Promise<void> {
  await startTimer(page, description);
  const counter = elapsedCounter(trackerBar(page));
  await expect.poll(() => elapsedOf(counter)).toBeGreaterThanOrEqual(1);
}

/**
 * Mueve el inicio del timer activo con el editor del contador, que se dibuja
 * en un portal. Al cerrarse el calendario el foco vuelve a su disparador, y
 * recién ahí se sigue con la hora.
 */
async function moveRunningStart(
  page: Page,
  day: CivilDay,
  today: CivilDay,
  time: string,
): Promise<void> {
  await page.getByRole("button", { name: "Editar la hora de inicio" }).click();
  const editor = page.getByRole("dialog", { name: "Inicio del timer" });
  await pickDate(page, editor, day, today);
  await expect(dateButton(editor)).toBeFocused();
  await editor.getByRole("textbox", { name: "Hora de inicio" }).fill(time);
  await page.keyboard.press("Tab");
  await withServerAction(page, () =>
    editor.getByRole("button", { name: "Guardar" }).click(),
  );
}

/** La URL lleva exactamente ese `desde` (ADR 0008). */
function withFrom(day: CivilDay): (url: URL) => boolean {
  return (url) => url.pathname === "/" && url.searchParams.get("desde") === dayKeyOf(day);
}

/**
 * Comprueba desde otra pestaña de la misma persona que el primer intento del
 * borrado se aplicó, como `expectAppliedElsewhere` de `start-retry.spec.ts`.
 * Sin esto, un pedido que no hubiera llegado haría pasar el recorrido sin
 * probar nada: el reintento sería el primer borrado. La entrada que queda
 * dice que la otra pestaña ya dibujó la lista.
 */
async function expectDeletedElsewhere(
  browser: Browser,
  email: string,
  kept: string,
  deleted: readonly string[],
): Promise<void> {
  const other = await openSecondTab(browser, email);
  await expect(entryRow(todayGroup(other), kept)).toBeVisible();
  for (const description of deleted) {
    await expect(entryRow(todayGroup(other), description)).toHaveCount(0);
  }
  await other.context().close();
}

test("elegir filas y días muestra la cantidad, el día mixto y la barra que se va", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const yesterday = addDays(today, -1);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "de ayer", yesterday, today, "09:00", "10:00");
  await addTodayEntries(page, today, ["primera de hoy", "segunda de hoy"]);

  const todays = todayGroup(page);
  const first = entryCheckbox(todays, "primera de hoy", "00:00 – 00:01");
  const second = entryCheckbox(todays, "segunda de hoy", "00:00 – 00:01");
  const day = dayCheckbox(todays, "Hoy");
  const yesterdays = dayCheckbox(dayGroup(page, yesterday, today), "Ayer");

  // Criterio 1: sin selección no hay barra; la casilla está siempre visible.
  await expect(first).toBeVisible();
  await expect(first).not.toBeChecked();
  await expect(bulkButton(page, "Quitar selección")).toHaveCount(0);

  await first.click();
  await expect(first).toBeChecked();
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");
  await expect(bulkButton(page, "Editar")).toBeVisible();
  await expect(bulkButton(page, "Borrar")).toBeVisible();
  await expect(bulkButton(page, "Quitar selección")).toBeVisible();

  // Criterio 2: con una de dos elegida el día está mixto, y apretarlo elige
  // la que falta.
  await expect(day).toHaveAttribute("aria-checked", "mixed");
  await day.click();
  await expect(day).toHaveAttribute("aria-checked", "true");
  await expect(second).toBeChecked();
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");
  // El día de ayer no se tocó.
  await expect(yesterdays).toHaveAttribute("aria-checked", "false");

  await first.click();
  await expect(day).toHaveAttribute("aria-checked", "mixed");
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");

  // Soltar la última saca la barra.
  await second.click();
  await expect(day).toHaveAttribute("aria-checked", "false");
  await expect(bulkButton(page, "Quitar selección")).toHaveCount(0);
  await expect(bulkStatus(page)).not.toContainText("seleccionada");

  // Apretado vacío elige todas; apretado lleno las suelta.
  await day.click();
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");
  await day.click();
  await expect(first).not.toBeChecked();
  await expect(second).not.toBeChecked();
  await expect(bulkButton(page, "Quitar selección")).toHaveCount(0);
});

test("editar la descripción de tres entradas las cambia a todas y deja el foco en la región", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const yesterday = addDays(today, -1);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "vieja de ayer", yesterday, today, "09:00", "10:00");
  await addTodayEntries(page, today, ["vieja uno", "vieja dos"]);

  await dayCheckbox(todayGroup(page), "Hoy").click();
  await entryCheckbox(
    dayGroup(page, yesterday, today),
    "vieja de ayer",
    "09:00 – 10:00",
  ).click();
  await expect(bulkStatus(page)).toHaveText("3 entradas seleccionadas");

  // Criterio 19: Esc cierra el diálogo y devuelve el foco a «Editar».
  let dialog = await openBulkEdit(page, "Editar 3 entradas");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(bulkButton(page, "Editar")).toBeFocused();

  // §5.2: los campos vacíos, la ayuda, y «Guardar» inactivo sin cambios.
  dialog = await openBulkEdit(page, "Editar 3 entradas");
  await expect(dialog.getByText("Lo que dejes vacío no cambia.")).toBeVisible();
  await expect(descriptionField(dialog)).toHaveValue("");
  await expect(clockField(dialog, "Hora de inicio")).toHaveValue("");
  await expect(clockField(dialog, "Hora de fin")).toHaveValue("");
  await expect(bulkDateButton(dialog)).toContainText("Sin cambios");
  const save = dialogButton(dialog, "Guardar");
  await expectInactive(save);

  await descriptionField(dialog).fill("nombre en bloque");
  await expectActive(save);
  await withServerAction(page, () => save.click());

  // Criterio 6: las tres con la descripción nueva, en sus dos días.
  await expect(dialog).toBeHidden();
  await expect(entriesNamed(page, "nombre en bloque")).toHaveCount(3);
  await expect(editDescriptionButton(todayGroup(page), "nombre en bloque")).toHaveCount(
    2,
  );
  await expect(
    editDescriptionButton(dayGroup(page, yesterday, today), "nombre en bloque"),
  ).toBeVisible();
  await expect(entriesNamed(page, "vieja")).toHaveCount(0);

  // Criterio 19: la selección se vació, la barra se fue y el foco quedó en
  // la región, que anuncia el resultado.
  await expect(bulkButton(page, "Quitar selección")).toHaveCount(0);
  await expect(bulkRegion(page)).toBeFocused();
  await expect(bulkStatus(page)).toHaveText("Se editaron 3 entradas.");
});

test("llevar dos entradas a hace cinco semanas extiende la lista hasta esa semana", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const target = addDays(weekStartOf(today), -33);

  /*
   * Una entrada se queda hoy: si las dos movidas fueran las únicas, la
   * ventana por omisión las seguiría sola hasta su día y no habría nada que
   * extender.
   */
  await page.goto("/");
  await chooseMode(page, "manual");
  await addTodayEntries(page, today, ["se queda hoy", "viaja uno", "viaja dos"]);

  const todays = todayGroup(page);
  await entryCheckbox(todays, "viaja uno", "00:00 – 00:01").click();
  await entryCheckbox(todays, "viaja dos", "00:00 – 00:01").click();
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");

  const dialog = await openBulkEdit(page, "Editar 2 entradas");
  await chooseBulkDate(page, dialog, today, target);
  await expect(dialogButton(dialog, "Quitar la fecha")).toBeVisible();
  await expect(bulkDateButton(dialog)).not.toContainText("Sin cambios");
  await withServerAction(page, () => dialogButton(dialog, "Guardar").click());

  // Criterio 13 y P-15: la URL lleva la semana del día nuevo y las dos están
  // en su día, con sus mismas horas. La de hoy sigue en hoy.
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(withFrom(weekStartOf(target)));
  const moved = dayGroup(page, target, today);
  await expect(timesButton(entryRow(moved, "viaja uno"), "00:00", "00:01")).toBeVisible();
  await expect(timesButton(entryRow(moved, "viaja dos"), "00:00", "00:01")).toBeVisible();
  await expect(entryRow(todayGroup(page), "viaja")).toHaveCount(0);
  await expect(entryRow(todayGroup(page), "se queda hoy")).toBeVisible();
  await expect(bulkStatus(page)).toHaveText("Se editaron 2 entradas.");
});

test("una entrada que no admite el cambio frena todo, y sin ella el cambio se aplica al resto", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const yesterday = addDays(today, -1);
  const twoDaysAgo = addDays(today, -2);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "de anteayer", twoDaysAgo, today, "00:10", "00:20");

  // Un timer que empezó ayer a las 00:00 y se detiene hoy: una entrada de más
  // de un día, cuyos horarios no se editan (TT-110).
  await chooseMode(page, "timer");
  await startTimerAndSettle(page, "más de un día");
  await moveRunningStart(page, yesterday, today, "00:00");
  const bar = trackerBar(page);
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Detener" }).click(),
  );
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  const yesterdays = dayGroup(page, yesterday, today);
  await expect(entryRow(yesterdays, "más de un día")).toBeVisible();

  const older = dayGroup(page, twoDaysAgo, today);
  await entryCheckbox(yesterdays, "más de un día", /00:00 – \d{2}:\d{2}/).click();
  await entryCheckbox(older, "de anteayer", "00:10 – 00:20").click();
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");

  /*
   * 00:15 es distinto del inicio de las dos, así que ninguna queda con su
   * trío sin cambios y las dos se evalúan (§4.3). El marcador de la hora
   * sigue el formato de 24 h de la persona.
   */
  const dialog = await openBulkEdit(page, "Editar 2 entradas");
  const start = clockField(dialog, "Hora de inicio");
  await expect(start).toHaveAttribute("placeholder", "hh:mm");
  await start.fill("00:15");
  await page.keyboard.press("Tab");
  const save = dialogButton(dialog, "Guardar");
  await withServerAction(page, () => save.click());

  // Criterios 10 y 18: el aviso nombra la entrada rechazada con su día, sus
  // horas y la causa. El diálogo sigue abierto.
  const notice = bulkNotice(page, ENTRIES_NOT_EDITED);
  await expect(notice).toContainText(BULK_EDIT_REJECTED);
  await expect(notice).toContainText(
    new RegExp(
      `${escapeRegExp("más de un día, Ayer, 00:00 – ")}\\d{2}:\\d{2}: ${escapeRegExp(MULTI_DAY_TIMES)}`,
    ),
  );
  await expect(notice).not.toContainText("de anteayer");
  await expect(dialog).toBeVisible();

  // Todo o nada: la de anteayer tampoco cambió.
  await expect(dayGroupBehindDialog(page, twoDaysAgo, today)).toContainText(
    "00:10 – 00:20",
  );
  await expect(dayGroupBehindDialog(page, yesterday, today)).toContainText("00:00 – ");

  // Sacar la rechazada deja el foco en «Guardar» y baja el aviso (§5.4).
  await notice
    .getByRole("button", { name: "Quitar esas entradas de la selección", exact: true })
    .click();
  await expect(notice).toBeHidden();
  await expect(save).toBeFocused();
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");

  await withServerAction(page, () => save.click());
  await expect(dialog).toBeHidden();
  await expect(
    timesButton(entryRow(older, "de anteayer"), "00:15", "00:20"),
  ).toBeVisible();
  await expect(entryRow(yesterdays, "más de un día")).toContainText("00:00 – ");
  await expect(bulkStatus(page)).toHaveText("Se editó 1 entrada.");
});

test("borrar dos entradas confirma con la palabra, y el borrado de una fila sigue llevando el foco a su día", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addTodayEntries(page, today, ["se borra uno", "se borra dos", "se borra sola"]);

  const todays = todayGroup(page);
  await entryCheckbox(todays, "se borra uno", "00:00 – 00:01").click();
  await entryCheckbox(todays, "se borra dos", "00:00 – 00:01").click();

  // Criterio 12: «Borrar» inactivo hasta la palabra, sin distinguir
  // mayúsculas.
  const dialog = await openBulkDelete(page, "¿Borrar 2 entradas?");
  await expect(dialog).toContainText("No se puede deshacer.");
  const confirm = dialogButton(dialog, "Borrar");
  await expectInactive(confirm);
  const field = confirmField(dialog);
  await field.fill("borra");
  await expectInactive(confirm);
  await field.fill("borrar");
  await expectActive(confirm);

  /*
   * Enter en el campo confirma: el diálogo se cierra en el acto y el borrado
   * viaja con el foco en la región (§5.4). La respuesta se retiene para
   * mirarlo mientras viaja: al terminar, la región toma el foco de todos
   * modos, y un encabezado de día que lo hubiera robado en el camino ya no se
   * vería.
   */
  const releaseDelete = await holdActionResponses(page, isTrackerPage);
  const deleted = page.waitForResponse((response) => isAction(response.request()));
  await field.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(entryRow(todays, "se borra uno")).toHaveCount(0);
  await expect(entryRow(todays, "se borra dos")).toHaveCount(0);
  await expect(bulkStatus(page)).toHaveText("Borrando…");
  // Criterio 19: la región, no el encabezado del día, que sigue en pantalla.
  await expect(bulkRegion(page)).toBeFocused();
  releaseDelete();
  expect((await deleted).ok()).toBeTruthy();

  await expect(bulkStatus(page)).toHaveText("Se borraron 2 entradas.");
  await expect(bulkRegion(page)).toBeFocused();
  await expect(entryRow(todays, "se borra sola")).toBeVisible();

  /*
   * El borrado de una fila, que hoy no tiene e2e de foco: el encabezado de su
   * día toma el foco mientras viaja. Es la última del día, así que con la
   * respuesta el grupo se va: se la retiene para mirar el foco antes.
   */
  const release = await holdActionResponses(page, isTrackerPage);
  const settled = page.waitForResponse((response) => isAction(response.request()));
  await deleteEntry(page, "se borra sola");
  await expect(todays.getByRole("heading", { name: "Hoy", exact: true })).toBeFocused();
  release();
  await settled;
  await expect(todayGroup(page)).toHaveCount(0);
});

test("un borrado cuya respuesta se perdió se reintenta y termina bien, con el foco en la región", async ({
  page,
  email,
  browser,
}) => {
  const today = todayIn(PERSON_TIMEZONE);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addTodayEntries(page, today, ["testigo", "perdida uno", "perdida dos"]);

  const todays = todayGroup(page);
  const first = entryCheckbox(todays, "perdida uno", "00:00 – 00:01");
  const second = entryCheckbox(todays, "perdida dos", "00:00 – 00:01");
  await first.click();
  await second.click();

  // El pedido llega y se aplica; lo que se pierde es la respuesta. Las
  // revalidaciones se retienen para que nada traiga lo borrado antes del
  // reintento.
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);

  const dialog = await openBulkDelete(page, "¿Borrar 2 entradas?");
  await confirmField(dialog).fill("BORRAR");
  await dialogButton(dialog, "Borrar").click();

  // TT-89 y TT-90: el aviso vive en la región, las filas vuelven y la
  // selección se conserva.
  const notice = bulkRegion(page)
    .getByRole("alert")
    .filter({ hasText: ENTRIES_NOT_DELETED });
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = notice.getByRole("button", { name: "Reintentar" });
  await expect(retry).toBeVisible();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");

  await expectDeletedElsewhere(browser, email, "testigo", ["perdida uno", "perdida dos"]);

  /*
   * Criterios 14 y 19: «Reintentar» se va con su aviso, y el foco tiene que
   * quedar en la región y no en `body`. Se mira con la respuesta retenida:
   * al terminar bien, la región toma el foco de todos modos.
   */
  await restoreResponses();
  const releaseRetry = await holdActionResponses(page, isTrackerPage);
  const retried = page.waitForResponse((response) => isAction(response.request()));
  await retry.click();
  await expect(bulkRegion(page)).toBeFocused();
  releaseRefreshes();
  releaseRetry();
  expect((await retried).ok()).toBeTruthy();
  await expect(bulkStatus(page)).toHaveText("Se borraron 2 entradas.");
  await expect(bulkNotice(page, ENTRIES_NOT_DELETED)).toHaveCount(0);
  await expect(entryRow(todays, "perdida")).toHaveCount(0);
  await expect(entryRow(todays, "testigo")).toBeVisible();
  await expect(bulkRegion(page)).toBeFocused();
});

test("la selección sobrevive a Cargar más, y lo que Atrás deja de mostrar sale y no vuelve", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const fiveWeeksAgo = addDays(weekStartOf(today), -35);
  const oldDay = addDays(fiveWeeksAgo, 1);

  // La vieja se carga con la ventana ya extendida, así el alta no navega; sin
  // `desde`, la de hoy la deja fuera de la ventana.
  await page.goto(`/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await chooseMode(page, "manual");
  await addEntry(page, "de hace cinco semanas", oldDay, today, "09:00", "10:00");
  await addEntry(page, "elegida de hoy", today, today, "00:00", "00:01");
  await page.goto("/");

  const chosen = entryCheckbox(todayGroup(page), "elegida de hoy", "00:00 – 00:01");
  await chosen.click();
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");

  const loadMore = page.getByRole("link", { name: "Cargar más", exact: true });
  await expect(loadMore).toHaveAttribute("href", `/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await loadMore.click();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  const old = dayGroup(page, oldDay, today);
  await expect(entryRow(old, "de hace cinco semanas")).toBeVisible();

  // Criterio 3: la navegación no desmonta la lista, y la selección sigue.
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");
  await expect(chosen).toBeChecked();
  const oldCheckbox = entryCheckbox(old, "de hace cinco semanas", "09:00 – 10:00");
  await expect(oldCheckbox).not.toBeChecked();

  /*
   * §5.3: «Atrás» achica la ventana y la vieja deja de verse, así que sale de
   * la selección. Al volver a verse con «Adelante» no vuelve elegida: nunca
   * se edita ni se borra una fila que no estaba en pantalla.
   */
  await oldCheckbox.click();
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");
  await page.goBack();
  await expect(page).toHaveURL((url) => url.searchParams.get("desde") === null);
  await expect(old).toHaveCount(0);
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");
  await page.goForward();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(oldCheckbox).toBeVisible();
  await expect(oldCheckbox).not.toBeChecked();
  await expect(chosen).toBeChecked();
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");
});

test("una entrada borrada en otra pestaña frena la edición, sale de la selección y el resto se edita", async ({
  page,
  email,
  browser,
}) => {
  const today = todayIn(PERSON_TIMEZONE);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addTodayEntries(page, today, ["sigue en la lista", "se borra afuera"]);

  await dayCheckbox(todayGroup(page), "Hoy").click();
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");

  // Otra pestaña de la misma persona borra una. Esta no se entera.
  const other = await openSecondTab(browser, email);
  await deleteEntryAndSettle(other, "se borra afuera");
  await expect(entryRow(todayGroup(other), "se borra afuera")).toHaveCount(0);
  await other.context().close();

  const dialog = await openBulkEdit(page, "Editar 2 entradas");
  await descriptionField(dialog).fill("descripción en bloque");
  const save = dialogButton(dialog, "Guardar");
  await withServerAction(page, () => save.click());

  // Criterio 18: el aviso nombra la que ya no existe como la mostraba la
  // pantalla al mandar (ADR 0011). La otra no cambió.
  const notice = bulkNotice(page, ENTRIES_NOT_EDITED);
  await expect(notice).toContainText(BULK_EDIT_REJECTED);
  await expect(notice).toContainText(`se borra afuera, Hoy, 00:00 – 00:01: ${NOT_FOUND}`);
  await expect(dialog).toBeVisible();

  // Criterio 3: la revalidación saca la borrada de la lista, y de la
  // selección.
  await expect(bulkStatus(page)).toHaveText("1 entrada seleccionada");
  const behind = dayGroupBehindDialog(page, today, today);
  await expect(behind).toContainText("sigue en la lista");
  await expect(behind).not.toContainText("se borra afuera");
  await expect(behind).not.toContainText("descripción en bloque");

  // Guardar de nuevo aplica el cambio a la que queda.
  await withServerAction(page, () => save.click());
  await expect(dialog).toBeHidden();
  await expect(
    editDescriptionButton(todayGroup(page), "descripción en bloque"),
  ).toBeVisible();
  await expect(entryRow(todayGroup(page), "sigue en la lista")).toHaveCount(0);
  await expect(bulkStatus(page)).toHaveText("Se editó 1 entrada.");
});

test("con 12 horas el diálogo acepta «1:15 PM» y la entrada queda de 1:15 PM a 2:00 PM", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const twoDaysAgo = addDays(today, -2);

  await page.goto("/perfil");
  await chooseFormat(page, "Formato de hora", "12 horas");
  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "en doce horas", twoDaysAgo, today, "1:00 PM", "2:00 PM");

  const group = dayGroup(page, twoDaysAgo, today);
  await entryCheckbox(group, "en doce horas", "1:00 PM – 2:00 PM").click();

  // PF-13 y PF-14: el marcador sigue el formato de la persona.
  const dialog = await openBulkEdit(page, "Editar 1 entrada");
  const start = clockField(dialog, "Hora de inicio");
  await expect(start).toHaveAttribute("placeholder", "h:mm AM");
  await expect(clockField(dialog, "Hora de fin")).toHaveAttribute(
    "placeholder",
    "h:mm AM",
  );

  /*
   * Criterio 22: Enter en el campo de hora interpreta lo tecleado y guarda en
   * el mismo evento (§5.4), y la action recibe la hora canónica de 24 h.
   */
  await start.fill("1:15 PM");
  const sent = page.waitForRequest(isAction);
  await withServerAction(page, () => start.press("Enter"));
  expect((await sent).postData()).toContain('"start":"13:15"');

  await expect(dialog).toBeHidden();
  await expect(
    timesButton(entryRow(group, "en doce horas"), "1:15 PM", "2:00 PM"),
  ).toBeVisible();
  await expect(bulkStatus(page)).toHaveText("Se editó 1 entrada.");
});

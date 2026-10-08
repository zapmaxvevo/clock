import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  dialogActions,
  dialogButton,
  dialogClock,
  dialogDescription,
  dialogNotice,
  PERSON_TIMEZONE,
  pickDialogDay,
} from "./calendar-page";
import { seedPersonEntries, seedProject } from "./database";
import { addDays, dayKeyOf, todayIn, type CivilDay } from "./days";
import {
  dropActionRequests,
  holdActionResponses,
  holdRefreshes,
  isAction,
  loseActionResponses,
  openSecondTab,
  recordActions,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import {
  addRowButton,
  CELL_NEEDS_ENTRY_EDIT,
  CELL_NOT_SAVED,
  cellDetailDialog,
  cellDetailTitle,
  cellField,
  cellMenuButton,
  cellMenuItem,
  cellName,
  coveredCellField,
  dayTotal,
  deleteEntryConfirm,
  detailEntryButton,
  EMPTY_WEEK,
  entryEditor,
  holdCellWrites,
  isCellWriteFor,
  isTimesheetPage,
  lastWeekOf,
  NETWORK_FAILURE,
  openTimesheetWeek,
  openTrackerFrom,
  rowTotal,
  screenNotice,
  timesheetRow,
  timesheetTable,
  trackerDay,
  trackerEntries,
  trackerEntry,
  weekTotal,
  writeCell,
} from "./timesheet-page";
import { uniqueSuffix } from "./tracker-page";

/**
 * Recorridos del slice 13b: el menú y el detalle de una celda de la planilla
 * (§7 del contrato, «Recorridos obligatorios de `e2e/timesheet-detail.spec.ts`»,
 * con A2, A7, A14 y A16 de sus correcciones). Cada recorrido entra con una
 * persona propia y sus proyectos llevan un sufijo propio; las entradas se
 * siembran por base, porque lo que se prueba es el detalle y no cómo se
 * cargan. Van en la semana anterior, donde ninguna hora queda en el futuro.
 * Una fila del servidor que se queda sin entradas sale con la foto (§5.6):
 * donde un recorrido afirma el foco en el campo de una celda, la fila lleva
 * otra entrada sembrada en otro día. Toda persona nueva tiene el lunes como
 * primer día de la semana (PF-16); lo esperado se calcula con `days.ts`.
 */

/** TS-83 y TT-90: el título del aviso de un guardado del detalle. */
const ENTRY_NOT_SAVED = "No se pudo guardar la entrada.";

/** TS-35 y TT-89: el título del aviso de un borrado del detalle. */
const ENTRY_NOT_DELETED = "No se pudo borrar la entrada.";

/** TT-80: la entrada ya no existe. */
const ENTRY_GONE = "Esa entrada ya no existe.";

/** Hoy en la zona por omisión de la persona, que es la que corta los días. */
function today(): CivilDay {
  return todayIn(PERSON_TIMEZONE);
}

/** Un proyecto público sin cliente, con el sufijo del recorrido. */
async function seedNamedProject(label: string): Promise<string> {
  const name = `${label} ${uniqueSuffix()}`;
  await seedProject({ name });
  return name;
}

/** «Cerrar» al pie de la lista (§5.2). */
function closeListButton(list: Locator): Locator {
  return list.getByRole("button", { name: "Cerrar", exact: true });
}

function retryButton(notice: Locator): Locator {
  return notice.getByRole("button", { name: "Reintentar", exact: true });
}

/** El disparador está activo: la foto ya trae todo lo que la celda pidió (D13b-5). */
async function expectMenuReady(trigger: Locator): Promise<void> {
  await expect(trigger).not.toHaveAttribute("aria-disabled", "true");
}

/** Abre el menú de una celda con el teclado, desde el disparador. */
async function openCellMenu(trigger: Locator): Promise<void> {
  await expectMenuReady(trigger);
  await trigger.focus();
  await trigger.press("Enter");
}

/** `upper` termina antes de que empiece `lower`: el aviso va arriba de los ítems (§5.2). */
async function expectAbove(upper: Locator, lower: Locator): Promise<void> {
  const top = await boxOf(upper);
  const bottom = await boxOf(lower);
  expect(top.y + top.height).toBeLessThanOrEqual(bottom.y);
}

/**
 * Las entradas de una celda con varias, sembradas como en el 13: «a» de
 * 10:00 a 11:00 y «b» de 12:00 a 13:00, `1:00` cada una y la celda en `2:00`.
 * Devuelve el campo de la celda ya dibujado con ese valor.
 */
async function openCellWithTwo(
  page: Page,
  email: string,
  project: string,
  week: CivilDay,
  day: CivilDay,
  now: CivilDay,
): Promise<Locator> {
  await openTimesheetWeek(page, week, now);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day, start: "10:00", end: "11:00", project },
    { description: "b", day, start: "12:00", end: "13:00", project },
  ]);
  await openTimesheetWeek(page, week, now);
  const field = cellField(page, project, day, now);
  await expect(field).toHaveValue("2:00");
  return field;
}

test("el menú de una celda con una entrada lleva al editor, que guarda todo junto", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Menú");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  const thursday = addDays(week, 3);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "", day: tuesday, start: "09:00", end: "10:30", project },
    { description: "", day: thursday, start: "14:00", end: "15:00", project },
  ]);
  await openTimesheetWeek(page, week, day);

  // TS-99: Tab desde el campo del martes lleva a su menú.
  const field = cellField(page, project, tuesday, day);
  const trigger = cellMenuButton(page, cellName(project, tuesday, day));
  await expect(field).toHaveValue("1:30");
  await field.focus();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();

  // TS-40, D13b-6: con una entrada, «Editar» y «Borrar», sin «Ver detalle».
  await page.keyboard.press("Enter");
  await expect(cellMenuItem(page, "Editar")).toBeVisible();
  await expect(cellMenuItem(page, "Borrar")).toBeVisible();
  await expect(cellMenuItem(page, "Ver detalle")).toHaveCount(0);

  // TS-41, D13b-7: el editor del calendario, con el foco en la descripción;
  // su menú ofrece «Borrar» y no «Duplicar».
  await cellMenuItem(page, "Editar").click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await expect(dialogDescription(editor)).toHaveValue("");
  await expect(dialogClock(editor, "Hora de inicio")).toHaveValue("09:00");
  await expect(dialogClock(editor, "Hora de fin")).toHaveValue("10:30");
  const editorMenu = dialogActions(editor, "Sin descripción");
  await editorMenu.click();
  await expect(page.getByRole("menuitem", { name: "Borrar", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicar", exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await expect(editor).toBeVisible();

  // «Guardar» manda todo junto (ADR 0013): el editor se cierra y el foco va
  // al campo del martes, que muestra la foto con el cambio.
  await dialogDescription(editor).fill("Diseño");
  await dialogClock(editor, "Hora de fin").fill("11:00");
  await dialogClock(editor, "Hora de fin").press("Tab");
  await withServerAction(page, () => dialogButton(editor, "Guardar").click());
  await expect(editor).toBeHidden();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("2:00");
  await expect(dayTotal(page, week, tuesday)).toHaveText("2:00");
  await expect(rowTotal(page, project)).toHaveText("3:00");
  await expect(weekTotal(page)).toHaveText("3:00");

  // §5.6: Esc en el editor abierto desde el menú devuelve el foco al disparador.
  await openCellMenu(trigger);
  await cellMenuItem(page, "Editar").click();
  await expect(dialogDescription(editor)).toBeFocused();
  await expect(dialogDescription(editor)).toHaveValue("Diseño");
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(trigger).toBeFocused();

  await openTrackerFrom(page, week);
  const group = trackerDay(page, tuesday, day);
  await expect(trackerEntries(group, "Diseño")).toHaveCount(1);
  await expect(trackerEntry(group, "09:00 – 11:00", "Diseño")).toBeVisible();
});

test("«Borrar» desde el menú confirma, vacía la celda, y sin otra entrada la fila sale", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Borrar");
  const other = await seedNamedProject("Otra");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  const thursday = addDays(week, 3);
  const friday = addDays(week, 4);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "", day: tuesday, start: "09:00", end: "10:30", project },
    { description: "", day: thursday, start: "14:00", end: "15:00", project },
    { description: "", day: friday, start: "09:00", end: "10:00", project: other },
  ]);
  await openTimesheetWeek(page, week, day);

  // TS-35, TT-61: la confirmación nombra la entrada y su horario; «Cancelar»
  // devuelve el foco al disparador.
  const field = cellField(page, project, tuesday, day);
  const trigger = cellMenuButton(page, cellName(project, tuesday, day));
  await expect(field).toHaveValue("1:30");
  await openCellMenu(trigger);
  await cellMenuItem(page, "Borrar").click();
  const confirm = deleteEntryConfirm(page);
  await expect(confirm).toContainText(
    "Se va a borrar «Sin descripción», de 09:00 a 10:30. No se puede deshacer.",
  );
  await expect(
    confirm.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(trigger).toBeFocused();

  // Confirmar: la celda queda vacía, sin menú, con el foco en su campo; el
  // total de la fila es el del jueves.
  await openCellMenu(trigger);
  await cellMenuItem(page, "Borrar").click();
  await withServerAction(page, () =>
    deleteEntryConfirm(page).getByRole("button", { name: "Borrar", exact: true }).click(),
  );
  await expect(field).toHaveValue("");
  await expect(trigger).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(rowTotal(page, project)).toHaveText("1:00");

  // §5.6, A2: la única entrada de una fila del servidor se va con la fila, y
  // el foco pasa a «Añadir nueva fila». Con la respuesta retenida, al
  // cerrarse la confirmación el foco está en el campo de la celda, ocupado;
  // sin retenerla, la foto puede llegar antes de que el diálogo termine de
  // cerrarse y el recorrido no probaría que el foco espera la foto.
  const otherField = cellField(page, other, friday, day);
  await openCellMenu(cellMenuButton(page, cellName(other, friday, day)));
  await cellMenuItem(page, "Borrar").click();
  const release = await holdActionResponses(page, isTimesheetPage);
  const answered = page.waitForResponse((response) => isAction(response.request()));
  await deleteEntryConfirm(page)
    .getByRole("button", { name: "Borrar", exact: true })
    .click();
  await expect(deleteEntryConfirm(page)).toBeHidden();
  await expect(otherField).toBeFocused();
  await expect(otherField).toHaveAttribute("aria-busy", "true");
  release();
  expect((await answered).ok()).toBe(true);
  await expect(timesheetRow(page, other)).toHaveCount(0);
  await expect(addRowButton(page)).toBeFocused();
  await expect(timesheetRow(page, project)).toBeVisible();
});

test("una celda con varias abre la lista, que edita y borra cada entrada y sigue a la foto", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Varias");
  const day = today();
  const week = lastWeekOf(day);
  const wednesday = addDays(week, 2);
  const cell = cellName(project, wednesday, day);
  await openCellWithTwo(page, email, project, week, wednesday, day);

  // P-14, D13b-6: con varias, solo «Ver detalle».
  const trigger = cellMenuButton(page, cell);
  await openCellMenu(trigger);
  await expect(cellMenuItem(page, "Ver detalle")).toBeVisible();
  await expect(cellMenuItem(page, "Editar")).toHaveCount(0);
  await expect(cellMenuItem(page, "Borrar")).toHaveCount(0);

  // TS-42: la lista, con el foco en su título, y las dos entradas en orden,
  // con su horario y su duración.
  await cellMenuItem(page, "Ver detalle").click();
  const list = cellDetailDialog(page, cell);
  const title = cellDetailTitle(list, cell);
  await expect(title).toBeFocused();
  const items = list.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).getByText("a", { exact: true })).toBeVisible();
  await expect(items.nth(0)).toContainText("10:00 – 11:00");
  await expect(items.nth(0).getByText("1:00", { exact: true })).toBeVisible();
  await expect(items.nth(1).getByText("b", { exact: true })).toBeVisible();
  await expect(items.nth(1)).toContainText("12:00 – 13:00");
  await expect(items.nth(1).getByText("1:00", { exact: true })).toBeVisible();
  for (const [index, entry, span] of [
    [0, "a", "de 10:00 a 11:00"],
    [1, "b", "de 12:00 a 13:00"],
  ] as const) {
    await expect(
      detailEntryButton(items.nth(index), "Editar", entry, span),
    ).toBeVisible();
    await expect(
      detailEntryButton(items.nth(index), "Borrar", entry, span),
    ).toBeVisible();
  }

  // D13b-2: «Editar» abre el editor encima; al guardar, el foco vuelve a su
  // «Editar», y la lista y la celda siguen a la foto.
  await detailEntryButton(list, "Editar", "b", "de 12:00 a 13:00").click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await expect(dialogDescription(editor)).toHaveValue("b");
  await dialogClock(editor, "Hora de fin").fill("13:30");
  await dialogClock(editor, "Hora de fin").press("Tab");
  await withServerAction(page, () => dialogButton(editor, "Guardar").click());
  await expect(editor).toBeHidden();
  await expect(list).toBeVisible();
  await expect(detailEntryButton(list, "Editar", "b", "de 12:00 a 13:30")).toBeFocused();
  await expect(items.nth(1).getByText("1:30", { exact: true })).toBeVisible();
  await expect(coveredCellField(page, project, wednesday, day)).toHaveValue("2:30");

  // Borrar «a» desde la lista: sale de ella y el foco pasa al título.
  await detailEntryButton(list, "Borrar", "a", "de 10:00 a 11:00").click();
  await withServerAction(page, () =>
    deleteEntryConfirm(page).getByRole("button", { name: "Borrar", exact: true }).click(),
  );
  await expect(items).toHaveCount(1);
  await expect(detailEntryButton(list, "Editar", "a", "de 10:00 a 11:00")).toHaveCount(0);
  await expect(detailEntryButton(list, "Editar", "b", "de 12:00 a 13:30")).toBeVisible();
  await expect(title).toBeFocused();

  // «Cerrar» devuelve el foco al disparador; con una entrada, el menú ofrece
  // «Editar» y «Borrar».
  await closeListButton(list).click();
  await expect(list).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(cellField(page, project, wednesday, day)).toHaveValue("1:30");
  await openCellMenu(trigger);
  await expect(cellMenuItem(page, "Editar")).toBeVisible();
  await expect(cellMenuItem(page, "Borrar")).toBeVisible();
  await expect(cellMenuItem(page, "Ver detalle")).toHaveCount(0);
});

test("una celda que la grilla no puede escribir manda al detalle, y desde ahí se corrige", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Detalle TS-79");
  const day = today();
  const week = lastWeekOf(day);
  const wednesday = addDays(week, 2);
  const cell = cellName(project, wednesday, day);
  const field = await openCellWithTwo(page, email, project, week, wednesday, day);

  // TS-79: «b» quedaría sin duración. El aviso manda al detalle.
  await writeCell(page, field, "1:00");
  await expect(screenNotice(page, CELL_NOT_SAVED)).toContainText(CELL_NEEDS_ENTRY_EDIT);
  await expect(field).toHaveValue("2:00");

  // Desde «Ver detalle», acortar «b» a 12:15 deja la celda en 1:15.
  await openCellMenu(cellMenuButton(page, cell));
  await cellMenuItem(page, "Ver detalle").click();
  const list = cellDetailDialog(page, cell);
  await detailEntryButton(list, "Editar", "b", "de 12:00 a 13:00").click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await dialogClock(editor, "Hora de fin").fill("12:15");
  await dialogClock(editor, "Hora de fin").press("Tab");
  await withServerAction(page, () => dialogButton(editor, "Guardar").click());
  await expect(editor).toBeHidden();
  await expect(detailEntryButton(list, "Editar", "b", "de 12:00 a 12:15")).toBeFocused();
  await closeListButton(list).click();
  await expect(list).toBeHidden();
  await expect(field).toHaveValue("1:15");
});

test("mover la única entrada de una fila a la semana siguiente saca la fila y deja el foco en «Añadir nueva fila»", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Mover");
  const day = today();
  // La semana de la entrada es la de antes de la anterior: así la semana
  // siguiente, adonde se mueve, también queda entera en el pasado.
  const next = lastWeekOf(day);
  const week = addDays(next, -7);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "mover", day: week, start: "09:00", end: "10:00", project },
  ]);
  await openTimesheetWeek(page, week, day);
  await expect(cellField(page, project, week, day)).toHaveValue("1:00");

  // TS-115, §5.7: la fila del servidor sale con la foto y el foco va a
  // «Añadir nueva fila» (A2).
  await openCellMenu(cellMenuButton(page, cellName(project, week, day)));
  await cellMenuItem(page, "Editar").click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await pickDialogDay(page, editor, next);

  // La foto que saca la fila se demora detrás de una revalidación retenida,
  // como la del foco de TT-40 que sale mientras el guardado viaja: el editor
  // se cierra con su respuesta y el foco espera en el campo de la celda. Sin
  // esto la foto puede llegar antes de que el editor termine de cerrarse, y
  // el recorrido no probaría que el foco espera la foto.
  const field = cellField(page, project, week, day);
  const releaseSave = await holdActionResponses(page, isTimesheetPage);
  const releaseRefresh = await holdRefreshes(page, isTimesheetPage);
  const sent = page.waitForRequest(isAction);
  const answered = page.waitForResponse((response) => isAction(response.request()));
  await dialogButton(editor, "Guardar").click();
  await sent;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  releaseSave();
  expect((await answered).ok()).toBe(true);
  await expect(editor).toBeHidden();
  await expect(field).toBeFocused();
  releaseRefresh();
  await expect(timesheetRow(page, project)).toHaveCount(0);
  await expect(addRowButton(page)).toBeFocused();
  await expect(timesheetTable(page).getByText(EMPTY_WEEK, { exact: true })).toBeVisible();

  // En la semana siguiente, la entrada está en su celda.
  await openTimesheetWeek(page, next, day);
  await expect(cellField(page, project, next, day)).toHaveValue("1:00");
});

test("guardar una entrada borrada en otra pestaña cierra el editor con «Esa entrada ya no existe.»", async ({
  page,
  email,
  browser,
}) => {
  const project = await seedNamedProject("Ya no existe");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  const thursday = addDays(week, 3);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "borrada", day: tuesday, start: "09:00", end: "10:00", project },
    { description: "sigue", day: thursday, start: "14:00", end: "15:00", project },
  ]);
  await openTimesheetWeek(page, week, day);
  const field = cellField(page, project, tuesday, day);
  await expect(field).toHaveValue("1:00");

  await openCellMenu(cellMenuButton(page, cellName(project, tuesday, day)));
  await cellMenuItem(page, "Editar").click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await dialogDescription(editor).fill("renombrada");

  // Otra pestaña la borra desde el rastreador.
  const tracker = await openSecondTab(browser, email, `/?desde=${dayKeyOf(week)}`);
  const otherGroup = trackerDay(tracker, tuesday, day);
  await otherGroup
    .getByRole("button", { name: "Acciones de la entrada «borrada»", exact: true })
    .click();
  await tracker.getByRole("menuitem", { name: "Borrar", exact: true }).click();
  await withServerAction(tracker, () =>
    deleteEntryConfirm(tracker)
      .getByRole("button", { name: "Borrar", exact: true })
      .click(),
  );
  await expect(trackerEntries(otherGroup, "borrada")).toHaveCount(0);
  await tracker.context().close();

  // Volver a la pestaña la revalida (TT-40): en headless `bringToFront()` no
  // dispara el evento, así que se despacha. La fila sigue por la del jueves,
  // y el editor, con su borrador.
  const refreshed = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.request().headers()["rsc"] !== undefined &&
      isTimesheetPage(new URL(response.url())),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;
  await expect(coveredCellField(page, project, tuesday, day)).toHaveValue("");
  await expect(dialogDescription(editor)).toHaveValue("renombrada");

  // TS-83: el editor se cierra, el foco va al campo de la celda y la
  // pantalla avisa sin «Reintentar».
  await withServerAction(page, () => dialogButton(editor, "Guardar").click());
  await expect(editor).toBeHidden();
  await expect(field).toBeFocused();
  const notice = screenNotice(page, ENTRY_NOT_SAVED);
  await expect(notice).toContainText(ENTRY_GONE);
  await expect(retryButton(notice)).toHaveCount(0);
});

test("el menú de una celda espera la foto de una escritura de la grilla", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Espera");
  const day = today();
  const week = lastWeekOf(day);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "", day: week, start: "09:00", end: "10:00", project },
  ]);
  await openTimesheetWeek(page, week, day);
  const field = cellField(page, project, week, day);
  const trigger = cellMenuButton(page, cellName(project, week, day));
  await expect(field).toHaveValue("1:00");
  await expectMenuReady(trigger);

  // D13b-5: con la respuesta retenida, Tab lleva al disparador, que está
  // inactivo sin perder el foco, y Enter no abre el menú.
  const release = await holdCellWrites(page, week);
  const requested = page.waitForRequest(isCellWriteFor(week));
  await field.fill("2:00");
  await field.press("Tab");
  await requested;
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");

  // Al soltarla y llegar la foto, el disparador se activa: el Enter de antes
  // no quedó pendiente, y el de ahora abre.
  const answered = page.waitForResponse((response) =>
    isCellWriteFor(week)(response.request()),
  );
  release();
  expect((await answered).ok()).toBe(true);
  await expect(field).not.toHaveAttribute("aria-busy", "true");
  await expect(field).toHaveValue("2:00");
  await expectMenuReady(trigger);
  await expect(cellMenuItem(page, "Editar")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cellMenuItem(page, "Editar")).toBeVisible();
  await expect(cellMenuItem(page, "Borrar")).toBeVisible();
});

test("un guardado cuya respuesta se perdió se reintenta desde el editor", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Reintentar");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "", day: tuesday, start: "09:00", end: "10:00", project },
  ]);
  await openTimesheetWeek(page, week, day);
  const field = cellField(page, project, tuesday, day);
  await expect(field).toHaveValue("1:00");

  await openCellMenu(cellMenuButton(page, cellName(project, tuesday, day)));
  await cellMenuItem(page, "Editar").click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await dialogDescription(editor).fill("revisión");

  // TT-89: la respuesta se pierde después de que el servidor guardó. El
  // editor sigue abierto con el aviso y «Reintentar».
  const restore = await loseActionResponses(page, isTimesheetPage);
  await dialogButton(editor, "Guardar").click();
  const notice = dialogNotice(editor, ENTRY_NOT_SAVED);
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(retryButton(notice)).toBeVisible();
  await expect(editor).toBeVisible();

  // Reintentar reenvía el borrador: guarda y cierra el editor.
  await restore();
  await withServerAction(page, () => retryButton(notice).click());
  await expect(editor).toBeHidden();
  await expect(field).toHaveValue("1:00");

  await openTrackerFrom(page, week);
  const group = trackerDay(page, tuesday, day);
  await expect(trackerEntries(group, "revisión")).toHaveCount(1);
  await expect(trackerEntry(group, "09:00 – 10:00", "revisión")).toBeVisible();
});

test("con la lista abierta, la falla de un borrado se ve en ella y se reintenta desde ahí", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Falla lista");
  const day = today();
  const week = lastWeekOf(day);
  const wednesday = addDays(week, 2);
  const cell = cellName(project, wednesday, day);
  await openCellWithTwo(page, email, project, week, wednesday, day);

  await openCellMenu(cellMenuButton(page, cell));
  await cellMenuItem(page, "Ver detalle").click();
  const list = cellDetailDialog(page, cell);
  const title = cellDetailTitle(list, cell);
  await expect(title).toBeFocused();

  // A14: el pedido no sale. La lista sigue abierta con el aviso arriba de los
  // ítems, y «a» sigue en ella.
  const restore = await dropActionRequests(page, isTimesheetPage);
  await detailEntryButton(list, "Borrar", "a", "de 10:00 a 11:00").click();
  await deleteEntryConfirm(page)
    .getByRole("button", { name: "Borrar", exact: true })
    .click();
  await expect(deleteEntryConfirm(page)).toBeHidden();
  const notice = list.getByRole("alert").filter({ hasText: ENTRY_NOT_DELETED });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(retryButton(notice)).toBeVisible();
  await expect(list).toBeVisible();
  const items = list.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(detailEntryButton(list, "Editar", "a", "de 10:00 a 11:00")).toBeVisible();
  await expectAbove(notice, items.first());

  // La pantalla, debajo del modal, no lo repite: el único aviso con ese
  // título, contando lo que el modal tapa, es el de la lista.
  await expect(
    page
      .getByRole("alert", { includeHidden: true })
      .filter({ hasText: ENTRY_NOT_DELETED }),
  ).toHaveCount(1);

  // T1: con el teclado, «Reintentar» se va con el aviso y el foco pasa antes
  // al título (§5.6). Con la respuesta retenida, la foto todavía no sacó a
  // «a», así que el foco no llega ahí por la entrada que sale.
  await restore();
  const release = await holdActionResponses(page, isTimesheetPage);
  const sent = page.waitForRequest(isAction);
  const answered = page.waitForResponse((response) => isAction(response.request()));
  await retryButton(notice).press("Enter");
  await sent;
  await expect(notice).toHaveCount(0);
  await expect(title).toBeFocused();
  await expect(detailEntryButton(list, "Editar", "a", "de 10:00 a 11:00")).toBeVisible();

  // Al soltar, «a» sale y queda «b».
  release();
  expect((await answered).ok()).toBe(true);
  await expect(items).toHaveCount(1);
  await expect(detailEntryButton(list, "Editar", "a", "de 10:00 a 11:00")).toHaveCount(0);
  await expect(detailEntryButton(list, "Editar", "b", "de 12:00 a 13:00")).toBeVisible();
});

test("cancelar desde la lista el editor o la confirmación devuelve el foco al botón que abrió la cadena", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Cancelar lista");
  const day = today();
  const week = lastWeekOf(day);
  const wednesday = addDays(week, 2);
  const cell = cellName(project, wednesday, day);
  await openCellWithTwo(page, email, project, week, wednesday, day);
  const sent = recordActions(page);

  await openCellMenu(cellMenuButton(page, cell));
  await cellMenuItem(page, "Ver detalle").click();
  const list = cellDetailDialog(page, cell);
  await expect(cellDetailTitle(list, cell)).toBeFocused();
  const editA = detailEntryButton(list, "Editar", "a", "de 10:00 a 11:00");

  // §5.6: «Cancelar» del editor abierto desde la lista vuelve a su «Editar».
  await editA.click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await dialogButton(editor, "Cancelar").click();
  await expect(editor).toBeHidden();
  await expect(list).toBeVisible();
  await expect(editA).toBeFocused();

  // A16: la confirmación que sale del menú del editor anidado vuelve, al
  // cancelarla, al «Editar» que abrió la cadena.
  await editA.click();
  await expect(dialogDescription(editor)).toBeFocused();
  await dialogActions(editor, "a").click();
  await page.getByRole("menuitem", { name: "Borrar", exact: true }).click();
  const confirm = deleteEntryConfirm(page);
  await expect(confirm).toContainText("Se va a borrar «a», de 10:00 a 11:00.");
  await expect(editor).toBeHidden();
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(editA).toBeFocused();

  // §5.6: la confirmación abierta desde la lista vuelve a su «Borrar».
  const deleteB = detailEntryButton(list, "Borrar", "b", "de 12:00 a 13:00");
  await deleteB.click();
  await expect(
    confirm.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(deleteB).toBeFocused();

  // Nada de lo cancelado viajó: la lista sigue con las dos.
  await expect(list.getByRole("listitem")).toHaveCount(2);
  expect(sent).toHaveLength(0);
});

test("borrar desde la lista todas las entradas de la celda la cierra, con el foco en el campo", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Vaciar lista");
  const day = today();
  const week = lastWeekOf(day);
  const wednesday = addDays(week, 2);
  const thursday = addDays(week, 3);
  const cell = cellName(project, wednesday, day);
  await openTimesheetWeek(page, week, day);
  // La del jueves deja la fila en la grilla cuando el miércoles se vacía.
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: wednesday, start: "10:00", end: "11:00", project },
    { description: "b", day: wednesday, start: "12:00", end: "13:00", project },
    { description: "c", day: thursday, start: "14:00", end: "15:00", project },
  ]);
  await openTimesheetWeek(page, week, day);
  const field = cellField(page, project, wednesday, day);
  await expect(field).toHaveValue("2:00");

  await openCellMenu(cellMenuButton(page, cell));
  await cellMenuItem(page, "Ver detalle").click();
  const list = cellDetailDialog(page, cell);
  const title = cellDetailTitle(list, cell);
  await expect(title).toBeFocused();

  await detailEntryButton(list, "Borrar", "a", "de 10:00 a 11:00").click();
  await withServerAction(page, () =>
    deleteEntryConfirm(page).getByRole("button", { name: "Borrar", exact: true }).click(),
  );
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(title).toBeFocused();

  // §5.2, §5.6: vacía y sin nada encima, la lista se cierra y el foco va al
  // destino de la celda, su campo.
  await detailEntryButton(list, "Borrar", "b", "de 12:00 a 13:00").click();
  await withServerAction(page, () =>
    deleteEntryConfirm(page).getByRole("button", { name: "Borrar", exact: true }).click(),
  );
  await expect(list).toBeHidden();
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(cellMenuButton(page, cell)).toHaveCount(0);
  await expect(rowTotal(page, project)).toHaveText("1:00");
});

test("cerrar la lista con la falla a la vista la pasa a la pantalla, que la reintenta", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Falla cerrar");
  const day = today();
  const week = lastWeekOf(day);
  const wednesday = addDays(week, 2);
  const cell = cellName(project, wednesday, day);
  const field = await openCellWithTwo(page, email, project, week, wednesday, day);
  const trigger = cellMenuButton(page, cell);

  await openCellMenu(trigger);
  await cellMenuItem(page, "Ver detalle").click();
  const list = cellDetailDialog(page, cell);
  await expect(cellDetailTitle(list, cell)).toBeFocused();

  const restore = await dropActionRequests(page, isTimesheetPage);
  await detailEntryButton(list, "Borrar", "a", "de 10:00 a 11:00").click();
  await deleteEntryConfirm(page)
    .getByRole("button", { name: "Borrar", exact: true })
    .click();
  await expect(
    list.getByRole("alert").filter({ hasText: ENTRY_NOT_DELETED }),
  ).toBeVisible();

  // §5.2, §5.5: al cerrar la lista, la falla vigente pasa a la región de la
  // pantalla, con el nombre del pedido y «Reintentar».
  await closeListButton(list).click();
  await expect(list).toBeHidden();
  await expect(trigger).toBeFocused();
  const notice = screenNotice(page, ENTRY_NOT_DELETED);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(notice).toContainText("«a», de 10:00 a 11:00");
  await expect(retryButton(notice)).toBeVisible();
  await expect(field).toHaveValue("2:00");

  // §5.5: con el teclado, el foco pasa antes al campo de la celda del pedido.
  await restore();
  await withServerAction(page, () => retryButton(notice).press("Enter"));
  await expect(screenNotice(page, ENTRY_NOT_DELETED)).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("1:00");
});

test("«Borrar» desde el editor con su falla a la vista la baja, y el aviso de una celda sigue", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Falla editor");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  const wednesday = addDays(week, 2);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "editada", day: tuesday, start: "09:00", end: "10:00", project },
    { description: "a", day: wednesday, start: "10:00", end: "11:00", project },
    { description: "b", day: wednesday, start: "12:00", end: "13:00", project },
  ]);
  await openTimesheetWeek(page, week, day);

  // Antes, un aviso de celda en la pantalla (TS-79).
  const busy = cellField(page, project, wednesday, day);
  await expect(busy).toHaveValue("2:00");
  await writeCell(page, busy, "1:00");
  const cellNotice = screenNotice(page, CELL_NOT_SAVED);
  await expect(cellNotice).toContainText(CELL_NEEDS_ENTRY_EDIT);

  // La respuesta del guardado se pierde: la falla queda a la vista en el editor.
  const trigger = cellMenuButton(page, cellName(project, tuesday, day));
  await openCellMenu(trigger);
  await cellMenuItem(page, "Editar").click();
  const editor = entryEditor(page);
  await expect(dialogDescription(editor)).toBeFocused();
  await dialogDescription(editor).fill("renombrada");
  const restore = await loseActionResponses(page, isTimesheetPage);
  await dialogButton(editor, "Guardar").click();
  await expect(dialogNotice(editor, ENTRY_NOT_SAVED)).toContainText(NETWORK_FAILURE);
  await restore();

  // F1, A4: «Borrar» del menú del editor lo cierra y baja su falla. Al
  // cancelar la confirmación, la pantalla no la muestra, y el aviso de la
  // celda, que nada bajó, sigue.
  await dialogActions(editor, "editada").click();
  await page.getByRole("menuitem", { name: "Borrar", exact: true }).click();
  const confirm = deleteEntryConfirm(page);
  await expect(editor).toBeHidden();
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(screenNotice(page, ENTRY_NOT_SAVED)).toHaveCount(0);
  await expect(cellNotice).toContainText(CELL_NEEDS_ENTRY_EDIT);
});

test("reintentar desde la pantalla el borrado de la única entrada de una fila espera la foto para mover el foco", async ({
  page,
  email,
}) => {
  const project = await seedNamedProject("Reintentar borrado");
  const day = today();
  const week = lastWeekOf(day);
  const friday = addDays(week, 4);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "única", day: friday, start: "09:00", end: "10:00", project },
  ]);
  await openTimesheetWeek(page, week, day);
  const field = cellField(page, project, friday, day);
  await expect(field).toHaveValue("1:00");

  // El pedido no sale: la falla va a la pantalla, con «Reintentar», y la fila sigue.
  const restore = await dropActionRequests(page, isTimesheetPage);
  await openCellMenu(cellMenuButton(page, cellName(project, friday, day)));
  await cellMenuItem(page, "Borrar").click();
  await deleteEntryConfirm(page)
    .getByRole("button", { name: "Borrar", exact: true })
    .click();
  const notice = screenNotice(page, ENTRY_NOT_DELETED);
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(notice).toContainText("«única», de 09:00 a 10:00");
  await expect(timesheetRow(page, project)).toBeVisible();
  await restore();

  // F2: con el teclado, el foco pasa antes al campo de la celda; con la
  // respuesta retenida, sigue ahí mientras el pedido viaja.
  const release = await holdActionResponses(page, isTimesheetPage);
  const sent = page.waitForRequest(isAction);
  const answered = page.waitForResponse((response) => isAction(response.request()));
  await retryButton(notice).press("Enter");
  await sent;
  await expect(screenNotice(page, ENTRY_NOT_DELETED)).toHaveCount(0);
  await expect(field).toBeFocused();

  // Al soltar, la fila sale con la foto y el foco va a «Añadir nueva fila» (A2).
  release();
  expect((await answered).ok()).toBe(true);
  await expect(timesheetRow(page, project)).toHaveCount(0);
  await expect(addRowButton(page)).toBeFocused();
});

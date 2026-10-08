import type { Locator, Page } from "@playwright/test";

import { PERSON_TIMEZONE } from "./calendar-page";
import { archiveProject, seedEntries, seedProject, type SeedEntry } from "./database";
import { addDays, dayKeyOf, todayIn, weekStartOf, type CivilDay } from "./days";
import {
  loseActionResponses,
  openSecondTab,
  recordActions,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import {
  addRow,
  addRowButton,
  CELL_NEEDS_ENTRY_EDIT,
  CELL_NOT_SAVED,
  cellField,
  cellMenuButton,
  cellName,
  dayHeader,
  dayTotal,
  EMPTY_WEEK,
  expectWeek,
  goToTimesheetByNav,
  holdCellWrites,
  isCellWriteFor,
  isTimesheetPage,
  lastWeekOf,
  NETWORK_FAILURE,
  newRowPicker,
  NO_PROJECT,
  openTimesheetWeek,
  openTrackerFrom,
  rangeButton,
  removeRowButton,
  removeRowDialog,
  ROW_NOT_REMOVED,
  rowTotal,
  screenNotice,
  TIMESHEET_HEADING,
  timesheetHref,
  timesheetRow,
  timesheetTable,
  trackerDay,
  trackerEntries,
  trackerEntry,
  weekLink,
  weekTotal,
  writeCell,
} from "./timesheet-page";
import {
  elapsedCounter,
  elapsedOf,
  pickProject,
  projectOption,
  projectPopup,
  projectSearch,
  startTimer,
  taskOption,
  trackerBar,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos del slice 13: la planilla de horarios (§7 del contrato,
 * «Recorridos obligatorios de `e2e/timesheet.spec.ts`», A1 de sus
 * correcciones de arranque, y F-M1 y F-m4 de las de revisiones). Cada
 * recorrido entra con una persona propia, y sus proyectos llevan un sufijo
 * propio. Las entradas que un recorrido necesita y no prueba cómo se cargan
 * se siembran por base. Las escrituras van sobre la semana anterior, o la de
 * antes: la planilla crea a las 09:00, y en la semana de hoy esa hora puede no
 * haber llegado. Toda persona nueva tiene el lunes como primer día de la
 * semana (PF-16), y los rótulos esperados se calculan con `days.ts`, no con el
 * código que los produce.
 */

/** Hoy en la zona por omisión de la persona, que es la que corta los días. */
function today(): CivilDay {
  return todayIn(PERSON_TIMEZONE);
}

/** Un proyecto público sin cliente, con el sufijo del recorrido. */
async function seedNamedProject(
  label: string,
  tasks: readonly string[] = [],
): Promise<{ name: string; suffix: string }> {
  const suffix = uniqueSuffix();
  const name = `${label} ${suffix}`;
  await seedProject({ name, tasks });
  return { name, suffix };
}

/**
 * Siembra por base las entradas de un recorrido que no prueba cómo se
 * cargan, con las horas en la zona de la persona. La persona ya tiene que
 * haber entrado a una pantalla, que es lo que le crea la membresía.
 */
async function seedPersonEntries(
  email: string,
  entries: readonly (Omit<SeedEntry, "day"> & { readonly day: CivilDay })[],
): Promise<void> {
  await seedEntries(
    email,
    PERSON_TIMEZONE,
    entries.map((entry) => ({ ...entry, day: dayKeyOf(entry.day) })),
  );
}

/** Días enteros de `from` a `to`. */
function daysBetween(from: CivilDay, to: CivilDay): number {
  return (
    (Date.UTC(to.year, to.month - 1, to.day) -
      Date.UTC(from.year, from.month - 1, from.day)) /
    86_400_000
  );
}

function retryButton(notice: Locator): Locator {
  return notice.getByRole("button", { name: "Reintentar", exact: true });
}

/** Sin `aria-busy`: la escritura de la celda ya no está en vuelo ni en cola (§5.5). */
async function expectIdle(field: Locator): Promise<void> {
  await expect(field).not.toHaveAttribute("aria-busy", "true");
}

/**
 * Escribe en otra celda y espera su respuesta, para afirmar después qué
 * pedidos salieron antes: las server actions se despachan en orden, así que
 * uno que hubiera salido de una confirmación anterior ya estaría en `sent`.
 */
async function writeSentinel(page: Page, field: Locator): Promise<void> {
  await writeCell(page, field, "0:30");
  await expect(field).toHaveValue("0:30");
}

test("la planilla se abre desde la navegación, muestra la semana vacía y navega entre semanas", async ({
  page,
}) => {
  const day = today();
  const current = weekStartOf(day);
  const previous = addDays(current, -7);
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();

  // TS-04: «Planilla» en la navegación y el título.
  await goToTimesheetByNav(page);
  await expect(
    page.getByRole("heading", { level: 1, name: TIMESHEET_HEADING, exact: true }),
  ).toBeVisible();

  // TS-08: «Proyectos», los siete días con su rótulo, hoy marcado, y «Total».
  const table = timesheetTable(page);
  await expect(
    table.getByRole("columnheader", { name: "Proyectos", exact: true }),
  ).toBeVisible();
  for (let offset = 0; offset < 7; offset += 1) {
    const header = dayHeader(page, addDays(current, offset), day);
    await expect(header).toBeVisible();
    if (offset === daysBetween(current, day)) {
      await expect(header).toHaveAttribute("aria-current", "date");
    } else {
      await expect(header).not.toHaveAttribute("aria-current", "date");
    }
  }
  await expect(
    table.getByRole("columnheader", { name: "Total", exact: true }),
  ).toBeVisible();

  // TS-09: el rango dice «Esta semana» y no hay atajo a ella. TS-87: el vacío.
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir fecha: Esta semana");
  await expect(weekLink(page, "Esta semana")).toHaveCount(0);
  await expect(table.getByText(EMPTY_WEEK, { exact: true })).toBeVisible();
  await expect(weekTotal(page)).toHaveText("0:00");

  // TS-09, TS-10: la semana anterior, con su primer día en la URL, y el atajo
  // que vuelve.
  await weekLink(page, "Semana anterior").click();
  await expectWeek(page, previous, day);
  await weekLink(page, "Esta semana").click();
  await expectWeek(page, current, day);
  await expect(weekLink(page, "Esta semana")).toHaveCount(0);
});

test("añadir una fila, elegir el proyecto y escribir una celda crea la entrada de las 09:00", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Planilla");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  await openTimesheetWeek(page, week, day);
  await expect(timesheetTable(page).getByText(EMPTY_WEEK, { exact: true })).toBeVisible();

  // TS-16, TS-17: la fila nueva con el foco en su selector.
  await addRow(page, project, suffix);

  // TS-29, TS-98: Enter guarda; en la única fila el foco se queda.
  const cell = cellField(page, project, tuesday, day);
  await writeCell(page, cell, "90", "Enter");
  await expect(cell).toHaveValue("1:30");
  await expect(cell).toBeFocused();

  // TS-44 … TS-46: los tres totales.
  await expect(rowTotal(page, project)).toHaveText("1:30");
  await expect(dayTotal(page, week, tuesday)).toHaveText("1:30");
  await expect(weekTotal(page)).toHaveText("1:30");

  // TS-30, TS-31: una entrada sin descripción, de 09:00 a 10:30.
  await openTrackerFrom(page, week);
  const group = trackerDay(page, tuesday, day);
  await expect(trackerEntries(group)).toHaveCount(1);
  await expect(trackerEntry(group, "09:00 – 10:30")).toBeVisible();
});

test("editar una celda con una entrada mueve su fin, y el mismo valor no manda nada", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Editar");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  const cell = cellField(page, project, tuesday, day);
  await writeCell(page, cell, "90");
  await expect(cell).toHaveValue("1:30");

  // TS-33: la misma entrada, con el fin en el inicio más dos horas.
  await writeCell(page, cell, "2:00");
  await expect(cell).toHaveValue("2:00");

  // TS-36: lo que ya muestra la celda, escrito igual o de otra forma, no viaja.
  const sent = recordActions(page);
  for (const text of ["2:00", "120"]) {
    await cell.fill(text);
    await cell.press("Tab");
    await expect(cell).toHaveValue("2:00");
  }
  const wednesday = addDays(week, 2);
  await writeSentinel(page, cellField(page, project, wednesday, day));
  expect(sent).toHaveLength(1);
  expect(isCellWriteFor(wednesday)(sent[0])).toBe(true);

  await openTrackerFrom(page, week);
  const group = trackerDay(page, tuesday, day);
  await expect(trackerEntries(group)).toHaveCount(1);
  await expect(trackerEntry(group, "09:00 – 11:00")).toBeVisible();
});

test("una celda con varias entradas sube con una nueva, baja la última y rechaza lo que no entra", async ({
  page,
  email,
  browser,
}) => {
  const { name: project } = await seedNamedProject("Varias");
  const day = today();
  const week = lastWeekOf(day);
  const wednesday = addDays(week, 2);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, [
    { description: "a", day: wednesday, start: "10:00", end: "11:00", project },
    { description: "b", day: wednesday, start: "12:00", end: "13:00", project },
  ]);

  await openTimesheetWeek(page, week, day);
  const cell = cellField(page, project, wednesday, day);
  await expect(cell).toHaveValue("2:00");

  // TS-34: subir agrega una entrada desde el fin de la que termina más tarde,
  // con la descripción de la que empieza más tarde.
  await writeCell(page, cell, "3:00");
  await expect(cell).toHaveValue("3:00");
  const tracker = await openSecondTab(browser, email, `/?desde=${dayKeyOf(week)}`);
  const otherGroup = trackerDay(tracker, wednesday, day);
  await expect(trackerEntry(otherGroup, "13:00 – 14:00", "b")).toBeVisible();
  await expect(trackerEntries(otherGroup, "b")).toHaveCount(2);
  await tracker.context().close();

  // TS-34: bajar adelanta el fin de la que empieza más tarde.
  await writeCell(page, cell, "2:30");
  await expect(cell).toHaveValue("2:30");

  // TS-79: la que empieza más tarde quedaría sin duración. El aviso no ofrece
  // reintentar y la celda vuelve a lo que tenía.
  await writeCell(page, cell, "1:00");
  const notice = screenNotice(page, CELL_NOT_SAVED);
  await expect(notice).toContainText(CELL_NEEDS_ENTRY_EDIT);
  await expect(retryButton(notice)).toHaveCount(0);
  await expect(cell).toHaveValue("2:30");

  await openTrackerFrom(page, week);
  const group = trackerDay(page, wednesday, day);
  await expect(trackerEntry(group, "10:00 – 11:00", "a")).toBeVisible();
  await expect(trackerEntry(group, "12:00 – 13:00", "b")).toBeVisible();
  await expect(trackerEntry(group, "13:00 – 13:30", "b")).toBeVisible();
  await expect(trackerEntries(group, "b")).toHaveCount(2);
});

test("lo que no se interpreta vuelve al valor anterior con la marca, y Esc descarta", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Interpreta");
  const day = today();
  const week = lastWeekOf(day);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  const cell = cellField(page, project, week, day);
  await writeCell(page, cell, "1:00");
  await expect(cell).toHaveValue("1:00");

  // TS-27, TS-35, TT-21: vuelve al valor anterior y se marca, sin pedido.
  const sent = recordActions(page);
  for (const text of ["abc", "0", ""]) {
    await cell.fill(text);
    await cell.press("Tab");
    await expect(cell).toHaveValue("1:00");
    await expect(cell).toHaveAttribute("aria-invalid", "true");
    // La marca dura un instante: se espera que baje para ver la siguiente.
    await expect(cell).toHaveAttribute("aria-invalid", "false");
  }

  // TS-28: Esc vuelve a lo que la celda muestra y el foco se queda.
  await cell.fill("3:00");
  await cell.press("Escape");
  await expect(cell).toHaveValue("1:00");
  await expect(cell).toBeFocused();
  await cell.press("Tab");

  const tuesday = addDays(week, 1);
  await writeSentinel(page, cellField(page, project, tuesday, day));
  expect(sent).toHaveLength(1);
  expect(isCellWriteFor(tuesday)(sent[0])).toBe(true);
});

test("el timer no aparece en la planilla, y escribir una celda de su proyecto no lo toca", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Timer");
  const day = today();
  const current = weekStartOf(day);
  const week = lastWeekOf(day);
  const description = "timer de la planilla";
  await page.goto("/");
  await pickProject(page, trackerBar(page), project, suffix);
  await startTimer(page, description);

  // TS-49, TS-50: la entrada que corre no está en ninguna celda ni total.
  await openTimesheetWeek(page, current, day);
  await expect(timesheetTable(page).getByText(EMPTY_WEEK, { exact: true })).toBeVisible();
  await expect(timesheetRow(page, project)).toHaveCount(0);
  await expect(weekTotal(page)).toHaveText("0:00");

  // TS-39: una celda de la semana anterior crea su entrada y el timer sigue.
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  const cell = cellField(page, project, week, day);
  await writeCell(page, cell, "0:30");
  await expect(cell).toHaveValue("0:30");

  await openTrackerFrom(page, week);
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  const counter = elapsedCounter(bar);
  const before = await elapsedOf(counter);
  await expect.poll(() => elapsedOf(counter)).toBeGreaterThan(before);
  await expect(trackerEntry(trackerDay(page, week, day), "09:00 – 09:30")).toBeVisible();
});

test("reintentar una celda cuya respuesta se perdió deja una sola entrada", async ({
  page,
  email,
  browser,
}) => {
  const { name: project, suffix } = await seedNamedProject("Reintentar");
  const day = today();
  const week = lastWeekOf(day);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  const cell = cellField(page, project, week, day);

  // TS-91: la respuesta se pierde después de que el servidor escribió. La
  // celda vuelve a lo que dice la foto, y el aviso ofrece reintentar.
  const restore = await loseActionResponses(page, isTimesheetPage);
  await cell.fill("1:00");
  await cell.press("Tab");
  const notice = screenNotice(page, CELL_NOT_SAVED);
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(retryButton(notice)).toBeEnabled();
  await expect(cell).toHaveValue("");

  // El primer intento se aplicó: sin esto, un pedido que no llegó haría pasar
  // el recorrido sin probar nada.
  const other = await openSecondTab(browser, email, timesheetHref(week));
  await expect(cellField(other, project, week, day)).toHaveValue("1:00");
  await other.context().close();

  // TS-37: el reintento llega al mismo valor sin escribir otra entrada. F-M1:
  // con el teclado, el botón se va con el aviso y el foco pasa antes a la
  // celda, que dejó de tenerlo con el Tab.
  await restore();
  await withServerAction(page, () => retryButton(notice).press("Enter"));
  await expect(screenNotice(page, CELL_NOT_SAVED)).toHaveCount(0);
  await expect(cell).toHaveValue("1:00");
  await expect(cell).toBeFocused();

  await openTrackerFrom(page, week);
  const group = trackerDay(page, week, day);
  await expect(trackerEntries(group)).toHaveCount(1);
  await expect(trackerEntry(group, "09:00 – 10:00")).toBeVisible();
});

test("reintentar quitar una fila cuya respuesta se perdió deja el foco en «Añadir nueva fila»", async ({
  page,
  email,
}) => {
  const { name: project } = await seedNamedProject("Reintentar fila");
  const day = today();
  const week = lastWeekOf(day);
  await openTimesheetWeek(page, week, day);
  await seedPersonEntries(email, [
    { description: "", day: week, start: "09:00", end: "10:00", project },
  ]);
  await openTimesheetWeek(page, week, day);
  await expect(rowTotal(page, project)).toHaveText("1:00");

  // TS-92: la respuesta se pierde después de que el servidor borró.
  const restore = await loseActionResponses(page, isTimesheetPage);
  await removeRowButton(page, project).click();
  await removeRowDialog(page, project)
    .getByRole("button", { name: "Quitar fila", exact: true })
    .click();
  const notice = screenNotice(page, ROW_NOT_REMOVED);
  await expect(notice).toContainText(NETWORK_FAILURE);

  // F-M1: con el teclado, el botón se va con el aviso y la fila se oculta; el
  // foco pasa antes a «Añadir nueva fila», como al confirmar.
  await restore();
  await withServerAction(page, () => retryButton(notice).press("Enter"));
  await expect(screenNotice(page, ROW_NOT_REMOVED)).toHaveCount(0);
  await expect(timesheetRow(page, project)).toHaveCount(0);
  await expect(addRowButton(page)).toBeFocused();
});

test("quitar una fila con entradas pide confirmación y borra solo las de esa semana", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Quitar");
  const day = today();
  const next = lastWeekOf(day);
  const week = addDays(next, -7);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  await writeCell(page, cellField(page, project, week, day), "1:00");
  await writeCell(page, cellField(page, project, addDays(week, 1), day), "0:30");
  await openTimesheetWeek(page, next, day);
  await addRow(page, project, suffix);
  const kept = cellField(page, project, addDays(next, 2), day);
  await writeCell(page, kept, "1:00");

  // La fila vuelve del servidor, con las dos entradas de la semana.
  await openTimesheetWeek(page, week, day);
  const remove = removeRowButton(page, project);

  // TS-53, TT-61: cuántas entradas y cuánto suman. «Cancelar» devuelve el foco.
  await remove.click();
  const dialog = removeRowDialog(page, project);
  await expect(dialog).toContainText(
    "Se van a borrar 2 entradas que suman 1:30. No se puede deshacer.",
  );
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(remove).toBeFocused();

  // TS-52: la fila sale y el foco va a «Añadir nueva fila».
  await remove.click();
  await withServerAction(page, () =>
    removeRowDialog(page, project)
      .getByRole("button", { name: "Quitar fila", exact: true })
      .click(),
  );
  await expect(timesheetRow(page, project)).toHaveCount(0);
  await expect(addRowButton(page)).toBeFocused();
  await expect(timesheetTable(page).getByText(EMPTY_WEEK, { exact: true })).toBeVisible();

  // La semana siguiente conserva su entrada.
  await openTimesheetWeek(page, next, day);
  await expect(kept).toHaveValue("1:00");
});

test("una celda ya guardada muestra lo que escribió otra pestaña cuando la pantalla se revalida", async ({
  page,
  email,
  browser,
}) => {
  const { name: project, suffix } = await seedNamedProject("Otra pestaña");
  const day = today();
  const week = lastWeekOf(day);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  const cell = cellField(page, project, week, day);
  await writeCell(page, cell, "1:00");
  await expect(cell).toHaveValue("1:00");

  const other = await openSecondTab(browser, email, timesheetHref(week));
  const otherCell = cellField(other, project, week, day);
  await expect(otherCell).toHaveValue("1:00");
  await writeCell(other, otherCell, "2:30");
  await expect(otherCell).toHaveValue("2:30");
  await other.context().close();

  // F-m4, TT-40: la foto nueva reemplaza lo que la celda guardó. En headless
  // `bringToFront()` no dispara el evento, así que se despacha.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cell).toHaveValue("2:30");
  await expect(rowTotal(page, project)).toHaveText("2:30");
});

test("la fila vacía que guarda el navegador es de su semana y de ese navegador", async ({
  page,
  email,
  browser,
}) => {
  const { name: project, suffix } = await seedNamedProject("Guardada");
  const day = today();
  const week = lastWeekOf(day);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);

  // TS-19: sigue después de recargar.
  await page.reload();
  await expectWeek(page, week, day);
  await expect(timesheetRow(page, project)).toBeVisible();

  // P-16: no aparece en otra semana.
  await openTimesheetWeek(page, weekStartOf(day), day);
  await expect(timesheetTable(page)).toBeVisible();
  await expect(timesheetRow(page, project)).toHaveCount(0);

  // TS-19: no viaja a otro navegador de la misma persona.
  const other = await openSecondTab(browser, email, timesheetHref(week));
  await expect(timesheetTable(other)).toBeVisible();
  await expect(timesheetRow(other, project)).toHaveCount(0);
  await other.context().close();

  // TS-52: sin entradas se quita sin diálogo ni pedido, y no vuelve.
  await openTimesheetWeek(page, week, day);
  const sent = recordActions(page);
  await removeRowButton(page, project).click();
  await expect(timesheetRow(page, project)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expectWeek(page, week, day);
  await expect(timesheetTable(page)).toBeVisible();
  await expect(timesheetRow(page, project)).toHaveCount(0);
  expect(sent).toHaveLength(0);
});

test("el selector de una fila nueva no ofrece los pares que ya son fila", async ({
  page,
}) => {
  const task = "Maquetado";
  const { name: project, suffix } = await seedNamedProject("Selector", [task]);
  const day = today();
  await openTimesheetWeek(page, lastWeekOf(day), day);
  await addRow(page, project, suffix);
  await addRow(page, NO_PROJECT);

  // TS-18, D13-9: el proyecto que todavía ofrece tareas queda inactivo.
  await addRowButton(page).click();
  const picker = newRowPicker(page);
  await expect(picker).toBeFocused();
  await picker.click();
  await expect(projectSearch(page)).toBeFocused();
  await projectSearch(page).fill(suffix);
  await expect(projectOption(page, project)).toHaveAttribute("aria-disabled", "true");
  const taskChoice = projectOption(page, taskOption(project, task));
  await expect(taskChoice).toBeVisible();
  await expect(taskChoice).not.toHaveAttribute("aria-disabled", "true");

  // TS-20: «Sin proyecto», que solo se ofrece con la búsqueda vacía, ya es fila.
  await projectSearch(page).fill("");
  await expect(projectOption(page, NO_PROJECT)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(projectPopup(page)).toBeHidden();
});

test("la fila de un proyecto archivado sigue, su celda con horas se escribe y las vacías no", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Archivado");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  const monday = cellField(page, project, week, day);
  await writeCell(page, monday, "1:00");

  await archiveProject(project);
  await page.reload();
  await expectWeek(page, week, day);

  // TS-21, TS-113: el lunes se edita; el martes es texto y no recibe el foco,
  // así que Tab salta de la celda con horas a su menú (TS-99) y de ahí a la X.
  await expect(timesheetRow(page, project)).toBeVisible();
  await expect(cellField(page, project, tuesday, day)).toHaveCount(0);
  await monday.focus();
  await page.keyboard.press("Tab");
  await expect(cellMenuButton(page, cellName(project, week, day))).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(removeRowButton(page, project)).toBeFocused();

  await writeCell(page, monday, "2:00");
  await expect(monday).toHaveValue("2:00");
  await expect(screenNotice(page, CELL_NOT_SAVED)).toHaveCount(0);
});

test("Tab recorre las celdas de una fila y pasa a la X, Enter baja, y los atajos del rastreador no existen", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Teclado");
  const day = today();
  const week = lastWeekOf(day);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  await addRow(page, NO_PROJECT);

  // TS-98: por fila, de izquierda a derecha, y después la X.
  const first = cellField(page, project, week, day);
  await first.focus();
  for (let offset = 1; offset < 7; offset += 1) {
    await page.keyboard.press("Tab");
    await expect(cellField(page, project, addDays(week, offset), day)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(removeRowButton(page, project)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cellField(page, NO_PROJECT, week, day)).toBeFocused();

  // TS-98: Enter guarda y baja a la celda del mismo día en la fila siguiente.
  // Enter y la pérdida del foco que le sigue mandan un solo pedido (criterio 24).
  const cellWrites = recordActions(page);
  await writeCell(page, first, "1:00", "Enter");
  await expect(first).toHaveValue("1:00");
  await expect(cellField(page, NO_PROJECT, week, day)).toBeFocused();
  await writeSentinel(page, cellField(page, project, addDays(week, 1), day));
  expect(cellWrites).toHaveLength(2);

  // TS-101: `n` con el foco en la página no arranca ningún timer.
  const sent = recordActions(page);
  await page.getByRole("heading", { level: 1, name: TIMESHEET_HEADING }).click();
  await page.keyboard.press("n");
  await page.goto("/");
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Detener" })).toHaveCount(0);
  expect(sent).toHaveLength(0);
});

/*
 * A1 de las correcciones de arranque: lo que muestra una celda y su
 * `aria-busy` no esperan a que termine la transición de otra escritura.
 *
 * Next despacha las server actions de a una, así que el orden importa. A sale
 * primero y su respuesta se retiene hasta que B ya está pedida —en la cola de
 * Next, detrás de A—; recién ahí se suelta A, y B sale y queda retenida. Así
 * la respuesta de A llega con B sin resolver, y el árbol revalidado de A está
 * enredado con la transición de B. Al revés, con B adelante y retenida, A no
 * saldría hasta soltar B y el caso no probaría nada.
 */

/**
 * Escribe A y después B con las respuestas de las dos retenidas, suelta la de
 * A y espera que llegue. Termina con B en vuelo; devuelve lo que la suelta.
 */
async function writeABehindHeldB(
  page: Page,
  a: { readonly field: Locator; readonly day: CivilDay; readonly text: string },
  b: { readonly field: Locator; readonly day: CivilDay; readonly text: string },
): Promise<() => Promise<void>> {
  const releaseA = await holdCellWrites(page, a.day);
  const releaseB = await holdCellWrites(page, b.day);

  const requestedA = page.waitForRequest(isCellWriteFor(a.day));
  await a.field.fill(a.text);
  await a.field.press("Tab");
  await requestedA;
  await expect(a.field).toHaveAttribute("aria-busy", "true");

  await b.field.fill(b.text);
  await b.field.press("Tab");
  await expect(b.field).toHaveAttribute("aria-busy", "true");

  const answeredA = page.waitForResponse((response) =>
    isCellWriteFor(a.day)(response.request()),
  );
  releaseA();
  expect((await answeredA).ok()).toBe(true);

  return async () => {
    const answeredB = page.waitForResponse((response) =>
      isCellWriteFor(b.day)(response.request()),
    );
    releaseB();
    expect((await answeredB).ok()).toBe(true);
  };
}

test("una celda rechazada vuelve a su valor y deja de estar ocupada aunque otra escritura siga en vuelo", async ({
  page,
  email,
}) => {
  const { name: project } = await seedNamedProject("Rechazo en vuelo");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  await openTimesheetWeek(page, week, day);
  // Dos entradas el lunes; la que empieza más tarde dura un minuto, así que
  // bajar la celda un minuto la dejaría sin duración (TS-79, D13-4).
  await seedPersonEntries(email, [
    { description: "larga", day: week, start: "10:00", end: "11:00", project },
    { description: "corta", day: week, start: "12:00", end: "12:01", project },
  ]);
  await openTimesheetWeek(page, week, day);
  const a = cellField(page, project, week, day);
  const b = cellField(page, project, tuesday, day);
  await expect(a).toHaveValue("1:01");

  const releaseB = await writeABehindHeldB(
    page,
    { field: a, day: week, text: "1:00" },
    { field: b, day: tuesday, text: "0:30" },
  );
  await expect(screenNotice(page, CELL_NOT_SAVED)).toContainText(CELL_NEEDS_ENTRY_EDIT);
  await expect(a).toHaveValue("1:01");
  await expectIdle(a);
  // B sigue sin respuesta: lo de arriba pasó con su transición abierta.
  await expect(b).toHaveAttribute("aria-busy", "true");

  await releaseB();
  await expect(b).toHaveValue("0:30");
  await expectIdle(b);
});

test("una celda guardada muestra lo pedido y deja de estar ocupada aunque otra escritura siga en vuelo", async ({
  page,
}) => {
  const { name: project, suffix } = await seedNamedProject("Éxito en vuelo");
  const day = today();
  const week = lastWeekOf(day);
  const tuesday = addDays(week, 1);
  await openTimesheetWeek(page, week, day);
  await addRow(page, project, suffix);
  const a = cellField(page, project, week, day);
  const b = cellField(page, project, tuesday, day);

  const releaseB = await writeABehindHeldB(
    page,
    { field: a, day: week, text: "90" },
    { field: b, day: tuesday, text: "0:30" },
  );
  // Primero el fin de la escritura: «1:30» también es el valor optimista.
  await expectIdle(a);
  await expect(a).toHaveValue("1:30");
  await expect(b).toHaveAttribute("aria-busy", "true");

  await releaseB();
  await expect(b).toHaveValue("0:30");
  await expectIdle(b);
  await expect(a).toHaveValue("1:30");
  await expect(screenNotice(page, CELL_NOT_SAVED)).toHaveCount(0);
});

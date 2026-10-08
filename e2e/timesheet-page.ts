/**
 * Localizadores y acciones de `/planilla` (slice 13). Como en
 * `tracker-page.ts`, todo se busca por rol y por texto accesible. La grilla es
 * una tabla (TS-100): las filas se encuentran por su encabezado de fila, y los
 * totales, por la columna en que caen, porque se nombran por sus encabezados
 * y no por un rótulo propio (D13-12).
 */
import { expect, type Locator, type Page, type Request } from "@playwright/test";

import {
  addDays,
  dayKeyOf,
  dayLabel,
  fullWeekdayLabel,
  weekdayLabel,
  weekLabel,
  weekStartOf,
  type CivilDay,
} from "./days";
import { isAction, withServerAction } from "./network";
import { projectOption, projectPopup, projectSearch, trackerBar } from "./tracker-page";

export const TIMESHEET_PATH = "/planilla";

/** El título de la pantalla, que también nombra la tabla (TS-04, TS-100). */
export const TIMESHEET_HEADING = "Planilla de horarios";

/** TS-91: el título del aviso de una celda que no se guardó. */
export const CELL_NOT_SAVED = "No se pudo guardar la celda.";

/** TS-92: el título del aviso de una fila que no se quitó. */
export const ROW_NOT_REMOVED = "No se pudo quitar la fila.";

/** TS-79: el mensaje del servidor para la celda que hay que editar entrada por entrada. */
export const CELL_NEEDS_ENTRY_EDIT = "Editá las entradas de esta celda desde el detalle.";

/** El texto de `unexpected`, el de una falla de red. */
export const NETWORK_FAILURE =
  "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** TS-87: el vacío de la semana. */
export const EMPTY_WEEK = "No hay horas cargadas esta semana";

/** El rótulo de la fila «Sin proyecto» (TS-20). */
export const NO_PROJECT = "Sin proyecto";

/** Lo que pide la pantalla: sus server actions y sus revalidaciones. */
export function isTimesheetPage(url: URL): boolean {
  return url.pathname === TIMESHEET_PATH;
}

/** La dirección de una semana, la que arman los enlaces de la barra (TS-10). */
export function timesheetHref(start: CivilDay): string {
  return `${TIMESHEET_PATH}?semana=${dayKeyOf(start)}`;
}

/** La URL es la de esa semana: un solo `semana`, con su primer día. */
export function timesheetUrl(start: CivilDay): (url: URL) => boolean {
  return (url) =>
    url.pathname === TIMESHEET_PATH &&
    url.searchParams.getAll("semana").join(",") === dayKeyOf(start);
}

/** «Planilla» en la navegación principal (TS-04). */
export function timesheetNavLink(page: Page): Locator {
  return page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Planilla", exact: true });
}

/** La grilla, nombrada por el título (TS-100). */
export function timesheetTable(page: Page): Locator {
  return page.getByRole("table", { name: TIMESHEET_HEADING, exact: true });
}

/** Entra a la planilla por la navegación, sin recargar, y espera la grilla. */
export async function goToTimesheetByNav(page: Page): Promise<void> {
  await timesheetNavLink(page).click();
  await expect(page).toHaveURL((url) => url.pathname === TIMESHEET_PATH);
  await expect(timesheetTable(page)).toBeVisible();
}

/** Los enlaces de la barra de la semana (TS-09). */
export type WeekLink = "Semana anterior" | "Semana siguiente" | "Esta semana";

export function weekLink(page: Page, name: WeekLink): Locator {
  return page.getByRole("link", { name, exact: true });
}

/** El rango de la semana es un botón que abre el calendario de mes (TS-09). */
export function rangeButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Elegir fecha: / });
}

/**
 * Espera la semana que empieza en `start`: la URL y el rótulo del rango, que
 * dibuja el servidor. La URL sola no alcanza, porque cambia antes de que
 * llegue la pantalla nueva.
 */
export async function expectWeek(
  page: Page,
  start: CivilDay,
  today: CivilDay,
): Promise<void> {
  await expect(page).toHaveURL(timesheetUrl(start));
  await expect(rangeButton(page)).toHaveAccessibleName(
    `Elegir fecha: ${weekLabel(start, today)}`,
  );
}

/** Abre la planilla en la semana que empieza en `start` y espera la grilla. */
export async function openTimesheetWeek(
  page: Page,
  start: CivilDay,
  today: CivilDay,
): Promise<void> {
  await page.goto(timesheetHref(start));
  await expectWeek(page, start, today);
  await expect(timesheetTable(page)).toBeVisible();
}

/** La semana anterior a la de hoy, la de los recorridos que escriben. */
export function lastWeekOf(today: CivilDay): CivilDay {
  return addDays(weekStartOf(today), -7);
}

/** El encabezado de columna de un día (TS-08). */
export function dayHeader(page: Page, day: CivilDay, today: CivilDay): Locator {
  return timesheetTable(page).getByRole("columnheader", {
    name: weekdayLabel(day, today),
    exact: true,
  });
}

/**
 * Una fila de la grilla, por su encabezado de fila: el proyecto, «Proyecto:
 * Tarea» o «Sin proyecto». Los proyectos de los recorridos no tienen
 * cliente, así que el encabezado no dice nada más.
 */
export function timesheetRow(page: Page, rowName: string): Locator {
  return timesheetTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: rowName, exact: true }) });
}

/** El nombre de una celda escribible: «Rediseño: Maquetado, miércoles 01/10» (TS-100). */
export function cellName(rowName: string, day: CivilDay, today: CivilDay): string {
  return `${rowName}, ${fullWeekdayLabel(day, today)}`;
}

/** El campo de una celda escribible. Una que no se escribe es texto y no lo tiene. */
export function cellField(
  page: Page,
  rowName: string,
  day: CivilDay,
  today: CivilDay,
): Locator {
  return timesheetTable(page).getByRole("textbox", {
    name: cellName(rowName, day, today),
    exact: true,
  });
}

/**
 * El campo de una celda mientras un diálogo modal está abierto: lo de afuera
 * queda con `aria-hidden`, así que la búsqueda por rol tiene que incluirlo.
 * Sirve para leer su valor, no para usarlo.
 */
export function coveredCellField(
  page: Page,
  rowName: string,
  day: CivilDay,
  today: CivilDay,
): Locator {
  return page
    .getByRole("table", { name: TIMESHEET_HEADING, exact: true, includeHidden: true })
    .getByRole("textbox", {
      name: cellName(rowName, day, today),
      exact: true,
      includeHidden: true,
    });
}

/** El menú de tres puntos de una celda con entradas (TS-40): «Acciones de la celda {celda}». */
export function cellMenuButton(page: Page, cell: string): Locator {
  return timesheetTable(page).getByRole("button", {
    name: `Acciones de la celda ${cell}`,
    exact: true,
  });
}

/** Una opción del menú abierto de una celda, que va en un portal (D13b-6). */
export function cellMenuItem(
  page: Page,
  name: "Editar" | "Borrar" | "Ver detalle",
): Locator {
  return page.getByRole("menuitem", { name, exact: true });
}

/** La lista de una celda con varias entradas (TS-42): «Detalle de {celda}». */
export function cellDetailDialog(page: Page, cell: string): Locator {
  return page.getByRole("dialog", { name: `Detalle de ${cell}`, exact: true });
}

/** El título de la lista, que recibe el foco (§5.6 del 13b). */
export function cellDetailTitle(dialog: Locator, cell: string): Locator {
  return dialog.getByRole("heading", { name: `Detalle de ${cell}`, exact: true });
}

/**
 * «Editar» o «Borrar» de una entrada de la lista, con su nombre y su horario:
 * «Editar «b», de 12:00 a 13:00» (§5.8 del 13b).
 */
export function detailEntryButton(
  dialog: Locator,
  action: "Editar" | "Borrar",
  entry: string,
  span: string,
): Locator {
  return dialog.getByRole("button", {
    name: `${action} «${entry}», ${span}`,
    exact: true,
  });
}

/** El editor de una entrada desde la planilla: el diálogo del calendario (TS-41). */
export function entryEditor(page: Page): Locator {
  return page.getByRole("dialog", { name: "Editar entrada", exact: true });
}

/** La confirmación del borrado de una entrada (TT-61). */
export function deleteEntryConfirm(page: Page): Locator {
  return page.getByRole("dialog", { name: "¿Borrar esta entrada?", exact: true });
}

/**
 * Las celdas de datos de una fila, en el orden de las columnas: los siete
 * días, el total y la de «Quitar fila». El encabezado de fila no es una.
 */
function dataCells(row: Locator): Locator {
  return row.getByRole("cell");
}

/** El total de una fila (TS-44): la celda de la columna «Total». */
export function rowTotal(page: Page, rowName: string): Locator {
  return dataCells(timesheetRow(page, rowName)).nth(7);
}

/** La fila de los totales del pie, con el encabezado de fila «Total». */
function totalsRow(page: Page): Locator {
  return timesheetTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Total", exact: true }) });
}

/** El total de un día (TS-45), por su lugar en la semana: 0 es el primer día. */
export function dayTotal(page: Page, weekStart: CivilDay, day: CivilDay): Locator {
  const index = Math.round(
    (Date.UTC(day.year, day.month - 1, day.day) -
      Date.UTC(weekStart.year, weekStart.month - 1, weekStart.day)) /
      86_400_000,
  );
  return dataCells(totalsRow(page)).nth(index);
}

/** El total de la semana (TS-46), en la columna «Total» del pie. */
export function weekTotal(page: Page): Locator {
  return dataCells(totalsRow(page)).nth(7);
}

/** «Añadir nueva fila», debajo de la grilla (TS-16). */
export function addRowButton(page: Page): Locator {
  return page.getByRole("button", { name: "Añadir nueva fila", exact: true });
}

/** El selector de la fila nueva, que dice «Seleccionar proyecto» (TS-16). */
export function newRowPicker(page: Page): Locator {
  return timesheetTable(page).getByRole("combobox", {
    name: "Proyecto de la fila nueva",
    exact: true,
  });
}

/**
 * Agrega una fila y elige su par. `option` es el nombre de la opción —el
 * proyecto, «Proyecto: Tarea» o «Sin proyecto»— y `search`, lo que se busca
 * para verla: la base acumula los proyectos de todas las corridas. Termina con
 * la fila ya nombrada por su par y sin selector (TS-23).
 */
export async function addRow(page: Page, option: string, search = ""): Promise<void> {
  await addRowButton(page).click();
  const picker = newRowPicker(page);
  await expect(picker).toBeFocused();
  await expect(picker).toHaveText("Seleccionar proyecto");
  await picker.click();
  await expect(projectSearch(page)).toBeFocused();
  if (search !== "") {
    await projectSearch(page).fill(search);
  }
  await projectOption(page, option).click();
  await expect(projectPopup(page)).toBeHidden();
  await expect(newRowPicker(page)).toHaveCount(0);
  await expect(timesheetRow(page, option)).toBeVisible();
}

/**
 * Escribe en una celda, la confirma con `key` y espera la respuesta del
 * servidor: la celda muestra el valor pedido antes de que llegue (§5.6).
 */
export async function writeCell(
  page: Page,
  field: Locator,
  text: string,
  key: "Enter" | "Tab" = "Tab",
): Promise<void> {
  await field.fill(text);
  await withServerAction(page, () => field.press(key));
}

/** «Quitar fila {fila}», la X después del total (TS-52). */
export function removeRowButton(page: Page, rowName: string): Locator {
  return timesheetTable(page).getByRole("button", {
    name: `Quitar fila ${rowName}`,
    exact: true,
  });
}

/** El diálogo de TS-53, por su título. Va en un portal. */
export function removeRowDialog(page: Page, rowName: string): Locator {
  return page.getByRole("dialog", { name: `¿Quitar la fila «${rowName}»?`, exact: true });
}

/** El aviso de una falla en la pantalla, por su título (TS-91, TS-92). */
export function screenNotice(page: Page, title: string): Locator {
  return page.getByRole("alert").filter({ hasText: title });
}

/** Un pedido de escritura de celda para el día `day`: su cuerpo lleva la fecha. */
export function isCellWriteFor(day: CivilDay): (request: Request) => boolean {
  return (request) =>
    isAction(request) && (request.postData() ?? "").includes(`"${dayKeyOf(day)}"`);
}

/**
 * Retiene la respuesta de las escrituras de celda del día `day` hasta que se
 * llame a lo que devuelve. El pedido llega entero al servidor, que lo aplica;
 * el navegador recibe la respuesta recién al soltarla. Las demás server
 * actions pasan sin tocarse.
 */
export async function holdCellWrites(page: Page, day: CivilDay): Promise<() => void> {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const matches = isCellWriteFor(day);
  await page.route(isTimesheetPage, async (route) => {
    if (!matches(route.request())) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  return release;
}

/** El grupo de un día en el rastreador, por el rótulo de su encabezado (TT-44). */
export function trackerDay(page: Page, day: CivilDay, today: CivilDay): Locator {
  return page.getByRole("region", { name: dayLabel(day, today), exact: true });
}

/** Abre el rastreador con la ventana extendida hasta `start` (TT-52). */
export async function openTrackerFrom(page: Page, start: CivilDay): Promise<void> {
  await page.goto(`/?desde=${dayKeyOf(start)}`);
  await expect(trackerBar(page)).toBeVisible();
}

/**
 * Las casillas de las entradas de un día del rastreador con esa descripción:
 * una por entrada, con sus horas en el nombre (TT-62). La planilla crea sin
 * descripción, que la pantalla nombra «Sin descripción».
 */
export function trackerEntries(group: Locator, description = "Sin descripción"): Locator {
  return group.getByRole("checkbox", {
    name: new RegExp(`^Seleccionar «${description}», `),
  });
}

/** La casilla de una entrada con esas horas: «09:00 – 10:30». */
export function trackerEntry(
  group: Locator,
  times: string,
  description = "Sin descripción",
): Locator {
  return group.getByRole("checkbox", {
    name: `Seleccionar «${description}», ${times}`,
    exact: true,
  });
}

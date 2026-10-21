import type { Locator, Page, Response } from "@playwright/test";

import {
  closedBlockName,
  clickSlot,
  dayColumn,
  dialogButton,
  dialogDescription,
  entryBlock,
  entryDialog,
  openLastWeek,
  PERSON_TIMEZONE,
} from "./calendar-page";
import { projectCountNamed, setMembershipStatus } from "./database";
import { addDays, todayIn } from "./days";
import {
  holdRefreshes,
  isAction,
  loseActionResponses,
  withServerAction,
} from "./network";
import {
  billableByDefaultField,
  dialogNotice,
  nameField,
  newProjectDialog,
  saveButton,
} from "./projects-page";
import { expect, test } from "./session";
import {
  addRowButton,
  cellField,
  lastWeekOf,
  newRowPicker,
  openTimesheetWeek,
  timesheetRow,
  writeCell,
} from "./timesheet-page";
import {
  addButton,
  addManualEntry,
  bulkStatus,
  chooseMode,
  createProjectOption,
  descriptionInput,
  entryCheckbox,
  entryRow,
  expectBillable,
  isTrackerPage,
  openBulkEdit,
  openProjectPicker,
  projectPicker,
  projectPopup,
  projectSearch,
  selectionOptions,
  todayGroup,
  trackerBar,
  typeManualDraft,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos de TT-09 en P1: «Crear proyecto» al final del selector, en cada
 * lugar que lo usa (§9.3.3 del contrato, criterios 18 y 19).
 *
 * Cada persona entra como `member`, que crea proyectos (PR-59). El proyecto
 * creado no se puede borrar hasta P2, así que su nombre lleva el sufijo del
 * recorrido. Lo que se afirma después de elegirlo se vuelve a afirmar tras una
 * recarga: el selector muestra la selección antes de que el servidor la
 * guarde, y solo la carga nueva dice lo que quedó.
 */

/** TT-07: la búsqueda sin coincidencias, que sigue con la opción debajo. */
const NO_MATCHES = "Ningún proyecto coincide con la búsqueda.";

/** TT-90: el título del aviso del diálogo de TT-09. */
const PROJECT_NOT_CREATED = "No se pudo crear el proyecto.";

/** TT-89 y PR-90: el aviso de la falla de red, el único con «Reintentar». */
const SAVE_FAILED = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** PR-15: la ayuda del color, que el alta lleva (D-P1-9). */
const COLOR_HINT = "Si no elegís uno, se asigna automáticamente.";

/** TT-06: lo que muestra la barra sin proyecto. */
const NO_SELECTION = "Proyecto";

/** Las horas de las entradas que carga `addManualEntry`, como las muestra su casilla. */
const MANUAL_TIMES = "00:00 – 00:01";

/**
 * Abre el selector desde `trigger`, busca `search` y elige «Crear proyecto»
 * con el mouse. Devuelve el diálogo de alta, que arranca con la búsqueda
 * recortada como nombre (D-P1-10).
 */
async function openCreateFromPicker(
  page: Page,
  trigger: Locator,
  search: string,
): Promise<Locator> {
  await trigger.click();
  await expect(projectSearch(page)).toBeFocused();
  await projectSearch(page).fill(search);
  await createProjectOption(page).click();
  await expect(projectPopup(page)).toBeHidden();
  const dialog = newProjectDialog(page);
  await expect(dialog).toBeVisible();
  await expect(nameField(dialog)).toHaveValue(search.trim());
  return dialog;
}

/**
 * Crea un proyecto desde el selector de `trigger` y espera que el diálogo se
 * cierre con la respuesta del alta. `billable` marca «Facturable por
 * defecto».
 */
async function createFromPicker(
  page: Page,
  trigger: Locator,
  name: string,
  billable = false,
): Promise<void> {
  const dialog = await openCreateFromPicker(page, trigger, name);
  if (billable) {
    await billableByDefaultField(dialog).check();
  }
  await withServerAction(page, () => saveButton(dialog).click());
  await expect(dialog).toBeHidden();
}

/**
 * Corre `act` y espera `count` respuestas de server actions, todas bien. Con
 * TT-09 en una fila son dos: el alta y, cuando el catálogo trae el proyecto,
 * el cambio de la entrada (D-P1-11).
 */
async function settleActions(
  page: Page,
  count: number,
  act: () => Promise<void>,
): Promise<void> {
  const settled: Response[] = [];
  const listener = (response: Response): void => {
    if (isAction(response.request())) {
      settled.push(response);
    }
  };
  page.on("response", listener);
  try {
    await act();
    await expect
      .poll(() => settled.length, { message: `se esperaban ${count} respuestas` })
      .toBe(count);
  } finally {
    page.off("response", listener);
  }
  for (const response of settled) {
    expect(response.ok(), `la action respondió ${response.status()}`).toBeTruthy();
  }
}

test("en la barra, «Crear proyecto» se alcanza con las flechas, y el proyecto facturable creado queda elegido con la barra facturable", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Desde la barra ${suffix}`;
  const description = `entrada con proyecto nuevo ${suffix}`;

  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await typeManualDraft(bar, description, "00:00", "00:01");
  await expectBillable(bar, false);

  // D-P1-10: sin coincidencias, el vacío de TT-07 y la opción debajo, que se
  // alcanza con la flecha y se elige con Enter.
  await openProjectPicker(page, bar);
  await projectSearch(page).fill(`  ${project}  `);
  await expect(
    projectPopup(page).getByRole("status").filter({ hasText: NO_MATCHES }),
  ).toBeVisible();
  await expect(selectionOptions(page)).toHaveCount(0);
  const optionId = await createProjectOption(page).getAttribute("id");
  expect(optionId).not.toBeNull();
  await projectSearch(page).press("ArrowDown");
  await expect(projectSearch(page)).toHaveAttribute(
    "aria-activedescendant",
    optionId ?? "",
  );
  await projectSearch(page).press("Enter");

  // El alta en su forma de alta, con la búsqueda recortada como nombre.
  const dialog = newProjectDialog(page);
  await expect(nameField(dialog)).toHaveValue(project);
  await expect(dialog.getByText(COLOR_HINT, { exact: true })).toBeVisible();
  await expect(billableByDefaultField(dialog)).not.toBeChecked();
  await billableByDefaultField(dialog).check();
  await withServerAction(page, () => saveButton(dialog).click());

  // D-P1-11, TT-14: queda elegido, con el foco en el disparador, y la barra
  // toma el facturable del proyecto nuevo.
  await expect(dialog).toBeHidden();
  await expect(projectPicker(bar)).toHaveText(project);
  await expect(projectPicker(bar)).toBeFocused();
  await expectBillable(bar, true);
  await expect(descriptionInput(bar)).toHaveValue(description);

  await withServerAction(page, () => addButton(bar).click());
  const row = entryRow(todayGroup(page), description);
  await expect(projectPicker(row)).toHaveText(project);
  await expectBillable(row, true);
  await page.reload();
  await expect(projectPicker(entryRow(todayGroup(page), description))).toHaveText(
    project,
  );
  await expectBillable(entryRow(todayGroup(page), description), true);
});

test("en una fila, crear un proyecto desde su selector deja la entrada con el proyecto y su facturable", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Desde la fila ${suffix}`;
  const description = `entrada sin proyecto ${suffix}`;

  await page.goto("/");
  await addManualEntry(page, description);
  const row = entryRow(todayGroup(page), description);
  await expectBillable(row, false);

  // El alta y, con el catálogo nuevo, el cambio de la entrada (TT-27).
  await settleActions(page, 2, () =>
    createFromPicker(page, projectPicker(row), project, true),
  );
  await expect(projectPicker(row)).toHaveText(project);
  await expectBillable(row, true);

  await page.reload();
  const reloaded = entryRow(todayGroup(page), description);
  await expect(projectPicker(reloaded)).toHaveText(project);
  await expectBillable(reloaded, true);
});

test("en la planilla, una fila nueva toma el proyecto creado y su celda se escribe", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Desde la planilla ${suffix}`;
  const today = todayIn(PERSON_TIMEZONE);
  const week = lastWeekOf(today);

  await openTimesheetWeek(page, week, today);
  await addRowButton(page).click();
  await createFromPicker(page, newRowPicker(page), project);

  // D-P1-11, D13-8: la fila toma el par cuando el catálogo lo trae, y es
  // cargable.
  await expect(newRowPicker(page)).toHaveCount(0);
  await expect(timesheetRow(page, project)).toBeVisible();
  const field = cellField(page, project, week, today);
  await writeCell(page, field, "0:30");
  await expect(field).toHaveValue("0:30");

  await page.reload();
  await expect(cellField(page, project, week, today)).toHaveValue("0:30");
});

test("en el diálogo del calendario, Escape cierra solo el alta anidada, y después el proyecto creado se guarda con la entrada", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Desde el calendario ${suffix}`;
  const description = `bloque con proyecto nuevo ${suffix}`;
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const tuesday = addDays(lastWeek, 1);

  await clickSlot(page, tuesday, today, "09:00");
  const dialog = entryDialog(page, "Agregar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  await dialogDescription(dialog).fill(description);

  // D-P1-10, CAL-67: Escape cierra el de arriba; el de abajo sigue con su
  // borrador, y el foco vuelve al disparador del selector.
  const nested = await openCreateFromPicker(page, projectPicker(dialog), project);
  await page.keyboard.press("Escape");
  await expect(nested).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(dialogDescription(dialog)).toHaveValue(description);
  await expect(projectPicker(dialog)).toBeFocused();
  await expect(projectPicker(dialog)).not.toHaveText(project);
  expect(await projectCountNamed(project)).toBe(0);

  // Ahora sí: el proyecto queda en el borrador y se guarda con la entrada.
  await createFromPicker(page, projectPicker(dialog), project);
  await expect(dialog).toBeVisible();
  await expect(projectPicker(dialog)).toHaveText(project);
  await withServerAction(page, () => dialogButton(dialog, "Agregar").click());
  await expect(dialog).toBeHidden();

  const block = closedBlockName({
    description,
    day: tuesday,
    today,
    start: "09:00",
    end: "10:00",
    duration: "1:00",
    project,
  });
  await expect(entryBlock(dayColumn(page, tuesday, today), block)).toBeVisible();
  await page.reload();
  await expect(entryBlock(dayColumn(page, tuesday, today), block)).toBeVisible();
});

test("en la edición masiva, el proyecto creado desde su selector se aplica a las entradas elegidas", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Desde la edición masiva ${suffix}`;
  const first = `primera ${suffix}`;
  const second = `segunda ${suffix}`;

  await page.goto("/");
  await addManualEntry(page, first);
  await addManualEntry(page, second);
  for (const description of [first, second]) {
    await entryCheckbox(todayGroup(page), description, MANUAL_TIMES).click();
  }
  await expect(bulkStatus(page)).toHaveText("2 entradas seleccionadas");
  const dialog = await openBulkEdit(page, "Editar 2 entradas");

  await createFromPicker(page, projectPicker(dialog), project);
  await expect(dialog).toBeVisible();
  await expect(projectPicker(dialog)).toHaveText(project);
  await withServerAction(page, () => saveButton(dialog).click());
  await expect(dialog).toBeHidden();
  await expect(bulkStatus(page)).toHaveText("Se editaron 2 entradas.");

  await page.reload();
  for (const description of [first, second]) {
    await expect(projectPicker(entryRow(todayGroup(page), description))).toHaveText(
      project,
    );
  }
});

test("cancelar el alta devuelve el foco al disparador sin elegir ni crear nada", async ({
  page,
}) => {
  const project = `Cancelado ${uniqueSuffix()}`;

  await page.goto("/");
  const bar = trackerBar(page);
  const dialog = await openCreateFromPicker(page, projectPicker(bar), project);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(projectPicker(bar)).toBeFocused();
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);
  expect(await projectCountNamed(project)).toBe(0);
});

test("«Reintentar» después de una respuesta perdida deja un solo proyecto y lo elige", async ({
  page,
}) => {
  const project = `Reintentado desde la barra ${uniqueSuffix()}`;

  await page.goto("/");
  const bar = trackerBar(page);
  const releaseRefreshes = await holdRefreshes(page, isTrackerPage);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  const dialog = await openCreateFromPicker(page, projectPicker(bar), project);
  await saveButton(dialog).click();

  // PR-90: el aviso de la red, en el diálogo, con lo escrito.
  const notice = dialogNotice(dialog, SAVE_FAILED);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(PROJECT_NOT_CREATED);
  await expect(nameField(dialog)).toHaveValue(project);
  // El primer intento se aplicó: si no, el reintento sería la primera alta.
  expect(await projectCountNamed(project)).toBe(1);

  // ADR 0007: el reintento lleva el mismo id y responde ese proyecto.
  await restoreResponses();
  await withServerAction(page, async () => {
    await notice.getByRole("button", { name: "Reintentar" }).click();
    releaseRefreshes();
  });
  await expect(dialog).toBeHidden();
  await expect(projectPicker(bar)).toHaveText(project);
  expect(await projectCountNamed(project)).toBe(1);
});

test("con la membresía desactivada, ni la barra ni la fila ofrecen el selector, y con él «Crear proyecto»", async ({
  page,
  email,
}) => {
  const description = `entrada de una inactiva ${uniqueSuffix()}`;

  await page.goto("/");
  await addManualEntry(page, description);

  // Activa, la opción está.
  await openProjectPicker(page, trackerBar(page));
  await expect(createProjectOption(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(projectPopup(page)).toBeHidden();

  // TT-92: en solo lectura, sin disparador no hay opción.
  await setMembershipStatus(email, "inactive");
  await page.reload();
  const row = entryRow(todayGroup(page), description);
  await expect(row).toBeVisible();
  await expect(projectPicker(trackerBar(page))).toHaveCount(0);
  await expect(projectPicker(row)).toHaveCount(0);
  await expect(createProjectOption(page)).toHaveCount(0);
});

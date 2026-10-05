import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import {
  addEntry,
  calendarRegion,
  closedBlockName,
  dayColumn,
  dialogBillable,
  dialogButton,
  dialogDescription,
  entryBlock,
  entryDialog,
  openDetails,
  openLastWeek,
  PERSON_TIMEZONE,
} from "./calendar-page";
import { seedProject } from "./database";
import { addDays, todayIn } from "./days";
import { withServerAction } from "./network";
import { expect, test } from "./session";
import {
  billableToggle,
  chooseMode,
  descriptionInput,
  entryRow,
  pickProject,
  projectPicker,
  setClock,
  startTimer,
  stopTimer,
  todayGroup,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos del slice 11a: el facturable (§7 del contrato, «Recorridos
 * obligatorios de `e2e/billable.spec.ts`»). Una persona por recorrido, que da
 * la sesión. El workspace es uno solo para todos los specs y los proyectos no
 * se pueden borrar en la fase 1, así que todo nombre sembrado o creado lleva
 * un sufijo propio del recorrido, y el selector de proyecto lo busca por ese
 * sufijo. Los proyectos se siembran antes de entrar a la pantalla, que lee el
 * catálogo al cargar. Las entradas cerradas del rastreador van de 00:00 a
 * 00:01 de hoy, que ya pasó a cualquier hora de la corrida; las del
 * calendario, en la semana anterior.
 *
 * Cada valor que se afirma después de una mutación se vuelve a afirmar tras
 * una recarga: la barra y la fila muestran el facturable con su vista
 * optimista, y solo la carga nueva dice lo que escribió el servidor.
 */

/** TT-06: lo que muestra la barra sin proyecto. */
const NO_SELECTION = "Proyecto";

/** PR-21, H-8: la ayuda de la casilla del alta de proyecto. */
const BILLABLE_BY_DEFAULT_HINT =
  "Las entradas nuevas con este proyecto arrancan facturables.";

const PROJECTS_PATH = "/proyectos";

/** Sufijo único del recorrido, para que la próxima corrida no choque con esta. */
function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

/** TT-14, H-7: el control de `scope` presionado o no, por su `aria-pressed`. */
async function expectBillable(scope: Locator, billable: boolean): Promise<void> {
  await expect(billableToggle(scope)).toHaveAttribute("aria-pressed", String(billable));
}

/** El botón de continuar de una fila (TT-57). */
function continueButton(scope: Locator, description: string): Locator {
  return scope.getByRole("button", { name: `Continuar «${description}»`, exact: true });
}

/**
 * Crea un proyecto sin cliente desde «Nuevo proyecto», con «Facturable por
 * defecto» marcado (PR-21), y espera que el diálogo se cierre con el foco de
 * vuelta en su botón y el proyecto en «Sin cliente».
 */
async function createBillableProject(page: Page, name: string): Promise<void> {
  await page.goto(PROJECTS_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Nuevo proyecto", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Nuevo proyecto" });
  await dialog.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);

  // H-8: sin marcar, con la ayuda asociada.
  const billableByDefault = dialog.getByRole("checkbox", {
    name: "Facturable por defecto",
    exact: true,
  });
  await expect(billableByDefault).not.toBeChecked();
  await expect(billableByDefault).toHaveAccessibleDescription(BILLABLE_BY_DEFAULT_HINT);
  await billableByDefault.check();

  await withServerAction(page, () =>
    dialog.getByRole("button", { name: "Guardar", exact: true }).click(),
  );
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(
    page
      .getByRole("region", { name: "Sin cliente", exact: true })
      .getByRole("heading", { level: 3, name, exact: true }),
  ).toBeVisible();
}

/**
 * Carga una entrada de hoy desde la barra manual, de 00:00 a 00:01, y espera
 * su fila. Con `project`, lo elige antes buscándolo por `search`.
 */
async function addManualEntry(
  page: Page,
  description: string,
  project?: { readonly name: string; readonly search: string },
): Promise<void> {
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await setClock(bar, "Hora de inicio", "00:00");
  await setClock(bar, "Hora de fin", "00:01");
  if (project !== undefined) {
    await pickProject(page, bar, project.name, project.search);
  }
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(entryRow(todayGroup(page), description)).toBeVisible();
}

test("un proyecto creado facturable por defecto hace facturable el timer que lo elige, y detener deja la barra no facturable", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Facturable ${suffix}`;
  const description = `timer facturable ${suffix}`;

  // PR-21: el alta de proyecto guarda el facturable por defecto.
  await createBillableProject(page, project);

  // TT-14: la barra arranca no facturable, y elegir el proyecto aplica su
  // valor por defecto al borrador.
  await page.goto("/");
  const bar = trackerBar(page);
  await expectBillable(bar, false);
  await pickProject(page, bar, project, suffix);
  await expectBillable(bar, true);

  // TT-38: el timer nació facturable, y una carga nueva lo trae del servidor.
  await startTimer(page, description);
  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(projectPicker(bar)).toHaveText(project);
  await expectBillable(bar, true);

  // TT-49, TT-50: la fila detenida es facturable; la barra queda sin
  // proyecto y no facturable (§5.4, `NO_FIELDS`).
  await stopTimer(page, description);
  const row = entryRow(todayGroup(page), description);
  await expectBillable(row, true);
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);
  await expectBillable(bar, false);

  await page.reload();
  await expectBillable(entryRow(todayGroup(page), description), true);
  await expectBillable(bar, false);
});

test("con el timer corriendo, elegir un proyecto facturable lo vuelve facturable y desmarcarlo se guarda sobre la entrada abierta", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Por defecto ${suffix}`;
  const description = `timer sin proyecto ${suffix}`;
  await seedProject({ name: project, billableByDefault: true });

  await page.goto("/");
  const bar = trackerBar(page);
  await startTimer(page, description);
  await expectBillable(bar, false);

  // D-2, TT-27: otro proyecto impone su valor por defecto a la entrada que
  // corre, con la respuesta del servidor y después de recargar.
  await withServerAction(page, () => pickProject(page, bar, project, suffix));
  await expectBillable(bar, true);
  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(projectPicker(bar)).toHaveText(project);
  await expectBillable(bar, true);

  // TT-27: desmarcarlo viaja sobre la entrada abierta y no le quita el
  // proyecto.
  await withServerAction(page, () => billableToggle(bar).click());
  await expectBillable(bar, false);
  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(description);
  await expect(projectPicker(bar)).toHaveText(project);
  await expectBillable(bar, false);
});

test("la fila alterna el facturable con el foco en el control, y continuarla arranca un timer facturable", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const description = `entrada cerrada ${suffix}`;

  await page.goto("/");
  await addManualEntry(page, description);
  const row = entryRow(todayGroup(page), description);
  const toggle = billableToggle(row);
  await expect(toggle).toHaveAccessibleName(`Entrada «${description}» facturable`);

  // TT-50, H-6: sin proyecto, no facturable. TT-54: la fila lo cambia y el
  // foco se queda en el control.
  await expectBillable(row, false);
  await withServerAction(page, () => toggle.click());
  await expectBillable(row, true);
  await expect(toggle).toBeFocused();
  await page.reload();
  await expectBillable(row, true);

  // TT-57: continuar copia el facturable de la original.
  const bar = trackerBar(page);
  await withServerAction(page, () =>
    continueButton(todayGroup(page), description).click(),
  );
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(description);
  await expectBillable(bar, true);
  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expectBillable(bar, true);
});

test("en modo manual, «Agregar» con un proyecto facturable crea una fila facturable y deja la barra sin proyecto y no facturable", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Manual ${suffix}`;
  const description = `entrada manual ${suffix}`;
  await seedProject({ name: project, billableByDefault: true });

  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await expectBillable(bar, false);
  await descriptionInput(bar).fill(description);
  await setClock(bar, "Hora de inicio", "00:00");
  await setClock(bar, "Hora de fin", "00:01");
  await pickProject(page, bar, project, suffix);
  await expectBillable(bar, true);

  // TT-25: «Agregar» crea la fila con el facturable del borrador y limpia la
  // barra entera, también el facturable.
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  const row = entryRow(todayGroup(page), description);
  await expect(row).toBeVisible();
  await expectBillable(row, true);
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);
  await expectBillable(bar, false);

  await page.reload();
  await expect(projectPicker(entryRow(todayGroup(page), description))).toHaveText(
    project,
  );
  await expectBillable(entryRow(todayGroup(page), description), true);
});

test("en el calendario, marcar «Facturable» y guardar suma «facturable» al nombre del bloque y una línea al detalle", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const description = `horas al cliente ${suffix}`;
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const tuesday = addDays(lastWeek, 1);
  const column = dayColumn(page, tuesday, today);
  const times = {
    description,
    day: tuesday,
    today,
    start: "09:00",
    end: "10:00",
    duration: "1:00",
  };

  // CAL-43: el alta nace no facturable, y el nombre del bloque no lo dice.
  await addEntry(page, { day: tuesday, today, start: "09:00", description });
  const created = entryBlock(column, closedBlockName(times));
  await expect(created).toBeFocused();

  // CAL-45, CAL-66: «Facturable» en el diálogo de edición, y «Guardar» lo
  // escribe.
  await created.click();
  const dialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  const billable = dialogBillable(dialog);
  await expect(billable).toHaveAttribute("aria-pressed", "false");
  await billable.click();
  await expect(billable).toHaveAttribute("aria-pressed", "true");
  await withServerAction(page, () => dialogButton(dialog, "Guardar").click());
  await expect(dialog).toBeHidden();

  // CAL-75: el nombre del bloque termina en «, facturable». CAL-23: su
  // detalle suma la línea «Facturable».
  const saved = entryBlock(column, closedBlockName({ ...times, billable: true }));
  await expect(saved).toBeFocused();
  await saved.hover();
  const detail = openDetails(page);
  await expect(detail).toHaveCount(1);
  await expect(detail).toContainText(description);
  await expect(detail.getByText("Facturable", { exact: true })).toBeVisible();

  // La carga nueva trae lo que escribió el servidor.
  await page.reload();
  await expect(
    entryBlock(
      dayColumn(page, tuesday, today),
      closedBlockName({ ...times, billable: true }),
    ),
  ).toBeVisible();
  await expect(entryBlock(calendarRegion(page), closedBlockName(times))).toHaveCount(0);
});

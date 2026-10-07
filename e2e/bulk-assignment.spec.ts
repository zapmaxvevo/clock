import type { Browser, Locator, Page } from "@playwright/test";

import { archiveProject, seedProject, seedTag } from "./database";
import {
  holdActionResponses,
  loseActionResponses,
  openSecondTab,
  withServerAction,
} from "./network";
import { saveButton } from "./projects-page";
import { expect, test } from "./session";
import {
  addManualEntry,
  billableToggle,
  bulkBillableGroup,
  bulkBillableOption,
  bulkButton,
  bulkDescriptionField,
  bulkEditDialog,
  bulkRegion,
  bulkStatus,
  entryCheckbox,
  entryRow,
  expectActive,
  expectBillable,
  expectInactive,
  isTrackerPage,
  keepButton,
  openBulkEdit,
  openProjectPicker,
  openTagPicker,
  pickProject,
  pickTags,
  projectPicker,
  projectPopup,
  projectSearch,
  rowTagsLabel,
  tagModeGroup,
  tagModeOption,
  tagPicker,
  tagPopup,
  tagSearch,
  tagsName,
  taskOption,
  todayGroup,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos del slice 12: el proyecto, las etiquetas y el facturable en
 * bloque (TT-63, D-2, ADR 0011, ADR 0017; §7 del contrato, «Recorridos
 * obligatorios de `e2e/bulk-assignment.spec.ts`»). Cada recorrido entra con
 * una persona propia y siembra sus entradas, que van de 00:00 a 00:01 de hoy.
 * El workspace es uno solo para todos los specs y lo sembrado no se puede
 * borrar, así que proyectos y etiquetas llevan el sufijo del recorrido, y los
 * selectores los buscan por él. Se siembran antes de entrar a la pantalla,
 * que lee el catálogo al cargar.
 *
 * El diálogo no tiene vista optimista de los campos: la lista que vuelve con
 * la respuesta es la que revalidó el servidor. Igual cada resultado se vuelve
 * a afirmar tras una carga nueva.
 */

/** Las horas de toda entrada del spec, como las muestra su casilla. */
const TODAY_TIMES = "00:00 – 00:01";

/** TT-10 y TT-50: la fila sin proyecto, y la opción del selector. */
const NO_PROJECT = "Sin proyecto";

/** §5.2: lo que muestra el disparador del proyecto sin nada elegido. */
const NO_CHANGE = "Sin cambios";

/** D12-3: la ayuda de «Reemplazar» sin etiquetas. */
const TAGS_CLEARED = "Las entradas quedan sin etiquetas.";

/** D12-5: la ayuda del facturable en «Sin cambios» con un proyecto elegido. */
const BILLABLE_BY_PROJECT =
  "Las entradas que cambian de proyecto toman el facturable por defecto de ese proyecto; las que ya estaban en él conservan el suyo.";

/** TT-90: el título del aviso de la edición masiva. */
const ENTRIES_NOT_EDITED = "No se pudieron editar las entradas.";

/** TT-77. */
const PROJECT_UNAVAILABLE = "Ese proyecto ya no está disponible.";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** TT-07 y TT-12: las búsquedas sin coincidencias. */
const NO_PROJECT_MATCHES = "Ningún proyecto coincide con la búsqueda.";
const NO_TAG_MATCHES = "Ninguna etiqueta coincide con la búsqueda.";

/** El aviso de la edición, que vive en el diálogo mientras está abierto (TT-90). */
function editNotice(dialog: Locator): Locator {
  return dialog.getByRole("alert").filter({ hasText: ENTRIES_NOT_EDITED });
}

/** Elige las casillas de las entradas de hoy y espera la cantidad en la región. */
async function selectToday(page: Page, descriptions: readonly string[]): Promise<void> {
  for (const description of descriptions) {
    await entryCheckbox(todayGroup(page), description, TODAY_TIMES).click();
  }
  const count = descriptions.length;
  await expect(bulkStatus(page)).toHaveText(
    count === 1 ? "1 entrada seleccionada" : `${count} entradas seleccionadas`,
  );
}

/**
 * Guarda y espera la respuesta del servidor. Con éxito, el diálogo se cierra,
 * la selección se vacía y la región se queda con el foco y el resultado
 * (§5.2 del 12, criterio 19 del 6).
 */
async function saveAndExpectEdited(
  page: Page,
  dialog: Locator,
  count: number,
): Promise<void> {
  await withServerAction(page, () => saveButton(dialog).click());
  await expect(dialog).toBeHidden();
  await expect(bulkRegion(page)).toBeFocused();
  await expect(bulkStatus(page)).toHaveText(`Se editaron ${count} entradas.`);
}

/**
 * Comprueba desde otra pestaña de la misma persona que el primer intento se
 * aplicó: cada fila ya tiene `tag`. Sin esto, un pedido que no hubiera
 * llegado haría pasar el recorrido sin probar nada, porque el reintento sería
 * el primer pedido (criterio 9, m5).
 */
async function expectTaggedElsewhere(
  browser: Browser,
  email: string,
  descriptions: readonly string[],
  tag: string,
): Promise<void> {
  const other = await openSecondTab(browser, email);
  for (const description of descriptions) {
    await expect(
      tagPicker(entryRow(todayGroup(other), description)),
    ).toHaveAccessibleName(tagsName(rowTagsLabel(description), [tag]));
  }
  await other.context().close();
}

test("elegir «Proyecto: Tarea» en bloque cambia las dos filas, y el facturable sigue D-2 en cada una", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Facturable ${suffix}`;
  const task = `Tarea ${suffix}`;
  const loose = `suelta ${suffix}`;
  const inProject = `en el proyecto ${suffix}`;
  await seedProject({ name: project, billableByDefault: true, tasks: [task] });

  // «a» sin proyecto, no facturable; «b» en P, que la hizo facturable, y
  // apagada desde la fila (TT-14).
  await page.goto("/");
  await addManualEntry(page, loose);
  await addManualEntry(page, inProject, { project: { option: project, search: suffix } });
  const today = todayGroup(page);
  await expectBillable(entryRow(today, inProject), true);
  await withServerAction(page, () => billableToggle(entryRow(today, inProject)).click());
  await expectBillable(entryRow(today, inProject), false);
  await expectBillable(entryRow(today, loose), false);

  await selectToday(page, [loose, inProject]);
  const dialog = await openBulkEdit(page, "Editar 2 entradas");

  // §5.2: el selector arranca en «Sin cambios»; elegir muestra «P: T».
  await expect(projectPicker(dialog)).toHaveText(NO_CHANGE);
  await pickProject(page, dialog, taskOption(project, task), suffix);
  await expect(projectPicker(dialog)).toHaveText(taskOption(project, task));
  await expect(bulkBillableOption(dialog, "Sin cambios")).toBeChecked();
  await saveAndExpectEdited(page, dialog, 2);

  // Criterio 4, D-2: «a» cambió de proyecto y toma el por defecto de P;
  // «b» ya estaba en P y conserva el suyo.
  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
    }
    const group = todayGroup(page);
    await expect(projectPicker(entryRow(group, loose))).toHaveText(
      taskOption(project, task),
    );
    await expect(projectPicker(entryRow(group, inProject))).toHaveText(
      taskOption(project, task),
    );
    await expectBillable(entryRow(group, loose), true);
    await expectBillable(entryRow(group, inProject), false);
  }
});

test("«Sin proyecto» con el facturable en «No» deja las dos filas sin proyecto y no facturables, y la ayuda del facturable sale solo con un proyecto", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Por defecto ${suffix}`;
  const inProject = `con proyecto ${suffix}`;
  const loose = `sin proyecto ${suffix}`;
  await seedProject({ name: project, billableByDefault: true });

  await page.goto("/");
  await addManualEntry(page, inProject, { project: { option: project, search: suffix } });
  await addManualEntry(page, loose);
  const today = todayGroup(page);
  await expectBillable(entryRow(today, inProject), true);
  await expectBillable(entryRow(today, loose), false);

  await selectToday(page, [inProject, loose]);
  const dialog = await openBulkEdit(page, "Editar 2 entradas");
  const hint = dialog.getByText(BILLABLE_BY_PROJECT, { exact: true });
  await expect(bulkBillableOption(dialog, "Sin cambios")).toBeChecked();
  await expect(hint).toBeHidden();

  // D12-5: con Q elegido y el facturable en «Sin cambios», la ayuda dice la
  // regla de D-2 y describe al grupo.
  await pickProject(page, dialog, project, suffix);
  await expect(hint).toBeVisible();
  await expect(bulkBillableGroup(dialog)).toHaveAccessibleDescription(
    BILLABLE_BY_PROJECT,
  );

  // Con «Sin proyecto» ninguna fila toma un por defecto: sin ayuda.
  await pickProject(page, dialog, NO_PROJECT);
  await expect(projectPicker(dialog)).toHaveText(NO_PROJECT);
  await expect(hint).toBeHidden();

  // Criterio 5: el facturable pedido gana en todas.
  await bulkBillableOption(dialog, "No").click();
  await expect(bulkBillableOption(dialog, "No")).toBeChecked();
  await saveAndExpectEdited(page, dialog, 2);

  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
    }
    const group = todayGroup(page);
    for (const description of [inProject, loose]) {
      await expect(projectPicker(entryRow(group, description))).toHaveText(NO_PROJECT);
      await expectBillable(entryRow(group, description), false);
    }
  }
});

test("«Agregar» suma a las etiquetas de cada fila, «Reemplazar» deja las elegidas, y «Reemplazar» sin ninguna las quita", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  // Los nombres van en orden alfabético, que es como los nombra el disparador.
  const first = `Alfa ${suffix}`;
  const second = `Beta ${suffix}`;
  const third = `Gama ${suffix}`;
  const tagged = `etiquetada ${suffix}`;
  const bare = `pelada ${suffix}`;
  for (const tag of [first, second, third]) {
    await seedTag(tag);
  }

  await page.goto("/");
  await addManualEntry(page, tagged, { tags: [first] });
  await addManualEntry(page, bare);

  /** Las etiquetas de las dos filas, antes y después de una carga nueva. */
  async function expectTags(
    taggedNames: readonly string[],
    bareNames: readonly string[],
  ): Promise<void> {
    for (const reload of [false, true]) {
      if (reload) {
        await page.reload();
      }
      const group = todayGroup(page);
      await expect(tagPicker(entryRow(group, tagged))).toHaveAccessibleName(
        tagsName(rowTagsLabel(tagged), taggedNames),
      );
      await expect(tagPicker(entryRow(group, bare))).toHaveAccessibleName(
        tagsName(rowTagsLabel(bare), bareNames),
      );
    }
  }

  // Criterio 19: «Agregar» sin etiquetas no es un cambio.
  await selectToday(page, [tagged, bare]);
  let dialog = await openBulkEdit(page, "Editar 2 entradas");
  await expect(tagModeOption(dialog, "Agregar a las que tienen")).toBeChecked();
  await expectInactive(saveButton(dialog));

  // «Agregar» Y: cada fila suma Y a lo que tenía.
  await pickTags(page, dialog, [second]);
  await expect(tagPicker(dialog)).toHaveAccessibleName(`Etiquetas: ${second}`);
  await expectActive(saveButton(dialog));
  await saveAndExpectEdited(page, dialog, 2);
  await expectTags([first, second], [second]);

  // «Reemplazar» por Z: las dos quedan solo con Z.
  await selectToday(page, [tagged, bare]);
  dialog = await openBulkEdit(page, "Editar 2 entradas");
  await pickTags(page, dialog, [third]);
  await tagModeOption(dialog, "Reemplazar las que tienen").click();
  await expect(tagModeOption(dialog, "Reemplazar las que tienen")).toBeChecked();
  await saveAndExpectEdited(page, dialog, 2);
  await expectTags([third], [third]);

  // D12-3: «Reemplazar» sin ninguna es un cambio, con su aviso a la vista y
  // asociado al grupo.
  await selectToday(page, [tagged, bare]);
  dialog = await openBulkEdit(page, "Editar 2 entradas");
  await expect(dialog.getByText(TAGS_CLEARED, { exact: true })).toBeHidden();
  await tagModeOption(dialog, "Reemplazar las que tienen").click();
  await expect(dialog.getByText(TAGS_CLEARED, { exact: true })).toBeVisible();
  await expect(tagModeGroup(dialog)).toHaveAccessibleDescription(TAGS_CLEARED);
  await expectActive(saveButton(dialog));
  await saveAndExpectEdited(page, dialog, 2);
  await expectTags([], []);
});

test("un proyecto archivado con el diálogo abierto frena el pedido entero con TT-77, sin lista ni «Reintentar», y ninguna fila cambia", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const kept = `Se queda ${suffix}`;
  const archived = `Se archiva ${suffix}`;
  const inProject = `en su proyecto ${suffix}`;
  const loose = `sin el suyo ${suffix}`;
  await seedProject({ name: kept });
  await seedProject({ name: archived });

  await page.goto("/");
  await addManualEntry(page, inProject, { project: { option: kept, search: suffix } });
  await addManualEntry(page, loose);

  await selectToday(page, [inProject, loose]);
  const dialog = await openBulkEdit(page, "Editar 2 entradas");
  await pickProject(page, dialog, archived, suffix);

  // Otra persona lo archiva antes de «Guardar» (TT-77).
  await archiveProject(archived);
  await withServerAction(page, () => saveButton(dialog).click());

  // §4.8, ADR 0017: un error del pedido entero, con título y mensaje, sin la
  // lista de filas y sin «Reintentar», porque no es `unexpected`.
  const notice = editNotice(dialog);
  await expect(notice).toContainText(PROJECT_UNAVAILABLE);
  await expect(notice.getByRole("list")).toHaveCount(0);
  await expect(
    notice.getByRole("button", { name: "Quitar esas entradas de la selección" }),
  ).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(projectPicker(dialog)).toHaveText(archived);

  // Cerrarlo vuelve a «Editar»; todo o nada, ninguna fila cambió.
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(bulkButton(page, "Editar")).toBeFocused();
  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
    }
    const group = todayGroup(page);
    await expect(projectPicker(entryRow(group, inProject))).toHaveText(kept);
    await expect(projectPicker(entryRow(group, loose))).toHaveText(NO_PROJECT);
  }
});

test("a 1366×657, con el aviso de TT-77 a la vista, el título y «Cerrar» quedan dentro de la ventana y se llega a «Guardar» desplazando", async ({
  page,
}) => {
  // F1 de las revisiones: la ventana de una notebook, con el diálogo en su
  // alto mayor: un proyecto elegido con su ayuda, «Reemplazar» con la suya y
  // el aviso del pedido rechazado.
  await page.setViewportSize({ width: 1366, height: 657 });
  const suffix = uniqueSuffix();
  const archived = `Ventana baja ${suffix}`;
  const first = `ventana uno ${suffix}`;
  const second = `ventana dos ${suffix}`;
  await seedProject({ name: archived });

  await page.goto("/");
  await addManualEntry(page, first);
  await addManualEntry(page, second);
  await selectToday(page, [first, second]);
  const dialog = await openBulkEdit(page, "Editar 2 entradas");
  await pickProject(page, dialog, archived, suffix);
  await tagModeOption(dialog, "Reemplazar las que tienen").click();
  await expect(dialog.getByText(BILLABLE_BY_PROJECT, { exact: true })).toBeVisible();
  await expect(dialog.getByText(TAGS_CLEARED, { exact: true })).toBeVisible();

  // Enter en «Descripción» guarda (§5.4 del 6) sin depender de que «Guardar»
  // esté a la vista, que es lo que el recorrido mira después.
  await archiveProject(archived);
  await withServerAction(page, () => bulkDescriptionField(dialog).press("Enter"));
  await expect(editNotice(dialog)).toContainText(PROJECT_UNAVAILABLE);

  // El encabezado entero dentro de la ventana: el título dice qué se edita y
  // «Cerrar» es la salida que no pide teclado.
  await expect(
    dialog.getByRole("heading", { name: "Editar 2 entradas", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    dialog.getByRole("button", { name: "Cerrar", exact: true }),
  ).toBeInViewport({
    ratio: 1,
  });

  // «Guardar» se alcanza desplazando lo que el diálogo deje desplazar.
  const save = saveButton(dialog);
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport({ ratio: 1 });
});

test("«No cambiar» vuelve cada selector a «Sin cambios» con el foco en su disparador, y `Escape` sin coincidencias cierra solo el selector", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Elegible ${suffix}`;
  const description = `sin tocar ${suffix}`;
  await seedProject({ name: project });

  await page.goto("/");
  await addManualEntry(page, description);
  await selectToday(page, [description]);
  const dialog = await openBulkEdit(page, "Editar 1 entrada");
  const keepProject = keepButton(dialog, "No cambiar el proyecto");
  const keepTags = keepButton(dialog, "No cambiar las etiquetas");
  await expect(keepProject).toHaveCount(0);
  await expect(keepTags).toHaveCount(0);
  await expectInactive(saveButton(dialog));

  // §5.2: «No cambiar el proyecto» se va con la elección y el foco pasa al
  // disparador, que vuelve a «Sin cambios».
  await pickProject(page, dialog, project, suffix);
  await expectActive(saveButton(dialog));
  await keepProject.click();
  await expect(keepProject).toHaveCount(0);
  await expect(projectPicker(dialog)).toHaveText(NO_CHANGE);
  await expect(projectPicker(dialog)).toBeFocused();
  await expectInactive(saveButton(dialog));

  // Con la lista vacía, `Escape` cierra solo el selector (m12 del 11b).
  await openProjectPicker(page, dialog);
  await projectSearch(page).fill(`inexistente ${suffix}`);
  await expect(
    projectPopup(page).getByRole("status").filter({ hasText: NO_PROJECT_MATCHES }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(projectPopup(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(projectPicker(dialog)).toBeFocused();
  await expect(projectPicker(dialog)).toHaveText(NO_CHANGE);

  // «Reemplazar» ya es un cambio; «No cambiar las etiquetas» vuelve a
  // «Agregar» sin etiquetas, con el foco en su disparador.
  await tagModeOption(dialog, "Reemplazar las que tienen").click();
  await expectActive(saveButton(dialog));
  await keepTags.click();
  await expect(keepTags).toHaveCount(0);
  await expect(tagModeOption(dialog, "Agregar a las que tienen")).toBeChecked();
  await expect(tagPicker(dialog)).toHaveAccessibleName("Etiquetas");
  await expect(tagPicker(dialog)).toBeFocused();
  await expectInactive(saveButton(dialog));

  await openTagPicker(page, dialog);
  await tagSearch(page).fill(`inexistente ${suffix}`);
  await expect(
    tagPopup(page).getByRole("status").filter({ hasText: NO_TAG_MATCHES }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tagPopup(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(tagPicker(dialog)).toBeFocused();

  // Un segundo `Escape` cierra el diálogo y devuelve el foco a «Editar».
  await page.keyboard.press("Escape");
  await expect(bulkEditDialog(page)).toBeHidden();
  await expect(bulkButton(page, "Editar")).toBeFocused();
});

test("«Agregar» una etiqueta con la respuesta perdida se reintenta y termina bien, con el foco en «Guardar» y después en la región", async ({
  page,
  email,
  browser,
}) => {
  const suffix = uniqueSuffix();
  const tag = `Perdida ${suffix}`;
  const first = `reintento uno ${suffix}`;
  const second = `reintento dos ${suffix}`;
  await seedTag(tag);

  await page.goto("/");
  await addManualEntry(page, first);
  await addManualEntry(page, second);
  await selectToday(page, [first, second]);
  const dialog = await openBulkEdit(page, "Editar 2 entradas");
  await pickTags(page, dialog, [tag]);

  // El pedido llega y se aplica; lo que se pierde es la respuesta. TT-89: el
  // aviso ofrece «Reintentar» y el foco sigue en «Guardar» (§5.4 del 6).
  const save = saveButton(dialog);
  const restoreResponses = await loseActionResponses(page, isTrackerPage);
  await save.click();
  const notice = editNotice(dialog);
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = notice.getByRole("button", { name: "Reintentar" });
  await expect(retry).toBeVisible();
  await expect(save).toBeFocused();

  await expectTaggedElsewhere(browser, email, [first, second], tag);

  /*
   * Criterio 9: el reintento llega al punto fijo y responde `ok` con las dos.
   * «Reintentar» se va con su aviso y el foco pasa a «Guardar», no a `body`:
   * se mira con la respuesta retenida, porque con el éxito el foco va a la
   * región de todos modos.
   */
  await restoreResponses();
  const releaseRetry = await holdActionResponses(page, isTrackerPage);
  await withServerAction(page, async () => {
    await retry.click();
    await expect(save).toBeFocused();
    releaseRetry();
  });
  await expect(dialog).toBeHidden();
  await expect(bulkStatus(page)).toHaveText("Se editaron 2 entradas.");
  await expect(bulkRegion(page)).toBeFocused();
  await expect(
    page.getByRole("alert").filter({ hasText: ENTRIES_NOT_EDITED }),
  ).toHaveCount(0);

  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
    }
    for (const description of [first, second]) {
      await expect(
        tagPicker(entryRow(todayGroup(page), description)),
      ).toHaveAccessibleName(tagsName(rowTagsLabel(description), [tag]));
    }
  }
});

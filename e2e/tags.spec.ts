import type { Locator, Page } from "@playwright/test";

import {
  addEntry,
  calendarRegion,
  closedBlockName,
  dayColumn,
  dialogButton,
  dialogDescription,
  entryBlock,
  entryDialog,
  openDetails,
  openLastWeek,
  PERSON_TIMEZONE,
} from "./calendar-page";
import { archiveTag } from "./database";
import { addDays, todayIn } from "./days";
import { isAction, recordActions, withServerAction } from "./network";
import { expect, test } from "./session";
import {
  chooseMode,
  dayTotal,
  descriptionInput,
  elapsedCounter,
  entryRow,
  escapeRegExp,
  openTagPicker,
  pickTags,
  setClock,
  startTimer,
  stopTimer,
  tagOption,
  tagPicker,
  tagPopup,
  tagSearch,
  todayGroup,
  trackerBar,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos del slice 11b: las etiquetas (§7 del contrato, «Recorridos
 * obligatorios de `e2e/tags.spec.ts`»). Una persona por recorrido, que da la
 * sesión. El workspace es uno solo para todos los specs y las etiquetas no se
 * pueden borrar en la fase 1, así que todo nombre creado lleva un sufijo
 * propio del recorrido, y el selector las busca por su nombre entero. Las
 * etiquetas se crean en `/proyectos` antes de entrar a la pantalla que las
 * usa, que lee el catálogo al cargar. Las entradas cerradas del rastreador van
 * de 00:00 a 00:01 de hoy, que ya pasó a cualquier hora de la corrida; las
 * del calendario, en la semana anterior.
 *
 * Cada valor que se afirma después de una mutación se vuelve a afirmar tras
 * una recarga: la barra y la fila muestran las etiquetas con su vista
 * optimista, y solo la carga nueva dice lo que escribió el servidor. El vacío
 * de TT-88 no se prueba acá: la base ya tiene etiquetas después del primer
 * recorrido, y lo cubre el modelo del selector.
 */

const PROJECTS_PATH = "/proyectos";

/** TT-12: el disparador de la barra y del diálogo, y su texto sin etiquetas. */
const TAGS = "Etiquetas";

/** PR-80. */
const TAG_NAME_TAKEN = "Ya hay una etiqueta con ese nombre.";

/** TT-90: el aviso de «Iniciar» nombra la operación. */
const START_FAILED = "No se pudo iniciar el timer.";

/** TT-78. */
const TAG_UNAVAILABLE = "Esa etiqueta ya no está disponible.";

/** TT-12: la búsqueda sin coincidencias. */
const NO_MATCHES = "Ninguna etiqueta coincide con la búsqueda.";

/** El nombre del disparador de una fila (TT-49, `entryTagsLabel`). */
function rowTagsLabel(description: string): string {
  return `Etiquetas de la entrada «${description}»`;
}

/**
 * El nombre accesible de un disparador: el rótulo y, con etiquetas, «: » y
 * sus nombres en orden alfabético, separados por coma (TT-12, H-1). Los
 * nombres llegan ya en ese orden.
 */
function tagsName(label: string, names: readonly string[]): string {
  return names.length === 0 ? label : `${label}: ${names.join(", ")}`;
}

/** H-5: la opción de una etiqueta archivada que la entrada todavía tiene. */
function archivedOption(name: string): string {
  return `${name} (archivada)`;
}

async function openProjects(page: Page): Promise<void> {
  await page.goto(PROJECTS_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible();
}

function newTagButton(page: Page): Locator {
  return page.getByRole("button", { name: "Nueva etiqueta", exact: true });
}

/** El diálogo de alta se dibuja en un portal, así que se busca en la página. */
function newTagDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Nueva etiqueta" });
}

function nameField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Nombre", exact: true });
}

function saveButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Guardar", exact: true });
}

/** La sección «Etiquetas» de `/proyectos` (PR-112, H-13). */
function tagSection(page: Page): Locator {
  return page.getByRole("region", { name: TAGS, exact: true });
}

/** Las etiquetas de la sección con exactamente ese nombre. */
function tagItems(page: Page, name: string): Locator {
  return tagSection(page)
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) });
}

/** El anuncio de un alta de etiqueta, en la región `status` de su diálogo. */
function tagCreatedStatus(page: Page, name: string): Locator {
  return page.getByRole("status").filter({ hasText: `Etiqueta «${name}» creada` });
}

/**
 * Crea una etiqueta desde «Nueva etiqueta», con `/proyectos` ya abierta, y
 * espera que el diálogo se cierre con el foco de vuelta en su botón, el
 * anuncio y la etiqueta en la sección.
 */
async function createTag(page: Page, name: string): Promise<void> {
  const trigger = newTagButton(page);
  await trigger.click();
  const dialog = newTagDialog(page);
  await nameField(dialog).fill(name);
  await withServerAction(page, () => saveButton(dialog).click());
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(tagCreatedStatus(page, name)).toBeVisible();
  await expect(tagItems(page, name)).toHaveCount(1);
}

/** Abre `/proyectos` y crea cada una de `names`. */
async function createTags(page: Page, names: readonly string[]): Promise<void> {
  await openProjects(page);
  for (const name of names) {
    await createTag(page, name);
  }
}

/**
 * Carga una entrada de hoy desde la barra manual con las etiquetas `tags` y
 * espera su fila. Va de 00:00 a 00:01, que ya pasó a cualquier hora de la
 * corrida. «Agregar» deja la barra sin descripción y sin etiquetas (TT-25).
 */
async function addTaggedEntry(
  page: Page,
  description: string,
  tags: readonly string[],
): Promise<void> {
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await setClock(bar, "Hora de inicio", "00:00");
  await setClock(bar, "Hora de fin", "00:01");
  await pickTags(page, bar, tags);
  await expect(tagPicker(bar)).toHaveAccessibleName(tagsName(TAGS, tags));
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(entryRow(todayGroup(page), description)).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(tagPicker(bar)).toHaveAccessibleName(TAGS);
}

/**
 * Hace un clic fuera de todo popup y de todo control: sobre el «Total» del
 * grupo de hoy, que es texto. Va por coordenadas y no por el localizador,
 * porque lo que reciba el clic —el texto o una capa del popup— da igual: el
 * selector lo toma como un clic afuera.
 */
async function clickOutside(page: Page): Promise<void> {
  const box = await dayTotal(todayGroup(page)).boundingBox();
  if (box === null) {
    throw new Error("El total del grupo de hoy no está a la vista.");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("una etiqueta creada en /proyectos aparece en «Etiquetas» y se anuncia, y el mismo nombre en minúsculas se rechaza con PR-80", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const name = `Cliente ${suffix}`;
  const repeated = `cliente ${suffix}`;

  // PR-44, PR-112: cualquier membresía activa la crea desde la cabecera, y la
  // sección la lista.
  await createTags(page, [name]);

  // PR-52, PR-80: el nombre no distingue mayúsculas. El aviso describe el
  // estado real y no se reintenta (TT-89); el diálogo queda abierto con lo
  // escrito.
  await newTagButton(page).click();
  const dialog = newTagDialog(page);
  await nameField(dialog).fill(repeated);
  await withServerAction(page, () => saveButton(dialog).click());
  await expect(
    dialog.getByRole("alert").filter({ hasText: TAG_NAME_TAKEN }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(nameField(dialog)).toHaveValue(repeated);

  // La carga nueva trae una sola.
  await page.reload();
  await expect(tagItems(page, name)).toHaveCount(1);
  await expect(tagItems(page, repeated)).toHaveCount(0);
});

test("la barra busca etiquetas sin acentos, el timer guarda las elegidas y detenerlo deja la barra sin etiquetas", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const design = `Diseño ${suffix}`;
  const review = `Revisión ${suffix}`;
  const description = `timer etiquetado ${suffix}`;
  await createTags(page, [design, review]);

  await page.goto("/");
  const bar = trackerBar(page);
  await expect(tagPicker(bar)).toHaveAccessibleName(TAGS);
  const sent = recordActions(page);

  // TT-12, H-2: la búsqueda no distingue acentos ni mayúsculas. El sufijo deja
  // afuera las «Diseño» de corridas anteriores.
  await openTagPicker(page, bar);
  await tagSearch(page).fill(`diseno ${suffix}`);
  const popup = tagPopup(page);
  await expect(tagOption(page, design)).toBeVisible();
  await expect(popup.getByRole("option")).toHaveCount(1);

  // TT-12: cada casilla marca sin cerrar; la búsqueda vacía ofrece la otra.
  await tagOption(page, design).click();
  await expect(tagOption(page, design)).toHaveAttribute("aria-selected", "true");
  await expect(popup).toBeVisible();
  await tagSearch(page).fill("");
  await tagOption(page, review).click();
  await expect(tagOption(page, review)).toHaveAttribute("aria-selected", "true");
  await expect(tagOption(page, design)).toHaveAttribute("aria-selected", "true");

  // D-5: `Escape` cierra con el foco en el disparador, que nombra las dos. La
  // barra sin timer solo cambia el borrador.
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(tagPicker(bar)).toBeFocused();
  await expect(tagPicker(bar)).toHaveAccessibleName(tagsName(TAGS, [design, review]));
  expect(sent).toHaveLength(0);

  // TT-38: el timer nació con las dos, y una carga nueva las trae del servidor.
  await withServerAction(page, () => startTimer(page, description));
  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(description);
  await expect(tagPicker(bar)).toHaveAccessibleName(tagsName(TAGS, [design, review]));

  // TT-49: la fila detenida las muestra; la barra queda sin etiquetas (§5.4,
  // `NO_FIELDS`).
  await withServerAction(page, () => stopTimer(page, description));
  const rowLabel = rowTagsLabel(description);
  await expect(tagPicker(entryRow(todayGroup(page), description))).toHaveAccessibleName(
    tagsName(rowLabel, [design, review]),
  );
  await expect(tagPicker(bar)).toHaveAccessibleName(TAGS);

  await page.reload();
  await expect(tagPicker(entryRow(todayGroup(page), description))).toHaveAccessibleName(
    tagsName(rowLabel, [design, review]),
  );
  await expect(tagPicker(bar)).toHaveAccessibleName(TAGS);
});

test("la fila desmarca una etiqueta y la guarda al cerrar el selector con un clic afuera", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const design = `Diseño ${suffix}`;
  const review = `Revisión ${suffix}`;
  const description = `entrada etiquetada ${suffix}`;
  await createTags(page, [design, review]);

  // TT-25: «Agregar» lleva las etiquetas del borrador y las limpia.
  await page.goto("/");
  await addTaggedEntry(page, description, [design, review]);
  const rowLabel = rowTagsLabel(description);
  const row = entryRow(todayGroup(page), description);
  await expect(tagPicker(row)).toHaveAccessibleName(tagsName(rowLabel, [design, review]));

  // TT-54, D-5: desmarcar no pide nada; cerrar con un clic afuera manda el
  // conjunto entero, en un solo pedido.
  const sent = recordActions(page);
  await openTagPicker(page, row);
  await tagSearch(page).fill(design);
  const option = tagOption(page, design);
  await expect(option).toHaveAttribute("aria-selected", "true");
  await option.click();
  await expect(option).toHaveAttribute("aria-selected", "false");
  await expect(tagPopup(page)).toBeVisible();
  await withServerAction(page, () => clickOutside(page));
  await expect(tagPopup(page)).toBeHidden();
  expect(sent).toHaveLength(1);
  expect(sent[0].postData(), "el pedido no lleva el grupo de etiquetas").toContain(
    '"tags":[',
  );
  await expect(tagPicker(row)).toHaveAccessibleName(tagsName(rowLabel, [review]));

  await page.reload();
  await expect(tagPicker(entryRow(todayGroup(page), description))).toHaveAccessibleName(
    tagsName(rowLabel, [review]),
  );
});

test("una etiqueta archivada sigue en la fila y no se ofrece, y archivarla después de elegirla hace fallar «Iniciar» con TT-78", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const old = `Vieja ${suffix}`;
  const fresh = `Nueva ${suffix}`;
  const description = `entrada con archivada ${suffix}`;
  const pending = `timer sin iniciar ${suffix}`;
  await createTags(page, [old, fresh]);

  // m-9 del 10: la entrada se crea por la interfaz y la etiqueta se archiva
  // después, como lo haría otra persona.
  await page.goto("/");
  await addTaggedEntry(page, description, [old]);
  await archiveTag(old);

  // PR-47, PR-68: la fila la conserva, y su selector la muestra marcada con
  // «(archivada)». Cerrarlo sin cambios no pide nada (D-5).
  await page.reload();
  const row = entryRow(todayGroup(page), description);
  await expect(tagPicker(row)).toHaveAccessibleName(
    tagsName(rowTagsLabel(description), [old]),
  );
  const sent = recordActions(page);
  await openTagPicker(page, row);
  await expect(tagOption(page, archivedOption(old))).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(tagPopup(page)).toBeHidden();
  await expect(tagPicker(row)).toBeFocused();
  expect(sent).toHaveLength(0);

  // PR-45: la barra ya no la ofrece, ni con el nombre entero.
  await chooseMode(page, "timer");
  const bar = trackerBar(page);
  await openTagPicker(page, bar);
  await tagSearch(page).fill(old);
  await expect(
    tagPopup(page).getByRole("status").filter({ hasText: NO_MATCHES }),
  ).toBeVisible();
  await expect(tagOption(page, old)).toHaveCount(0);
  await expect(tagOption(page, archivedOption(old))).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(tagPopup(page)).toBeHidden();
  await expect(tagPicker(bar)).toBeFocused();

  // TT-78: otra persona archiva la que la barra tiene elegida. No se
  // reintenta (TT-89), no queda timer, y el borrador se conserva (§5.4).
  await pickTags(page, bar, [fresh]);
  await archiveTag(fresh);
  await descriptionInput(bar).fill(pending);
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Iniciar" }).click(),
  );
  const notice = page.getByRole("alert").filter({ hasText: START_FAILED });
  await expect(notice).toContainText(TAG_UNAVAILABLE);
  await expect(notice.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(tagPicker(bar)).toHaveAccessibleName(tagsName(TAGS, [fresh]));

  await page.reload();
  await expect(trackerBar(page).getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(entryRow(page.getByRole("main"), pending)).toHaveCount(0);
});

test("en el calendario, marcar una etiqueta en el diálogo y guardar la suma al detalle del bloque", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const tag = `Calendario ${suffix}`;
  const description = `horas etiquetadas ${suffix}`;
  await createTags(page, [tag]);

  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const tuesday = addDays(lastWeek, 1);
  const name = closedBlockName({
    description,
    day: tuesday,
    today,
    start: "09:00",
    end: "10:00",
    duration: "1:00",
  });
  const block = entryBlock(dayColumn(page, tuesday, today), name);

  // CAL-43: el alta nace sin etiquetas.
  await addEntry(page, { day: tuesday, today, start: "09:00", description });
  await expect(block).toBeFocused();

  // CAL-45, CAL-66: el selector va dentro del diálogo, y cerrarlo con
  // `Escape` cierra solo el popup. «Guardar» manda el conjunto; un diálogo
  // sin cambios se cierra sin pedir nada, así que el pedido se afirma antes
  // de esperar su respuesta.
  await block.click();
  const dialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  await expect(tagPicker(dialog)).toHaveAccessibleName(TAGS);
  await pickTags(page, dialog, [tag]);
  await expect(dialog).toBeVisible();
  await expect(tagPicker(dialog)).toHaveAccessibleName(tagsName(TAGS, [tag]));
  const sent = recordActions(page);
  const settled = page.waitForResponse((response) => isAction(response.request()));
  await dialogButton(dialog, "Guardar").click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => sent.length, { message: "«Guardar» no mandó ningún pedido" })
    .toBe(1);
  expect(sent[0].postData(), "el pedido de «Guardar» no lleva las etiquetas").toContain(
    '"tags":["',
  );
  expect((await settled).ok()).toBe(true);

  // CAL-23, H-10: el detalle suma «Etiquetas: …»; el nombre del bloque no
  // las nombra (CAL-75).
  await expect(block).toBeFocused();
  await block.hover();
  const detail = openDetails(page);
  await expect(detail).toHaveCount(1);
  await expect(detail).toContainText(description);
  await expect(detail.getByText(`Etiquetas: ${tag}`, { exact: true })).toBeVisible();

  // La carga nueva trae lo que escribió el servidor.
  await page.reload();
  await entryBlock(calendarRegion(page), name).hover();
  await expect(
    openDetails(page).getByText(`Etiquetas: ${tag}`, { exact: true }),
  ).toBeVisible();
});

test("el selector de etiquetas de la barra es accesible por teclado y sus letras no disparan atajos", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const tag = `Atajo ${suffix}`;
  await createTags(page, [tag]);

  await page.goto("/");
  const bar = trackerBar(page);
  const picker = bar.getByRole("combobox", { name: TAGS, exact: true });
  await expect(picker).toBeVisible();

  // §5.8: al abrir, el foco va al buscador.
  await picker.click();
  const search = tagSearch(page);
  await expect(search).toBeFocused();

  // TT-26: «n» escribe en el buscador y no arranca un timer.
  const sent = recordActions(page);
  await page.keyboard.press("n");
  await expect(search).toHaveValue("n");
  await expect(tagPopup(page)).toBeVisible();
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Detener" })).toHaveCount(0);

  // Espacio sobre la opción resaltada la marca sin cerrar.
  await search.fill(tag);
  const option = tagOption(page, tag);
  await expect(tagPopup(page).getByRole("option")).toHaveCount(1);
  const optionId = await option.getAttribute("id");
  expect(optionId).not.toBeNull();
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", optionId ?? "");
  await page.keyboard.press("Space");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(tagPopup(page)).toBeVisible();

  // `Escape` cierra, el foco vuelve al disparador y su nombre dice la
  // elegida (WCAG 2.5.3). Nada viajó al servidor.
  await page.keyboard.press("Escape");
  await expect(tagPopup(page)).toBeHidden();
  await expect(tagPicker(bar)).toBeFocused();
  await expect(tagPicker(bar)).toHaveAccessibleName(tagsName(TAGS, [tag]));
  await expect(bar.getByRole("button", { name: "Detener" })).toHaveCount(0);
  expect(sent).toHaveLength(0);
});

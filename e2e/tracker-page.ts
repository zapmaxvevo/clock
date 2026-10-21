/**
 * Localizadores y acciones de la pantalla del rastreador, compartidos por los
 * recorridos del timer y los del modo manual. Todo se busca por rol y por
 * texto accesible: la pantalla se repartió en varios componentes y ningún
 * localizador tiene que depender de en cuál quedó cada cosa.
 */
import { randomUUID } from "node:crypto";

import { expect, type Locator, type Page } from "@playwright/test";

import {
  calendarDayName,
  dayLabel,
  monthsBetween,
  weekLabel,
  type CivilDay,
} from "./days";
import { withServerAction } from "./network";

/** Lo que pide el rastreador: sus server actions y sus revalidaciones. */
export function isTrackerPage(url: URL): boolean {
  return url.pathname === "/";
}

export function trackerBar(page: Page): Locator {
  return page.getByRole("region", { name: "Rastreador" });
}

export function descriptionInput(scope: Locator): Locator {
  return scope.getByRole("textbox", { name: "Descripción de la entrada" });
}

export function elapsedCounter(scope: Locator): Locator {
  return scope.getByRole("timer", { name: "Tiempo transcurrido" });
}

/** El grupo del día de hoy, que la lista encabeza con «Hoy» (TT-44). */
export function todayGroup(page: Page): Locator {
  return page.getByRole("region", { name: "Hoy" });
}

/** La franja de una semana, por su rótulo (TT-47). */
export function trackerWeek(page: Page, start: CivilDay, today: CivilDay): Locator {
  return page.getByRole("region", { name: weekLabel(start, today), exact: true });
}

export function entryRow(scope: Locator, description: string): Locator {
  return scope.getByRole("listitem").filter({ hasText: description });
}

/** La descripción de una fila es un botón que la vuelve editable (TT-54). */
export function editDescriptionButton(scope: Locator, description: string): Locator {
  return scope.getByRole("button", { name: `${description} — editar la descripción` });
}

/** Las horas de una fila son el botón que abre el editor del horario (TT-54). */
export function timesButton(row: Locator, start: string, end: string): Locator {
  return row.getByRole("button", { name: `${start} – ${end} — editar el horario` });
}

/** El «Total» del encabezado del grupo, que lleva la etiqueta y el valor. */
export function dayTotal(group: Locator): Locator {
  return group.getByText(/^Total \d+:\d{2}$/);
}

/**
 * Canales del color de fondo de la superficie de `element`: el suyo o el del
 * primer ancestro que pinta uno, como la lista transparente de un `Select`,
 * que la pinta su popup. El tema los define en oklch, la build los reescribe
 * en lab, y el canvas los lleva a sRGB pintando un píxel, así la afirmación es
 * «es rojo» y no el valor exacto de la paleta.
 */
export async function backgroundRgb(
  element: Locator,
): Promise<{ red: number; green: number; blue: number }> {
  return element.evaluate((node) => {
    let surface: Element | null = node;
    let color = "transparent";
    while (surface !== null) {
      color = window.getComputedStyle(surface).backgroundColor;
      if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
        break;
      }
      surface = surface.parentElement;
    }
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) {
      throw new Error("El canvas no está disponible para normalizar el color.");
    }
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const { data } = context.getImageData(0, 0, 1, 1);
    return { red: data[0], green: data[1], blue: data[2] };
  });
}

/**
 * Si `text` se ve tachado: él o alguno de sus contenedores, hasta el primero
 * que cumple el selector `boundary` inclusive, lleva `line-through`. El
 * tachado no se anuncia, así que no hay rol ni nombre que lo muestre y se lee
 * el estilo calculado; `text-decoration` no se hereda, por eso se miran los
 * contenedores, como `backgroundRgb` mira el fondo.
 */
export async function isTextStruck(text: Locator, boundary: string): Promise<boolean> {
  return text.evaluate((node, stop) => {
    for (
      let element: Element | null = node;
      element !== null;
      element = element.parentElement
    ) {
      if (getComputedStyle(element).textDecorationLine.includes("line-through")) {
        return true;
      }
      if (element.matches(stop)) {
        return false;
      }
    }
    return false;
  }, boundary);
}

/** Lee el contador en segundos, para compararlo sin depender del formato. */
export async function elapsedOf(counter: Locator): Promise<number> {
  const text = (await counter.textContent()) ?? "";
  const parts = text.trim().split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`El contador no se pudo leer: «${text}»`);
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/**
 * Arranca un timer y espera a que la barra tenga la entrada abierta. El botón
 * pasa a «Detener» con la vista optimista, antes de que el servidor escriba;
 * el grupo del día del timer activo, en cambio, solo lo dibuja el servidor.
 */
export async function startTimer(page: Page, description: string): Promise<void> {
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await bar.getByRole("button", { name: "Iniciar" }).click();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(todayGroup(page)).toBeVisible();
}

/**
 * Detiene el timer y espera a que la entrada esté en la lista. La barra pasa
 * a «Iniciar» con la vista optimista, antes de que el servidor escriba; la
 * fila del día es lo que dice que ya escribió y revalidó.
 */
export async function stopTimer(page: Page, description: string): Promise<void> {
  const bar = trackerBar(page);
  await bar.getByRole("button", { name: "Detener" }).click();
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(entryRow(todayGroup(page), description)).toBeVisible();
}

/**
 * Sufijo único de un recorrido. El workspace es uno solo para todos los specs
 * y lo que se crea en la fase 1 no se puede borrar: todo nombre sembrado o
 * creado lo lleva, para que la próxima corrida no choque con esta.
 */
export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

/** El botón de continuar de una fila, con el ícono de reproducción (TT-57). */
export function continueButton(scope: Locator, description: string): Locator {
  return scope.getByRole("button", { name: `Continuar «${description}»`, exact: true });
}

/** Borra una entrada desde el menú de su fila y confirma el diálogo (TT-60). */
export async function deleteEntry(page: Page, description: string): Promise<void> {
  await todayGroup(page)
    .getByRole("button", { name: `Acciones de la entrada «${description}»` })
    .click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Borrar" }).click();
}

/** Duplica desde el menú de la fila (TT-58). El menú abierto vive en un portal. */
export async function duplicateFromMenu(page: Page, description: string): Promise<void> {
  await page
    .getByRole("button", { name: `Acciones de la entrada «${description}»` })
    .click();
  await page.getByRole("menuitem", { name: "Duplicar" }).click();
}

/** Borra y espera a que el servidor haya escrito. */
export async function deleteEntryAndSettle(
  page: Page,
  description: string,
): Promise<void> {
  await withServerAction(page, () => deleteEntry(page, description));
}

/** Conmutador de modo de la barra (TT-16). */
export function modeSwitch(page: Page): Locator {
  return page.getByRole("group", { name: "Modo de carga" });
}

/** Elige el modo y espera a que la barra de ese modo esté dibujada. */
export async function chooseMode(page: Page, mode: "timer" | "manual"): Promise<void> {
  await page.getByRole("button", { name: `Modo ${mode}` }).click();
  const bar = trackerBar(page);
  const button = mode === "manual" ? "Agregar" : "Iniciar";
  await expect(bar.getByRole("button", { name: button })).toBeVisible();
}

/** Uno de los tres campos tolerantes de la barra manual (TT-18). */
export function clockField(scope: Locator, label: string): Locator {
  return scope.getByRole("textbox", { name: label });
}

/** El selector de fecha, que muestra el día elegido en su rótulo. */
export function dateButton(scope: Locator): Locator {
  return scope.getByRole("button", { name: /^Fecha de la entrada:/ });
}

/**
 * Elige un día en el selector de fecha de la barra. El calendario abre en el
 * mes del día elegido, que en el borrador inicial es hoy; desde ahí se mueve
 * de a un mes. Termina cuando el rótulo del botón ya nombra el día nuevo.
 */
export async function pickDate(
  page: Page,
  scope: Locator,
  target: CivilDay,
  today: CivilDay,
): Promise<void> {
  await dateButton(scope).click();
  const calendar = page.getByRole("grid");
  const months = monthsBetween(today, target);
  const step = page.getByRole("button", {
    name: months < 0 ? "Mes anterior" : "Mes siguiente",
  });
  for (let moved = 0; moved < Math.abs(months); moved += 1) {
    await step.click();
  }
  // Un día fuera del piso se dibuja inactivo: afirmarlo antes del clic nombra
  // la causa en vez de agotar el tiempo del clic.
  const day = calendar.getByRole("button", { name: calendarDayName(target) });
  await expect(day).toBeEnabled();
  await day.click();
  await expect(dateButton(scope)).toHaveText(dayLabel(target, today));
}

/**
 * Escribe en un campo tolerante y lo normaliza con Enter. El campo solo
 * interpreta lo tecleado al salir o con Enter, nunca mientras se escribe.
 */
export async function setClock(
  scope: Locator,
  label: string,
  text: string,
): Promise<void> {
  const field = clockField(scope, label);
  await field.fill(text);
  await field.press("Enter");
}

/** El nombre accesible del buscador del selector de proyecto (TT-07). */
const PROJECT_SEARCH = "Buscar proyecto, cliente o tarea";

/**
 * El disparador del selector de proyecto de `scope`: «Proyecto» en la barra
 * y «Proyecto de la entrada «…»» en una fila (TT-06, TT-49). Dentro de cada
 * uno hay uno solo.
 */
export function projectPicker(scope: Locator): Locator {
  return scope.getByRole("combobox", { name: /^Proyecto( de la entrada «.*»)?$/ });
}

/** El buscador del selector abierto. El popup va en un portal. */
export function projectSearch(page: Page): Locator {
  return page.getByRole("combobox", { name: PROJECT_SEARCH, exact: true });
}

/** El popup del selector abierto, el diálogo que lleva el buscador. */
export function projectPopup(page: Page): Locator {
  return page.getByRole("dialog").filter({ has: projectSearch(page) });
}

/** La opción de una tarea y lo que muestra un disparador con ella (TT-06). */
export function taskOption(project: string, task: string): string {
  return `${project}: ${task}`;
}

/**
 * Una opción del selector abierto: el nombre del proyecto, «Proyecto: Tarea»
 * o «Sin proyecto».
 */
export function projectOption(page: Page, name: string): Locator {
  return projectPopup(page).getByRole("option", { name, exact: true });
}

/** TT-09: el texto de la opción que crea un proyecto desde el selector. */
export const CREATE_PROJECT = "Crear proyecto";

/**
 * TT-09: «Crear proyecto», la última opción del selector abierto para quien
 * tiene `project.create` (D-P1-10). No es una selección.
 */
export function createProjectOption(page: Page): Locator {
  return projectOption(page, CREATE_PROJECT);
}

/**
 * Las opciones de selección del selector abierto: los proyectos, sus tareas y
 * «Sin proyecto», sin «Crear proyecto» (§9.3 de P1).
 */
export function selectionOptions(page: Page): Locator {
  return projectPopup(page)
    .getByRole("option")
    .filter({ hasNotText: new RegExp(`^${CREATE_PROJECT}$`) });
}

/** Abre el selector de `scope` y espera el foco en el buscador. */
export async function openProjectPicker(page: Page, scope: Locator): Promise<void> {
  await projectPicker(scope).click();
  await expect(projectSearch(page)).toBeFocused();
}

/**
 * Elige una opción del selector de `scope` y espera a que se cierre con el
 * foco de vuelta en su disparador. Antes escribe `search` en el buscador: la
 * base de los e2e acumula proyectos de todas las corridas, y el sufijo del
 * recorrido deja a la vista solo los suyos. «Sin proyecto» se elige con la
 * búsqueda vacía, que es la única que lo ofrece.
 */
export async function pickProject(
  page: Page,
  scope: Locator,
  option: string,
  search = "",
): Promise<void> {
  await openProjectPicker(page, scope);
  if (search !== "") {
    await projectSearch(page).fill(search);
  }
  await projectOption(page, option).click();
  await expect(projectPopup(page)).toBeHidden();
  await expect(projectPicker(scope)).toBeFocused();
}

/** Lo que `addManualEntry` elige en la barra además de la descripción. */
export type ManualEntryFields = {
  /** La opción del selector de proyecto y lo que se busca para verla (ver `pickProject`). */
  readonly project?: { readonly option: string; readonly search: string };
  /** Las etiquetas que se marcan (ver `pickTags`). */
  readonly tags?: readonly string[];
};

/** «Agregar» de la barra manual. */
export function addButton(bar: Locator): Locator {
  return bar.getByRole("button", { name: "Agregar", exact: true });
}

/**
 * Teclea en la barra manual la descripción y las dos horas. La fecha queda
 * como esté, que en el borrador inicial es hoy.
 */
export async function typeManualDraft(
  bar: Locator,
  description: string,
  start: string,
  end: string,
): Promise<void> {
  await descriptionInput(bar).fill(description);
  await setClock(bar, "Hora de inicio", start);
  await setClock(bar, "Hora de fin", end);
}

/**
 * Carga una entrada de hoy desde la barra manual y espera su fila. Va de 00:00
 * a 00:01, que ya pasó a cualquier hora de la corrida. Con `project` y `tags`,
 * los elige antes. La barra vuelve al borrador inicial después de la
 * respuesta, con la descripción vacía, sin proyecto y sin etiquetas (TT-06,
 * TT-25).
 */
export async function addManualEntry(
  page: Page,
  description: string,
  fields: ManualEntryFields = {},
): Promise<void> {
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await typeManualDraft(bar, description, "00:00", "00:01");
  if (fields.project !== undefined) {
    await pickProject(page, bar, fields.project.option, fields.project.search);
  }
  if (fields.tags !== undefined) {
    await pickTags(page, bar, fields.tags);
  }
  await withServerAction(page, () => addButton(bar).click());
  await expect(entryRow(todayGroup(page), description)).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(projectPicker(bar)).toHaveText("Proyecto");
  await expect(tagPicker(bar)).toHaveAccessibleName("Etiquetas");
}

/**
 * El control de facturable de `scope` (TT-14, H-7): un botón de alternancia
 * con `aria-pressed`, «Facturable» en la barra y en el diálogo del
 * calendario, y «Entrada «…» facturable» en una fila. Dentro de cada uno hay
 * uno solo.
 */
export function billableToggle(scope: Locator): Locator {
  return scope.getByRole("button", { name: /^(Facturable|Entrada «.*» facturable)$/ });
}

/** TT-14, H-7: el control de `scope` presionado o no, por su `aria-pressed`. */
export async function expectBillable(scope: Locator, billable: boolean): Promise<void> {
  await expect(billableToggle(scope)).toHaveAttribute("aria-pressed", String(billable));
}

/** El nombre accesible del buscador del selector de etiquetas (TT-12, §5.8). */
const TAG_SEARCH = "Buscar etiqueta";

/**
 * El disparador del selector de etiquetas de `scope` (TT-12, H-1): «Etiquetas»
 * en la barra y en el diálogo del calendario, y «Etiquetas de la entrada «…»»
 * en una fila. Con etiquetas, el nombre suma «: » y los nombres en orden
 * alfabético. Dentro de cada uno hay uno solo.
 */
export function tagPicker(scope: Locator): Locator {
  return scope.getByRole("combobox", {
    name: /^Etiquetas( de la entrada «.*»)?(: .+)?$/,
  });
}

/** El nombre del disparador de etiquetas de una fila (TT-49, `entryTagsLabel`). */
export function rowTagsLabel(description: string): string {
  return `Etiquetas de la entrada «${description}»`;
}

/**
 * El nombre accesible de un disparador de etiquetas: el rótulo y, con
 * etiquetas, «: » y sus nombres en orden alfabético, separados por coma
 * (TT-12, H-1). Los nombres llegan ya en ese orden.
 */
export function tagsName(label: string, names: readonly string[]): string {
  return names.length === 0 ? label : `${label}: ${names.join(", ")}`;
}

/** El buscador del selector de etiquetas abierto. El popup va en un portal. */
export function tagSearch(page: Page): Locator {
  return page.getByRole("combobox", { name: TAG_SEARCH, exact: true });
}

/** El popup del selector de etiquetas abierto, el diálogo que lleva el buscador. */
export function tagPopup(page: Page): Locator {
  return page.getByRole("dialog").filter({ has: tagSearch(page) });
}

/**
 * Una opción del selector de etiquetas abierto: el nombre de la etiqueta, o
 * «{nombre} (archivada)» para la que la entrada tiene y ya no está en el
 * catálogo (H-5). Marcada lleva `aria-selected="true"`.
 */
export function tagOption(page: Page, name: string): Locator {
  return tagPopup(page).getByRole("option", { name, exact: true });
}

/** Abre el selector de etiquetas de `scope` y espera el foco en el buscador. */
export async function openTagPicker(page: Page, scope: Locator): Promise<void> {
  await tagPicker(scope).click();
  await expect(tagSearch(page)).toBeFocused();
}

/**
 * Alterna una etiqueta en el selector abierto, buscándola por su nombre
 * entero, y espera que quede marcada o no según `selected`. El popup sigue
 * abierto (TT-12).
 */
export async function toggleTag(
  page: Page,
  name: string,
  selected: boolean,
): Promise<void> {
  await tagSearch(page).fill(name);
  const option = tagOption(page, name);
  await expect(option).toHaveAttribute("aria-selected", String(!selected));
  await option.click();
  await expect(option).toHaveAttribute("aria-selected", String(selected));
  await expect(tagPopup(page)).toBeVisible();
}

/**
 * Marca las etiquetas `names` en el selector de `scope` y lo cierra con
 * `Escape`, que deja el foco en el disparador (D-5). Cada una se busca por su
 * nombre entero: la base de los e2e acumula las etiquetas de todas las
 * corridas, y el nombre lleva el sufijo del recorrido. En una entrada que ya
 * existe, cerrar es lo que guarda: quien llama espera la respuesta.
 */
export async function pickTags(
  page: Page,
  scope: Locator,
  names: readonly string[],
): Promise<void> {
  await openTagPicker(page, scope);
  for (const name of names) {
    await toggleTag(page, name, true);
  }
  await page.keyboard.press("Escape");
  await expect(tagPopup(page)).toBeHidden();
  await expect(tagPicker(scope)).toBeFocused();
}

/**
 * El disparador del menú de la cuenta, en el encabezado de toda pantalla del
 * shell: muestra la foto o las iniciales (PF-10, PF-44).
 */
export function accountMenuButton(page: Page): Locator {
  return page.getByRole("button", { name: "Menú de la cuenta", exact: true });
}

/** El menú de la cuenta abierto. Se dibuja en un portal. */
export function accountMenu(page: Page): Locator {
  return page.getByRole("menu");
}

/**
 * Entra a `/perfil` por el menú de la cuenta (PF-30): es una navegación del
 * cliente, no una carga nueva. Termina con el título de la pantalla a la
 * vista.
 */
export async function openProfileFromMenu(page: Page): Promise<void> {
  await accountMenuButton(page).click();
  await accountMenu(page).getByRole("menuitem", { name: "Perfil", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/perfil");
  await expect(page.getByRole("heading", { name: "Perfil", exact: true })).toBeVisible();
}

/**
 * Deja una marca en la ventana. Una carga nueva la borra: si sigue ahí, todo
 * lo que pasó desde que se puso fue navegación del cliente (PF-33).
 */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.assign(window, { e2eSinRecargar: true });
  });
}

export async function documentIsMarked(page: Page): Promise<boolean> {
  return page.evaluate(() => "e2eSinRecargar" in window);
}

/** Vuelve al rastreador por la navegación principal, sin recargar. */
export async function goToTrackerByNav(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Inicio", exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(trackerBar(page)).toBeVisible();
}

/** Las preferencias de hora y fecha de `/perfil` que son un `Select` (PF-12, PF-13). */
export type FormatPreference = "Formato de fecha" | "Formato de hora";

/**
 * El disparador de un control de `/perfil`. Los tres tienen rol `combobox`:
 * los dos formatos son un `Select` y la zona, el selector con buscador. El
 * nombre empieza con el rótulo del control.
 */
export function preferenceControl(
  page: Page,
  label: FormatPreference | "Zona horaria",
): Locator {
  return page.getByRole("combobox", { name: new RegExp(`^${label}`) });
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Una opción por el comienzo de su nombre: la opción lleva al lado su ejemplo
 * o su desplazamiento (`dd/MM/yyyy` con `04/10/2026`, `Asia/Tokyo` con
 * `UTC+09:00`), que el recorrido no fija.
 */
function optionNamed(text: string): RegExp {
  return new RegExp(`^${escapeRegExp(text)}(?=$|UTC|[^A-Za-z_/])`);
}

/**
 * Una opción del `Select` abierto de un formato, por el comienzo de su
 * nombre: «yyyy-MM-dd», «12 horas».
 */
export function formatOption(page: Page, option: string): Locator {
  return page.getByRole("option", { name: optionNamed(option) });
}

/**
 * Elige un formato en `/perfil` y espera la respuesta del servidor: el control
 * guarda al cambiar (PF-32). La opción se busca en `page`, porque la lista va
 * en un portal. `option` es el comienzo del nombre: «yyyy-MM-dd», «12 horas».
 */
export async function chooseFormat(
  page: Page,
  label: FormatPreference,
  option: string,
): Promise<void> {
  const control = preferenceControl(page, label);
  await control.click();
  await withServerAction(page, () => formatOption(page, option).click());
  await expect(control).toContainText(option);
}

/** El buscador del selector de zona abierto. */
export function timeZoneSearch(page: Page): Locator {
  return page.getByRole("combobox", { name: "Buscar zona horaria", exact: true });
}

/** El popup del selector de zona, el diálogo que lleva el buscador. */
export function timeZonePopup(page: Page): Locator {
  return page.getByRole("dialog").filter({ has: timeZoneSearch(page) });
}

/**
 * Elige una zona en `/perfil`: abre el selector, escribe `search` en el
 * buscador para no recorrer las cuatrocientas, elige `zone` y espera la
 * respuesta del servidor. Termina con el popup cerrado y la zona en el
 * disparador.
 */
export async function chooseTimeZone(
  page: Page,
  search: string,
  zone: string,
): Promise<void> {
  const control = preferenceControl(page, "Zona horaria");
  await control.click();
  await expect(timeZoneSearch(page)).toBeFocused();
  await timeZoneSearch(page).fill(search);
  await withServerAction(page, () =>
    timeZonePopup(page)
      .getByRole("option", { name: optionNamed(zone) })
      .click(),
  );
  await expect(timeZonePopup(page)).toBeHidden();
  await expect(control).toContainText(zone);
}

/**
 * Elige un día en el selector de fecha de `scope` y espera que el calendario
 * se cierre con el foco de vuelta en el botón. El calendario abre en el mes
 * del día elegido, `shown`. A diferencia de `pickDate`, no fija el rótulo que
 * queda en el botón: depende del formato de fecha de la persona.
 */
export async function chooseDay(
  page: Page,
  scope: Locator,
  shown: CivilDay,
  target: CivilDay,
): Promise<void> {
  await dateButton(scope).click();
  const calendar = page.getByRole("grid");
  const months = monthsBetween(shown, target);
  const step = page.getByRole("button", {
    name: months < 0 ? "Mes anterior" : "Mes siguiente",
  });
  for (let moved = 0; moved < Math.abs(months); moved += 1) {
    await step.click();
  }
  await calendar.getByRole("button", { name: calendarDayName(target) }).click();
  await expect(calendar).toBeHidden();
  await expect(dateButton(scope)).toBeFocused();
}

/**
 * Inactivo por `aria-disabled` y nunca por `disabled`: un control con foco
 * que pasa a `disabled` lo pierde a `body` (§5.4 del 6).
 */
export async function expectInactive(control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).not.toHaveAttribute("disabled");
}

export async function expectActive(control: Locator): Promise<void> {
  await expect(control).not.toHaveAttribute("aria-disabled", "true");
  await expect(control).not.toHaveAttribute("disabled");
}

/**
 * La región de las acciones en masa (TT-62), siempre montada aunque no haya
 * selección: es el destino del foco cuando lo que lo tenía se va. Con un
 * diálogo modal abierto, Base UI marca con `aria-hidden` todo lo de afuera; la
 * región se busca igual, porque el recorrido la mira también detrás del
 * diálogo.
 */
export function bulkRegion(page: Page): Locator {
  return page.getByRole("region", {
    name: "Acciones en masa",
    exact: true,
    includeHidden: true,
  });
}

/**
 * El único estado de la región: la cantidad elegida, «Borrando…» y el
 * resultado de la última operación.
 */
export function bulkStatus(page: Page): Locator {
  return bulkRegion(page).getByRole("status", { includeHidden: true });
}

/** Un botón de la barra, que vive dentro de la región. */
export function bulkButton(
  page: Page,
  name: "Editar" | "Borrar" | "Quitar selección",
): Locator {
  return bulkRegion(page).getByRole("button", { name, exact: true });
}

/**
 * La casilla de una fila: la descripción y sus horas como las muestra la
 * fila, en el formato de la persona (TT-62). Las horas pueden ser un patrón,
 * para una entrada cuyo fin depende de la hora de la corrida.
 */
export function entryCheckbox(
  scope: Locator,
  description: string,
  times: string | RegExp,
): Locator {
  const prefix = `Seleccionar «${description}», `;
  return typeof times === "string"
    ? scope.getByRole("checkbox", { name: `${prefix}${times}`, exact: true })
    : scope.getByRole("checkbox", {
        name: new RegExp(`^${escapeRegExp(prefix)}${times.source}$`),
      });
}

/** La casilla del encabezado de un día, por el rótulo del día (TT-44). */
export function dayCheckbox(scope: Locator, label: string): Locator {
  return scope.getByRole("checkbox", {
    name: `Seleccionar las entradas del día ${label}`,
    exact: true,
  });
}

/** El diálogo de edición masiva, «Editar N entradas». Va en un portal. */
export function bulkEditDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: /^Editar (1 entrada|\d+ entradas)$/ });
}

/** El campo «Descripción» del diálogo de edición masiva. */
export function bulkDescriptionField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Descripción", exact: true });
}

/**
 * Abre el diálogo de edición desde la barra y espera el foco en
 * «Descripción», que es donde lo deja al abrir (§5.4 del 6).
 */
export async function openBulkEdit(page: Page, title: string): Promise<Locator> {
  await bulkButton(page, "Editar").click();
  const dialog = bulkEditDialog(page);
  await expect(dialog).toHaveAccessibleName(title);
  await expect(bulkDescriptionField(dialog)).toBeFocused();
  return dialog;
}

/**
 * «No cambiar el proyecto» y «No cambiar las etiquetas» del diálogo de
 * edición masiva: vuelven su sección a «Sin cambios» (§5.2 del 12). Cada uno
 * está a la vista solo con algo elegido en su sección.
 */
export function keepButton(
  dialog: Locator,
  name: "No cambiar el proyecto" | "No cambiar las etiquetas",
): Locator {
  return dialog.getByRole("button", { name, exact: true });
}

/** El grupo de opciones del diálogo de edición masiva que dice cómo se aplican las etiquetas. */
export function tagModeGroup(dialog: Locator): Locator {
  return dialog.getByRole("radiogroup", {
    name: "Cómo se aplican las etiquetas",
    exact: true,
  });
}

/** Una opción de `tagModeGroup`; «Agregar» es la elegida al abrir. */
export function tagModeOption(
  dialog: Locator,
  name: "Agregar a las que tienen" | "Reemplazar las que tienen",
): Locator {
  return tagModeGroup(dialog).getByRole("radio", { name, exact: true });
}

/**
 * El grupo de opciones del facturable del diálogo de edición masiva. No es
 * el botón de alternancia de `billableToggle`: tiene «Sin cambios».
 */
export function bulkBillableGroup(dialog: Locator): Locator {
  return dialog.getByRole("radiogroup", { name: "Facturable", exact: true });
}

/** Una opción de `bulkBillableGroup`; «Sin cambios» es la elegida al abrir. */
export function bulkBillableOption(
  dialog: Locator,
  name: "Sin cambios" | "Sí" | "No",
): Locator {
  return bulkBillableGroup(dialog).getByRole("radio", { name, exact: true });
}

/** El diálogo de borrado masivo, «¿Borrar N entradas?». Va en un portal. */
export function bulkDeleteDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: /^¿Borrar (1 entrada|\d+ entradas)\?$/ });
}

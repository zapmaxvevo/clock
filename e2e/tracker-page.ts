/**
 * Localizadores y acciones de la pantalla del rastreador, compartidos por los
 * recorridos del timer y los del modo manual. Todo se busca por rol y por
 * texto accesible: la pantalla se repartió en varios componentes y ningún
 * localizador tiene que depender de en cuál quedó cada cosa.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { calendarDayName, dayLabel, monthsBetween, type CivilDay } from "./days";
import { withServerAction } from "./network";

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

export function entryRow(scope: Locator, description: string): Locator {
  return scope.getByRole("listitem").filter({ hasText: description });
}

/** La descripción de una fila es un botón que la vuelve editable (TT-54). */
export function editDescriptionButton(scope: Locator, description: string): Locator {
  return scope.getByRole("button", { name: `${description} — editar la descripción` });
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
  await calendar.getByRole("button", { name: calendarDayName(target) }).click();
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

/**
 * Una opción del selector abierto: el nombre del proyecto, «Proyecto: Tarea»
 * o «Sin proyecto».
 */
export function projectOption(page: Page, name: string): Locator {
  return projectPopup(page).getByRole("option", { name, exact: true });
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

/**
 * El control de facturable de `scope` (TT-14, H-7): un botón de alternancia
 * con `aria-pressed`, «Facturable» en la barra y «Entrada «…» facturable» en
 * una fila. Dentro de cada uno hay uno solo.
 */
export function billableToggle(scope: Locator): Locator {
  return scope.getByRole("button", { name: /^(Facturable|Entrada «.*» facturable)$/ });
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

/** El diálogo de borrado masivo, «¿Borrar N entradas?». Va en un portal. */
export function bulkDeleteDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: /^¿Borrar (1 entrada|\d+ entradas)\?$/ });
}

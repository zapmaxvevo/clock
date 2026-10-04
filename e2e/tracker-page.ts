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
 * Canales del color de fondo. El tema los define en oklch y el canvas los
 * lleva a sRGB pintando un píxel, así la afirmación es «es rojo» y no el
 * valor exacto de la paleta.
 */
export async function backgroundRgb(
  element: Locator,
): Promise<{ red: number; green: number; blue: number }> {
  return element.evaluate((node) => {
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) {
      throw new Error("El canvas no está disponible para normalizar el color.");
    }
    context.fillStyle = window.getComputedStyle(node).backgroundColor;
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

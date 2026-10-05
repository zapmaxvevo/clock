/**
 * Localizadores y acciones de `/calendario` (slices 8 y 8c). Como en
 * `tracker-page.ts`, todo se busca por rol y por texto accesible. Hay dos
 * excepciones, las dos porque la pantalla no las expone a la accesibilidad:
 * la línea de ahora, que es decorativa y lleva `data-calendar-now`, y el
 * detalle de un bloque, un `Tooltip` de Base UI que no tiene rol.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import {
  calendarDayName,
  dayKeyOf,
  monthOfCaption,
  monthsBetween,
  weekdayLabel,
  type CivilDay,
} from "./days";
import { escapeRegExp } from "./tracker-page";

export const CALENDAR_PATH = "/calendario";

/** La zona por omisión de la persona (P-03): la que fija qué día es hoy. */
export const PERSON_TIMEZONE = "America/Argentina/Buenos_Aires";

/**
 * Minutos del final de un día en que los recorridos del timer no se pueden
 * afirmar: al principio el timer de las 00:00 suma «0:00» o mide la altura
 * mínima, y al final el test puede cruzar la medianoche.
 */
export const NEAR_MIDNIGHT_MINUTES = 5;

/** El motivo del salto de los recorridos del timer cerca de la medianoche. */
export const NEAR_MIDNIGHT_REASON =
  "A menos de cinco minutos de la medianoche de la persona el timer de las 00:00 suma «0:00» o el recorrido cruza de día; el reloj emulado no sirve, porque el total, la línea y el bloque se anclan en el serverNow.";

/** Diferencia máxima, en píxeles, entre el borde del timer y la línea de ahora. */
export const NOW_LINE_TOLERANCE_PX = 2;

/** Lo que pide el endpoint de la pantalla: sus server actions y sus revalidaciones. */
export function isCalendarPage(url: URL): boolean {
  return url.pathname === CALENDAR_PATH;
}

/** La vista de la grilla, como la nombra el selector «Semana / Día» (CAL-07). */
export type CalendarMode = "week" | "day";

/** Los enlaces de la barra que llevan a otro período o a otra vista (§5.6). */
export type PeriodLink =
  | "Semana anterior"
  | "Semana siguiente"
  | "Día anterior"
  | "Día siguiente"
  | "Hoy"
  | "Semana"
  | "Día";

/** Los tamaños de franja del zoom (CAL-11), como los muestra el control. */
export type ZoomSize = "1 h" | "30 min" | "15 min" | "5 min";

const ZOOM_STATUS: Record<ZoomSize, string> = {
  "1 h": "Franjas de 1 hora",
  "30 min": "Franjas de 30 minutos",
  "15 min": "Franjas de 15 minutos",
  "5 min": "Franjas de 5 minutos",
};

/**
 * El nombre de una columna empieza con el rótulo del día en el formato
 * `dd/MM/yyyy`, que es el de toda persona nueva (CAL-09).
 */
const DAY_COLUMN = /^(?:lun|mar|mié|jue|vie|sáb|dom), \d{2}\/\d{2}/;

/** El total de la semana en la barra, con su etiqueta (CAL-33). */
const PERIOD_TOTAL = /^Total \d+:\d{2}$/;

/**
 * La región de la pantalla como selector CSS, solo para dejar afuera lo que
 * está adentro: el detalle de un bloque se busca por su texto, y el bloque
 * lleva el mismo.
 */
const REGION_SELECTOR = '[aria-label="Calendario"]';

/** La dirección de una vista, que es la que arman sus enlaces (CAL-17). */
export function calendarHref(start: CivilDay, mode: CalendarMode = "week"): string {
  const day = `${CALENDAR_PATH}?semana=${dayKeyOf(start)}`;
  return mode === "day" ? `${day}&vista=dia` : day;
}

/** La URL es la de esa vista: un solo `semana`, y `vista=dia` solo en la del día. */
export function calendarUrl(
  start: CivilDay,
  mode: CalendarMode = "week",
): (url: URL) => boolean {
  return (url) =>
    url.pathname === CALENDAR_PATH &&
    url.searchParams.getAll("semana").join(",") === dayKeyOf(start) &&
    url.searchParams.get("vista") === (mode === "day" ? "dia" : null);
}

/** «Calendario» en la navegación principal (CAL-01). */
export function calendarNavLink(page: Page): Locator {
  return page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Calendario", exact: true });
}

/**
 * La región de la pantalla, siempre montada, con la barra y la grilla. Con
 * un diálogo modal abierto, Base UI marca todo lo de afuera con
 * `aria-hidden` y la región deja de encontrarse por rol.
 */
export function calendarRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Calendario", exact: true });
}

/**
 * Entra al calendario por la navegación, sin recargar, y espera la grilla.
 * Es una navegación del cliente a una ruta dinámica, que se pide entera.
 */
export async function goToCalendarByNav(page: Page): Promise<void> {
  await calendarNavLink(page).click();
  await expect(page).toHaveURL((url) => url.pathname === CALENDAR_PATH);
  await expect(calendarRegion(page)).toBeVisible();
}

export function periodLink(page: Page, name: PeriodLink): Locator {
  return calendarRegion(page).getByRole("link", { name, exact: true });
}

/** El rótulo del período es un botón que abre el calendario de mes (CAL-16). */
export function rangeButton(page: Page): Locator {
  return calendarRegion(page).getByRole("button", { name: /^Elegir fecha: / });
}

/**
 * Espera la vista que se pidió: la URL y el rótulo del período, que dibuja el
 * servidor. La URL sola no alcanza, porque cambia antes de que llegue la
 * pantalla nueva.
 */
export async function expectPeriod(
  page: Page,
  start: CivilDay,
  mode: CalendarMode,
  label: string,
): Promise<void> {
  await expect(page).toHaveURL(calendarUrl(start, mode));
  await expect(rangeButton(page)).toHaveAccessibleName(`Elegir fecha: ${label}`);
}

/** Sigue un enlace de la barra y espera la vista a la que lleva. */
export async function followPeriodLink(
  page: Page,
  name: PeriodLink,
  start: CivilDay,
  mode: CalendarMode,
  label: string,
): Promise<void> {
  await periodLink(page, name).click();
  await expectPeriod(page, start, mode, label);
}

/**
 * Elige un día en el calendario del rango y espera que se cierre. El
 * calendario puede abrir en el mes de hoy o en el del primer día del período,
 * así que el mes que muestra se lee del nombre de su grilla. No espera la
 * vista nueva: eso lo afirma quien llama.
 */
export async function pickPeriodDay(page: Page, target: CivilDay): Promise<void> {
  await rangeButton(page).click();
  await pickInOpenCalendar(page, target);
}

/**
 * Elige un día en el calendario de mes abierto, que va en un portal, y espera
 * que se cierre. El mes que muestra se lee del nombre de su grilla, así no
 * importa en cuál abrió.
 */
async function pickInOpenCalendar(page: Page, target: CivilDay): Promise<void> {
  const calendar = page.getByRole("grid");
  const shown = monthOfCaption((await calendar.getAttribute("aria-label")) ?? "");
  const months = monthsBetween(shown, target);
  const step = page.getByRole("button", {
    name: months < 0 ? "Mes anterior" : "Mes siguiente",
  });
  for (let moved = 0; moved < Math.abs(months); moved += 1) {
    await step.click();
  }
  await calendar.getByRole("button", { name: calendarDayName(target) }).click();
  await expect(calendar).toBeHidden();
}

/** Las columnas de la grilla, en orden: cada una es un grupo con su encabezado. */
export function dayColumns(page: Page): Locator {
  return calendarRegion(page).getByRole("group", { name: DAY_COLUMN });
}

/** La columna de un día, por el comienzo de su nombre: el rótulo del día. */
export function dayColumn(page: Page, day: CivilDay, today: CivilDay): Locator {
  return calendarRegion(page).getByRole("group", {
    name: new RegExp(`^${escapeRegExp(weekdayLabel(day, today))}`),
  });
}

/**
 * El nombre entero de una columna: el rótulo del día y su total, que es lo
 * último del encabezado (CAL-09, CAL-31). Entre los dos puede haber una
 * etiqueta o nada, según cómo se arme el encabezado, pero ningún dígito: así
 * «4:00» no encuentra «14:00». `totals` admite más de un valor para el total
 * que sigue al timer.
 */
export function columnName(
  day: CivilDay,
  today: CivilDay,
  totals: string | readonly string[],
): RegExp {
  const options = (typeof totals === "string" ? [totals] : totals).map(escapeRegExp);
  return new RegExp(
    `^${escapeRegExp(weekdayLabel(day, today))}\\D*(?:${options.join("|")})$`,
  );
}

/**
 * El total del período en la barra (CAL-33). La barra va antes que la grilla,
 * así que si los encabezados de las columnas también escriben «Total», el del
 * período es el primero. Solo existe en la vista semana.
 */
export function periodTotal(page: Page): Locator {
  return calendarRegion(page).getByText(PERIOD_TOTAL).first();
}

/** Los botones de los bloques de una entrada, por el comienzo de su nombre (CAL-75). */
export function entryBlocks(scope: Locator, description: string): Locator {
  return scope.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(description)}, `),
  });
}

/** El botón de un bloque, por su nombre entero (CAL-75). */
export function entryBlock(scope: Locator, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

/**
 * El nombre de una entrada cerrada (CAL-75): «{descripción}, {día}, de
 * {inicio} a {fin}{superíndice}, {duración}». Las horas van como las escribe
 * la persona; el superíndice es el texto de TT-51.
 */
export function closedBlockName(entry: {
  readonly description: string;
  readonly day: CivilDay;
  readonly today: CivilDay;
  readonly start: string;
  readonly end: string;
  readonly extraDays?: number;
  readonly duration: string;
  /** «Proyecto» o «Proyecto: Tarea», que el nombre suma al final. */
  readonly project?: string;
}): string {
  const extraDays = entry.extraDays ?? 0;
  const superscript =
    extraDays === 0
      ? ""
      : extraDays === 1
        ? " (termina un día después)"
        : ` (termina ${extraDays} días después)`;
  const day = weekdayLabel(entry.day, entry.today);
  const project = entry.project === undefined ? "" : `, ${entry.project}`;
  return `${entry.description}, ${day}, de ${entry.start} a ${entry.end}${superscript}, ${entry.duration}${project}`;
}

/** El nombre del bloque del timer (CAL-75): «…, desde las {inicio}, en curso». */
export function runningBlockName(entry: {
  readonly description: string;
  readonly day: CivilDay;
  readonly today: CivilDay;
  readonly start: string;
}): string {
  const day = weekdayLabel(entry.day, entry.today);
  return `${entry.description}, ${day}, desde las ${entry.start}, en curso`;
}

/**
 * Lo que dibuja una entrada en una columna, botón o segmento oculto. Los
 * segmentos que no son el primero están fuera del árbol de accesibilidad
 * (CAL-76) y solo se encuentran por su texto, que es la descripción.
 */
export function segmentText(column: Locator, description: string): Locator {
  return column.getByText(description, { exact: true });
}

/** La línea de ahora, decorativa (`aria-hidden`), por su atributo (§5.5). */
export function nowLine(scope: Page | Locator): Locator {
  return scope.locator("[data-calendar-now]");
}

/** Lo que mide una franja en píxeles, a cualquier zoom (§5.5). */
export const SLOT_HEIGHT_PX = 48;

/** Lo que mide un minuto en la grilla con ese tamaño de franja. */
export function minuteHeight(size: ZoomSize): number {
  const minutes = size === "1 h" ? 60 : Number.parseInt(size, 10);
  return SLOT_HEIGHT_PX / minutes;
}

/**
 * El encabezado de hoy, que lo marca con `aria-current="date"` (CAL-09). No
 * tiene rol propio: es el rótulo de su columna.
 */
export function todayHeader(page: Page): Locator {
  return calendarRegion(page).locator('[aria-current="date"]');
}

/** Dónde queda la línea de ahora de una columna, en píxeles. */
export type NowLineMetrics = {
  /** Del borde inferior del encabezado de la columna al centro de la línea. */
  readonly belowHeader: number;
  /** Del borde superior de la columna al centro de la línea: el minuto a escala. */
  readonly fromColumnTop: number;
  /** Lo más que se puede desplazar la grilla: el tope del desplazamiento inicial. */
  readonly maxScroll: number;
};

/**
 * Mide la línea de ahora de `column`. El encabezado es el que nombra a la
 * columna (`aria-labelledby`), y la grilla, el primer ancestro que se
 * desplaza. La línea se centra en su minuto, así que se mide su centro.
 */
export async function nowLineMetrics(column: Locator): Promise<NowLineMetrics> {
  return column.evaluate((node) => {
    const line = node.querySelector("[data-calendar-now]");
    const header = document.getElementById(node.getAttribute("aria-labelledby") ?? "");
    let scroller = node.parentElement;
    while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) {
      scroller = scroller.parentElement;
    }
    if (line === null || header === null || scroller === null) {
      throw new Error("La columna no tiene línea de ahora, encabezado o grilla.");
    }
    const box = line.getBoundingClientRect();
    const center = box.top + box.height / 2;
    return {
      belowHeader: center - header.getBoundingClientRect().bottom,
      fromColumnTop: center - node.getBoundingClientRect().top,
      maxScroll: scroller.scrollHeight - scroller.clientHeight,
    };
  });
}

/**
 * El detalle de un bloque (CAL-23, CAL-77). Es un `Tooltip` de Base UI, que
 * no le da rol al recuadro ni lo asocia al botón: se encuentra por su texto,
 * la descripción seguida del horario, y fuera de la región, porque va en un
 * portal y el bloque lleva el mismo texto.
 */
export function blockDetail(page: Page, description: string, start: string): Locator {
  return page
    .getByText(new RegExp(`${escapeRegExp(description)}.*${escapeRegExp(start)}`))
    .and(page.locator(`:not(${REGION_SELECTOR} *)`));
}

/** «Acercar» y «Alejar», en la esquina de la grilla (CAL-11). */
export function zoomButton(page: Page, name: "Acercar" | "Alejar"): Locator {
  return calendarRegion(page).getByRole("button", { name, exact: true });
}

/** El tamaño de franja a la vista y el estado que lo anuncia (CAL-11). */
export async function expectZoom(page: Page, size: ZoomSize): Promise<void> {
  const region = calendarRegion(page);
  await expect(region.getByText(size, { exact: true })).toBeVisible();
  await expect(region.getByRole("status").filter({ hasText: /^Franjas de / })).toHaveText(
    ZOOM_STATUS[size],
  );
}

/** Aprieta «Acercar» una vez y espera el tamaño nuevo. Cambiarlo no navega. */
export async function zoomIn(page: Page, size: ZoomSize): Promise<void> {
  await zoomButton(page, "Acercar").click();
  await expectZoom(page, size);
}

/** Los títulos del diálogo de una entrada (§5.3 del 8c). */
export type EntryDialogTitle =
  "Editar entrada" | "Agregar entrada" | "Timer en curso" | "Entrada";

/**
 * El diálogo de una entrada: «Editar entrada» para una cerrada, «Timer en
 * curso» para la que corre, «Agregar entrada» para el alta, y «Entrada» en
 * solo lectura, sin `canTrack`. Va en un portal.
 */
export function entryDialog(page: Page, title: EntryDialogTitle): Locator {
  return page.getByRole("dialog", { name: title, exact: true });
}

/** «Descripción» del diálogo. */
export function dialogDescription(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Descripción", exact: true });
}

/** Un campo de hora o la duración del diálogo, los del modo manual (TT-18). */
export function dialogClock(
  dialog: Locator,
  label: "Hora de inicio" | "Hora de fin" | "Duración",
): Locator {
  return dialog.getByRole("textbox", { name: label, exact: true });
}

/** El selector de fecha del diálogo, que lleva el día elegido en su nombre. */
export function dialogDate(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: /^Fecha( de la entrada)?: / });
}

/** Un botón del pie del diálogo. */
export function dialogButton(
  dialog: Locator,
  name: "Guardar" | "Cancelar" | "Agregar" | "Detener",
): Locator {
  return dialog.getByRole("button", { name, exact: true });
}

/** El menú del diálogo de una cerrada (CAL-68), con el nombre de la entrada. */
export function dialogActions(dialog: Locator, description: string): Locator {
  return dialog.getByRole("button", {
    name: `Acciones de la entrada «${description}»`,
    exact: true,
  });
}

/**
 * Elige una opción del menú del diálogo, que se abre en un portal. Elegirla
 * cierra el diálogo (CAL-68); quien llama espera lo que sigue.
 */
export async function chooseDialogAction(
  page: Page,
  dialog: Locator,
  description: string,
  action: "Duplicar" | "Borrar",
): Promise<void> {
  await dialogActions(dialog, description).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

/** Lo que un diálogo de edición o de alta muestra en sus campos. */
export type DialogFields = {
  readonly description: string;
  /** El rótulo del día en el selector: «Hoy», «Ayer» o «mié, 30/09». */
  readonly date: string;
  readonly start: string;
  /** Sin fin ni duración en el timer, que dice «Fin: en curso». */
  readonly end?: string;
  readonly duration?: string;
};

/**
 * Espera un diálogo de edición o de alta abierto, con el foco en
 * «Descripción» y los valores de la entrada en sus campos (§5.3 y §5.5 del 8c).
 */
export async function expectEditDialog(
  dialog: Locator,
  fields: DialogFields,
): Promise<void> {
  await expect(dialogDescription(dialog)).toBeFocused();
  await expect(dialogDescription(dialog)).toHaveValue(fields.description);
  await expect(dialogDate(dialog)).toHaveAccessibleName(
    new RegExp(`: ${escapeRegExp(fields.date)}$`),
  );
  await expect(dialogClock(dialog, "Hora de inicio")).toHaveValue(fields.start);
  if (fields.end === undefined) {
    await expect(dialogClock(dialog, "Hora de fin")).toHaveCount(0);
    await expect(dialog).toContainText("Fin: en curso");
  } else {
    await expect(dialogClock(dialog, "Hora de fin")).toHaveValue(fields.end);
  }
  if (fields.duration !== undefined) {
    await expect(dialogClock(dialog, "Duración")).toHaveValue(fields.duration);
  }
}

/** La confirmación del borrado (TT-60), la misma de la fila. */
export function deleteConfirmation(page: Page): Locator {
  return page.getByRole("dialog", { name: "¿Borrar esta entrada?", exact: true });
}

/**
 * Elige un día con el selector de fecha del diálogo y espera el foco de
 * vuelta en el selector, que es cuando el borrador ya tiene el día.
 */
export async function pickDialogDay(
  page: Page,
  dialog: Locator,
  target: CivilDay,
): Promise<void> {
  await dialogDate(dialog).click();
  await pickInOpenCalendar(page, target);
  await expect(dialogDate(dialog)).toBeFocused();
}

/** El aviso de una falla dentro del diálogo, por su título (TT-90). */
export function dialogNotice(dialog: Locator, title: string): Locator {
  return dialog.getByRole("alert").filter({ hasText: title });
}

/**
 * El aviso de una falla en la pantalla, debajo de la barra, por su título: el
 * que sobrevive al diálogo (§5.4 del 8c).
 */
export function screenNotice(page: Page, title: string): Locator {
  return calendarRegion(page).getByRole("alert").filter({ hasText: title });
}

/**
 * El aviso de CAL-46, informativo: la entrada guardada quedó fuera del
 * período. `day` es el rótulo de columna de su día de inicio.
 */
export function outsideNotice(page: Page, day: string, mode: CalendarMode): Locator {
  const period = mode === "week" ? "de la semana" : "del día";
  return calendarRegion(page)
    .getByRole("status")
    .filter({ hasText: `La entrada quedó el ${day}, fuera ${period} que estás viendo.` });
}

/** «Agregar entrada», al final de la barra (CAL-74). */
export function addEntryButton(page: Page): Locator {
  return calendarRegion(page).getByRole("button", {
    name: "Agregar entrada",
    exact: true,
  });
}

/** Un punto de la pantalla, en píxeles del viewport, el de `page.mouse`. */
export type ScreenPoint = { readonly x: number; readonly y: number };

/**
 * Desde el borde superior de una columna, los píxeles hasta dos por debajo
 * del borde de la franja de `clock` (CAL-43). Las franjas no son controles,
 * así que el lugar se calcula con la escala del zoom. Es relativo a la
 * columna: no depende del desplazamiento de la grilla.
 */
export function slotOffset(clock: string, size: ZoomSize = "1 h"): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours * 60 + minutes) * minuteHeight(size) + 2;
}

/**
 * El punto de pantalla de una franja: el centro de la columna, a
 * `slotOffset`. Sale de una sola caja, tomada en el momento: hay que pedirlo
 * justo antes de usarlo, porque la grilla se desplaza (al abrir, al enfocar un
 * bloque, cerca de un borde durante un gesto).
 */
export async function slotPoint(
  page: Page,
  day: CivilDay,
  today: CivilDay,
  clock: string,
  size: ZoomSize = "1 h",
): Promise<ScreenPoint> {
  const box = await boxOf(dayColumn(page, day, today));
  return { x: box.x + box.width / 2, y: box.y + slotOffset(clock, size) };
}

/**
 * Debajo del borde superior de un bloque, dónde se aprieta su cuerpo para
 * moverlo: más abajo que el asa de inicio, que mide 6 px (§5.3 del 8b). Es
 * `slotOffset` más 16 px.
 */
export const BODY_GRIP_PX = 18;

/**
 * El punto adonde se lleva un bloque agarrado a `BODY_GRIP_PX` para que su
 * inicio caiga en la franja de `clock` (CAL-50): el agarre se conserva.
 */
export async function grabPoint(
  page: Page,
  day: CivilDay,
  today: CivilDay,
  clock: string,
  size: ZoomSize = "1 h",
): Promise<ScreenPoint> {
  const point = await slotPoint(page, day, today, clock, size);
  return { x: point.x, y: point.y + BODY_GRIP_PX - 2 };
}

/** Hace clic en la franja de `clock` de un día, con el fondo de la columna. */
export async function clickSlot(
  page: Page,
  day: CivilDay,
  today: CivilDay,
  clock: string,
  size: ZoomSize = "1 h",
): Promise<void> {
  const column = dayColumn(page, day, today);
  const { width } = await boxOf(column);
  await column.click({ position: { x: width / 2, y: slotOffset(clock, size) } });
}

/** La caja de un elemento dibujado, en píxeles del viewport. */
export async function boxOf(
  element: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await element.boundingBox();
  if (box === null) {
    throw new Error("El elemento no tiene caja: no está dibujado.");
  }
  return box;
}

/** El centro de un elemento, para apretarlo con `page.mouse`. */
export async function centerOf(element: Locator): Promise<ScreenPoint> {
  const box = await boxOf(element);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Un asa del bloque (§5.3 del 8b): decorativa (`aria-hidden`), así que se
 * busca por su atributo, adentro del botón del bloque.
 */
export function blockHandle(block: Locator, edge: "start" | "end"): Locator {
  return block.locator(`[data-block-handle="${edge}"]`);
}

/**
 * La selección del alta mientras se arrastra (CAL-44), decorativa, en la
 * región o en una columna.
 */
export function calendarSelection(scope: Locator): Locator {
  return scope.locator("[data-calendar-selection]");
}

/** Lo que importa del área que se desplaza: su desplazamiento y su caja. */
export type GridScroller = {
  readonly scrollTop: number;
  readonly maxScroll: number;
  readonly top: number;
  readonly bottom: number;
};

/**
 * La grilla que se desplaza: el primer ancestro de las columnas con algo que
 * desplazar. No tiene rol ni nombre; se llega desde una columna.
 */
export async function gridScroller(page: Page): Promise<GridScroller> {
  return dayColumns(page)
    .first()
    .evaluate((node) => {
      let scroller = node.parentElement;
      while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      if (scroller === null) {
        throw new Error("Las columnas no están en un área que se desplace.");
      }
      const box = scroller.getBoundingClientRect();
      return {
        scrollTop: scroller.scrollTop,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
        top: box.top,
        bottom: box.bottom,
      };
    });
}

/**
 * Desplaza la grilla para que `clock` quede arriba, debajo de los
 * encabezados, o lo más cerca que permita el final. Es preparación del
 * recorrido: lo que se afirma es la posición de las cosas, no el desplazamiento.
 */
export async function scrollGridTo(
  page: Page,
  clock: string,
  size: ZoomSize = "1 h",
): Promise<void> {
  const [hours, minutes] = clock.split(":").map(Number);
  const top = (hours * 60 + minutes) * minuteHeight(size);
  await dayColumns(page)
    .first()
    .evaluate((node, scrollTop) => {
      let scroller = node.parentElement;
      while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      scroller?.scrollTo({ top: scrollTop });
    }, top);
  await settle(page);
}

/**
 * Un paso que sincroniza con la página: dos cuadros de animación. Va antes de
 * afirmar una ausencia —ningún pedido, ningún diálogo—, nunca una espera fija.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Pasos de movimiento de cada tramo de un arrastre: al menos cinco (§6 del 8b). */
const DRAG_STEPS = 8;

/**
 * Lo que se aprieta para empezar un gesto: un elemento, y a cuántos píxeles
 * de su borde superior, o su centro si falta. Es relativo al elemento, así que
 * no depende del desplazamiento de la grilla.
 */
export type Grip = { readonly on: Locator; readonly y?: number };

/**
 * Lleva el puntero a `grip` con `hover`, que espera a que el elemento reciba
 * el puntero en ese punto: el fondo de un diálogo que se termina de cerrar no
 * se lleva el movimiento ni el `pointerdown` que sigue.
 */
export async function hoverAt(grip: Grip): Promise<void> {
  if (grip.y === undefined) {
    await grip.on.hover();
    return;
  }
  const { width } = await boxOf(grip.on);
  await grip.on.hover({ position: { x: width / 2, y: grip.y } });
}

/** Lleva el puntero a `grip` y aprieta el botón principal. */
export async function pressAt(page: Page, grip: Grip): Promise<void> {
  await hoverAt(grip);
  await page.mouse.down();
}

/** Mueve el puntero, con el botón como esté, en varios pasos. */
export async function moveTo(page: Page, to: ScreenPoint): Promise<void> {
  await page.mouse.move(to.x, to.y, { steps: DRAG_STEPS });
}

/**
 * Un arrastre entero con el botón principal: apretar, mover en pasos y
 * soltar. El destino se calcula después de apretar, porque `hover` puede
 * desplazar la grilla para tener el elemento a la vista.
 */
export async function dragBetween(
  page: Page,
  from: Grip,
  to: () => Promise<ScreenPoint>,
): Promise<void> {
  await pressAt(page, from);
  await moveTo(page, await to());
  await page.mouse.up();
}

/**
 * Los detalles de los bloques abiertos. Base UI no les da rol (ver
 * `blockDetail`); el atributo es el de la primitiva generada.
 */
export function openDetails(page: Page): Locator {
  return page.locator("[data-slot=tooltip-content]");
}

/**
 * La distancia, en píxeles, entre el borde inferior de un bloque y el centro
 * de la línea de ahora de su columna: el timer termina en ahora (CAL-38).
 */
export async function bottomToNowLine(block: Locator, column: Locator): Promise<number> {
  const bottom = await block.evaluate((node) => node.getBoundingClientRect().bottom);
  const top = await column.evaluate((node) => node.getBoundingClientRect().top);
  const { fromColumnTop } = await nowLineMetrics(column);
  return Math.abs(bottom - (top + fromColumnTop));
}

/**
 * Espera dos bloques a la misma altura y lado a lado, sin pisarse (CAL-25),
 * con un píxel de margen para los bordes.
 */
export async function expectSideBySide(blocks: Locator): Promise<void> {
  await expect(blocks).toHaveCount(2);
  const boxes = await blocks.evaluateAll((nodes) =>
    nodes.map((node) => {
      const { left, right, top, height } = node.getBoundingClientRect();
      return { left, right, top, height };
    }),
  );
  const [first, second] = boxes;
  expect(Math.abs(first.top - second.top)).toBeLessThan(1);
  expect(Math.abs(first.height - second.height)).toBeLessThan(1);
  const apart = first.right <= second.left + 1 || second.right <= first.left + 1;
  expect(apart, "los dos bloques se pisan").toBe(true);
}

/**
 * Lo que pinta el encabezado de una columna: color, fondo, borde y peso de su
 * texto y de todo lo que lleva adentro. El de hoy va con el color de acento
 * (CAL-09); la marca es solo visual, así que se compara contra otro día.
 */
export async function headerLook(column: Locator): Promise<string> {
  return column.evaluate((node) => {
    const ids = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/);
    const parts: string[] = [];
    for (const id of ids) {
      const header = document.getElementById(id);
      if (header === null) {
        continue;
      }
      for (const element of [header, ...header.querySelectorAll("*")]) {
        const style = window.getComputedStyle(element);
        parts.push(
          [
            style.color,
            style.backgroundColor,
            style.borderBottomColor,
            style.fontWeight,
          ].join(" "),
        );
      }
    }
    return parts.join(" | ");
  });
}

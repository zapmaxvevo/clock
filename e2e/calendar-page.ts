/**
 * Localizadores y acciones de `/calendario` (slice 8). Como en
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
}): string {
  const extraDays = entry.extraDays ?? 0;
  const superscript =
    extraDays === 0
      ? ""
      : extraDays === 1
        ? " (termina un día después)"
        : ` (termina ${extraDays} días después)`;
  const day = weekdayLabel(entry.day, entry.today);
  return `${entry.description}, ${day}, de ${entry.start} a ${entry.end}${superscript}, ${entry.duration}`;
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

/**
 * El diálogo de una entrada (§5.7), en solo lectura: «Entrada» para una
 * cerrada, «Timer en curso» para la que corre. Va en un portal.
 */
export function entryDialog(page: Page, title: "Entrada" | "Timer en curso"): Locator {
  return page.getByRole("dialog", { name: title, exact: true });
}

/** Los valores de la lista de definiciones del diálogo, en orden. */
export function dialogValues(dialog: Locator): Locator {
  return dialog.getByRole("definition");
}

/** «Cerrar», el único control del diálogo de solo lectura. */
export function closeButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Cerrar", exact: true });
}

/**
 * Espera el diálogo de solo lectura abierto, con el foco en «Cerrar» y sin
 * ningún otro control: ni campos, ni selectores, ni la cruz del primitivo.
 */
export async function expectReadOnlyDialog(dialog: Locator): Promise<void> {
  await expect(closeButton(dialog)).toBeFocused();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
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

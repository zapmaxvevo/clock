/**
 * Localizadores y acciones de `/reportes` (R2a y R2b del núcleo de reportes).
 * Como en `timesheet-page.ts`, todo se busca por rol y por texto accesible. La
 * tabla se nombra por el título, y cada grupo es una fila con su encabezado de
 * fila: el nombre o, por fecha, el rótulo del día. La única excepción son los
 * totales: una lista de definiciones, cuyo término no da nombre a su
 * definición, así que la cifra se busca como el hermano que sigue al término.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import {
  addDays,
  calendarDayName,
  dayKeyOf,
  dayRangeLabel,
  monthEndOf,
  monthOfCaption,
  monthStartOf,
  monthsBetween,
  sameDay,
  weekLabel,
  weekStartOf,
  type CivilDay,
} from "./days";
import { escapeRegExp } from "./tracker-page";

export const REPORTS_PATH = "/reportes";

/** El título de la pantalla, que también nombra la tabla (§5.3). */
export const REPORT_HEADING = "Reporte resumido";

/** RP-33: la fila del vacío. */
export const EMPTY_REPORT = "No hay horas en este período";

/** D-R2a-2: la línea del alcance de un member. */
export const SCOPE_SELF = "Ves solo tus horas.";

/** D-R2a-2: la línea del alcance de owner y admin. */
export const SCOPE_EVERYONE = "Ves las horas de todas las personas del workspace.";

/** RP-31: la marca de una persona con la membresía inactiva. */
export const INACTIVE_PERSON = "(inactiva)";

/** RP-28: el grupo de las entradas sin proyecto. */
export const NO_PROJECT = "Sin proyecto";

/** RP-28: el grupo de las entradas sin proyecto y de los proyectos sin cliente. */
export const NO_CLIENT = "Sin cliente";

/** RP-07: el aviso de una membresía que no está activa. */
export const FORBIDDEN_TITLE = "Tu acceso al workspace está desactivado.";
export const FORBIDDEN_BODY = "No podés ver reportes.";

/** RP-34: los mensajes del selector, que la URL nunca muestra (RP-32). */
export const RANGE_MESSAGES = [
  "La fecha de fin no puede ser anterior a la de inicio.",
  "Elegí un período de hasta 366 días.",
  "Fecha inválida.",
] as const;

/** RP-22: la línea de la zona con que se cortan los días. */
export function zoneLine(timeZone: string): string {
  return `Los días se cortan en tu zona horaria: ${timeZone}.`;
}

/** Un período con los dos extremos incluidos. */
export type ReportRange = { readonly first: CivilDay; readonly last: CivilDay };

/** La agrupación como la escribe la URL. */
export type ReportGroupBy = "persona" | "proyecto" | "cliente" | "fecha";

/**
 * El enlace de cada agrupación en «Agrupar por», en su orden. Es también el
 * encabezado de la primera columna de la tabla (§5.3).
 */
export const GROUP_LINK: Record<ReportGroupBy, string> = {
  persona: "Persona",
  proyecto: "Proyecto",
  cliente: "Cliente",
  fecha: "Fecha",
};

/** RP-20: los atajos del selector del período, en el orden de la lista (D-R2b-2). */
export const SHORTCUT_LABELS = [
  "Hoy",
  "Ayer",
  "Esta semana",
  "Semana anterior",
  "Últimas dos semanas",
  "Este mes",
  "Mes pasado",
  "Este año",
  "Año pasado",
] as const;
export type ShortcutLabel = (typeof SHORTCUT_LABELS)[number];

/** La semana de `start`, de siete días. */
export function weekRange(start: CivilDay): ReportRange {
  return { first: start, last: addDays(start, 6) };
}

/** La semana de hoy, con el lunes como primer día (PF-16). */
export function currentWeekRange(today: CivilDay): ReportRange {
  return weekRange(weekStartOf(today));
}

/** La semana anterior a la de hoy, la de los recorridos que siembran. */
export function lastWeekRange(today: CivilDay): ReportRange {
  return weekRange(addDays(weekStartOf(today), -7));
}

/** El mes que está `months` meses después del de `civil`, entero. */
export function monthRange(civil: CivilDay, months: number): ReportRange {
  return { first: monthStartOf(civil, months), last: monthEndOf(civil, months) };
}

/** Del 1 de enero al 31 de diciembre de `year`. */
function yearRange(year: number): ReportRange {
  return { first: { year, month: 1, day: 1 }, last: { year, month: 12, day: 31 } };
}

/**
 * El período de un atajo con hoy en `today` (D-R2b-2): unidades enteras del
 * calendario, con los días que no pasaron, y las semanas alineadas al lunes.
 * «Últimas dos semanas» son la anterior y esta, no los 14 días hasta hoy.
 */
export function shortcutRange(label: ShortcutLabel, today: CivilDay): ReportRange {
  const week = weekStartOf(today);
  switch (label) {
    case "Hoy":
      return { first: today, last: today };
    case "Ayer":
      return { first: addDays(today, -1), last: addDays(today, -1) };
    case "Esta semana":
      return weekRange(week);
    case "Semana anterior":
      return weekRange(addDays(week, -7));
    case "Últimas dos semanas":
      return { first: addDays(week, -7), last: addDays(week, 6) };
    case "Este mes":
      return monthRange(today, 0);
    case "Mes pasado":
      return monthRange(today, -1);
    case "Este año":
      return yearRange(today.year);
    case "Año pasado":
      return yearRange(today.year - 1);
  }
}

/** El período movido `days` días, hacia atrás si es negativo. */
export function shiftRange(range: ReportRange, days: number): ReportRange {
  return { first: addDays(range.first, days), last: addDays(range.last, days) };
}

/** La dirección de un período y una agrupación, con los tres parámetros. */
export function reportsUrl(range: ReportRange, groupBy: ReportGroupBy): string {
  return `${REPORTS_PATH}?desde=${dayKeyOf(range.first)}&hasta=${dayKeyOf(range.last)}&agrupar=${groupBy}`;
}

/** La URL es la de ese período y esa agrupación: cada parámetro una vez. */
export function reportsUrlOf(
  range: ReportRange,
  groupBy: ReportGroupBy,
): (url: URL) => boolean {
  return (url) =>
    url.pathname === REPORTS_PATH &&
    url.searchParams.getAll("desde").join(",") === dayKeyOf(range.first) &&
    url.searchParams.getAll("hasta").join(",") === dayKeyOf(range.last) &&
    url.searchParams.getAll("agrupar").join(",") === groupBy;
}

/**
 * Registra, desde ahora, los pedidos que navegan a ese período y esa
 * agrupación. Los de prefetch de un enlace no cuentan: Next los marca con
 * `next-router-prefetch` y no son una navegación. Una que llegue tarde, después
 * de afirmar la URL, queda igual en el registro, que se lee al final.
 */
export function recordNavigations(
  page: Page,
  range: ReportRange,
  groupBy: ReportGroupBy,
): readonly string[] {
  const matches = reportsUrlOf(range, groupBy);
  const recorded: string[] = [];
  page.on("request", (request) => {
    if (
      request.headers()["next-router-prefetch"] === undefined &&
      matches(new URL(request.url()))
    ) {
      recorded.push(request.url());
    }
  });
  return recorded;
}

/**
 * El rótulo del período: el del atajo de hoy que tiene ese período (D-R2b-2);
 * si no hay, el de la semana si es una alineada al lunes, el primer día de
 * toda persona nueva, y si no, el de `dayRangeLabel` (D-R2a-4).
 */
export function rangeLabel(range: ReportRange, today: CivilDay): string {
  const { first, last } = range;
  const shortcut = SHORTCUT_LABELS.find((label) => {
    const candidate = shortcutRange(label, today);
    return sameDay(candidate.first, first) && sameDay(candidate.last, last);
  });
  if (shortcut !== undefined) {
    return shortcut;
  }
  return sameDay(first, weekStartOf(first)) && sameDay(last, addDays(first, 6))
    ? weekLabel(first, today)
    : dayRangeLabel(first, last, today);
}

/** «Reportes» en la navegación principal (D-R2a-10). */
export function reportsNavLink(page: Page): Locator {
  return page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Reportes", exact: true });
}

export function reportHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: REPORT_HEADING, exact: true });
}

/** La tabla de los grupos, nombrada por el título (§5.3). */
export function reportTable(page: Page): Locator {
  return page.getByRole("table", { name: REPORT_HEADING, exact: true });
}

/** Entra al reporte por la navegación, sin recargar, y espera la tabla. */
export async function goToReportsByNav(page: Page): Promise<void> {
  await reportsNavLink(page).click();
  await expect(page).toHaveURL((url) => url.pathname === REPORTS_PATH);
  await expect(reportTable(page)).toBeVisible();
}

/** El encabezado de la primera columna, que nombra la agrupación (§5.3). */
export function groupColumnHeader(page: Page): Locator {
  return reportTable(page).getByRole("columnheader").first();
}

/**
 * Los encabezados de fila de la tabla, uno por grupo, en el orden en que se
 * muestran. La fila del vacío no tiene.
 */
export function groupHeaders(page: Page): Locator {
  return reportTable(page).getByRole("rowheader");
}

/**
 * La fila de un grupo, por el comienzo de su encabezado: el nombre de la
 * persona, que puede seguir con «(inactiva)», el del proyecto, el del cliente
 * o el rótulo del día. Los nombres de los recorridos llevan el sufijo del
 * test, así que no hay otro que empiece igual; los días son de un alcance
 * propio.
 */
export function groupRow(page: Page, name: string): Locator {
  return reportTable(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", {
        name: new RegExp(`^${escapeRegExp(name)}(?:\\s|$)`),
      }),
    });
}

/** La duración de una fila: su única celda de datos (RP-19). */
export function groupDuration(row: Locator): Locator {
  return row.getByRole("cell");
}

/** La marca «(inactiva)» de la fila de una persona (RP-31). */
export function inactiveMark(row: Locator): Locator {
  return row.getByText(INACTIVE_PERSON, { exact: true });
}

/** La cifra de «Total» o «Facturable» (RP-18): la definición que sigue al término. */
export function reportTotal(page: Page, term: "Total" | "Facturable"): Locator {
  return page
    .getByRole("term")
    .filter({ hasText: new RegExp(`^${term}$`) })
    .locator("xpath=following-sibling::*[1]");
}

/** Los términos de los totales; con la membresía inactiva no hay ninguno. */
export function reportTerms(page: Page): Locator {
  return page.getByRole("term");
}

/** «Período anterior» y «Período siguiente» (RP-20), y el atajo «Esta semana». */
export type PeriodLink = "Período anterior" | "Período siguiente" | "Esta semana";

export function periodLink(page: Page, name: PeriodLink): Locator {
  return page.getByRole("link", { name, exact: true });
}

/** El botón del período, que abre el calendario de rango (§5.2). */
export function rangeButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Elegir período: / });
}

/** «Agrupar por», nombrado por su rótulo visible. */
export function groupByControl(page: Page): Locator {
  return page.getByRole("group", { name: "Agrupar por", exact: true });
}

export function groupByLink(page: Page, groupBy: ReportGroupBy): Locator {
  return groupByControl(page).getByRole("link", {
    name: GROUP_LINK[groupBy],
    exact: true,
  });
}

/**
 * La agrupación elegida es la única con `aria-current` entre las que hay. Se
 * leen los enlaces que dibuja la barra y no los de `GROUP_LINK`: una agrupación
 * que la pantalla todavía no ofrece no tiene enlace que marcar.
 */
export async function expectGroupBy(page: Page, groupBy: ReportGroupBy): Promise<void> {
  await expect(groupByLink(page, groupBy)).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() =>
      groupByControl(page)
        .getByRole("link")
        .evaluateAll((links) =>
          links
            .filter((link) => link.getAttribute("aria-current") === "true")
            .map((link) => link.textContent),
        ),
    )
    .toEqual([GROUP_LINK[groupBy]]);
}

/**
 * Espera el período y la agrupación pedidos: la URL, el rótulo que dibuja el
 * servidor y la agrupación marcada. La URL sola no alcanza, porque cambia
 * antes de que llegue la pantalla nueva.
 */
export async function expectReport(
  page: Page,
  range: ReportRange,
  groupBy: ReportGroupBy,
  today: CivilDay,
): Promise<void> {
  await expect(page).toHaveURL(reportsUrlOf(range, groupBy));
  await expect(rangeButton(page)).toHaveAccessibleName(
    `Elegir período: ${rangeLabel(range, today)}`,
  );
  await expectGroupBy(page, groupBy);
}

/** Abre el reporte en un período y una agrupación, y espera la pantalla. */
export async function openReport(
  page: Page,
  range: ReportRange,
  groupBy: ReportGroupBy,
  today: CivilDay,
): Promise<void> {
  await page.goto(reportsUrl(range, groupBy));
  await expectReport(page, range, groupBy, today);
  await expect(reportTable(page)).toBeVisible();
}

/** El calendario de rango abierto, que va en un portal. */
export function rangeCalendar(page: Page): Locator {
  return page.getByRole("grid");
}

/**
 * El selector del período abierto, que va en un portal: el diálogo que tiene
 * el calendario de rango.
 */
export function rangePopover(page: Page): Locator {
  return page.getByRole("dialog").filter({ has: page.getByRole("grid") });
}

/** La lista «Atajos» del selector abierto (§5.2). */
export function shortcutList(page: Page): Locator {
  return rangePopover(page).getByRole("list", { name: "Atajos", exact: true });
}

/**
 * Un atajo de la lista. Se busca dentro del selector: con el selector
 * abierto, «Esta semana» es también el enlace de la barra.
 */
export function shortcutLink(page: Page, label: ShortcutLabel): Locator {
  return shortcutList(page).getByRole("link", { name: label, exact: true });
}

/** «Aplicar», debajo del calendario. */
export function applyButton(page: Page): Locator {
  return page.getByRole("button", { name: "Aplicar", exact: true });
}

/**
 * Hace clic en un día del calendario de rango abierto. El mes que muestra se
 * lee del nombre de su grilla, y se avanza o retrocede hasta el del día; el
 * calendario sigue abierto, porque el rango se aplica con «Aplicar».
 */
export async function clickRangeDay(page: Page, target: CivilDay): Promise<void> {
  const calendar = rangeCalendar(page);
  const shown = monthOfCaption((await calendar.getAttribute("aria-label")) ?? "");
  const months = monthsBetween(shown, target);
  const step = page.getByRole("button", {
    name: months < 0 ? "Mes anterior" : "Mes siguiente",
    exact: true,
  });
  for (let moved = 0; moved < Math.abs(months); moved += 1) {
    await step.click();
  }
  // El nombre de la grilla cambia con cada paso: se espera el del mes del día.
  await expect
    .poll(async () => {
      const month = monthOfCaption((await calendar.getAttribute("aria-label")) ?? "");
      return monthsBetween(month, target);
    })
    .toBe(0);
  await calendar.getByRole("button", { name: calendarDayName(target) }).click();
}

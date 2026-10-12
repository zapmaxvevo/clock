/**
 * Localizadores y acciones de `/reportes` (R2a a R10b y R9 del núcleo de reportes).
 * Como en `timesheet-page.ts`, todo se busca por rol y por texto accesible. La
 * tabla se nombra por el título, y cada grupo es una fila con su encabezado de
 * fila: el nombre o, por fecha, el rótulo del día. La única excepción son los
 * totales: una lista de definiciones, cuyo término no da nombre a su
 * definición, así que la cifra se busca como el hermano que sigue al término.
 */
import { readFile } from "node:fs/promises";

import { expect, type Locator, type Page, type Request } from "@playwright/test";
import { Workbook, type Cell } from "exceljs";

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

/** RP-33, D-R4-7: la fila del vacío cuando hay filtros. */
export const EMPTY_FILTERED = "Ninguna entrada coincide con los filtros";

/** D-R4-7: el enlace del segundo vacío, que vuelve a la vista sin filtros. */
export const CLEAR_FILTERS = "Quitar filtros";

/** D-R3-8: el grupo de los botones de los subniveles. */
export const SUBGROUP_BY = "Subagrupar por";

/** D-R3-8: la opción que quita un subnivel, y el texto del botón sin él. */
export const NO_LEVEL = "Ninguno";

/** RP-31: la marca de una persona con la membresía inactiva. */
export const INACTIVE_PERSON = "(inactiva)";

/** RP-28: el grupo de las entradas sin proyecto. */
export const NO_PROJECT = "Sin proyecto";

/** RP-28: el grupo de las entradas sin proyecto y de los proyectos sin cliente. */
export const NO_CLIENT = "Sin cliente";

/** RP-28: el grupo de las entradas sin tarea, con proyecto o sin él. */
export const NO_TASK = "Sin tarea";

/** RP-28: el grupo de las entradas sin ninguna etiqueta. */
export const NO_TAG = "Sin etiqueta";

/** RP-28: el grupo de las entradas con la descripción vacía, el rótulo del rastreador. */
export const NO_DESCRIPTION = "Sin descripción";

/** D-R3-6: la línea de un nivel de abajo que no entra en el tope. */
export const ROW_LIMIT =
  "El reporte pasa de 3000 filas con todos sus niveles: se muestran solo los de arriba. Acortá el período o quitá un nivel.";

/** D-R10-10: la fila que reemplaza a las del primer nivel cuando no entra en el tope. */
export const FIRST_LEVEL_LIMIT =
  "El primer nivel pasa de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá por otra cosa.";

/** RP-18, D-R3-3: la línea que avisa que las filas por etiqueta pueden pasar el total. */
export const TAG_OVERLAP =
  "Una entrada con varias etiquetas suma en cada una: las filas por etiqueta pueden sumar más que el total.";

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
export type ReportGroupBy =
  | "persona"
  | "proyecto"
  | "cliente"
  | "tarea"
  | "etiqueta"
  | "fecha"
  | "semana"
  | "mes"
  | "descripcion";

/**
 * El enlace de cada agrupación en «Agrupar por», en su orden (D-R3-8,
 * D-R10-5). Es también el encabezado de la primera columna de la tabla (§5.3).
 */
export const GROUP_LINK: Record<ReportGroupBy, string> = {
  persona: "Persona",
  proyecto: "Proyecto",
  cliente: "Cliente",
  tarea: "Tarea",
  etiqueta: "Etiqueta",
  fecha: "Fecha",
  semana: "Semana",
  mes: "Mes",
  descripcion: "Descripción",
};

/**
 * D-R10-3: los días que cuenta una semana o un mes que el período o un grupo
 * de arriba cortan, en gris después del rótulo: «solo 01/10 – 04/10».
 */
function partialDays(days: string): string {
  return `solo ${days}`;
}

/**
 * El nombre accesible del encabezado de una semana o un mes: el rótulo de la
 * unidad entera y, si la fila no la cuenta entera, los días que cuenta. Con
 * ese nombre entero, `groupRow` separa la misma semana debajo de dos meses.
 */
export function periodHeading(label: string, partial: string | null): string {
  return partial === null ? label : `${label} ${partialDays(partial)}`;
}

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
  switch (label) {
    case "Hoy":
      return { first: today, last: today };
    case "Ayer":
      return { first: addDays(today, -1), last: addDays(today, -1) };
    case "Esta semana":
      return currentWeekRange(today);
    case "Semana anterior":
      return lastWeekRange(today);
    case "Últimas dos semanas":
      return { first: lastWeekRange(today).first, last: currentWeekRange(today).last };
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

/** RP-26: el valor de `proyectos` que elige las entradas sin proyecto (D-R4-2). */
export const NO_PROJECT_KEY = "sin-proyecto";

/**
 * Los filtros de la URL (D-R4-2): ids de personas, tal como los guarda la
 * base, y de clientes y de proyectos, con `NO_PROJECT_KEY` entre los de
 * proyecto. Uno que falta, o vacío, no se escribe.
 */
export type ReportUrlFilters = {
  readonly people?: readonly string[];
  readonly clients?: readonly string[];
  readonly projects?: readonly string[];
};

/**
 * Lo que la URL lleva además de los filtros: las personas sin horas, que se
 * escriben como `sin-horas=1` (D-R9-4). Sin la opción, no se escribe.
 */
export type ReportUrlOptions = {
  readonly peopleWithoutTime?: boolean;
};

/** D-R9-4: el parámetro de las personas sin horas, entre `subagrupar` y los filtros. */
const WITHOUT_TIME_PARAM = "sin-horas";

/** Cada filtro con su parámetro, en el orden en que la URL los escribe (D-R4-2). */
const FILTER_PARAMS = [
  ["people", "personas"],
  ["clients", "clientes"],
  ["projects", "proyectos"],
] as const;

/**
 * La lista de un filtro como la escribe la aplicación (D-R4-2): ordenada por
 * unidades de código, con `sin-proyecto` al final.
 */
function filterList(values: readonly string[]): string {
  const ids = values.filter((value) => value !== NO_PROJECT_KEY).sort();
  const last = values.includes(NO_PROJECT_KEY) ? [NO_PROJECT_KEY] : [];
  return [...ids, ...last].join(",");
}

/**
 * La query de un período y una agrupación: los tres parámetros y, si hay
 * subniveles, `subagrupar` como cuarto, separados por coma (D-R3-5). Después,
 * `sin-horas=1` con la opción (D-R9-4) y los filtros que no están vacíos, cada
 * uno con su lista (D-R4-2).
 */
function reportsQuery(
  range: ReportRange,
  groupBy: ReportGroupBy,
  subgroups: readonly ReportGroupBy[],
  filters: ReportUrlFilters,
  options: ReportUrlOptions,
): string {
  const levels = subgroups.length === 0 ? "" : `&subagrupar=${subgroups.join(",")}`;
  const withoutTime =
    options.peopleWithoutTime === true ? `&${WITHOUT_TIME_PARAM}=1` : "";
  const lists = FILTER_PARAMS.map(([key, param]) => {
    const values = filters[key] ?? [];
    return values.length === 0 ? "" : `&${param}=${filterList(values)}`;
  }).join("");
  return `desde=${dayKeyOf(range.first)}&hasta=${dayKeyOf(range.last)}&agrupar=${groupBy}${levels}${withoutTime}${lists}`;
}

/** La dirección de un período, una agrupación, sus subniveles, sus filtros y sus opciones. */
export function reportsUrl(
  range: ReportRange,
  groupBy: ReportGroupBy,
  subgroups: readonly ReportGroupBy[] = [],
  filters: ReportUrlFilters = {},
  options: ReportUrlOptions = {},
): string {
  return `${REPORTS_PATH}?${reportsQuery(range, groupBy, subgroups, filters, options)}`;
}

/** D-R6-4: los formatos de la descarga, como los escribe su ruta. */
export type ExportFormat = "csv" | "xlsx";

/** D-R6-4: la ruta de las descargas, `/reportes/exportar/<formato>`. */
const EXPORT_PATH = `${REPORTS_PATH}/exportar/`;

/**
 * La descarga de un formato (D-R6-10): con la misma query que `reportsUrl`
 * para los mismos argumentos, que es la de la página que la ofrece.
 */
export function exportUrl(
  format: ExportFormat,
  range: ReportRange,
  groupBy: ReportGroupBy,
  subgroups: readonly ReportGroupBy[] = [],
  filters: ReportUrlFilters = {},
  options: ReportUrlOptions = {},
): string {
  return `${EXPORT_PATH}${format}?${reportsQuery(range, groupBy, subgroups, filters, options)}`;
}

/**
 * La URL es la de ese período, esa agrupación, esos subniveles, esos filtros
 * y esas opciones: cada parámetro una vez, sin `subagrupar` si no hay
 * subniveles, sin `sin-horas` si no se pide la opción y sin `personas`,
 * `clientes` ni `proyectos` si no se piden. Una lista de filtro tiene que ser
 * la que escribe la aplicación, en su orden.
 */
export function reportsUrlOf(
  range: ReportRange,
  groupBy: ReportGroupBy,
  subgroups: readonly ReportGroupBy[] = [],
  filters: ReportUrlFilters = {},
  options: ReportUrlOptions = {},
): (url: URL) => boolean {
  const levels = subgroups.length === 0 ? [] : [subgroups.join(",")];
  const withoutTime = options.peopleWithoutTime === true ? ["1"] : [];
  const lists = FILTER_PARAMS.map(([key, param]) => {
    const values = filters[key] ?? [];
    return [param, values.length === 0 ? [] : [filterList(values)]] as const;
  });
  return (url) =>
    url.pathname === REPORTS_PATH &&
    url.searchParams.getAll("desde").join(",") === dayKeyOf(range.first) &&
    url.searchParams.getAll("hasta").join(",") === dayKeyOf(range.last) &&
    url.searchParams.getAll("agrupar").join(",") === groupBy &&
    JSON.stringify(url.searchParams.getAll("subagrupar")) === JSON.stringify(levels) &&
    JSON.stringify(url.searchParams.getAll(WITHOUT_TIME_PARAM)) ===
      JSON.stringify(withoutTime) &&
    lists.every(
      ([param, list]) =>
        JSON.stringify(url.searchParams.getAll(param)) === JSON.stringify(list),
    );
}

/**
 * Registra, desde ahora, los pedidos que navegan a ese período, esa
 * agrupación y esos filtros, sin subniveles. Los de prefetch de un enlace no cuentan: Next los marca con
 * `next-router-prefetch` y no son una navegación. Una que llegue tarde, después
 * de afirmar la URL, queda igual en el registro, que se lee al final.
 */
export function recordNavigations(
  page: Page,
  range: ReportRange,
  groupBy: ReportGroupBy,
  filters: ReportUrlFilters = {},
): readonly string[] {
  const matches = reportsUrlOf(range, groupBy, [], filters);
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

/** Si un pedido va a la ruta de las descargas, de cualquier formato y de cualquier tipo. */
export function isExportRequest(request: Request): boolean {
  return new URL(request.url()).pathname.startsWith(EXPORT_PATH);
}

/**
 * Registra, desde ahora, todos los pedidos a la ruta de las descargas, también
 * los de prefetch: un `next/link` los haría al dibujar el enlace o al pasar el
 * puntero, sin que nadie haga clic (D-R6-10). Se lee al final.
 */
export function recordExportRequests(page: Page): readonly string[] {
  const recorded: string[] = [];
  page.on("request", (request) => {
    if (isExportRequest(request)) {
      recorded.push(request.url());
    }
  });
  return recorded;
}

/** El BOM de UTF-8, que el CSV lleva una vez al principio (D-R6-9). */
const BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf];

/**
 * Lee un CSV descargado: afirma que empieza con el BOM y devuelve el texto sin
 * él. El decodificador no descarta ningún otro, así que uno de más se ve.
 */
export async function readCsv(path: string): Promise<string> {
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, BYTE_ORDER_MARK.length)], "el BOM al principio").toEqual(
    BYTE_ORDER_MARK,
  );
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    bytes.subarray(BYTE_ORDER_MARK.length),
  );
}

/**
 * Lee un `.xlsx` descargado con `exceljs`, que la regla de ESLint admite en
 * `e2e/` y solo para leer lo que bajó el propio recorrido (D-R6-12).
 */
export async function readXlsx(path: string): Promise<Workbook> {
  const workbook = new Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

/** Los milisegundos de un día, y los días del 30/12/1899 de Excel al 01/01/1970. */
const DAY_MS = 86_400_000;
const EXCEL_EPOCH_OFFSET_DAYS = 25_569;

/**
 * El número que guarda una celda del `.xlsx`. `exceljs` devuelve como `Date`
 * en UTC las que tienen un formato de fecha o de hora (también `[h]:mm`), así
 * que se vuelven a llevar al número de serie. Una cadena no es un número y falla.
 */
export function xlsxNumberOf(cell: Cell): number {
  const { value } = cell;
  if (value instanceof Date) {
    return value.getTime() / DAY_MS + EXCEL_EPOCH_OFFSET_DAYS;
  }
  if (typeof value === "number") {
    return value;
  }
  throw new Error(`La celda ${cell.address} no guarda un número: ${String(value)}.`);
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
 * Un nombre accesible que empieza con `name`, seguido de un espacio o de
 * nada: el de un grupo, que puede seguir con «(inactiva)» o con el cliente.
 */
function leadingName(name: string): RegExp {
  return new RegExp(`^${escapeRegExp(name)}(?:\\s|$)`);
}

/** La fila de la tabla cuyo encabezado de fila tiene ese nombre accesible. */
function rowByHeader(page: Page, name: string | RegExp): Locator {
  return reportTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name, exact: true }) });
}

/**
 * La fila de un grupo, por el comienzo de su encabezado: el nombre de la
 * persona, que puede seguir con «(inactiva)», el del proyecto, el del cliente
 * o el rótulo del día. Los nombres de los recorridos llevan el sufijo del
 * test, así que no hay otro que empiece igual; los días son de un alcance
 * propio.
 */
export function groupRow(page: Page, name: string): Locator {
  return rowByHeader(page, leadingName(name));
}

/**
 * El nombre accesible del encabezado de la fila de una tarea: su nombre y el
 * de su proyecto, en dos elementos (§5.4). Dos tareas que se llaman igual se
 * distinguen por el proyecto. Se busca por el nombre y no por el texto, que
 * junta los dos sin espacio.
 */
export function taskHeading(task: string, project: string): string {
  return `${task} ${project}`;
}

/** La fila de una tarea de un proyecto, que `groupRow` no separa de otra igual. */
export function taskRow(page: Page, task: string, project: string): Locator {
  return rowByHeader(page, taskHeading(task, project));
}

/**
 * La fila del primer nivel que no entra en el tope (D-R10-10): una celda que
 * ocupa la tabla entera, sin encabezado de fila.
 */
export function firstLevelLimitCell(page: Page): Locator {
  return reportTable(page).getByRole("cell", { name: FIRST_LEVEL_LIMIT, exact: true });
}

/**
 * Los encabezados de fila son exactamente `names`, en ese orden, por su nombre
 * accesible. Primero la cantidad y después cada uno, que reintenta hasta que
 * llega la tabla nueva.
 */
export async function expectGroupNames(
  page: Page,
  names: readonly string[],
): Promise<void> {
  const headers = groupHeaders(page);
  await expect(headers).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(headers.nth(index)).toHaveAccessibleName(name);
  }
}

/**
 * El botón de expandir de un grupo con hijos, dentro de su encabezado de fila
 * (D-R3-9). Se nombra por el contenido del encabezado, así que se busca por el
 * comienzo, como `groupRow`. Un grupo del último nivel no tiene.
 */
export function expandButton(page: Page, name: string): Locator {
  return groupHeaders(page).getByRole("button", {
    name: leadingName(name),
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
 * La agrupación elegida es la única con `aria-current`. Una sola aserción
 * sobre los enlaces marcados del grupo: reintenta hasta que llega la barra
 * nueva, y falla tanto si la elegida no está marcada como si hay otra más.
 */
export async function expectGroupBy(page: Page, groupBy: ReportGroupBy): Promise<void> {
  await expect(groupByControl(page).locator('[aria-current="true"]')).toHaveText([
    GROUP_LINK[groupBy],
  ]);
}

/** D-R9-11: el texto del enlace con la opción apagada, que es su nombre. */
export const SHOW_WITHOUT_TIME = "Mostrar personas sin horas";

/** D-R9-11: el texto del mismo enlace con la opción encendida. */
export const HIDE_WITHOUT_TIME = "Ocultar personas sin horas";

/**
 * El enlace de las personas sin horas (D-R9-11), por su nombre exacto: con
 * `shown`, el que las oculta; sin él, el que las muestra. Va junto a «Agrupar
 * por», fuera de su grupo, y solo con la persona en el primer nivel y el
 * filtro de personas.
 */
export function withoutTimeToggle(page: Page, shown: boolean): Locator {
  return page.getByRole("link", {
    name: shown ? HIDE_WITHOUT_TIME : SHOW_WITHOUT_TIME,
    exact: true,
  });
}

/**
 * Espera el período y la agrupación pedidos: la URL, el rótulo que dibuja el
 * servidor y la agrupación marcada. La URL sola no alcanza, porque cambia
 * antes de que llegue la pantalla nueva. Con subniveles, filtros u opciones,
 * la URL los lleva; los controles que los muestran los esperan
 * `expectSubgroups`, `filterButton` y `withoutTimeToggle`.
 */
export async function expectReport(
  page: Page,
  range: ReportRange,
  groupBy: ReportGroupBy,
  today: CivilDay,
  subgroups: readonly ReportGroupBy[] = [],
  filters: ReportUrlFilters = {},
  options: ReportUrlOptions = {},
): Promise<void> {
  await expect(page).toHaveURL(reportsUrlOf(range, groupBy, subgroups, filters, options));
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
  subgroups: readonly ReportGroupBy[] = [],
  filters: ReportUrlFilters = {},
  options: ReportUrlOptions = {},
): Promise<void> {
  await page.goto(reportsUrl(range, groupBy, subgroups, filters, options));
  await expectReport(page, range, groupBy, today, subgroups, filters, options);
  await expect(reportTable(page)).toBeVisible();
}

/** Los dos subniveles, por el rótulo de su botón y de su lista (§5.3). */
export type SubgroupLevel = "Segundo nivel" | "Tercer nivel";

/** El texto de una opción de la lista de un subnivel: una agrupación o «Ninguno». */
function levelOptionLabel(groupBy: ReportGroupBy | null): string {
  return groupBy === null ? NO_LEVEL : GROUP_LINK[groupBy];
}

/** El texto del botón de un subnivel, que es también su nombre: «Segundo nivel: Fecha». */
export function levelChoice(level: SubgroupLevel, groupBy: ReportGroupBy | null): string {
  return `${level}: ${levelOptionLabel(groupBy)}`;
}

/** «Subagrupar por», nombrado por su rótulo visible (D-R3-8). */
export function subgroupControl(page: Page): Locator {
  return page.getByRole("group", { name: SUBGROUP_BY, exact: true });
}

/** El botón de un subnivel, que abre su lista, con cualquier elección. */
export function subgroupButton(page: Page, level: SubgroupLevel): Locator {
  return subgroupControl(page).getByRole("button", {
    name: new RegExp(`^${escapeRegExp(level)}: `),
  });
}

/** La lista de un subnivel, nombrada por el nivel, dentro de su popover (§5.3). */
export function subgroupList(page: Page, level: SubgroupLevel): Locator {
  return page.getByRole("dialog").getByRole("list", { name: level, exact: true });
}

/** Una opción de la lista abierta de un subnivel: una agrupación o «Ninguno». */
export function subgroupLink(
  page: Page,
  level: SubgroupLevel,
  groupBy: ReportGroupBy | null,
): Locator {
  return subgroupList(page, level).getByRole("link", {
    name: levelOptionLabel(groupBy),
    exact: true,
  });
}

/**
 * Espera los botones de los subniveles que dibuja el servidor: el segundo
 * siempre, con su elección o «Ninguno», y el tercero solo si hay segundo
 * nivel. Como el rótulo del período, sirven para saber que llegó la pantalla
 * nueva cuando la navegación solo cambia los subniveles.
 */
export async function expectSubgroups(
  page: Page,
  subgroups: readonly ReportGroupBy[],
): Promise<void> {
  const [second = null, third = null] = subgroups;
  await expect(subgroupButton(page, "Segundo nivel")).toHaveAccessibleName(
    levelChoice("Segundo nivel", second),
  );
  if (second === null) {
    await expect(subgroupButton(page, "Tercer nivel")).toHaveCount(0);
  } else {
    await expect(subgroupButton(page, "Tercer nivel")).toHaveAccessibleName(
      levelChoice("Tercer nivel", third),
    );
  }
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

/** Los filtros de la barra, por el rótulo de su botón (D-R4-8). */
export type FilterName = "Personas" | "Clientes" | "Proyectos";

/** El buscador de cada filtro, por su `aria-label` (§5.7). */
const FILTER_SEARCH: Record<FilterName, string> = {
  Personas: "Buscar personas",
  Clientes: "Buscar clientes",
  Proyectos: "Buscar proyectos",
};

/**
 * El texto del botón de un filtro, que es también su nombre (D-R4-8):
 * «Proyectos: todos», «Proyectos: Nombre» con uno, «Proyectos: 2» con más.
 */
export function filterChoice(filter: FilterName, summary: string): string {
  return `${filter}: ${summary}`;
}

/** «Filtrar por», nombrado por su rótulo visible (D-R4-8). */
export function filterControl(page: Page): Locator {
  return page.getByRole("group", { name: "Filtrar por", exact: true });
}

/** El botón de un filtro con lo que dice: su nombre exacto. */
export function filterButton(page: Page, filter: FilterName, summary: string): Locator {
  return filterControl(page).getByRole("button", {
    name: filterChoice(filter, summary),
    exact: true,
  });
}

/**
 * El botón de un filtro, diga lo que diga. Un member no tiene el de
 * «Personas» (D-R4-4).
 */
export function anyFilterButton(page: Page, filter: FilterName): Locator {
  return filterControl(page).getByRole("button", {
    name: new RegExp(`^${escapeRegExp(filter)}: `),
  });
}

/**
 * El buscador del panel abierto de un filtro, que va en un portal y solo
 * existe con el panel abierto.
 */
export function filterSearch(page: Page, filter: FilterName): Locator {
  return page.getByRole("searchbox", { name: FILTER_SEARCH[filter], exact: true });
}

/**
 * El panel abierto de un filtro: el diálogo que tiene su buscador (§5.3). El
 * `has` se busca dentro del diálogo, así que no lleva el diálogo otra vez.
 */
export function filterPanel(page: Page, filter: FilterName): Locator {
  return page.getByRole("dialog").filter({ has: filterSearch(page, filter) });
}

/**
 * Un grupo de opciones del panel abierto: las vigentes, nombrado por el
 * filtro, o el de aparte, «Archivados» o «Inactivas» (D-R4-8).
 */
export function filterGroup(
  page: Page,
  filter: FilterName,
  group: FilterName | "Archivados" | "Inactivas",
): Locator {
  return filterPanel(page, filter).getByRole("group", { name: group, exact: true });
}

/**
 * La casilla de una opción del panel abierto, que va en un portal, por su
 * nombre accesible: el del proyecto solo, porque el cliente va por
 * `aria-describedby` (§5.3). Se busca por el comienzo, como `groupRow`; los
 * nombres llevan el sufijo del test, así que no hay otro que empiece igual.
 */
export function filterOption(page: Page, name: string): Locator {
  return page.getByRole("dialog").getByRole("checkbox", { name: leadingName(name) });
}

/**
 * Las casillas de un grupo del panel son exactamente `names`, en ese orden,
 * por el comienzo de su nombre, como `filterOption`. Primero la cantidad, que
 * reintenta hasta que el buscador las filtra.
 */
export async function expectFilterOptions(
  group: Locator,
  names: readonly string[],
): Promise<void> {
  const options = group.getByRole("checkbox");
  await expect(options).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(options.nth(index)).toHaveAccessibleName(leadingName(name));
  }
}

/**
 * Si el nombre visible de una opción del panel abierto se ve tachado (P-08):
 * el texto o alguno de sus contenedores, hasta el panel, lleva
 * `line-through`. El tachado no se anuncia (el grupo dice por qué está
 * aparte), así que no hay rol ni nombre que lo muestre y se lee el estilo
 * calculado; `text-decoration` no se hereda, por eso se miran los
 * contenedores.
 */
export async function isStruckThrough(page: Page, name: string): Promise<boolean> {
  return page
    .getByRole("dialog")
    .getByText(name, { exact: true })
    .evaluate((text) => {
      for (
        let node: Element | null = text;
        node !== null && node.getAttribute("role") !== "dialog";
        node = node.parentElement
      ) {
        if (getComputedStyle(node).textDecorationLine.includes("line-through")) {
          return true;
        }
      }
      return false;
    });
}

/** «Aplicar», al pie del panel abierto de un filtro, que va en un portal. */
export function filterApply(page: Page): Locator {
  return page.getByRole("dialog").getByRole("button", { name: "Aplicar", exact: true });
}

/**
 * La fila del segundo vacío (D-R4-7). La celda sigue con «Quitar filtros»,
 * así que se busca por el comienzo del texto.
 */
export function emptyFiltered(page: Page): Locator {
  return reportTable(page).getByText(new RegExp(`^${escapeRegExp(EMPTY_FILTERED)}`));
}

/** «Quitar filtros», en la fila del segundo vacío. */
export function clearFiltersLink(page: Page): Locator {
  return reportTable(page).getByRole("link", { name: CLEAR_FILTERS, exact: true });
}

/** D-R6-10: el grupo de las descargas, al final de la barra. */
export const EXPORT_GROUP = "Exportar";

/** El texto visible del enlace de cada formato en «Exportar» (D-R6-10). */
export type ExportLabel = "CSV" | "Excel";

/** «Exportar», nombrado por su rótulo visible. En los vacíos de RP-33 no está. */
export function exportGroup(page: Page): Locator {
  return page.getByRole("group", { name: EXPORT_GROUP, exact: true });
}

/** El enlace de un formato, que se nombra por su texto. */
export function exportLink(page: Page, label: ExportLabel): Locator {
  return exportGroup(page).getByRole("link", { name: label, exact: true });
}

/** D-R5-9: el resumen del `<details>` con la tabla de datos del gráfico. */
export const CHART_DATA = "Ver los datos del gráfico";

/** La granularidad del gráfico, que sale del largo del período (D-R5-4). */
export type ChartGranularity = Extract<ReportGroupBy, "fecha" | "semana" | "mes">;

/** D-R5-9: la leyenda de la figura, su único nombre. */
export function chartCaption(granularity: ChartGranularity): string {
  switch (granularity) {
    case "fecha":
      return "Horas por día";
    case "semana":
      return "Horas por semana";
    case "mes":
      return "Horas por mes";
  }
}

/** El gráfico, la figura nombrada por su leyenda (D-R5-9). */
export function chartFigure(page: Page, caption: string): Locator {
  return page.getByRole("figure", { name: caption, exact: true });
}

/**
 * Las columnas del gráfico, en orden: cada una es una imagen con su nombre,
 * también las que están en cero (D-R5-9).
 */
export function chartBars(figure: Locator): Locator {
  return figure.getByRole("img");
}

/** La columna con ese nombre, que es también su parada de foco (D-R5-9). */
export function chartBar(figure: Locator, name: string): Locator {
  return figure.getByRole("img", { name, exact: true });
}

/**
 * El nombre de una columna (D-R5-5, D-R5-9): el rótulo de la fila de la
 * tabla, con «solo …» si el período la corta, y la duración.
 */
export function chartBarName(
  label: string,
  partial: string | null,
  duration: string,
): string {
  return `${periodHeading(label, partial)}: ${duration}`;
}

/**
 * Cualquier nombre de columna: lo que la línea del valor dice cuando hay una
 * activa. Ninguna otra pieza de la figura termina en «: h:mm».
 */
const ANY_CHART_BAR = /^.+: \d+:\d{2}$/;

/**
 * La línea del valor arriba de las columnas, cuando dice `name` (§5.2). Es
 * `aria-hidden`, porque repite el nombre de la columna activa, así que se
 * busca por su texto. Sin `name`, la que dice el de cualquier columna: que no
 * haya ninguna es que la línea está vacía.
 */
export function chartReadout(figure: Locator, name?: string): Locator {
  return name === undefined
    ? figure.getByText(ANY_CHART_BAR)
    : figure.getByText(name, { exact: true });
}

/** El resumen del `<details>` de la tabla de datos, que la abre y la cierra. */
export function chartDataSummary(figure: Locator): Locator {
  return figure.getByText(CHART_DATA, { exact: true });
}

/**
 * Las filas de la tabla de datos, una por columna, sin la de los encabezados:
 * las que tienen encabezado de fila.
 */
export function chartDataRows(figure: Locator): Locator {
  return figure.getByRole("row").filter({ has: figure.page().getByRole("rowheader") });
}

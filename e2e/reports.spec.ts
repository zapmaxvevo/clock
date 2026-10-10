import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import { boxOf, PERSON_TIMEZONE } from "./calendar-page";
import {
  archiveProject,
  clientIdOf,
  projectIdOf,
  seedNumberedEntries,
  seedPersonEntries,
  seedPerson,
  seedProject,
  seedTag,
  setDisplayName,
  setMembershipStatus,
  setRole,
  setWeekStart,
  userIdOf,
  type MembershipStatus,
} from "./database";
import {
  addDays,
  dayKeyOf,
  dayRangeLabel,
  monthLabel,
  SUNDAY,
  todayIn,
  weekdayLabel,
  weekStartOf,
  type CivilDay,
} from "./days";
import {
  anyFilterButton,
  applyButton,
  chartBar,
  chartBarName,
  chartBars,
  chartCaption,
  chartDataRows,
  chartDataSummary,
  chartFigure,
  chartReadout,
  clearFiltersLink,
  clickRangeDay,
  currentWeekRange,
  emptyFiltered,
  EMPTY_REPORT,
  expandButton,
  expectFilterOptions,
  expectGroupBy,
  expectGroupNames,
  expectReport,
  expectSubgroups,
  filterApply,
  filterButton,
  filterGroup,
  filterOption,
  filterPanel,
  filterSearch,
  firstLevelLimitCell,
  FORBIDDEN_BODY,
  FORBIDDEN_TITLE,
  goToReportsByNav,
  GROUP_LINK,
  groupByControl,
  groupByLink,
  groupColumnHeader,
  groupDuration,
  groupHeaders,
  groupRow,
  inactiveMark,
  INACTIVE_PERSON,
  isStruckThrough,
  lastWeekRange,
  monthRange,
  NO_CLIENT,
  NO_DESCRIPTION,
  NO_LEVEL,
  NO_PROJECT,
  NO_PROJECT_KEY,
  NO_TAG,
  NO_TASK,
  openReport,
  periodHeading,
  periodLink,
  RANGE_MESSAGES,
  rangeButton,
  rangeCalendar,
  rangePopover,
  recordNavigations,
  REPORTS_PATH,
  reportHeading,
  reportsNavLink,
  reportsUrl,
  reportsUrlOf,
  reportTable,
  reportTerms,
  reportTotal,
  ROW_LIMIT,
  SCOPE_EVERYONE,
  SCOPE_SELF,
  shiftRange,
  SHORTCUT_LABELS,
  shortcutLink,
  shortcutList,
  shortcutRange,
  levelChoice,
  subgroupButton,
  subgroupControl,
  subgroupLink,
  subgroupList,
  TAG_OVERLAP,
  taskHeading,
  taskRow,
  weekRange,
  zoneLine,
  type FilterName,
  type ReportGroupBy,
  type ReportRange,
  type ShortcutLabel,
  type SubgroupLevel,
} from "./reports-page";
import { expect, TEST_EMAIL_DOMAIN, test } from "./session";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/**
 * Recorridos de R2a a R10b y de R5 del núcleo de reportes: el resumido por persona,
 * por proyecto, por cliente, por tarea, por etiqueta, por fecha, por semana,
 * por mes y por descripción, los atajos del período, los subniveles, los
 * filtros, el tope del primer nivel y el gráfico (§8.2 de cada contrato), con la regla de
 * §8.3 de R2a. Cada recorrido tiene sus personas —la de la sesión y las que
 * siembra—, todas con un nombre editado que lleva el sufijo del test, y solo
 * afirma sobre sus filas o sobre proyectos con ese sufijo: la base acumula
 * personas y horas de todas las corridas, así que la lista de un filtro se
 * busca por el sufijo antes de afirmar sus opciones (D-R4-13). El total se
 * afirma solo con el alcance propio. El rol, el estado y el primer día de la
 * semana los cambia la persona de la sesión sobre sí misma. Las entradas van
 * en la semana anterior a la de hoy, salvo las de la semana y el mes, que van
 * en un período fijo de 2025 (D-R10-14) —las del gráfico también, más una
 * de la semana actual (D-R5-12)—, y se siembran antes de abrir la
 * pantalla; las del tope del primer nivel, con un helper de SQL. Los rótulos
 * esperados se calculan con `days.ts`, no con el código que los produce.
 */

/** Hoy en la zona por omisión de la persona, que es la que corta los días. */
function today(): CivilDay {
  return todayIn(PERSON_TIMEZONE);
}

/**
 * Entra a una pantalla, que es lo que le crea la membresía a la persona de la
 * sesión: sin ella no se le pueden sembrar entradas ni cambiar el rol.
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
}

/** Otra persona del workspace, con un email propio y el nombre con el sufijo. */
async function seedOtherPerson(
  displayName: string,
  status?: MembershipStatus,
): Promise<string> {
  const email = `e2e-reporte-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
  await seedPerson({ email, displayName, status });
  return email;
}

/** Abre el selector del período y espera la lista de atajos. */
async function openRangePicker(page: Page): Promise<void> {
  await rangeButton(page).click();
  await expect(shortcutList(page)).toBeVisible();
}

/**
 * Elige un atajo del selector abierto: el selector se cierra sin pasar por
 * «Aplicar» y el foco vuelve al botón del período (§5.2).
 */
async function pickShortcut(page: Page, label: ShortcutLabel): Promise<void> {
  await shortcutLink(page, label).click();
  await expect(rangePopover(page)).toBeHidden();
  await expect(rangeButton(page)).toBeFocused();
}

/**
 * Elige una opción en la lista de un subnivel: el popover se cierra y, con la
 * pantalla nueva y sus subniveles `expected`, el foco está en el botón del
 * nivel, que ya dice lo elegido (D-R3-8), como con un atajo. El foco se
 * afirma después de que llega la pantalla: antes, el botón que lo tiene es el
 * de la pantalla vieja.
 */
async function pickSubgroup(
  page: Page,
  level: SubgroupLevel,
  groupBy: ReportGroupBy | null,
  expected: readonly ReportGroupBy[],
): Promise<void> {
  await subgroupButton(page, level).click();
  await expect(subgroupList(page, level)).toBeVisible();
  await subgroupLink(page, level, groupBy).click();
  await expect(subgroupList(page, level)).toBeHidden();
  await expectSubgroups(page, expected);
  await expect(
    subgroupControl(page).getByRole("button", {
      name: levelChoice(level, groupBy),
      exact: true,
    }),
  ).toBeFocused();
}

/**
 * Abre el panel de un filtro desde su botón, que dice `summary`: el buscador
 * está vacío y tiene el foco (D-R4-8).
 */
async function openFilter(
  page: Page,
  filter: FilterName,
  summary: string,
): Promise<void> {
  await filterButton(page, filter, summary).click();
  await expect(filterSearch(page, filter)).toBeFocused();
  await expect(filterSearch(page, filter)).toHaveValue("");
}

/**
 * «Aplicar» en el panel abierto: el popover se cierra y, con la pantalla
 * nueva, el foco está en el botón del filtro, que ya dice `summary` (D-R4-8).
 * Como en `pickSubgroup`, el botón con lo elegido es el de la pantalla nueva.
 */
async function applyFilter(
  page: Page,
  filter: FilterName,
  summary: string,
): Promise<void> {
  await filterApply(page).click();
  await expect(filterPanel(page, filter)).toBeHidden();
  await expect(filterButton(page, filter, summary)).toBeFocused();
}

/** El rango de la URL sin `hasta`, que se descarta entero. */
function onlyFrom(range: ReportRange): string {
  return `${REPORTS_PATH}?desde=${dayKeyOf(range.first)}&agrupar=proyecto`;
}

test("«Reportes» se abre desde la navegación con la semana actual vacía", async ({
  page,
}) => {
  await enterApp(page);

  // D-R2a-10: «Reportes» va entre «Planilla» y «Proyectos», lleva a
  // `/reportes` y queda marcado.
  await expect(
    page.getByRole("navigation", { name: "Principal" }).getByRole("link"),
  ).toContainText(["Planilla", "Reportes", "Proyectos"]);
  await goToReportsByNav(page);
  await expect(reportsNavLink(page)).toHaveAttribute("aria-current", "page");
  await expect(reportHeading(page)).toBeVisible();

  // RP-20, RP-24: sin parámetros, «Esta semana», sin el atajo a ella.
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Esta semana");
  await expect(periodLink(page, "Esta semana")).toHaveCount(0);

  // D-R2a-2, RP-22: el alcance de un member y la zona de su perfil.
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(page.getByText(zoneLine(PERSON_TIMEZONE), { exact: true })).toBeVisible();

  // RP-33: el vacío, con los totales en cero. D-R2a-3: por persona.
  await expect(reportTable(page).getByText(EMPTY_REPORT, { exact: true })).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(0);
  await expect(reportTotal(page, "Total")).toHaveText("0:00");
  await expect(reportTotal(page, "Facturable")).toHaveText("0:00");
  await expectGroupBy(page, "persona");
  await expect(page).toHaveURL(
    (url) => url.pathname === REPORTS_PATH && url.search === "",
  );
});

test("un member ve solo lo propio aunque el enlace venga de otra persona", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const tuesday = addDays(lastWeek.first, 1);
  const wednesday = addDays(lastWeek.first, 2);
  const suffix = uniqueSuffix();
  const project = `Reporte ${suffix}`;
  const own = `Ana ${suffix}`;
  const other = `Otra ${suffix}`;

  await enterApp(page);
  await setDisplayName(email, own);
  await seedProject({ name: project });
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: tuesday, start: "09:00", end: "10:30", project },
    { description: "b", day: wednesday, start: "11:00", end: "11:45", project },
    { description: "c", day: wednesday, start: "14:00", end: "14:20" },
  ]);
  const otherEmail = await seedOtherPerson(other);
  await seedPersonEntries(otherEmail, PERSON_TIMEZONE, [
    { description: "d", day: tuesday, start: "08:00", end: "12:00", project },
  ]);

  // RP-32: el enlace que arma un admin, con un parámetro de personas que
  // R2a no tiene. RP-01, RP-10: una sola fila, la suya, con su total.
  await page.goto(`${reportsUrl(lastWeek, "persona")}&personas=${otherEmail}`);
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Semana anterior");
  await expectGroupBy(page, "persona");
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(1);
  await expect(groupDuration(groupRow(page, own))).toHaveText("2:35");
  await expect(inactiveMark(groupRow(page, own))).toHaveCount(0);
  await expect(page.getByText(other)).toHaveCount(0);
  await expect(reportTotal(page, "Total")).toHaveText("2:35");

  // D-R2a-4: «Proyecto» conserva el rango y deja afuera lo que no es suyo.
  // RP-28: la entrada sin proyecto va a «Sin proyecto».
  await groupByLink(page, "proyecto").click();
  await expectReport(page, lastWeek, "proyecto", day);
  await expect(groupDuration(groupRow(page, project))).toHaveText("2:15");
  await expect(groupDuration(groupRow(page, NO_PROJECT))).toHaveText("0:20");
  await expect(groupHeaders(page)).toHaveCount(2);
  await expect(reportTotal(page, "Total")).toHaveText("2:35");
});

test("un admin ve las horas de todo el equipo, con la persona inactiva marcada", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const thursday = addDays(lastWeek.first, 3);
  const suffix = uniqueSuffix();
  const project = `Equipo ${suffix}`;
  const active = `Beto ${suffix}`;
  const inactive = `Carla ${suffix}`;

  await enterApp(page);
  await setRole(email, "admin");
  await seedProject({ name: project });
  const activeEmail = await seedOtherPerson(active);
  const inactiveEmail = await seedOtherPerson(inactive, "inactive");
  await seedPersonEntries(activeEmail, PERSON_TIMEZONE, [
    { description: "b", day: thursday, start: "09:00", end: "12:00", project },
  ]);
  await seedPersonEntries(inactiveEmail, PERSON_TIMEZONE, [
    { description: "c", day: thursday, start: "13:00", end: "14:00", project },
  ]);

  // RP-02, D-R2a-2: el alcance de todas las personas.
  await openReport(page, lastWeek, "persona", day);
  await expect(page.getByText(SCOPE_EVERYONE, { exact: true })).toBeVisible();

  // RP-31, RP-61: las horas de la inactiva cuentan y la fila lo dice.
  const activeRow = groupRow(page, active);
  const inactiveRow = groupRow(page, inactive);
  await expect(groupDuration(activeRow)).toHaveText("3:00");
  await expect(groupDuration(inactiveRow)).toHaveText("1:00");
  await expect(inactiveMark(activeRow)).toHaveCount(0);
  await expect(inactiveMark(inactiveRow)).toBeVisible();

  // RP-12: por duración descendente, B antes que C.
  const names = await groupHeaders(page).allInnerTexts();
  const activeAt = names.findIndex((name) => name.startsWith(active));
  const inactiveAt = names.findIndex((name) => name.startsWith(inactive));
  expect(activeAt).toBeGreaterThanOrEqual(0);
  expect(inactiveAt).toBeGreaterThan(activeAt);

  // Por proyecto: la fila del proyecto suma a las dos.
  await groupByLink(page, "proyecto").click();
  await expectReport(page, lastWeek, "proyecto", day);
  await expect(groupDuration(groupRow(page, project))).toHaveText("4:00");
});

test("las flechas, «Esta semana» y el calendario de rango navegan el período", async ({
  page,
}) => {
  const day = today();
  const thisWeek = currentWeekRange(day);
  const lastWeek = lastWeekRange(day);
  await page.goto(REPORTS_PATH);
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Esta semana");

  // La agrupación que se elige primero se conserva en los tres pasos.
  await groupByLink(page, "proyecto").click();
  await expectReport(page, thisWeek, "proyecto", day);

  // RP-20: «Período anterior» mueve una semana; «Esta semana» aparece y vuelve.
  await periodLink(page, "Período anterior").click();
  await expectReport(page, lastWeek, "proyecto", day);
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Semana anterior");
  await periodLink(page, "Esta semana").click();
  await expectReport(page, thisWeek, "proyecto", day);
  await expect(periodLink(page, "Esta semana")).toHaveCount(0);

  // §5.2: Esc cierra sin navegar, aunque un clic ya haya cambiado la
  // selección, y el foco vuelve al botón. Aplicada, esa selección pediría el
  // lunes de la semana anterior como período de un día: ningún enlace de este
  // recorrido lleva ahí, así que un pedido con esa URL solo puede venir de Esc.
  // La navegación de un `router.push` puede llegar después de afirmar la URL;
  // el registro la encuentra al final, con varios viajes al servidor en medio.
  const picked: ReportRange = { first: lastWeek.first, last: thisWeek.last };
  const escaped = recordNavigations(
    page,
    { first: picked.first, last: picked.first },
    "proyecto",
  );
  await rangeButton(page).click();
  await expect(rangeCalendar(page)).toBeVisible();
  await clickRangeDay(page, picked.first);
  await page.keyboard.press("Escape");
  await expect(rangeCalendar(page)).toBeHidden();
  await expect(rangeButton(page)).toBeFocused();
  await expectReport(page, thisWeek, "proyecto", day);

  // D-R2a-4: sobre «Esta semana», un rango completo, el primer clic arranca
  // uno nuevo y el segundo lo cierra. Al abrir de nuevo, la selección vuelve
  // a ser el período que se ve.
  await rangeButton(page).click();
  await expect(rangeCalendar(page)).toBeVisible();
  await clickRangeDay(page, picked.first);
  await clickRangeDay(page, picked.last);
  await applyButton(page).click();
  await expect(rangeCalendar(page)).toBeHidden();
  await expectReport(page, picked, "proyecto", day);
  await expect(rangeButton(page)).toBeFocused();
  await expect(periodLink(page, "Esta semana")).toBeVisible();

  // RP-20: con un período de 14 días, la flecha mueve 14.
  await periodLink(page, "Período anterior").click();
  await expectReport(page, shiftRange(picked, -14), "proyecto", day);

  // F1: sobre un período de un día, un clic en ese día deja la selección
  // vacía; «Aplicar» lleva `aria-disabled`, no cierra ni navega. Después, otro
  // día se aplica como siempre. Una navegación al período de un día que se
  // veía solo podría venir de ese «Aplicar».
  const single: ReportRange = {
    first: addDays(lastWeek.first, 2),
    last: addDays(lastWeek.first, 2),
  };
  const other = addDays(single.first, -7);
  await openReport(page, single, "proyecto", day);
  const reapplied = recordNavigations(page, single, "proyecto");
  await rangeButton(page).click();
  await expect(rangeCalendar(page)).toBeVisible();
  await clickRangeDay(page, single.first);
  await expect(applyButton(page)).toHaveAttribute("aria-disabled", "true");
  // Con `aria-disabled` sigue en el orden del tabulador, así que se puede
  // activar con Enter; Playwright no le hace clic a un control inactivo.
  await applyButton(page).press("Enter");
  await expect(rangeCalendar(page)).toBeVisible();
  await expect(page).toHaveURL(reportsUrlOf(single, "proyecto"));
  await clickRangeDay(page, other);
  await expect(applyButton(page)).not.toHaveAttribute("aria-disabled", "true");
  await applyButton(page).click();
  await expect(rangeCalendar(page)).toBeHidden();
  await expectReport(page, { first: other, last: other }, "proyecto", day);

  expect(escaped).toEqual([]);
  expect(reapplied).toEqual([]);
});

test("una URL con el rango inválido muestra «Esta semana» y conserva la agrupación", async ({
  page,
}) => {
  const day = today();
  const thisWeek = currentWeekRange(day);
  const lastWeek = lastWeekRange(day);
  const reversed: ReportRange = { first: lastWeek.last, last: lastWeek.first };
  const tooLong: ReportRange = {
    first: addDays(lastWeek.last, -399),
    last: lastWeek.last,
  };

  // RP-32: cada rango inválido se descarta entero, sin aviso, y la agrupación
  // válida sobrevive. Cada uno se carga después de la semana anterior por
  // persona, así ni el rótulo ni la agrupación pueden venir de la carga
  // anterior.
  for (const url of [
    reportsUrl(reversed, "proyecto"),
    reportsUrl(tooLong, "proyecto"),
    onlyFrom(lastWeek),
  ]) {
    await openReport(page, lastWeek, "persona", day);
    await page.goto(url);
    await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Esta semana");
    await expectGroupBy(page, "proyecto");
    await expect(reportTable(page)).toBeVisible();
    for (const message of RANGE_MESSAGES) {
      await expect(page.getByText(message, { exact: true })).toHaveCount(0);
    }
  }

  // Y al revés: una agrupación inválida se descarta y el rango válido queda.
  await openReport(page, thisWeek, "proyecto", day);
  await page.goto(
    `${REPORTS_PATH}?desde=${dayKeyOf(lastWeek.first)}&hasta=${dayKeyOf(lastWeek.last)}&agrupar=otro`,
  );
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Semana anterior");
  await expectGroupBy(page, "persona");
});

test("con la membresía inactiva, el reporte muestra el aviso y nada más", async ({
  page,
  email,
}) => {
  await enterApp(page);
  await setMembershipStatus(email, "inactive");

  // RP-07: el título y el aviso, sin barra, tabla ni totales.
  await page.goto(REPORTS_PATH);
  await expect(reportHeading(page)).toBeVisible();
  const notice = page.getByRole("alert").filter({ hasText: FORBIDDEN_TITLE });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(FORBIDDEN_BODY);
  await expect(reportTable(page)).toHaveCount(0);
  await expect(reportTerms(page)).toHaveCount(0);
  await expect(rangeButton(page)).toHaveCount(0);
});

test("los atajos eligen el período y las flechas siguen sus meses", async ({ page }) => {
  const day = today();
  const range = (label: ShortcutLabel): ReportRange => shortcutRange(label, day);
  await page.goto(REPORTS_PATH);
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Esta semana");
  await groupByLink(page, "proyecto").click();
  await expectReport(page, range("Esta semana"), "proyecto", day);

  // RP-20: los nueve atajos en orden, con el período que se ve marcado.
  await openRangePicker(page);
  await expect(shortcutList(page).getByRole("link")).toHaveText([...SHORTCUT_LABELS]);
  for (const label of SHORTCUT_LABELS) {
    const current = shortcutLink(page, label);
    if (label === "Esta semana") {
      await expect(current).toHaveAttribute("aria-current", "true");
    } else {
      await expect(current).not.toHaveAttribute("aria-current", "true");
    }
  }

  // D-R2b-1: el atajo escribe su rango en la URL, con la agrupación, y cierra
  // el selector con el foco en el botón (D-R2b-10). El selector está cerrado
  // antes de cada flecha.
  await pickShortcut(page, "Mes pasado");
  await expectReport(page, range("Mes pasado"), "proyecto", day);

  // D-R2b-3: las flechas mueven meses enteros, rotulados por sus días si no son
  // los de un atajo.
  await periodLink(page, "Período anterior").click();
  await expectReport(page, monthRange(day, -2), "proyecto", day);
  await periodLink(page, "Período siguiente").click();
  await expectReport(page, range("Mes pasado"), "proyecto", day);
  await periodLink(page, "Período siguiente").click();
  await expectReport(page, range("Este mes"), "proyecto", day);

  await openRangePicker(page);
  await pickShortcut(page, "Hoy");
  await expectReport(page, range("Hoy"), "proyecto", day);
  await periodLink(page, "Período anterior").click();
  await expectReport(page, range("Ayer"), "proyecto", day);

  await openRangePicker(page);
  await pickShortcut(page, "Año pasado");
  await expectReport(page, range("Año pasado"), "proyecto", day);
  await periodLink(page, "Período siguiente").click();
  await expectReport(page, range("Este año"), "proyecto", day);

  // RP-24: la semana anterior y esta, que la flecha mueve 14 días.
  await openRangePicker(page);
  await pickShortcut(page, "Últimas dos semanas");
  await expectReport(page, range("Últimas dos semanas"), "proyecto", day);
  await periodLink(page, "Período anterior").click();
  await expectReport(
    page,
    shiftRange(range("Últimas dos semanas"), -14),
    "proyecto",
    day,
  );
});

test("por cliente, «Sin cliente» junta lo que no tiene proyecto y los proyectos sin cliente", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const tuesday = addDays(lastWeek.first, 1);
  const wednesday = addDays(lastWeek.first, 2);
  const thursday = addDays(lastWeek.first, 3);
  const suffix = uniqueSuffix();
  const client = `Cliente ${suffix}`;
  const withClient = `Con cliente ${suffix}`;
  const withoutClient = `Suelto ${suffix}`;

  await enterApp(page);
  await setDisplayName(email, `Dana ${suffix}`);
  await seedProject({ name: withClient, client });
  await seedProject({ name: withoutClient });
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: tuesday, start: "09:00", end: "10:00", project: withClient },
    {
      description: "b",
      day: wednesday,
      start: "11:00",
      end: "11:30",
      project: withClient,
    },
    {
      description: "c",
      day: thursday,
      start: "09:00",
      end: "09:45",
      project: withoutClient,
    },
    { description: "d", day: thursday, start: "14:00", end: "14:15" },
  ]);

  // RP-11, D-R2a-4: «Cliente» conserva el rango.
  await openReport(page, lastWeek, "persona", day);
  await groupByLink(page, "cliente").click();
  await expectReport(page, lastWeek, "cliente", day);

  // RP-28: las dos entradas del proyecto con cliente suman una fila, y «Sin
  // cliente» junta la entrada sin proyecto con la del proyecto sin cliente.
  // RP-12: por duración. El alcance es propio, así que el total es el de las
  // dos filas.
  const expectByClient = async (): Promise<void> => {
    await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
    await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.cliente);
    await expect(groupHeaders(page)).toHaveText([client, NO_CLIENT]);
    await expect(groupDuration(groupRow(page, client))).toHaveText("1:30");
    await expect(groupDuration(groupRow(page, NO_CLIENT))).toHaveText("1:00");
    await expect(reportTotal(page, "Total")).toHaveText("2:30");
  };
  await expectByClient();

  // RP-32: al recargar, la misma vista.
  await page.reload();
  await expectReport(page, lastWeek, "cliente", day);
  await expectByClient();
});

test("por fecha, una fila por día con horas, en orden y en la zona de quien mira", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const tuesday = addDays(lastWeek.first, 1);
  const wednesday = addDays(lastWeek.first, 2);
  const thursday = addDays(lastWeek.first, 3);
  const friday = addDays(lastWeek.first, 4);
  const saturday = addDays(lastWeek.first, 5);
  const suffix = uniqueSuffix();

  await enterApp(page);
  await setDisplayName(email, `Eva ${suffix}`);
  // La del viernes a las 23:30 en la zona de la persona ya es sábado en UTC.
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: tuesday, start: "09:00", end: "09:20" },
    { description: "b", day: tuesday, start: "14:00", end: "14:10" },
    { description: "c", day: thursday, start: "10:00", end: "11:45" },
    { description: "d", day: friday, start: "23:30", end: "23:50" },
  ]);

  await openReport(page, lastWeek, "persona", day);
  await groupByLink(page, "fecha").click();
  await expectReport(page, lastWeek, "fecha", day);

  // RP-11, RP-22: un día por fila, cortado en la zona de quien mira, en orden
  // cronológico aunque el jueves tenga más horas (D-R2b-6). Los días sin horas
  // no tienen fila. El alcance es propio, así que el total es el de las filas.
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.fecha);
  const [tuesdayLabel, thursdayLabel, fridayLabel] = [tuesday, thursday, friday].map(
    (civil) => weekdayLabel(civil, day),
  );
  await expect(groupHeaders(page)).toHaveText([tuesdayLabel, thursdayLabel, fridayLabel]);
  await expect(groupDuration(groupRow(page, tuesdayLabel))).toHaveText("0:30");
  await expect(groupDuration(groupRow(page, thursdayLabel))).toHaveText("1:45");
  await expect(groupDuration(groupRow(page, fridayLabel))).toHaveText("0:20");
  for (const empty of [wednesday, saturday]) {
    await expect(groupRow(page, weekdayLabel(empty, day))).toHaveCount(0);
  }
  await expect(reportTotal(page, "Total")).toHaveText("2:35");

  // D-R2a-4: la flecha conserva la agrupación; la semana de antes no tiene horas.
  await periodLink(page, "Período anterior").click();
  await expectReport(page, shiftRange(lastWeek, -7), "fecha", day);
  await expect(reportTable(page).getByText(EMPTY_REPORT, { exact: true })).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(0);
});

test("por tarea y por etiqueta, con «Sin …» y la suma de las etiquetas", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const [monday, tuesday, wednesday, thursday] = [0, 1, 2, 3].map((days) =>
    addDays(lastWeek.first, days),
  );
  const suffix = uniqueSuffix();
  const withTasks = `P ${suffix}`;
  const other = `Q ${suffix}`;
  const first = `T1 ${suffix}`;
  const second = `T2 ${suffix}`;
  const tagOne = `E1 ${suffix}`;
  const tagTwo = `E2 ${suffix}`;

  await enterApp(page);
  await setDisplayName(email, `Fede ${suffix}`);
  // R10 de la revisión: Q tiene una tarea que se llama como la T1 de P.
  await seedProject({ name: withTasks, tasks: [first, second] });
  await seedProject({ name: other, tasks: [first] });
  await seedTag(tagOne);
  await seedTag(tagTwo);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    {
      description: "a",
      day: monday,
      start: "09:00",
      end: "10:00",
      project: withTasks,
      task: first,
      tags: [tagOne, tagTwo],
    },
    {
      description: "b",
      day: tuesday,
      start: "09:00",
      end: "09:30",
      project: withTasks,
      task: second,
      tags: [tagOne],
    },
    {
      description: "c",
      day: wednesday,
      start: "09:00",
      end: "09:15",
      project: other,
      task: first,
    },
    { description: "d", day: thursday, start: "09:00", end: "09:20", tags: [tagTwo] },
  ]);

  // D-R3-8, D-R10-5: los enlaces de «Agrupar por», en orden.
  await openReport(page, lastWeek, "persona", day);
  await expect(groupByControl(page).getByRole("link")).toHaveText(
    Object.values(GROUP_LINK),
  );

  // RP-11, D-R2a-4: «Tarea» conserva el rango. RP-12: por duración. Cada T1
  // es una fila con su proyecto (D-R3-4), y «Sin tarea» junta la entrada sin
  // proyecto, sin proyecto al lado (RP-28). El alcance es propio, así que el
  // total es el de las filas; sin la línea de la etiqueta.
  await groupByLink(page, "tarea").click();
  await expectReport(page, lastWeek, "tarea", day);
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.tarea);
  await expectGroupNames(page, [
    taskHeading(first, withTasks),
    taskHeading(second, withTasks),
    NO_TASK,
    taskHeading(first, other),
  ]);
  await expect(groupDuration(taskRow(page, first, withTasks))).toHaveText("1:00");
  await expect(groupDuration(taskRow(page, second, withTasks))).toHaveText("0:30");
  await expect(groupDuration(groupRow(page, NO_TASK))).toHaveText("0:20");
  await expect(groupDuration(taskRow(page, first, other))).toHaveText("0:15");
  await expect(reportTotal(page, "Total")).toHaveText("2:05");
  await expect(page.getByText(TAG_OVERLAP, { exact: true })).toHaveCount(0);

  // RP-18: la entrada del lunes suma en E1 y en E2, así que las filas pasan
  // el total, que sigue siendo el de las entradas, y la línea lo avisa. RP-28:
  // «Sin etiqueta» es la del miércoles.
  const expectByTag = async (): Promise<void> => {
    await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
    await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.etiqueta);
    await expect(groupHeaders(page)).toHaveText([tagOne, tagTwo, NO_TAG]);
    await expect(groupDuration(groupRow(page, tagOne))).toHaveText("1:30");
    await expect(groupDuration(groupRow(page, tagTwo))).toHaveText("1:20");
    await expect(groupDuration(groupRow(page, NO_TAG))).toHaveText("0:15");
    await expect(reportTotal(page, "Total")).toHaveText("2:05");
    await expect(page.getByText(TAG_OVERLAP, { exact: true })).toBeVisible();
  };
  await groupByLink(page, "etiqueta").click();
  await expectReport(page, lastWeek, "etiqueta", day);
  await expectByTag();

  // RP-32: al recargar, la misma vista.
  await page.reload();
  await expectReport(page, lastWeek, "etiqueta", day);
  await expectByTag();
});

/**
 * Las entradas de los recorridos 11 y 12 (§8.2 de R3): P1 el martes y el
 * jueves, con E1 solo la del martes, y P2 el miércoles.
 */
async function seedSubgroupEntries(
  email: string,
  lastWeek: ReportRange,
): Promise<{ readonly first: string; readonly second: string; readonly tag: string }> {
  const suffix = uniqueSuffix();
  const first = `P1 ${suffix}`;
  const second = `P2 ${suffix}`;
  const tag = `E1 ${suffix}`;
  await setDisplayName(email, `Gabi ${suffix}`);
  await seedProject({ name: first });
  await seedProject({ name: second });
  await seedTag(tag);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    {
      description: "a",
      day: addDays(lastWeek.first, 1),
      start: "09:00",
      end: "10:00",
      project: first,
      tags: [tag],
    },
    {
      description: "b",
      day: addDays(lastWeek.first, 2),
      start: "09:00",
      end: "09:45",
      project: second,
    },
    {
      description: "c",
      day: addDays(lastWeek.first, 3),
      start: "10:00",
      end: "10:30",
      project: first,
    },
  ]);
  return { first, second, tag };
}

test("los subniveles se eligen en su lista y cada grupo se expande y se contrae", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const [tuesday, thursday] = [1, 3].map((days) =>
    weekdayLabel(addDays(lastWeek.first, days), day),
  );
  await enterApp(page);
  const { first, second, tag } = await seedSubgroupEntries(email, lastWeek);

  // D-R3-8: sin subniveles, «Segundo nivel: Ninguno» y sin tercero. Su lista
  // empieza por «Ninguno», marcado, y sigue con las que no son el primer
  // nivel, en el orden de «Agrupar por» (D-R10-5).
  await openReport(page, lastWeek, "proyecto", day);
  await expectSubgroups(page, []);
  await subgroupButton(page, "Segundo nivel").click();
  await expect(subgroupList(page, "Segundo nivel").getByRole("link")).toHaveText([
    NO_LEVEL,
    GROUP_LINK.persona,
    GROUP_LINK.cliente,
    GROUP_LINK.tarea,
    GROUP_LINK.etiqueta,
    GROUP_LINK.fecha,
    GROUP_LINK.semana,
    GROUP_LINK.mes,
    GROUP_LINK.descripcion,
  ]);
  await expect(subgroupLink(page, "Segundo nivel", null)).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(subgroupList(page, "Segundo nivel")).toBeHidden();

  // RP-12, D-R3-5: «Fecha» cierra el popover con el foco en su botón y
  // escribe `subagrupar`. RP-13, D-R3-9: todo contraído, con un botón por
  // grupo que tiene hijos.
  await pickSubgroup(page, "Segundo nivel", "fecha", ["fecha"]);
  await expectReport(page, lastWeek, "proyecto", day, ["fecha"]);
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(groupColumnHeader(page)).toHaveText(
    `${GROUP_LINK.proyecto} / ${GROUP_LINK.fecha}`,
  );
  await expectGroupNames(page, [first, second]);
  await expect(groupDuration(groupRow(page, first))).toHaveText("1:30");
  await expect(groupDuration(groupRow(page, second))).toHaveText("0:45");
  await expect(expandButton(page, first)).toHaveAttribute("aria-expanded", "false");
  await expect(expandButton(page, second)).toHaveAttribute("aria-expanded", "false");
  await expect(reportTotal(page, "Total")).toHaveText("2:15");

  // Abrir P1 muestra sus días en orden, entre P1 y P2, y el foco queda en el
  // botón. Enter lo vuelve a cerrar.
  await expandButton(page, first).click();
  await expectGroupNames(page, [first, tuesday, thursday, second]);
  await expect(groupDuration(groupRow(page, tuesday))).toHaveText("1:00");
  await expect(groupDuration(groupRow(page, thursday))).toHaveText("0:30");
  await expect(expandButton(page, first)).toHaveAttribute("aria-expanded", "true");
  await expect(expandButton(page, first)).toBeFocused();
  await page.keyboard.press("Enter");
  await expectGroupNames(page, [first, second]);
  await expect(expandButton(page, first)).toHaveAttribute("aria-expanded", "false");

  // «Tercer nivel: Etiqueta» suma el nivel a la URL. RP-18: con la etiqueta
  // entre los niveles, la línea de la suma por etiqueta.
  await pickSubgroup(page, "Tercer nivel", "etiqueta", ["fecha", "etiqueta"]);
  await expectReport(page, lastWeek, "proyecto", day, ["fecha", "etiqueta"]);
  await expect(groupColumnHeader(page)).toHaveText(
    `${GROUP_LINK.proyecto} / ${GROUP_LINK.fecha} / ${GROUP_LINK.etiqueta}`,
  );
  await expect(page.getByText(TAG_OVERLAP, { exact: true })).toBeVisible();
  await expectGroupNames(page, [first, second]);
  await expandButton(page, first).click();
  await expandButton(page, tuesday).click();
  await expandButton(page, thursday).click();
  await expectGroupNames(page, [first, tuesday, tag, thursday, NO_TAG, second]);
  await expect(groupDuration(groupRow(page, tag))).toHaveText("1:00");
  await expect(groupDuration(groupRow(page, NO_TAG))).toHaveText("0:30");
  // El último nivel no tiene botón.
  await expect(expandButton(page, tag)).toHaveCount(0);
  await expect(expandButton(page, NO_TAG)).toHaveCount(0);

  // Cerrar P1 oculta a sus nietos; reabrirlo muestra los días como estaban.
  await expandButton(page, first).click();
  await expectGroupNames(page, [first, second]);
  await expandButton(page, first).click();
  await expectGroupNames(page, [first, tuesday, tag, thursday, NO_TAG, second]);
  await expect(expandButton(page, tuesday)).toHaveAttribute("aria-expanded", "true");

  // RP-32, D-R3-9: al recargar, la misma URL y los mismos niveles, contraídos.
  await page.reload();
  await expectReport(page, lastWeek, "proyecto", day, ["fecha", "etiqueta"]);
  await expectSubgroups(page, ["fecha", "etiqueta"]);
  await expectGroupNames(page, [first, second]);
  await expect(expandButton(page, first)).toHaveAttribute("aria-expanded", "false");
  await expect(expandButton(page, second)).toHaveAttribute("aria-expanded", "false");
});

test("los controles conservan los subniveles, los intercambian y los quitan", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const [tuesday, wednesday, thursday] = [1, 2, 3].map((days) =>
    weekdayLabel(addDays(lastWeek.first, days), day),
  );
  await enterApp(page);
  const { first, tag } = await seedSubgroupEntries(email, lastWeek);
  await openReport(page, lastWeek, "proyecto", day, ["fecha"]);
  await expectSubgroups(page, ["fecha"]);

  // D-R3-8: «Fecha» en «Agrupar por» ya está en el segundo nivel, así que
  // los dos se intercambian.
  await groupByLink(page, "fecha").click();
  await expectReport(page, lastWeek, "fecha", day, ["proyecto"]);
  await expectSubgroups(page, ["proyecto"]);
  await expect(groupColumnHeader(page)).toHaveText(
    `${GROUP_LINK.fecha} / ${GROUP_LINK.proyecto}`,
  );
  await expectGroupNames(page, [tuesday, wednesday, thursday]);
  await expandButton(page, tuesday).click();
  await expectGroupNames(page, [tuesday, first, wednesday, thursday]);
  await expect(groupDuration(groupRow(page, first))).toHaveText("1:00");

  // RP-20: las flechas conservan `subagrupar`; la semana de antes está vacía.
  await periodLink(page, "Período anterior").click();
  await expectReport(page, shiftRange(lastWeek, -7), "fecha", day, ["proyecto"]);
  await expectSubgroups(page, ["proyecto"]);
  await expect(reportTable(page).getByText(EMPTY_REPORT, { exact: true })).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(0);

  // D-R3-9: cada navegación arranca contraída, también de vuelta al período
  // que tenía el martes abierto.
  await periodLink(page, "Período siguiente").click();
  await expectReport(page, lastWeek, "fecha", day, ["proyecto"]);
  await expectSubgroups(page, ["proyecto"]);
  await expectGroupNames(page, [tuesday, wednesday, thursday]);
  await expect(expandButton(page, tuesday)).toHaveAttribute("aria-expanded", "false");

  // Lo mismo sin pasar por un período vacío: con el martes abierto, sumar un
  // nivel es otra navegación sobre los mismos días.
  await expandButton(page, tuesday).click();
  await expectGroupNames(page, [tuesday, first, wednesday, thursday]);
  await pickSubgroup(page, "Tercer nivel", "etiqueta", ["proyecto", "etiqueta"]);
  await expectReport(page, lastWeek, "fecha", day, ["proyecto", "etiqueta"]);
  await expectGroupNames(page, [tuesday, wednesday, thursday]);
  await expect(expandButton(page, tuesday)).toHaveAttribute("aria-expanded", "false");

  // D-R3-7: P1 está debajo del martes y del jueves, y cada uno cuelga por el
  // camino entero: debajo del martes, solo la etiqueta del martes.
  await expandButton(page, tuesday).click();
  await expandButton(page, first).click();
  await expectGroupNames(page, [tuesday, first, tag, wednesday, thursday]);
  await expect(groupDuration(groupRow(page, tag))).toHaveText("1:00");

  // «Ninguno» en el segundo nivel quita los dos: la URL vuelve a los tres
  // parámetros, no hay «Tercer nivel» y las filas no tienen botón.
  await pickSubgroup(page, "Segundo nivel", null, []);
  await expectReport(page, lastWeek, "fecha", day);
  await expect(page).toHaveURL((url) => [...url.searchParams.keys()].length === 3);
  await expectGroupNames(page, [tuesday, wednesday, thursday]);
  await expect(groupHeaders(page).getByRole("button")).toHaveCount(0);
});

test("los filtros de cliente y de proyecto, con «Sin proyecto», los archivados y el segundo vacío", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const [monday, tuesday, wednesday, thursday] = [0, 1, 2, 3].map((days) =>
    addDays(lastWeek.first, days),
  );
  const suffix = uniqueSuffix();
  const firstClient = `C1 ${suffix}`;
  const secondClient = `C2 ${suffix}`;
  const first = `P1 ${suffix}`;
  const second = `P2 ${suffix}`;
  const archived = `P3 ${suffix}`;

  await enterApp(page);
  await setDisplayName(email, `Iris ${suffix}`);
  await seedProject({ name: first, client: firstClient });
  await seedProject({ name: second, client: secondClient });
  await seedProject({ name: archived });
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: monday, start: "09:00", end: "10:00", project: first },
    { description: "b", day: tuesday, start: "09:00", end: "09:30", project: second },
    { description: "c", day: wednesday, start: "09:00", end: "09:45", project: archived },
    { description: "d", day: thursday, start: "09:00", end: "09:20" },
  ]);
  await archiveProject(archived);
  const [firstId, archivedId, firstClientId] = await Promise.all([
    projectIdOf(first),
    projectIdOf(archived),
    clientIdOf(firstClient),
  ]);

  await openReport(page, lastWeek, "proyecto", day);
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(reportTotal(page, "Total")).toHaveText("2:35");

  // D-R4-8: «Sin proyecto» primero, sin filtrar por la búsqueda; las vigentes
  // en el grupo del filtro y, aparte, P3 en «Archivados» (RP-29).
  await openFilter(page, "Proyectos", "todos");
  await filterSearch(page, "Proyectos").fill(suffix);
  await expectFilterOptions(filterGroup(page, "Proyectos", "Proyectos"), [
    NO_PROJECT,
    first,
    second,
  ]);
  await expectFilterOptions(filterGroup(page, "Proyectos", "Archivados"), [archived]);

  // RP-25, RP-26: P1 y «Sin proyecto». La URL lleva los dos, con
  // `sin-proyecto` al final (D-R4-2); las filas y el total son los de lo
  // filtrado.
  const chosen = { projects: [firstId, NO_PROJECT_KEY] };
  await filterOption(page, first).check();
  await filterOption(page, NO_PROJECT).check();
  await applyFilter(page, "Proyectos", "2");
  await expectReport(page, lastWeek, "proyecto", day, [], chosen);
  // El encabezado de un proyecto con cliente lo nombra a los dos (R3).
  await expectGroupNames(page, [`${first} ${firstClient}`, NO_PROJECT]);
  await expect(groupDuration(groupRow(page, first))).toHaveText("1:00");
  await expect(groupDuration(groupRow(page, NO_PROJECT))).toHaveText("0:20");
  await expect(reportTotal(page, "Total")).toHaveText("1:20");

  // D-R4-10: «Cliente» conserva el filtro. La entrada sin proyecto va a «Sin
  // cliente».
  const expectByClient = async (): Promise<void> => {
    await expectGroupNames(page, [firstClient, NO_CLIENT]);
    await expect(groupDuration(groupRow(page, firstClient))).toHaveText("1:00");
    await expect(groupDuration(groupRow(page, NO_CLIENT))).toHaveText("0:20");
    await expect(reportTotal(page, "Total")).toHaveText("1:20");
  };
  await groupByLink(page, "cliente").click();
  await expectReport(page, lastWeek, "cliente", day, [], chosen);
  await expectByClient();

  // RP-32: al recargar, la misma vista, y el botón dice lo elegido.
  await page.reload();
  await expectReport(page, lastWeek, "cliente", day, [], chosen);
  await expect(filterButton(page, "Proyectos", "2")).toBeVisible();
  await expectByClient();

  // D-R4-10: el subnivel y el atajo del período conservan los filtros. Las
  // filas de arriba son las mismas: la semana de hoy no tiene horas.
  const twoWeeks = shortcutRange("Últimas dos semanas", day);
  await pickSubgroup(page, "Segundo nivel", "proyecto", ["proyecto"]);
  await expectReport(page, lastWeek, "cliente", day, ["proyecto"], chosen);
  await expect(filterButton(page, "Proyectos", "2")).toBeVisible();
  await expectByClient();
  await openRangePicker(page);
  await pickShortcut(page, "Últimas dos semanas");
  await expectReport(page, twoWeeks, "cliente", day, ["proyecto"], chosen);
  await expect(filterButton(page, "Proyectos", "2")).toBeVisible();
  await expectByClient();
  await pickSubgroup(page, "Segundo nivel", null, []);
  await expectReport(page, twoWeeks, "cliente", day, [], chosen);
  await openRangePicker(page);
  await pickShortcut(page, "Semana anterior");
  await expectReport(page, lastWeek, "cliente", day, [], chosen);
  await expect(filterButton(page, "Proyectos", "2")).toBeVisible();
  await expectByClient();

  // D-R4-8: Esc cierra sin aplicar y el foco vuelve al botón. Aplicada, la
  // casilla de P3 pediría los tres proyectos: ningún paso lleva ahí, así que
  // un pedido con esa URL solo puede venir de Esc.
  const escaped = recordNavigations(page, lastWeek, "cliente", {
    projects: [firstId, archivedId, NO_PROJECT_KEY],
  });
  await openFilter(page, "Proyectos", "2");
  await filterOption(page, archived).check();
  await page.keyboard.press("Escape");
  await expect(filterPanel(page, "Proyectos")).toBeHidden();
  await expect(filterButton(page, "Proyectos", "2")).toBeFocused();
  await expectReport(page, lastWeek, "cliente", day, [], chosen);
  await expectByClient();

  // Al abrir de nuevo, lo elegido es lo del estado, no lo que Esc descartó.
  // RP-29: el archivado se filtra y sus horas cuentan.
  await openFilter(page, "Proyectos", "2");
  await expect(filterOption(page, first)).toBeChecked();
  await expect(filterOption(page, NO_PROJECT)).toBeChecked();
  await expect(filterOption(page, archived)).not.toBeChecked();
  await filterOption(page, first).uncheck();
  await filterOption(page, NO_PROJECT).uncheck();
  await filterOption(page, archived).check();
  await applyFilter(page, "Proyectos", archived);
  const onlyArchived = { projects: [archivedId] };
  await expectReport(page, lastWeek, "cliente", day, [], onlyArchived);
  await expectGroupNames(page, [NO_CLIENT]);
  await expect(groupDuration(groupRow(page, NO_CLIENT))).toHaveText("0:45");
  await expect(reportTotal(page, "Total")).toHaveText("0:45");

  // D-R4-10, RP-33: la flecha conserva el filtro; la semana de antes no tiene
  // horas y, con filtros, es el segundo vacío (D-R4-7).
  await periodLink(page, "Período anterior").click();
  await expectReport(page, shiftRange(lastWeek, -7), "cliente", day, [], onlyArchived);
  await expect(emptyFiltered(page)).toBeVisible();
  await expect(clearFiltersLink(page)).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(0);
  await expect(reportTotal(page, "Total")).toHaveText("0:00");
  await periodLink(page, "Período siguiente").click();
  await expectReport(page, lastWeek, "cliente", day, [], onlyArchived);
  await expect(groupDuration(groupRow(page, NO_CLIENT))).toHaveText("0:45");

  // D-R4-3: entre filtros, «y». P3 no tiene cliente, así que con C1 no queda
  // nada.
  await openFilter(page, "Clientes", "todos");
  await filterSearch(page, "Clientes").fill(suffix);
  await expectFilterOptions(filterGroup(page, "Clientes", "Clientes"), [
    firstClient,
    secondClient,
  ]);
  await filterOption(page, firstClient).check();
  await applyFilter(page, "Clientes", firstClient);
  await expectReport(page, lastWeek, "cliente", day, [], {
    clients: [firstClientId],
    projects: [archivedId],
  });
  await expect(emptyFiltered(page)).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(0);

  // D-R4-7: «Quitar filtros» vuelve al mismo período y la misma agrupación,
  // sin ningún filtro.
  await clearFiltersLink(page).click();
  await expectReport(page, lastWeek, "cliente", day);
  await expect(filterButton(page, "Clientes", "todos")).toBeVisible();
  await expect(filterButton(page, "Proyectos", "todos")).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(3);
  await expect(groupDuration(groupRow(page, firstClient))).toHaveText("1:00");
  await expect(groupDuration(groupRow(page, secondClient))).toHaveText("0:30");
  await expect(groupDuration(groupRow(page, NO_CLIENT))).toHaveText("1:05");
  await expect(reportTotal(page, "Total")).toHaveText("2:35");

  expect(escaped).toEqual([]);
});

test("un filtro que nombra algo que no existe, o mal formado, se ignora", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const tuesday = addDays(lastWeek.first, 1);
  const suffix = uniqueSuffix();
  const person = `Juan ${suffix}`;
  const project = `P1 ${suffix}`;

  await enterApp(page);
  await setDisplayName(email, person);
  await seedProject({ name: project });
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: tuesday, start: "09:00", end: "10:00", project },
    { description: "b", day: tuesday, start: "11:00", end: "11:30" },
  ]);
  const projectId = await projectIdOf(project);
  const unknown = randomUUID();
  const byPerson = reportsUrl(lastWeek, "persona");

  // Cada dirección se carga entera: lo que se ve no puede venir de la anterior.
  const expectPerson = async (duration: string): Promise<void> => {
    await expect(rangeButton(page)).toHaveAccessibleName(
      "Elegir período: Semana anterior",
    );
    await expectGroupBy(page, "persona");
    await expect(groupHeaders(page)).toHaveCount(1);
    await expect(groupDuration(groupRow(page, person))).toHaveText(duration);
    await expect(reportTotal(page, "Total")).toHaveText(duration);
  };

  // RP-34: un id bien formado que no está en el catálogo se ignora. Ignorado
  // entero, no es un filtro: no hay segundo vacío (D-R4-7).
  await page.goto(`${byPerson}&proyectos=${unknown}`);
  await expectPerson("1:30");
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(filterButton(page, "Proyectos", "todos")).toBeVisible();
  await expect(emptyFiltered(page)).toHaveCount(0);

  // Los demás del mismo parámetro siguen, y el enlace siguiente lleva solo
  // los efectivos (D-R4-5).
  await page.goto(`${byPerson}&proyectos=${projectId},${unknown}`);
  await expectPerson("1:00");
  await expect(filterButton(page, "Proyectos", project)).toBeVisible();
  await groupByLink(page, "proyecto").click();
  await expectReport(page, lastWeek, "proyecto", day, [], { projects: [projectId] });
  await expectGroupNames(page, [project]);
  await expect(groupDuration(groupRow(page, project))).toHaveText("1:00");

  // RP-32: una coma de más descarta el parámetro entero, no solo el valor vacío.
  await page.goto(`${byPerson}&proyectos=${projectId},`);
  await expectPerson("1:30");
  await expect(filterButton(page, "Proyectos", "todos")).toBeVisible();

  // Un proyecto como cliente está bien formado y no es de su catálogo.
  await page.goto(`${byPerson}&clientes=${projectId}`);
  await expectPerson("1:30");
  await expect(filterButton(page, "Clientes", "todos")).toBeVisible();
});

test("un admin filtra por personas, con las inactivas aparte y sin las invitadas", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const tuesday = addDays(lastWeek.first, 1);
  const suffix = uniqueSuffix();
  const project = `P ${suffix}`;
  const own = `Ana ${suffix}`;
  const active = `Beto ${suffix}`;
  const inactive = `Carla ${suffix}`;
  const invited = `Dora ${suffix}`;
  const idle = `Eva ${suffix}`;

  await enterApp(page);
  await setRole(email, "admin");
  await setDisplayName(email, own);
  await seedProject({ name: project });
  const activeEmail = await seedOtherPerson(active);
  const inactiveEmail = await seedOtherPerson(inactive, "inactive");
  await seedOtherPerson(invited, "invited");
  const idleEmail = await seedOtherPerson(idle);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: tuesday, start: "09:00", end: "10:00", project },
  ]);
  await seedPersonEntries(activeEmail, PERSON_TIMEZONE, [
    { description: "b", day: tuesday, start: "09:00", end: "11:00", project },
  ]);
  await seedPersonEntries(inactiveEmail, PERSON_TIMEZONE, [
    { description: "c", day: tuesday, start: "09:00", end: "09:30", project },
  ]);
  const [ownId, activeId, inactiveId, idleId] = await Promise.all(
    [email, activeEmail, inactiveEmail, idleEmail].map(userIdOf),
  );
  // D-R4-2: el id de la sesión lo genera Better Auth, con mayúsculas. Sin
  // ellas, un id pasado a minúsculas en algún punto no se notaría.
  expect(ownId).not.toBe(ownId.toLowerCase());

  await openReport(page, lastWeek, "persona", day);
  await expect(page.getByText(SCOPE_EVERYONE, { exact: true })).toBeVisible();

  // RP-62, D-R4-8, P-08: las activas en el grupo del filtro, con E aunque no
  // tenga horas, y aparte, en «Inactivas», C con el nombre tachado. RP-64: la
  // invitada no está en ninguno.
  await openFilter(page, "Personas", "todas");
  await filterSearch(page, "Personas").fill(suffix);
  await expectFilterOptions(filterGroup(page, "Personas", "Personas"), [
    own,
    active,
    idle,
  ]);
  await expectFilterOptions(filterGroup(page, "Personas", "Inactivas"), [inactive]);
  await expect(filterOption(page, invited)).toHaveCount(0);
  expect(await isStruckThrough(page, inactive)).toBe(true);
  expect(await isStruckThrough(page, active)).toBe(false);

  // RP-25: A, B y C. La URL lleva el id de A tal como lo guarda la base; las
  // filas son solo las elegidas, así que el total es reproducible (§8.3).
  const chosen = { people: [ownId, activeId, inactiveId] };
  await filterOption(page, own).check();
  await filterOption(page, active).check();
  await filterOption(page, inactive).check();
  await applyFilter(page, "Personas", "3");
  const expectByPerson = async (): Promise<void> => {
    await expectReport(page, lastWeek, "persona", day, [], chosen);
    // RP-12: por duración descendente.
    await expectGroupNames(page, [active, own, `${inactive} ${INACTIVE_PERSON}`]);
    await expect(groupDuration(groupRow(page, active))).toHaveText("2:00");
    await expect(groupDuration(groupRow(page, own))).toHaveText("1:00");
    await expect(groupDuration(groupRow(page, inactive))).toHaveText("0:30");
    await expect(inactiveMark(groupRow(page, inactive))).toBeVisible();
    await expect(inactiveMark(groupRow(page, active))).toHaveCount(0);
    await expect(reportTotal(page, "Total")).toHaveText("3:30");
  };
  await expectByPerson();

  // D-R4-10: «Proyecto» conserva el filtro.
  await groupByLink(page, "proyecto").click();
  await expectReport(page, lastWeek, "proyecto", day, [], chosen);
  await expectGroupNames(page, [project]);
  await expect(groupDuration(groupRow(page, project))).toHaveText("3:30");
  await expect(reportTotal(page, "Total")).toHaveText("3:30");

  // RP-32: al recargar, la misma vista, y el botón dice lo elegido.
  await page.reload();
  await expectReport(page, lastWeek, "proyecto", day, [], chosen);
  await expect(filterButton(page, "Personas", "3")).toBeVisible();
  await expect(groupDuration(groupRow(page, project))).toHaveText("3:30");
  await expect(reportTotal(page, "Total")).toHaveText("3:30");

  // D-R4-7: solo E, que no tiene horas, es el segundo vacío.
  await openFilter(page, "Personas", "3");
  await filterSearch(page, "Personas").fill(suffix);
  await expect(filterOption(page, own)).toBeChecked();
  await expect(filterOption(page, active)).toBeChecked();
  await expect(filterOption(page, inactive)).toBeChecked();
  await filterOption(page, own).uncheck();
  await filterOption(page, active).uncheck();
  await filterOption(page, inactive).uncheck();
  await filterOption(page, idle).check();
  await applyFilter(page, "Personas", idle);
  await expectReport(page, lastWeek, "proyecto", day, [], { people: [idleId] });
  await expect(emptyFiltered(page)).toBeVisible();
  await expect(groupHeaders(page)).toHaveCount(0);
  await expect(reportTotal(page, "Total")).toHaveText("0:00");
});

test("un member con un enlace que filtra personas ve lo propio, y los otros filtros se aplican", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const tuesday = addDays(lastWeek.first, 1);
  const suffix = uniqueSuffix();
  const own = `Lía ${suffix}`;
  const other = `Omar ${suffix}`;
  const first = `P1 ${suffix}`;
  const second = `P2 ${suffix}`;

  await enterApp(page);
  await setDisplayName(email, own);
  await seedProject({ name: first });
  await seedProject({ name: second });
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: tuesday, start: "09:00", end: "10:00", project: first },
    { description: "b", day: tuesday, start: "11:00", end: "11:30", project: second },
  ]);
  const otherEmail = await seedOtherPerson(other);
  await seedPersonEntries(otherEmail, PERSON_TIMEZONE, [
    { description: "c", day: tuesday, start: "09:00", end: "12:00", project: first },
  ]);
  const [otherId, firstId] = await Promise.all([
    userIdOf(otherEmail),
    projectIdOf(first),
  ]);

  // RP-32, D-R4-4: el enlace que arma un admin. Para un member `personas` no
  // tiene catálogo y se ignora; `proyectos` se aplica sobre lo propio.
  await page.goto(
    reportsUrl(lastWeek, "persona", [], { people: [otherId], projects: [firstId] }),
  );
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Semana anterior");
  await expectGroupBy(page, "persona");
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(filterButton(page, "Proyectos", first)).toBeVisible();
  await expect(anyFilterButton(page, "Personas")).toHaveCount(0);
  await expectGroupNames(page, [own]);
  await expect(groupDuration(groupRow(page, own))).toHaveText("1:00");
  await expect(page.getByText(other)).toHaveCount(0);
  await expect(reportTotal(page, "Total")).toHaveText("1:00");

  // D-R4-5: el enlace siguiente lleva los filtros efectivos, sin `personas`.
  await groupByLink(page, "proyecto").click();
  await expectReport(page, lastWeek, "proyecto", day, [], { projects: [firstId] });
  await expectGroupNames(page, [first]);
  await expect(groupDuration(groupRow(page, first))).toHaveText("1:00");
  await expect(reportTotal(page, "Total")).toHaveText("1:00");
});

/** Un día de 2025, el año fijo de los recorridos 17 y 18 (D-R10-14). */
function in2025(month: number, day: number): CivilDay {
  return { year: 2025, month, day };
}

/**
 * El período de los recorridos 17 y 18 (§8.2 de R10), del sábado 20/09 al
 * viernes 10/10 de 2025: con el domingo como primer día, corta la primera
 * semana y la última, y los dos meses.
 */
const WEEKS_RANGE: ReportRange = { first: in2025(9, 20), last: in2025(10, 10) };

/**
 * Las entradas de los recorridos 17 y 18, en P1 salvo la del miércoles 01/10,
 * en P2. La persona de la sesión empieza la semana el domingo (RP-24), sobre
 * su propia membresía (D-R10-14).
 */
async function seedWeekEntries(
  email: string,
): Promise<{ readonly first: string; readonly suffix: string }> {
  const suffix = uniqueSuffix();
  const first = `P1 ${suffix}`;
  const second = `P2 ${suffix}`;
  await setDisplayName(email, `Jime ${suffix}`);
  await setWeekStart(email, SUNDAY);
  await seedProject({ name: first });
  await seedProject({ name: second });
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    {
      description: "a",
      day: in2025(9, 20),
      start: "09:00",
      end: "09:15",
      project: first,
    },
    {
      description: "b",
      day: in2025(9, 30),
      start: "09:00",
      end: "10:00",
      project: first,
    },
    {
      description: "c",
      day: in2025(10, 1),
      start: "09:00",
      end: "09:30",
      project: second,
    },
    {
      description: "d",
      day: in2025(10, 10),
      start: "09:00",
      end: "09:20",
      project: first,
    },
  ]);
  return { first, suffix };
}

/**
 * Los rótulos de los recorridos 17 y 18 con hoy en `today`, con la regla del
 * año de `days.ts`: unos días, la semana del domingo que contiene a un día y
 * el mes de un día.
 */
function weekEntryLabels(today: CivilDay): {
  readonly days: (first: CivilDay, last?: CivilDay) => string;
  readonly week: (civil: CivilDay) => string;
  readonly month: (civil: CivilDay) => string;
} {
  const days = (first: CivilDay, last: CivilDay = first): string =>
    dayRangeLabel(first, last, today);
  return {
    days,
    week: (civil) => {
      const start = weekStartOf(civil, SUNDAY);
      return days(start, addDays(start, 6));
    },
    month: (civil) => monthLabel(civil, today),
  };
}

test("por semana y por mes, con el primer día de la persona y los extremos cortados", async ({
  page,
  email,
}) => {
  const day = today();
  const { days, week, month } = weekEntryLabels(day);
  await enterApp(page);
  await seedWeekEntries(email);
  await openReport(page, WEEKS_RANGE, "persona", day);

  // RP-11, D-R10-5: «Semana» conserva el rango. RP-24: las semanas empiezan
  // el domingo, el primer día de la persona. D-R10-3: cada una se rotula
  // entera, y la primera y la última, que el período corta, dicen los días
  // que cuentan. En orden cronológico; la del 21/09 no tiene horas y no está.
  // El alcance es propio, así que el total es el de las filas.
  const firstWeek = periodHeading(week(in2025(9, 20)), days(in2025(9, 20)));
  const middleWeek = periodHeading(week(in2025(9, 30)), null);
  const lastWeek = periodHeading(
    week(in2025(10, 10)),
    days(in2025(10, 5), in2025(10, 10)),
  );
  const expectByWeek = async (): Promise<void> => {
    await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
    await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.semana);
    await expectGroupNames(page, [firstWeek, middleWeek, lastWeek]);
    await expect(groupDuration(groupRow(page, firstWeek))).toHaveText("0:15");
    await expect(groupDuration(groupRow(page, middleWeek))).toHaveText("1:30");
    await expect(groupDuration(groupRow(page, lastWeek))).toHaveText("0:20");
    await expect(groupRow(page, week(in2025(9, 21)))).toHaveCount(0);
    await expect(reportTotal(page, "Total")).toHaveText("2:05");
  };
  await groupByLink(page, "semana").click();
  await expectReport(page, WEEKS_RANGE, "semana", day);
  await expectByWeek();

  // RP-32: al recargar, la misma vista.
  await page.reload();
  await expectReport(page, WEEKS_RANGE, "semana", day);
  await expectByWeek();

  // «Mes»: los dos, cortados por el período, en orden cronológico.
  const september = periodHeading(
    month(in2025(9, 1)),
    days(in2025(9, 20), in2025(9, 30)),
  );
  const october = periodHeading(
    month(in2025(10, 1)),
    days(in2025(10, 1), in2025(10, 10)),
  );
  await groupByLink(page, "mes").click();
  await expectReport(page, WEEKS_RANGE, "mes", day);
  await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.mes);
  await expectGroupNames(page, [september, october]);
  await expect(groupDuration(groupRow(page, september))).toHaveText("1:15");
  await expect(groupDuration(groupRow(page, october))).toHaveText("0:50");
  await expect(reportTotal(page, "Total")).toHaveText("2:05");
});

test("Mes → Semana parte la semana del fin de mes y un filtro conserva los niveles", async ({
  page,
  email,
}) => {
  const day = today();
  const { days, week, month } = weekEntryLabels(day);
  await enterApp(page);
  const { first, suffix } = await seedWeekEntries(email);
  const firstId = await projectIdOf(first);
  await openReport(page, WEEKS_RANGE, "mes", day, ["semana"]);
  await expectSubgroups(page, ["semana"]);

  // RP-12, D-R3-9: los dos meses contraídos, cada uno con su botón.
  const [septemberLabel, octoberLabel] = [month(in2025(9, 1)), month(in2025(10, 1))];
  const september = periodHeading(septemberLabel, days(in2025(9, 20), in2025(9, 30)));
  const october = periodHeading(octoberLabel, days(in2025(10, 1), in2025(10, 10)));
  await expect(groupColumnHeader(page)).toHaveText(
    `${GROUP_LINK.mes} / ${GROUP_LINK.semana}`,
  );
  await expectGroupNames(page, [september, october]);
  await expect(expandButton(page, septemberLabel)).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(expandButton(page, octoberLabel)).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(groupDuration(groupRow(page, september))).toHaveText("1:15");
  await expect(groupDuration(groupRow(page, october))).toHaveText("0:50");
  await expect(reportTotal(page, "Total")).toHaveText("2:05");

  // D-R10-6: la semana del 28/09 cruza el fin de mes, así que está debajo de
  // los dos. D-R10-3: cada vez dice los días que cuenta, los del período y
  // los del mes de arriba, aunque el período la tenga entera.
  const split = week(in2025(9, 30));
  const firstWeek = periodHeading(week(in2025(9, 20)), days(in2025(9, 20)));
  const splitInSeptember = periodHeading(split, days(in2025(9, 28), in2025(9, 30)));
  const splitInOctober = periodHeading(split, days(in2025(10, 1), in2025(10, 4)));
  const lastWeek = periodHeading(
    week(in2025(10, 10)),
    days(in2025(10, 5), in2025(10, 10)),
  );
  await expandButton(page, septemberLabel).click();
  await expectGroupNames(page, [september, firstWeek, splitInSeptember, october]);
  await expect(groupDuration(groupRow(page, firstWeek))).toHaveText("0:15");
  await expect(groupDuration(groupRow(page, splitInSeptember))).toHaveText("1:00");
  await expandButton(page, octoberLabel).click();
  await expectGroupNames(page, [
    september,
    firstWeek,
    splitInSeptember,
    october,
    splitInOctober,
    lastWeek,
  ]);
  await expect(groupDuration(groupRow(page, splitInOctober))).toHaveText("0:30");
  await expect(groupDuration(groupRow(page, lastWeek))).toHaveText("0:20");

  // RP-25, D-R4-10: el filtro conserva el mes y la semana. Sin la entrada del
  // 01/10, que es de P2, octubre solo tiene la última semana.
  const chosen = { projects: [firstId] };
  await openFilter(page, "Proyectos", "todos");
  await filterSearch(page, "Proyectos").fill(suffix);
  await filterOption(page, first).check();
  await applyFilter(page, "Proyectos", first);
  await expectReport(page, WEEKS_RANGE, "mes", day, ["semana"], chosen);
  await expectSubgroups(page, ["semana"]);
  await expectGroupNames(page, [september, october]);
  await expect(groupDuration(groupRow(page, september))).toHaveText("1:15");
  await expect(groupDuration(groupRow(page, october))).toHaveText("0:20");
  await expandButton(page, octoberLabel).click();
  await expectGroupNames(page, [september, october, lastWeek]);
  await expect(reportTotal(page, "Total")).toHaveText("1:35");

  // D-R3-8: «Fecha» en el segundo nivel conserva el filtro.
  await pickSubgroup(page, "Segundo nivel", "fecha", ["fecha"]);
  await expectReport(page, WEEKS_RANGE, "mes", day, ["fecha"], chosen);
  await expectGroupNames(page, [september, october]);
  await expandButton(page, octoberLabel).click();
  const friday = weekdayLabel(in2025(10, 10), day);
  await expectGroupNames(page, [september, october, friday]);
  await expect(groupDuration(groupRow(page, friday))).toHaveText("0:20");
});

/**
 * Un texto ASCII de 150 caracteres que empieza con el sufijo. Sin espacios,
 * así el corte de los 100 primeros no cae en uno que el nombre accesible
 * pudiera recortar.
 */
function longDescription(suffix: string): string {
  return `${suffix}-${"abcdefghij".repeat(15)}`.slice(0, 150);
}

test("por descripción, con «Sin descripción», las mayúsculas y el texto largo", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const [monday, tuesday, wednesday, thursday, friday] = [0, 1, 2, 3, 4].map((days) =>
    addDays(lastWeek.first, days),
  );
  const suffix = uniqueSuffix();
  const first = `P1 ${suffix}`;
  const second = `P2 ${suffix}`;
  const meeting = `Reunión ${suffix}`;
  const lowercaseMeeting = `reunión ${suffix}`;
  const long = longDescription(suffix);
  // D-R10-9: los 100 primeros caracteres y «…».
  const longShown = `${long.slice(0, 100)}…`;

  await enterApp(page);
  await setDisplayName(email, `Hebe ${suffix}`);
  await seedProject({ name: first });
  await seedProject({ name: second });
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: meeting, day: monday, start: "09:00", end: "10:00", project: first },
    { description: meeting, day: tuesday, start: "09:00", end: "09:30", project: second },
    {
      description: lowercaseMeeting,
      day: wednesday,
      start: "09:00",
      end: "09:20",
      project: first,
    },
    { description: "", day: thursday, start: "09:00", end: "09:15", project: first },
    { description: long, day: friday, start: "09:00", end: "09:10", project: second },
  ]);
  const secondId = await projectIdOf(second);
  await openReport(page, lastWeek, "persona", day);

  // RP-11, D-R10-5: «Descripción» conserva el rango. D-R10-8: la clave es el
  // texto exacto, así que «Reunión» y «reunión» son dos filas. RP-12: por
  // duración. RP-28: «Sin descripción» junta la vacía. D-R10-9: el largo,
  // recortado y con «…». El alcance es propio, así que el total es el de las
  // filas.
  await groupByLink(page, "descripcion").click();
  await expectReport(page, lastWeek, "descripcion", day);
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.descripcion);
  await expectGroupNames(page, [meeting, lowercaseMeeting, NO_DESCRIPTION, longShown]);
  await expect(groupDuration(groupRow(page, meeting))).toHaveText("1:30");
  await expect(groupDuration(groupRow(page, lowercaseMeeting))).toHaveText("0:20");
  await expect(groupDuration(groupRow(page, NO_DESCRIPTION))).toHaveText("0:15");
  await expect(groupDuration(groupRow(page, longShown))).toHaveText("0:10");
  await expect(reportTotal(page, "Total")).toHaveText("2:15");

  // RP-12, D-R3-8: «Proyecto» en el segundo nivel. Debajo de «Reunión», sus
  // dos proyectos por duración.
  await pickSubgroup(page, "Segundo nivel", "proyecto", ["proyecto"]);
  await expectReport(page, lastWeek, "descripcion", day, ["proyecto"]);
  await expectGroupNames(page, [meeting, lowercaseMeeting, NO_DESCRIPTION, longShown]);
  await expandButton(page, meeting).click();
  await expectGroupNames(page, [
    meeting,
    first,
    second,
    lowercaseMeeting,
    NO_DESCRIPTION,
    longShown,
  ]);
  await expect(groupDuration(groupRow(page, first))).toHaveText("1:00");
  await expect(groupDuration(groupRow(page, second))).toHaveText("0:30");

  // RP-25, D-R4-10: el filtro conserva los dos niveles. Con P2 quedan la
  // reunión del martes y el largo.
  const chosen = { projects: [secondId] };
  const expectFiltered = async (): Promise<void> => {
    await expectSubgroups(page, ["proyecto"]);
    await expectGroupNames(page, [meeting, longShown]);
    await expect(groupDuration(groupRow(page, meeting))).toHaveText("0:30");
    await expect(groupDuration(groupRow(page, longShown))).toHaveText("0:10");
    await expect(reportTotal(page, "Total")).toHaveText("0:40");
  };
  await openFilter(page, "Proyectos", "todos");
  await filterSearch(page, "Proyectos").fill(suffix);
  await filterOption(page, second).check();
  await applyFilter(page, "Proyectos", second);
  await expectReport(page, lastWeek, "descripcion", day, ["proyecto"], chosen);
  await expectFiltered();

  // RP-32: al recargar, la misma vista.
  await page.reload();
  await expectReport(page, lastWeek, "descripcion", day, ["proyecto"], chosen);
  await expectFiltered();
});

test("el primer nivel que no entra en el tope no se muestra, y el total sí", async ({
  page,
  email,
}) => {
  const day = today();
  const lastWeek = lastWeekRange(day);
  const suffix = uniqueSuffix();
  await enterApp(page);
  await setDisplayName(email, `Iris ${suffix}`);
  // D-R10-14: una descripción distinta por entrada, una más que el tope.
  await seedNumberedEntries(email, PERSON_TIMEZONE, {
    day: lastWeek.first,
    start: "09:00",
    count: 3001,
    suffix,
  });
  await openReport(page, lastWeek, "persona", day);

  // D-R10-10: el primer nivel tiene 3001 filas y no entra. La columna sigue
  // nombrándolo y la tabla lo dice en lugar de las filas, sin el vacío ni la
  // línea del tope de los niveles de abajo. El total sale de las entradas.
  await groupByLink(page, "descripcion").click();
  await expectReport(page, lastWeek, "descripcion", day);
  await expect(firstLevelLimitCell(page)).toBeVisible();
  await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.descripcion);
  await expect(groupHeaders(page)).toHaveCount(0);
  await expect(reportTable(page).getByText(EMPTY_REPORT, { exact: true })).toHaveCount(0);
  await expect(page.getByText(ROW_LIMIT, { exact: true })).toHaveCount(0);
  await expect(reportTotal(page, "Total")).toHaveText("50:01");

  // RP-28: por proyecto entra, con una sola fila.
  await groupByLink(page, "proyecto").click();
  await expectReport(page, lastWeek, "proyecto", day);
  await expectGroupNames(page, [NO_PROJECT]);
  await expect(groupDuration(groupRow(page, NO_PROJECT))).toHaveText("50:01");
  await expect(firstLevelLimitCell(page)).toHaveCount(0);
  await expect(reportTotal(page, "Total")).toHaveText("50:01");

  // D-R3-6: debajo, la descripción tiene 3001 filas y el presupuesto del
  // segundo nivel es de 2999. No entra: la línea del tope lo dice, la columna
  // nombra solo el primero y «Sin proyecto» no tiene botón.
  await pickSubgroup(page, "Segundo nivel", "descripcion", ["descripcion"]);
  await expectReport(page, lastWeek, "proyecto", day, ["descripcion"]);
  await expect(page.getByText(ROW_LIMIT, { exact: true })).toBeVisible();
  await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.proyecto);
  await expectGroupNames(page, [NO_PROJECT]);
  await expect(expandButton(page, NO_PROJECT)).toHaveCount(0);
  await expect(groupDuration(groupRow(page, NO_PROJECT))).toHaveText("50:01");
  await expect(reportTotal(page, "Total")).toHaveText("50:01");
});

test("el gráfico por día, semana y mes, con el teclado, el puntero y los filtros", async ({
  page,
  email,
}) => {
  const day = today();
  const { days, week, month } = weekEntryLabels(day);
  await enterApp(page);
  const { first, suffix } = await seedWeekEntries(email);
  const second = `P2 ${suffix}`;
  const secondId = await projectIdOf(second);
  // M2, D-R5-12: una entrada siempre pasada el primer día de la semana
  // actual, que empieza el domingo como la de la persona; `currentWeekRange`
  // empieza el lunes, y los domingos daría otra semana.
  const thisWeek = weekRange(weekStartOf(day, SUNDAY));
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    {
      description: "e",
      day: thisWeek.first,
      start: "00:00",
      end: "00:01",
      project: first,
    },
  ]);
  await openReport(page, WEEKS_RANGE, "persona", day);

  // D-R5-4: 21 días van por día. D-R5-5: una columna por día, en orden,
  // también las que no tienen horas, nombrada con el rótulo de la tabla.
  const dayBar = (civil: CivilDay, duration: string): string =>
    chartBarName(weekdayLabel(civil, day), null, duration);
  const september20 = dayBar(in2025(9, 20), "0:15");
  const september30 = dayBar(in2025(9, 30), "1:00");
  const october1 = dayBar(in2025(10, 1), "0:30");
  const october10 = dayBar(in2025(10, 10), "0:20");
  const byDay = chartFigure(page, chartCaption("fecha"));
  await expect(chartBars(byDay)).toHaveCount(21);
  await expect(chartBars(byDay).first()).toHaveAccessibleName(september20);
  await expect(chartBars(byDay).last()).toHaveAccessibleName(october10);
  for (const name of [september30, october1, dayBar(in2025(9, 21), "0:00")]) {
    await expect(chartBar(byDay, name)).toBeVisible();
  }

  // D-R5-9: el puntero sobre una columna la nombra en la línea del valor; al
  // salir del gráfico, sin foco en ninguna columna, la línea queda vacía.
  await chartBar(byDay, october1).hover();
  await expect(chartReadout(byDay, october1)).toBeVisible();
  await reportHeading(page).hover();
  await expect(chartReadout(byDay)).toHaveCount(0);

  // D-R5-9: una sola parada de tabulación, la primera columna; las flechas,
  // Inicio y Fin mueven el foco sin dar la vuelta. Con el puntero encima, la
  // activa es la del puntero; al salir, vuelve a ser la del foco.
  const data = chartDataSummary(byDay);
  await data.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(chartBar(byDay, september20)).toBeFocused();
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(chartBar(byDay, september30)).toBeFocused();
  await expect(chartReadout(byDay, september30)).toBeVisible();
  await chartBar(byDay, october1).hover();
  await expect(chartReadout(byDay, october1)).toBeVisible();
  await reportHeading(page).hover();
  await expect(chartReadout(byDay, september30)).toBeVisible();
  await page.keyboard.press("End");
  await expect(chartBar(byDay, october10)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(chartBar(byDay, october10)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(chartBar(byDay, september20)).toBeFocused();
  // Al salir el foco de las columnas, la línea se apaga; la parada queda en
  // la última enfocada.
  await page.keyboard.press("Tab");
  await expect(data).toBeFocused();
  await expect(chartReadout(byDay)).toHaveCount(0);
  await page.keyboard.press("Shift+Tab");
  await expect(chartBar(byDay, september20)).toBeFocused();

  // D-R5-9: la tabla de datos, una fila por columna, también las en cero.
  await data.click();
  await expect(chartDataRows(byDay)).toHaveCount(21);
  const september30Row = chartDataRows(byDay).filter({
    has: page.getByRole("rowheader", {
      name: weekdayLabel(in2025(9, 30), day),
      exact: true,
    }),
  });
  await expect(september30Row.getByRole("cell")).toHaveText("1:00");

  // D-R5-4: el gráfico no sigue a la agrupación: por semana, sigue por día.
  await groupByLink(page, "semana").click();
  await expectReport(page, WEEKS_RANGE, "semana", day);
  await expect(groupColumnHeader(page)).toHaveText(GROUP_LINK.semana);
  await expect(chartBars(byDay)).toHaveCount(21);

  // D-R5-2: el gráfico lleva los filtros de la cabecera.
  const onlySecond = { projects: [secondId] };
  await openFilter(page, "Proyectos", "todos");
  await filterSearch(page, "Proyectos").fill(suffix);
  await filterOption(page, second).check();
  await applyFilter(page, "Proyectos", second);
  await expectReport(page, WEEKS_RANGE, "semana", day, [], onlySecond);
  await expect(chartBars(byDay)).toHaveCount(21);
  await expect(chartBar(byDay, october1)).toBeVisible();
  await expect(chartBar(byDay, dayBar(in2025(9, 30), "0:00"))).toBeVisible();

  // D-R5-4: de 32 a 182 días, por semana, con el domingo de la persona
  // (RP-24). D-R5-5: la primera y la última, cortadas, dicen sus días.
  const august = { first: in2025(8, 1), last: in2025(10, 10) };
  await openReport(page, august, "persona", day);
  const byWeek = chartFigure(page, chartCaption("semana"));
  await expect(chartBars(byWeek)).toHaveCount(11);
  await expect(chartBars(byWeek).first()).toHaveAccessibleName(
    chartBarName(week(in2025(8, 1)), days(in2025(8, 1), in2025(8, 2)), "0:00"),
  );
  await expect(
    chartBar(byWeek, chartBarName(week(in2025(9, 30)), null, "1:30")),
  ).toBeVisible();
  await expect(chartBars(byWeek).last()).toHaveAccessibleName(
    chartBarName(week(in2025(10, 10)), days(in2025(10, 5), in2025(10, 10)), "0:20"),
  );

  // D-R5-6, RP-33: sin horas, sin gráfico.
  await openReport(page, { first: in2025(6, 1), last: in2025(6, 7) }, "persona", day);
  await expect(reportTable(page).getByText(EMPTY_REPORT, { exact: true })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(0);

  // D-R5-4: de 183 a 366 días, por mes.
  const year = { first: in2025(1, 1), last: in2025(12, 31) };
  await openReport(page, year, "persona", day);
  const byMonth = chartFigure(page, chartCaption("mes"));
  await expect(chartBars(byMonth)).toHaveCount(12);
  for (const name of [
    chartBarName(month(in2025(9, 1)), null, "1:15"),
    chartBarName(month(in2025(10, 1)), null, "0:50"),
    chartBarName(month(in2025(1, 1)), null, "0:00"),
  ]) {
    await expect(chartBar(byMonth, name)).toBeVisible();
  }

  // §5.1: una navegación de cliente vuelve a montar las columnas, con la
  // parada en la primera. «Esta semana» es la del domingo de la persona, que
  // el selector llama así.
  await chartDataSummary(byMonth).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("End");
  await expect(
    chartBar(byMonth, chartBarName(month(in2025(12, 1)), null, "0:00")),
  ).toBeFocused();
  await periodLink(page, "Esta semana").click();
  await expect(page).toHaveURL(reportsUrlOf(thisWeek, "persona"));
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir período: Esta semana");
  const byThisWeek = chartFigure(page, chartCaption("fecha"));
  await expect(chartBars(byThisWeek)).toHaveCount(7);
  await chartDataSummary(byThisWeek).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    chartBar(byThisWeek, chartBarName(weekdayLabel(thisWeek.first, day), null, "0:01")),
  ).toBeFocused();
});

/** Una caja en píxeles del viewport, como la de `boxOf`. */
type Box = { x: number; y: number; width: number; height: number };

/**
 * La caja del contenido de un elemento: la suya sin el borde ni el relleno.
 * La de `main` es el ancho que la página le da a la pantalla.
 */
async function contentBoxOf(element: Locator): Promise<Box> {
  return element.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const inset = (side: "Top" | "Right" | "Bottom" | "Left"): number =>
      parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) +
      parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`));
    const x = rect.left + inset("Left");
    const y = rect.top + inset("Top");
    return {
      x,
      y,
      width: rect.right - inset("Right") - x,
      height: rect.bottom - inset("Bottom") - y,
    };
  });
}

/** Si `inner` cabe en `outer`, con medio píxel de redondeo. */
function inside(inner: Box, outer: Box): boolean {
  const tolerance = 0.5;
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/**
 * Las marcas del eje, en el orden de las columnas, por su texto (son
 * `aria-hidden`). Un texto que se repite, como «ene» de dos años, se toma por
 * su aparición.
 */
function axisTicks(figure: Locator, labels: readonly string[]): Locator[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const occurrence = seen.get(label) ?? 0;
    seen.set(label, occurrence + 1);
    return figure.getByText(label, { exact: true }).nth(occurrence);
  });
}

/**
 * D-R5-8, §5.2: el gráfico entra en el contenido principal. La figura no
 * desborda; ella, la primera y la última columna, la marca de la última y la
 * línea del valor con el puntero sobre la última quedan dentro de la caja del
 * contenido de `main`. Las marcas que se ven no se pisan: a lo angosto se
 * ocultan algunas (D1 de R5). Se consulta con `expect.poll`, porque hasta que
 * carga la fuente el ancho del texto es el de la de reserva.
 */
async function expectChartFits(
  page: Page,
  figure: Locator,
  tickLabels: readonly string[],
): Promise<void> {
  const ticks = axisTicks(figure, tickLabels);
  const lastBar = chartBars(figure).last();
  await lastBar.hover();
  await expect(chartReadout(figure)).toBeVisible();
  await expect
    .poll(() => figure.evaluate((node) => node.scrollWidth - node.clientWidth), {
      message: "la figura desborda",
    })
    .toBeLessThanOrEqual(0);
  const parts: Record<string, Locator> = {
    figura: figure,
    "primera columna": chartBars(figure).first(),
    "última columna": lastBar,
    "marca de la última columna": ticks[ticks.length - 1],
    "línea del valor": chartReadout(figure),
  };
  await expect
    .poll(
      async () => {
        const content = await contentBoxOf(page.getByRole("main"));
        const outside: string[] = [];
        for (const [part, locator] of Object.entries(parts)) {
          if (!inside(await boxOf(locator), content)) {
            outside.push(part);
          }
        }
        return outside;
      },
      { message: "partes del gráfico fuera del contenido principal" },
    )
    .toEqual([]);
  await expect
    .poll(
      async () => {
        const shown: { label: string; box: Box }[] = [];
        for (const [index, tick] of ticks.entries()) {
          const box = await tick.boundingBox();
          if (box !== null) {
            shown.push({ label: tickLabels[index], box });
          }
        }
        return shown.flatMap(({ label, box }, index) => {
          const previous = shown[index - 1];
          return previous !== undefined && previous.box.x + previous.box.width > box.x
            ? [`${previous.label} y ${label}`]
            : [];
        });
      },
      { message: "marcas visibles que se pisan" },
    )
    .toEqual([]);
}

test("a 320 px el gráfico entra en su caja y sus marcas no se pisan", async ({
  page,
  email,
}) => {
  const day = today();
  await page.setViewportSize({ width: 320, height: 800 });
  await enterApp(page);
  await seedWeekEntries(email);

  // D-R5-8: 31 columnas por día, con una marca cada cinco.
  await openReport(page, { first: in2025(9, 10), last: in2025(10, 10) }, "persona", day);
  const byDay = chartFigure(page, chartCaption("fecha"));
  await expect(chartBars(byDay)).toHaveCount(31);
  await expectChartFits(page, byDay, [
    "10/09",
    "15/09",
    "20/09",
    "25/09",
    "30/09",
    "05/10",
    "10/10",
  ]);

  // D-R5-8: 13 columnas por mes, con una marca cada dos.
  await openReport(
    page,
    { first: in2025(1, 15), last: { year: 2026, month: 1, day: 15 } },
    "persona",
    day,
  );
  const byMonth = chartFigure(page, chartCaption("mes"));
  await expect(chartBars(byMonth)).toHaveCount(13);
  await expectChartFits(page, byMonth, ["ene", "mar", "may", "jul", "sep", "nov", "ene"]);
});

import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { PERSON_TIMEZONE } from "./calendar-page";
import {
  seedPersonEntries,
  seedPerson,
  seedProject,
  seedTag,
  setDisplayName,
  setMembershipStatus,
  setRole,
  type MembershipStatus,
} from "./database";
import { addDays, dayKeyOf, todayIn, weekdayLabel, type CivilDay } from "./days";
import {
  applyButton,
  clickRangeDay,
  currentWeekRange,
  EMPTY_REPORT,
  expandButton,
  expectGroupBy,
  expectGroupNames,
  expectReport,
  expectSubgroups,
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
  lastWeekRange,
  monthRange,
  NO_CLIENT,
  NO_LEVEL,
  NO_PROJECT,
  NO_TAG,
  NO_TASK,
  openReport,
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
  SCOPE_EVERYONE,
  SCOPE_SELF,
  shiftRange,
  SHORTCUT_LABELS,
  shortcutLink,
  shortcutList,
  shortcutRange,
  subgroupButton,
  subgroupLink,
  subgroupList,
  TAG_OVERLAP,
  taskHeading,
  taskRow,
  zoneLine,
  type ReportGroupBy,
  type ReportRange,
  type ShortcutLabel,
  type SubgroupLevel,
} from "./reports-page";
import { expect, TEST_EMAIL_DOMAIN, test } from "./session";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/**
 * Recorridos de R2a, R2b y R3 del núcleo de reportes: el resumido por persona,
 * por proyecto, por cliente, por tarea, por etiqueta y por fecha, los atajos
 * del período y los subniveles (§8.2 de cada contrato), con la regla de §8.3 de R2a. Cada
 * recorrido tiene sus personas —la de la sesión y las que siembra—, todas con
 * un nombre editado que lleva el sufijo del test, y solo afirma sobre sus filas
 * o sobre proyectos con ese sufijo: la base acumula personas y horas de todas
 * las corridas. El total se afirma solo con el alcance propio. El rol y el
 * estado los cambia la persona de la sesión sobre sí misma. Las entradas van en
 * la semana anterior a la de hoy y se siembran antes de abrir la pantalla; los
 * rótulos esperados se calculan con `days.ts`, no con el código que los
 * produce.
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
 * Elige una opción en la lista de un subnivel: el popover se cierra y el foco
 * vuelve al botón del nivel (D-R3-8), como con un atajo.
 */
async function pickSubgroup(
  page: Page,
  level: SubgroupLevel,
  groupBy: ReportGroupBy | null,
): Promise<void> {
  await subgroupButton(page, level).click();
  await expect(subgroupList(page, level)).toBeVisible();
  await subgroupLink(page, level, groupBy).click();
  await expect(subgroupList(page, level)).toBeHidden();
  await expect(subgroupButton(page, level)).toBeFocused();
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

  // D-R3-8: los seis enlaces de «Agrupar por», en orden.
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
  // empieza por «Ninguno», marcado, y sigue con las cinco que no son el
  // primer nivel, en el orden de «Agrupar por».
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
  await pickSubgroup(page, "Segundo nivel", "fecha");
  await expectReport(page, lastWeek, "proyecto", day, ["fecha"]);
  await expectSubgroups(page, ["fecha"]);
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
  await pickSubgroup(page, "Tercer nivel", "etiqueta");
  await expectReport(page, lastWeek, "proyecto", day, ["fecha", "etiqueta"]);
  await expectSubgroups(page, ["fecha", "etiqueta"]);
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
  const { first } = await seedSubgroupEntries(email, lastWeek);
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
  await pickSubgroup(page, "Tercer nivel", "etiqueta");
  await expectReport(page, lastWeek, "fecha", day, ["proyecto", "etiqueta"]);
  await expectSubgroups(page, ["proyecto", "etiqueta"]);
  await expectGroupNames(page, [tuesday, wednesday, thursday]);
  await expect(expandButton(page, tuesday)).toHaveAttribute("aria-expanded", "false");

  // «Ninguno» en el segundo nivel quita los dos: la URL vuelve a los tres
  // parámetros, no hay «Tercer nivel» y las filas no tienen botón.
  await pickSubgroup(page, "Segundo nivel", null);
  await expectReport(page, lastWeek, "fecha", day);
  await expect(page).toHaveURL((url) => [...url.searchParams.keys()].length === 3);
  await expectSubgroups(page, []);
  await expectGroupNames(page, [tuesday, wednesday, thursday]);
  await expect(groupHeaders(page).getByRole("button")).toHaveCount(0);
});

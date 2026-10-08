import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { PERSON_TIMEZONE } from "./calendar-page";
import {
  seedPersonEntries,
  seedPerson,
  seedProject,
  setDisplayName,
  setMembershipStatus,
  setRole,
  type MembershipStatus,
} from "./database";
import { addDays, dayKeyOf, todayIn, type CivilDay } from "./days";
import {
  applyButton,
  clickRangeDay,
  currentWeekRange,
  EMPTY_REPORT,
  expectGroupBy,
  expectReport,
  FORBIDDEN_BODY,
  FORBIDDEN_TITLE,
  goToReportsByNav,
  groupByLink,
  groupDuration,
  groupHeaders,
  groupRow,
  inactiveMark,
  lastWeekRange,
  NO_PROJECT,
  openReport,
  periodLink,
  RANGE_MESSAGES,
  rangeButton,
  rangeCalendar,
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
  zoneLine,
  type ReportRange,
} from "./reports-page";
import { expect, TEST_EMAIL_DOMAIN, test } from "./session";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/**
 * Recorridos de R2a del núcleo de reportes: el resumido por persona y por
 * proyecto (§8.2 del contrato), con la regla de §8.3. Cada recorrido tiene sus
 * personas —la de la sesión y las que siembra—, todas con un nombre editado
 * que lleva el sufijo del test, y solo afirma sobre sus filas o sobre
 * proyectos con ese sufijo: la base acumula personas y horas de todas las
 * corridas. El total se afirma solo con el alcance propio. El rol y el estado
 * los cambia la persona de la sesión sobre sí misma. Las entradas van en la
 * semana anterior a la de hoy y se siembran antes de abrir la pantalla; los
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

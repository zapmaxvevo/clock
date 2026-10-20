import type { Locator, Page } from "@playwright/test";

import {
  BODY_GRIP_PX,
  calendarHref,
  calendarRegion,
  closedBlockName,
  columnName,
  dayColumn,
  dialogButton,
  dialogClock,
  dialogDescription,
  dragBetween,
  entryBlock,
  entryBlocks,
  entryDialog,
  grabPoint,
  isCalendarPage,
  openLastWeek,
  PERSON_TIMEZONE,
} from "./calendar-page";
import { seedPersonEntries, seedProject, seedRunningEntry } from "./database";
import {
  addDays,
  minuteOfDayIn,
  todayIn,
  weekLabel,
  weekStartOf,
  type CivilDay,
} from "./days";
import { holdActionResponses, recordActions, withServerAction } from "./network";
import { expect, test } from "./session";
import {
  cellDetailDialog,
  cellField,
  cellMenuButton,
  cellMenuItem,
  cellName,
  dayTotal as sheetDayTotal,
  holdCellWrites,
  isCellWriteFor,
  lastWeekOf,
  openTimesheetWeek,
  openTrackerFrom,
  removeRowButton,
  removeRowDialog,
  rowTotal,
  trackerDay,
  weekTotal as sheetWeekTotal,
  writeCell,
} from "./timesheet-page";
import {
  addButton,
  chooseMode,
  clockField,
  dateButton,
  descriptionInput,
  elapsedCounter,
  entryRow,
  isTrackerPage,
  pickDate,
  setClock,
  todayGroup,
  trackerBar,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos del completo (§9.4 del contrato de WS2a): las duraciones del
 * rastreador, la planilla y el calendario en `hh:mm:ss`. Corren en el proyecto
 * `duration-full`, con el workspace en `full` (D-WS2a-12); los mismos lugares
 * con el compacto los prueba el resto de la suite. Cada recorrido entra con
 * una persona propia y siembra entradas con segundos sueltos —100 segundos son
 * `0:01` en el compacto y `00:01:40` en el completo—, así un lugar que formatee
 * en minutos o con el compacto falla. El contador del timer no es una
 * duración: sigue en `h:mm:ss` sin relleno (PF-22, WS-66).
 */

/** El total de un grupo o del período en el completo, con su etiqueta. */
const FULL_TOTAL = /^Total \d{2,}:\d{2}:\d{2}$/;

/** El contador del timer: las horas sin relleno, con los dos formatos (PF-22). */
const COUNTER = /^0:\d{2}:\d{2}$/;

/** El bloque del timer en el calendario: su transcurrido como duración (CAL-21). */
const RUNNING_DURATION = /en curso · \d{2}:\d{2}:\d{2}$/;

/**
 * Minutos del comienzo del día en que los recorridos con timer no corren: el
 * timer sembrado empezó hace diez minutos, y las entradas de hoy van de las
 * 00:00 a las 00:06:40. Al final del día, el transcurrido pasaría al siguiente.
 */
const DAY_START_MARGIN_MINUTES = 15;
const DAY_END_MARGIN_MINUTES = 5;

/** El motivo del salto cerca de la medianoche. */
const NEAR_MIDNIGHT_REASON =
  "cerca de la medianoche el timer sembrado y las entradas de hoy no caen en el mismo día";

function today(): CivilDay {
  return todayIn(PERSON_TIMEZONE);
}

function skipNearMidnight(): void {
  const minute = minuteOfDayIn(PERSON_TIMEZONE);
  test.skip(
    minute < DAY_START_MARGIN_MINUTES || minute > 1440 - DAY_END_MARGIN_MINUTES,
    NEAR_MIDNIGHT_REASON,
  );
}

/**
 * El total de un grupo del rastreador o del período del calendario. El de una
 * semana va antes que los de sus días, así que es el primero de su región.
 */
function totalOf(scope: Locator): Locator {
  return scope.getByText(FULL_TOTAL).first();
}

/** La franja de una semana del rastreador, por su rótulo (TT-47). */
function trackerWeek(page: Page, start: CivilDay, now: CivilDay): Locator {
  return page.getByRole("region", { name: weekLabel(start, now), exact: true });
}

/** La duración de una fila del rastreador, por su texto entero. */
function rowDuration(row: Locator, duration: string): Locator {
  return row.getByText(duration, { exact: true });
}

/** Las horas de una fila son el botón que abre el editor del horario (TT-54). */
function timesButton(row: Locator, start: string, end: string): Locator {
  return row.getByRole("button", { name: `${start} – ${end} — editar el horario` });
}

test("el rastreador muestra las filas y los totales en el completo, y el contador sigue sin relleno", async ({
  page,
  email,
}) => {
  skipNearMidnight();
  const now = today();
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "Primera", day: now, start: "00:00:00", end: "00:01:40" },
    { description: "Segunda", day: now, start: "00:05:00", end: "00:06:40" },
  ]);
  await page.reload();

  // Criterios 7 y 8 (D-WS2a-5): cada fila con sus segundos, y el día y la
  // semana con la suma exacta.
  const group = todayGroup(page);
  await expect(rowDuration(entryRow(group, "Primera"), "00:01:40")).toBeVisible();
  await expect(rowDuration(entryRow(group, "Segunda"), "00:01:40")).toBeVisible();
  await expect(totalOf(group)).toHaveText("Total 00:03:20");
  await expect(totalOf(trackerWeek(page, weekStartOf(now), now))).toHaveText(
    "Total 00:03:20",
  );

  // Con un timer, el contador sigue en `h:mm:ss` sin relleno y el total del
  // día, en el completo, sube de un segundo al siguiente (C1, PF-22).
  await seedRunningEntry(email, "Timer del completo");
  await page.reload();
  await expect(elapsedCounter(trackerBar(page))).toHaveText(COUNTER);
  const total = totalOf(group);
  await expect(total).toHaveText(FULL_TOTAL);
  const before = (await total.textContent()) ?? "";
  await expect(total).not.toHaveText(before);
  await expect(total).toHaveText(FULL_TOTAL);
  await expect(elapsedCounter(trackerBar(page))).toHaveText(COUNTER);
});

test("la barra manual muestra la duración en el completo y acepta lo que muestra", async ({
  page,
}) => {
  const now = today();
  const yesterday = addDays(now, -1);
  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  const duration = clockField(bar, "Duración");
  const end = clockField(bar, "Hora de fin");

  // C3: el borrador inicial no tiene duración.
  await expect(duration).toHaveValue("00:00:00");

  // Ayer, para que ninguna hora quede en el futuro.
  await pickDate(page, bar, yesterday, now);
  await setClock(bar, "Hora de inicio", "09:00");

  // C3, D-WS2a-6: lo tecleado se muestra en el completo, y el campo acepta su
  // propio valor editado.
  await setClock(bar, "Duración", "1:30");
  await expect(duration).toHaveValue("01:30:00");
  await expect(end).toHaveValue("10:30");
  await setClock(bar, "Duración", "01:45:00");
  await expect(duration).toHaveValue("01:45:00");
  await expect(end).toHaveValue("10:45");

  await descriptionInput(bar).fill("Manual completa");
  await withServerAction(page, () => addButton(bar).click());
  const row = entryRow(trackerDay(page, yesterday, now), "Manual completa");
  await expect(rowDuration(row, "01:45:00")).toBeVisible();
  await expect(timesButton(row, "09:00", "10:45")).toBeVisible();
});

test("editar el horario de una fila muestra la duración del borrador mientras viaja y después la del servidor", async ({
  page,
  email,
}) => {
  const now = today();
  const day = addDays(lastWeekOf(now), 1);
  await openTrackerFrom(page, day);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "Trío", day, start: "09:00:20", end: "09:02:00" },
  ]);
  await openTrackerFrom(page, day);

  const group = trackerDay(page, day, now);
  const row = entryRow(group, "Trío");
  await expect(rowDuration(row, "00:01:40")).toBeVisible();
  await expect(totalOf(group)).toHaveText("Total 00:01:40");

  const release = await holdActionResponses(page, isTrackerPage);
  await timesButton(row, "09:00", "09:02").click();
  await expect(clockField(row, "Hora de inicio")).toBeFocused();
  await page.keyboard.press("Tab");
  const end = clockField(row, "Hora de fin");
  await expect(end).toBeFocused();
  await end.fill("10:00");
  await page.keyboard.press("Tab");
  await expect(dateButton(row)).toBeFocused();

  // C2: mientras se edita y mientras viaja, el borrador en minutos enteros.
  await expect(rowDuration(row, "01:00:00")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(row).toHaveAttribute("aria-busy", "true");
  await expect(rowDuration(row, "01:00:00")).toBeVisible();

  // S1: el inicio no cambió y conserva sus segundos, así que el servidor deja
  // 59 minutos y 40 segundos.
  await withServerAction(page, async () => release());
  await expect(row).toHaveAttribute("aria-busy", "false");
  await expect(rowDuration(row, "00:59:40")).toBeVisible();
  await expect(totalOf(group)).toHaveText("Total 00:59:40");
});

test("la planilla muestra celdas y totales en el completo y escribe minutos sin salto al llegar la foto", async ({
  page,
  email,
}) => {
  const project = `Completo ${uniqueSuffix()}`;
  await seedProject({ name: project });
  const now = today();
  const week = lastWeekOf(now);
  const monday = week;
  const tuesday = addDays(week, 1);
  await openTimesheetWeek(page, week, now);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "a", day: monday, start: "10:00:00", end: "10:01:40", project },
    { description: "b", day: monday, start: "12:00:00", end: "12:01:40", project },
    { description: "c", day: tuesday, start: "10:00:00", end: "10:01:40", project },
  ]);
  await openTimesheetWeek(page, week, now);

  // Criterio 8 en la planilla: cada celda y cada total con la suma exacta.
  const two = cellField(page, project, monday, now);
  const one = cellField(page, project, tuesday, now);
  await expect(two).toHaveValue("00:03:20");
  await expect(one).toHaveValue("00:01:40");
  await expect(rowTotal(page, project)).toHaveText("00:05:00");
  await expect(sheetDayTotal(page, week, monday)).toHaveText("00:03:20");
  await expect(sheetDayTotal(page, week, tuesday)).toHaveText("00:01:40");
  await expect(sheetWeekTotal(page)).toHaveText("00:05:00");

  // D-WS2a-8, TS-36: «sin cambios» se decide en minutos. `3` sobre `00:03:20`
  // no manda nada y el campo vuelve al rótulo de la celda.
  const sent = recordActions(page);
  await two.fill("3");
  await two.press("Tab");
  await expect(two).toHaveValue("00:03:20");

  // D-WS2a-8: con varias entradas, `5` deja la celda en `00:05:20` mientras
  // viaja y después, y los totales la siguen.
  const release = await holdCellWrites(page, monday);
  const requested = page.waitForRequest(isCellWriteFor(monday));
  await two.fill("5");
  await two.press("Tab");
  await requested;
  await expect(two).toHaveAttribute("aria-busy", "true");
  await expect(two).toHaveValue("00:05:20");
  await expect(rowTotal(page, project)).toHaveText("00:07:00");
  await expect(sheetDayTotal(page, week, monday)).toHaveText("00:05:20");
  await expect(sheetWeekTotal(page)).toHaveText("00:07:00");
  const answered = page.waitForResponse((response) =>
    isCellWriteFor(monday)(response.request()),
  );
  release();
  expect((await answered).ok()).toBe(true);
  await expect(two).not.toHaveAttribute("aria-busy", "true");
  await expect(two).toHaveValue("00:05:20");
  await expect(rowTotal(page, project)).toHaveText("00:07:00");
  await expect(sheetDayTotal(page, week, monday)).toHaveText("00:05:20");
  await expect(sheetWeekTotal(page)).toHaveText("00:07:00");
  // El único pedido es el de `5`: el de `3` habría salido antes.
  expect(sent).toHaveLength(1);
  expect(isCellWriteFor(monday)(sent[0])).toBe(true);

  // Con una sola entrada, la celda queda en los minutos escritos.
  await writeCell(page, one, "5");
  await expect(one).toHaveValue("00:05:00");
  await expect(rowTotal(page, project)).toHaveText("00:10:20");
  await expect(sheetDayTotal(page, week, tuesday)).toHaveText("00:05:00");
  await expect(sheetWeekTotal(page)).toHaveText("00:10:20");

  // TS-42: el detalle muestra cada entrada con su rótulo del servidor. Subir
  // agregó una de dos minutos (TS-34).
  const twoName = cellName(project, monday, now);
  const trigger = cellMenuButton(page, twoName);
  await expect(trigger).not.toHaveAttribute("aria-disabled", "true");
  await trigger.click();
  await cellMenuItem(page, "Ver detalle").click();
  const detail = cellDetailDialog(page, twoName);
  await expect(detail.getByText("00:01:40", { exact: true })).toHaveCount(2);
  await expect(detail.getByText("00:02:00", { exact: true })).toHaveCount(1);
  await detail.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(detail).toBeHidden();

  // TS-53: el diálogo de quitar la fila suma en el completo.
  await removeRowButton(page, project).click();
  const remove = removeRowDialog(page, project);
  await expect(remove).toContainText(
    "Se van a borrar 4 entradas que suman 00:10:20. No se puede deshacer.",
  );
  await remove.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(remove).toBeHidden();
});

test("el calendario muestra bloques, totales, el diálogo y el arrastre en el completo", async ({
  page,
  email,
}) => {
  const now = today();
  const week = await openLastWeek(page, now);
  const tuesday = addDays(week, 1);
  const wednesday = addDays(week, 2);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "Bloque uno", day: tuesday, start: "10:00:00", end: "10:01:40" },
    { description: "Bloque dos", day: tuesday, start: "12:00:00", end: "12:01:40" },
    { description: "Arrastre", day: wednesday, start: "09:00:00", end: "10:00:20" },
  ]);
  await openLastWeek(page, now);

  // S1 y C1: los bloques con el rótulo del servidor, la columna y el período
  // con la suma exacta.
  const tuesdayColumn = dayColumn(page, tuesday, now);
  const wednesdayColumn = dayColumn(page, wednesday, now);
  const first = entryBlock(
    tuesdayColumn,
    closedBlockName({
      description: "Bloque uno",
      day: tuesday,
      today: now,
      start: "10:00",
      end: "10:01",
      duration: "00:01:40",
    }),
  );
  await expect(first).toBeVisible();
  await expect(
    entryBlock(
      tuesdayColumn,
      closedBlockName({
        description: "Bloque dos",
        day: tuesday,
        today: now,
        start: "12:00",
        end: "12:01",
        duration: "00:01:40",
      }),
    ),
  ).toBeVisible();
  await expect(tuesdayColumn).toHaveAccessibleName(columnName(tuesday, now, "00:03:20"));
  await expect(wednesdayColumn).toHaveAccessibleName(
    columnName(wednesday, now, "01:00:20"),
  );
  await expect(totalOf(calendarRegion(page))).toHaveText("Total 01:03:40");

  // C6: el campo «Duración» del diálogo muestra el rótulo del servidor y,
  // con el trío cambiado, el del borrador. «Cancelar» no guarda nada.
  await first.click();
  const dialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(dialog)).toHaveValue("Bloque uno");
  const duration = dialogClock(dialog, "Duración");
  await expect(duration).toHaveValue("00:01:40");
  await dialogClock(dialog, "Hora de fin").fill("10:30");
  await dialogClock(dialog, "Hora de fin").press("Tab");
  await expect(duration).toHaveValue("00:30:00");
  await dialogButton(dialog, "Cancelar").click();
  await expect(dialog).toBeHidden();

  // C4: mientras viaja el arrastre, el bloque se dibuja con minutos enteros.
  const release = await holdActionResponses(page, isCalendarPage);
  await dragBetween(
    page,
    { on: entryBlocks(wednesdayColumn, "Arrastre"), y: BODY_GRIP_PX },
    () => grabPoint(page, wednesday, now, "11:00"),
  );
  const moved = entryBlock(
    wednesdayColumn,
    closedBlockName({
      description: "Arrastre",
      day: wednesday,
      today: now,
      start: "11:00",
      end: "12:00",
      duration: "01:00:00",
    }),
  );
  await expect(moved).toHaveAttribute("aria-busy", "true");
  await withServerAction(page, async () => release());
  await expect(moved).not.toHaveAttribute("aria-busy", "true");
  await expect(wednesdayColumn).toHaveAccessibleName(
    columnName(wednesday, now, "01:00:00"),
  );
  await expect(totalOf(calendarRegion(page))).toHaveText("Total 01:03:20");
});

test("el bloque del timer en el calendario avanza en el completo y su diálogo sigue con el contador", async ({
  page,
  email,
}) => {
  skipNearMidnight();
  const now = today();
  await page.goto(calendarHref(weekStartOf(now)));
  await expect(calendarRegion(page)).toBeVisible();
  await seedRunningEntry(email, "Timer del calendario");
  await page.reload();

  // C5, D-WS2a-7: el transcurrido del bloque es una duración, y avanza.
  const timer = entryBlocks(dayColumn(page, now, now), "Timer del calendario");
  await expect(timer).toContainText(RUNNING_DURATION);
  const before = (await timer.textContent()) ?? "";
  await expect(timer).not.toHaveText(before);
  await expect(timer).toContainText(RUNNING_DURATION);

  // PF-22, CAL-66: el diálogo dice «Fin: en curso» con el contador.
  await timer.click();
  const dialog = entryDialog(page, "Timer en curso");
  await expect(dialog.getByText("Fin: en curso", { exact: true })).toBeVisible();
  await expect(elapsedCounter(dialog)).toHaveText(COUNTER);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

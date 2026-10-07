import type { Locator, Page } from "@playwright/test";

import {
  CALENDAR_PATH,
  calendarHref,
  calendarNavLink,
  calendarRegion,
  closedBlockName,
  columnName,
  dayColumn,
  dayColumns,
  dialogButton,
  entryBlock,
  entryBlocks,
  entryDialog,
  expectEditDialog,
  expectPeriod,
  expectZoom,
  followPeriodLink,
  goToCalendarByNav,
  headerLook,
  minuteHeight,
  NEAR_MIDNIGHT_MINUTES,
  NEAR_MIDNIGHT_REASON,
  NOW_LINE_TOLERANCE_PX,
  nowLine,
  nowLineMetrics,
  blockDetail,
  periodLink,
  periodTotal,
  PERSON_TIMEZONE,
  pickPeriodDay,
  rangeButton,
  runningBlockName,
  segmentText,
  todayHeader,
  zoomButton,
  zoomIn,
  boxOf,
} from "./calendar-page";
import {
  addDays,
  dayKeyOf,
  dayLabel,
  minuteOfDayIn,
  todayIn,
  weekdayLabel,
  weekLabel,
  weekStartOf,
  type CivilDay,
} from "./days";
import { withServerAction } from "./network";
import { expect, test } from "./session";
import {
  chooseFormat,
  chooseMode,
  dateButton,
  dayTotal,
  descriptionInput,
  duplicateFromMenu,
  elapsedCounter,
  escapeRegExp,
  pickDate,
  setClock,
  startTimer,
  todayGroup,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos del slice 8: el calendario en lectura (§7 del contrato,
 * «Recorridos obligatorios»). La persona tiene `canTrack`, así que desde el
 * 8c cada bloque abre el diálogo de edición; estos recorridos solo miran sus
 * valores y cancelan, y la escritura está en `calendar-edit.spec.ts`. Tres
 * tests, uno por recorrido, porque cada uno
 * abre una sola sesión y el endpoint de sesión ya responde 429 con la suite
 * completa; la segunda pestaña es otra página del mismo contexto, que comparte
 * la cookie. Las entradas cerradas se cargan en `/` con el modo manual y van
 * en la semana anterior: ninguna hora queda en el futuro y la semana siempre
 * tiene todos sus días. Toda persona nueva tiene el lunes como primer día de
 * la semana (PF-16) y el formato de fecha `dd/MM/yyyy`; lo esperado se calcula
 * con `days.ts`, no con el código que lo produce. Sin reloj emulado: el total,
 * la línea de ahora y el bloque del timer se anclan en el `serverNow`.
 */

/** El total de una semana o de un día en `/`: la etiqueta y el valor. */
const TOTAL = /^Total \d+:\d{2}$/;

/**
 * Carga una entrada desde la barra manual, ya abierta, y espera a que el
 * servidor la haya escrito. La descripción vacía y la fecha de vuelta en hoy
 * dicen que la barra quedó lista para la siguiente.
 */
async function addEntry(
  page: Page,
  description: string,
  day: CivilDay,
  today: CivilDay,
  start: string,
  end: string,
): Promise<void> {
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await pickDate(page, bar, day, today);
  await setClock(bar, "Hora de inicio", start);
  await setClock(bar, "Hora de fin", end);
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(dateButton(bar)).toHaveText("Hoy");
}

/**
 * El total de una semana de `/`, por el rótulo de su franja (TT-47). Está en
 * su encabezado, antes que los días, así que es el primero de la franja.
 */
function trackerWeekTotal(page: Page, start: CivilDay, today: CivilDay): Locator {
  return page
    .getByRole("region", { name: weekLabel(start, today), exact: true })
    .getByText(TOTAL)
    .first();
}

/** Los minutos de un total «Total h:mm» o «h:mm». */
async function minutesOf(total: Locator): Promise<number> {
  const text = (await total.textContent()) ?? "";
  const match = /(\d+):(\d{2})$/.exec(text.trim());
  if (match === null) {
    throw new Error(`El total no se pudo leer: «${text}»`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Un total en `h:mm` (PF-20). */
function durationText(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** El alto de un bloque llega al esperado, con un margen de dos píxeles. */
async function expectHeight(element: Locator, pixels: number): Promise<void> {
  await expect
    .poll(async () => Math.abs((await boxOf(element)).height - pixels))
    .toBeLessThanOrEqual(2);
}

test("el calendario se abre desde la navegación, navega por semanas y días y dibuja con los formatos de la persona", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const lastWednesday = addDays(lastWeek, 2);
  const yesterday = addDays(today, -1);
  // Un día de esta semana que no es hoy y que ya está dentro del piso del
  // workspace: el de hoy se compara contra él (CAL-09).
  const otherDay = dayKeyOf(today) === dayKeyOf(thisWeek) ? addDays(today, 1) : yesterday;
  const description = "reunión del miércoles";

  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, description, lastWednesday, today, "09:00", "10:00");

  // Otra pestaña de la misma sesión elige 12 h y se cierra. Esta no se
  // entera: su layout sigue con los formatos que leyó al entrar.
  const other = await page.context().newPage();
  await other.goto("/perfil");
  await chooseFormat(other, "Formato de hora", "12 horas");
  await other.close();

  // Criterio 1: «Calendario» va después de «Inicio» y queda marcado.
  await expect(
    page.getByRole("navigation", { name: "Principal" }).getByRole("link"),
  ).toContainText(["Inicio", "Calendario", "Proyectos"]);
  await goToCalendarByNav(page);
  await expect(calendarNavLink(page)).toHaveAttribute("aria-current", "page");

  // Criterios 2 y 7: siete columnas desde el lunes, con el rótulo del día, y
  // la de hoy marcada; sin `semana`, la semana actual.
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir fecha: Esta semana");
  const columns = dayColumns(page);
  await expect(columns).toHaveCount(7);
  for (let index = 0; index < 7; index += 1) {
    const day = addDays(thisWeek, index);
    await expect(columns.nth(index)).toHaveAccessibleName(
      new RegExp(`^${escapeRegExp(weekdayLabel(day, today))}`),
    );
  }
  await expect(todayHeader(page)).toHaveCount(1);
  await expect(todayHeader(page)).toContainText(weekdayLabel(today, today));
  expect(await headerLook(dayColumn(page, today, today))).not.toBe(
    await headerLook(dayColumn(page, otherDay, today)),
  );
  await expect(periodLink(page, "Hoy")).toHaveAttribute("aria-current");
  await expect(periodLink(page, "Semana")).toHaveAttribute("aria-current", "page");

  // Criterio 16 (CAL-14) y CAL-35: con hoy en el período, la línea de ahora
  // está en la columna de hoy y la grilla abre con ella a la vista.
  await expect(nowLine(calendarRegion(page))).toHaveCount(1);
  await expect(nowLine(dayColumn(page, today, today))).toBeInViewport();

  // CAL-14 y CAL-35, sin depender de que la hora quede a la vista: la grilla
  // abre desplazada una hora por encima de ahora, así que la línea queda una
  // franja (48 px a «1 h») debajo del encabezado. El desplazamiento no baja de
  // cero antes de la 01:00, ni pasa del final de la grilla a la noche: ahí la
  // línea queda más abajo, en la posición que dan esos topes.
  const hourScale = minuteHeight("1 h");
  await expect
    .poll(async () => {
      const minute = minuteOfDayIn(PERSON_TIMEZONE);
      const { belowHeader, maxScroll } = await nowLineMetrics(
        dayColumn(page, today, today),
      );
      const scroll = Math.min(Math.max(0, (minute - 60) * hourScale), maxScroll);
      return Math.abs(belowHeader - (minute * hourScale - scroll));
    })
    .toBeLessThanOrEqual(NOW_LINE_TOLERANCE_PX);

  // Criterio 3: «Semana anterior» lleva a su semana con la URL normalizada.
  await followPeriodLink(page, "Semana anterior", lastWeek, "week", "Semana anterior");
  await expect(periodLink(page, "Hoy")).not.toHaveAttribute("aria-current");
  await expect(nowLine(page)).toHaveCount(0);
  await expect(todayHeader(page)).toHaveCount(0);

  // Criterio 7: el bloque, dibujado con las 12 h que eligió la otra pestaña.
  const wednesday = dayColumn(page, lastWednesday, today);
  const block = entryBlock(
    wednesday,
    closedBlockName({
      description,
      day: lastWednesday,
      today,
      start: "9:00 AM",
      end: "10:00 AM",
      duration: "1:00",
    }),
  );
  await expect(block).toBeVisible();
  await expect(block).toContainText("9:00 AM – 10:00 AM");

  // Criterio 16 (CAL-14): sin hoy en el período, las 08:00 arriba. El eje se
  // rotula con el formato de la persona.
  const region = calendarRegion(page);
  await expect(region.getByText("8:00 AM", { exact: true })).toBeInViewport();
  await expect(region.getByText("6:00 AM", { exact: true })).not.toBeInViewport();

  // CAL-74: el bloque abre su diálogo de edición con un clic, y las horas de
  // sus campos también van en 12 h (PF-13). `Esc` cancela y devuelve el foco
  // al bloque.
  await block.click();
  const dialog = entryDialog(page, "Editar entrada");
  await expectEditDialog(dialog, {
    description,
    date: dayLabel(lastWednesday, today),
    start: "9:00 AM",
    end: "10:00 AM",
    duration: "1:00",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(block).toBeFocused();

  // Criterio 3: «Hoy» vuelve a la semana actual.
  await followPeriodLink(page, "Hoy", thisWeek, "week", "Esta semana");
  await expect(periodLink(page, "Hoy")).toHaveAttribute("aria-current");

  // Criterios 2 y 3: «Día» abre hoy, una sola columna, rotulada «Hoy» en el
  // rango y con el día en la columna; las flechas van de a un día.
  await followPeriodLink(page, "Día", today, "day", "Hoy");
  await expect(dayColumns(page)).toHaveCount(1);
  await expect(dayColumn(page, today, today)).toBeVisible();
  await expect(periodLink(page, "Día")).toHaveAttribute("aria-current", "page");
  await followPeriodLink(page, "Día anterior", yesterday, "day", "Ayer");
  await expect(dayColumns(page)).toHaveCount(1);
  await followPeriodLink(page, "Día siguiente", today, "day", "Hoy");

  // «Semana» vuelve a la semana del día que se ve.
  await followPeriodLink(page, "Semana", thisWeek, "week", "Esta semana");
  await expect(dayColumns(page)).toHaveCount(7);

  // Criterio 3 (CAL-16): el selector del rango lleva a la semana de un día de
  // hace un mes. La URL puede llevar el día elegido, que el servidor
  // interpreta como su semana (CAL-17), pero los enlaces ya van normalizados.
  const monthAgo = addDays(today, -30);
  const monthAgoWeek = weekStartOf(monthAgo);
  await pickPeriodDay(page, monthAgo);
  await expect(rangeButton(page)).toHaveAccessibleName(
    `Elegir fecha: ${weekLabel(monthAgoWeek, today)}`,
  );
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === CALENDAR_PATH &&
      [dayKeyOf(monthAgo), dayKeyOf(monthAgoWeek)].includes(
        url.searchParams.get("semana") ?? "",
      ),
  );
  await expect(rangeButton(page)).toBeFocused();
  await expect(dayColumns(page).first()).toHaveAccessibleName(
    new RegExp(`^${escapeRegExp(weekdayLabel(monthAgoWeek, today))}`),
  );
  await expect(periodLink(page, "Semana anterior")).toHaveAttribute(
    "href",
    calendarHref(addDays(monthAgoWeek, -7)),
  );
  await expect(periodLink(page, "Semana siguiente")).toHaveAttribute(
    "href",
    calendarHref(addDays(monthAgoWeek, 7)),
  );

  // CAL-07: en una semana sin hoy, «Día» abre su primer día.
  await followPeriodLink(page, "Día", monthAgoWeek, "day", dayLabel(monthAgoWeek, today));

  // Criterio 2: un día de mitad de semana dibuja la semana que lo contiene, y
  // `vista=dia` una sola columna.
  await page.goto(`${CALENDAR_PATH}?semana=${dayKeyOf(lastWednesday)}`);
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir fecha: Semana anterior");
  await expect(dayColumns(page)).toHaveCount(7);
  await expect(periodLink(page, "Semana siguiente")).toHaveAttribute(
    "href",
    calendarHref(thisWeek),
  );
  await page.goto(`${calendarHref(lastWednesday, "day")}`);
  await expectPeriod(page, lastWednesday, "day", dayLabel(lastWednesday, today));
  await expect(dayColumns(page)).toHaveCount(1);

  // Criterio 2: un día inválido, repetido o cuyo período no se puede navegar
  // dibuja la semana actual. Cada uno se carga después de una semana que no
  // es la actual, así el rótulo no puede venir de la carga anterior.
  for (const query of [
    "semana=2026-02-30",
    `semana=${dayKeyOf(lastWednesday)}&semana=${dayKeyOf(lastWednesday)}`,
    "semana=9999-12-31",
    "semana=0100-01-01",
  ]) {
    await page.goto(calendarHref(lastWeek));
    await expect(rangeButton(page)).toHaveAccessibleName("Elegir fecha: Semana anterior");
    await page.goto(`${CALENDAR_PATH}?${query}`);
    await expect(rangeButton(page)).toHaveAccessibleName("Elegir fecha: Esta semana");
    await expect(dayColumns(page)).toHaveCount(7);
  }

  // Criterio 16 (CAL-11, CAL-12): el zoom arranca en una hora, «Alejar» no
  // actúa en su extremo, «Acercar» pasa a 30 minutos y sobrevive a la recarga.
  // El tamaño de la franja cambia la grilla: el bloque de una hora mide una
  // franja a «1 h» y dos a «30 min», también después de recargar, cuando el
  // zoom llega desde la cookie.
  await page.goto(calendarHref(lastWeek));
  await expectZoom(page, "1 h");
  await expect(zoomButton(page, "Alejar")).toHaveAttribute("aria-disabled", "true");
  await expectHeight(block, 60 * minuteHeight("1 h"));
  await zoomIn(page, "30 min");
  await expectHeight(block, 60 * minuteHeight("30 min"));
  await page.reload();
  await expectZoom(page, "30 min");
  await expectHeight(block, 60 * minuteHeight("30 min"));
});

test("los totales son los de la lista, la entrada de medianoche se parte en dos columnas y las superpuestas van lado a lado", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = addDays(weekStartOf(today), -7);
  const tuesday = addDays(lastWeek, 1);
  const thursday = addDays(lastWeek, 3);
  const friday = addDays(lastWeek, 4);
  const midnight = "guardia de medianoche";
  const overlap = "revisión en paralelo";

  // Una de 22:00 a 02:00 del jueves, y dos iguales de 09:00 a 10:00 del
  // martes: la segunda es la copia de la primera.
  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, midnight, thursday, today, "22:00", "02:00");
  await addEntry(page, overlap, tuesday, today, "09:00", "10:00");
  await withServerAction(page, () => duplicateFromMenu(page, overlap));
  await expect(page.getByRole("listitem").filter({ hasText: overlap })).toHaveCount(2);

  // Criterio 5: el total de la semana anterior en `/`. La de medianoche suma
  // entera en el jueves (P-02).
  await expect(trackerWeekTotal(page, lastWeek, today)).toHaveText("Total 6:00");

  await goToCalendarByNav(page);
  await followPeriodLink(page, "Semana anterior", lastWeek, "week", "Semana anterior");

  // Criterio 5: el mismo total de la semana, y cada día suma las cerradas que
  // empiezan en él: el viernes no suma nada de la de medianoche.
  await expect(periodTotal(page)).toHaveText("Total 6:00");
  await expect(dayColumn(page, thursday, today)).toHaveAccessibleName(
    columnName(thursday, today, "4:00"),
  );
  await expect(dayColumn(page, friday, today)).toHaveAccessibleName(
    columnName(friday, today, "0:00"),
  );
  await expect(dayColumn(page, tuesday, today)).toHaveAccessibleName(
    columnName(tuesday, today, "2:00"),
  );

  // Criterios 8 y 14: la de medianoche tiene un segmento en cada columna y un
  // solo botón, el del jueves, con el superíndice en el nombre.
  const region = calendarRegion(page);
  const thursdayColumn = dayColumn(page, thursday, today);
  const fridayColumn = dayColumn(page, friday, today);
  const midnightBlock = entryBlock(
    thursdayColumn,
    closedBlockName({
      description: midnight,
      day: thursday,
      today,
      start: "22:00",
      end: "02:00",
      extraDays: 1,
      duration: "4:00",
    }),
  );
  await expect(entryBlocks(region, midnight)).toHaveCount(1);
  await expect(midnightBlock).toBeVisible();
  await expect(segmentText(thursdayColumn, midnight)).toBeVisible();
  await expect(segmentText(fridayColumn, midnight)).toBeVisible();
  await expect(entryBlocks(fridayColumn, midnight)).toHaveCount(0);

  // Criterio 9: las dos del martes son dos botones con el mismo nombre, a la
  // misma altura y lado a lado, sin pisarse.
  const tuesdayColumn = dayColumn(page, tuesday, today);
  const overlaps = entryBlock(
    tuesdayColumn,
    closedBlockName({
      description: overlap,
      day: tuesday,
      today,
      start: "09:00",
      end: "10:00",
      duration: "1:00",
    }),
  );
  await expect(overlaps).toHaveCount(2);
  const first = await boxOf(overlaps.nth(0));
  const second = await boxOf(overlaps.nth(1));
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  expect(Math.abs(first.height - second.height)).toBeLessThan(1);
  const apart =
    first.x + first.width <= second.x + 1 || second.x + second.width <= first.x + 1;
  expect(apart, "los dos bloques del martes se pisan").toBe(true);

  // Criterios 13 y 14: `Tab` va del primero al segundo; `Enter` abre su
  // diálogo de edición, y «Cancelar» devuelve el foco al botón.
  await overlaps.nth(0).focus();
  await page.keyboard.press("Tab");
  await expect(overlaps.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  const tuesdayDialog = entryDialog(page, "Editar entrada");
  await expectEditDialog(tuesdayDialog, {
    description: overlap,
    date: dayLabel(tuesday, today),
    start: "09:00",
    end: "10:00",
    duration: "1:00",
  });
  await dialogButton(tuesdayDialog, "Cancelar").click();
  await expect(tuesdayDialog).toBeHidden();
  await expect(overlaps.nth(1)).toBeFocused();
  // El puntero quedó donde estaba «Cancelar». El `Tab` de abajo desplaza la
  // grilla hasta el jueves, y si su bloque queda debajo del puntero, el hover
  // vuelve a abrir el detalle que `Esc` cierra. Lo que se prueba es el
  // teclado: el puntero va a la esquina, fuera de la grilla.
  await page.mouse.move(0, 0);

  // Criterio 14: `Tab` sigue en orden cronológico, al jueves, y con el foco
  // de teclado en el bloque aparece su detalle; `Esc` lo cierra.
  await page.keyboard.press("Tab");
  await expect(midnightBlock).toBeFocused();
  const detail = blockDetail(page, midnight, "22:00");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("02:00");
  await expect(detail).toContainText("4:00");
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(midnightBlock).toBeFocused();

  // Criterio 13: un clic en el segmento del viernes abre el diálogo de la
  // entrada entera, con el fin del día siguiente y su superíndice; `Esc`
  // devuelve el foco al botón, que está en el jueves.
  await segmentText(fridayColumn, midnight).click();
  const midnightDialog = entryDialog(page, "Editar entrada");
  await expectEditDialog(midnightDialog, {
    description: midnight,
    date: dayLabel(thursday, today),
    start: "22:00",
    end: "02:00",
    duration: "4:00",
  });
  await expect(midnightDialog).toContainText("+1");
  await page.keyboard.press("Escape");
  await expect(midnightDialog).toBeHidden();
  await expect(midnightBlock).toBeFocused();
});

test("el timer se dibuja en la columna de hoy hasta la línea de ahora y suma en los totales", async ({
  page,
}) => {
  const minute = minuteOfDayIn(PERSON_TIMEZONE);
  test.skip(
    minute < NEAR_MIDNIGHT_MINUTES || minute > 1440 - NEAR_MIDNIGHT_MINUTES,
    NEAR_MIDNIGHT_REASON,
  );
  const today = todayIn(PERSON_TIMEZONE);
  const thisWeek = weekStartOf(today);
  const description = "timer del calendario";

  // Un timer que empezó a las 00:00 de hoy, con el editor de TT-28.
  await page.goto("/");
  await startTimer(page, description);
  await page.getByRole("button", { name: "Editar la hora de inicio" }).click();
  await page.getByRole("textbox", { name: "Hora de inicio" }).fill("00:00");
  await page.keyboard.press("Tab");
  await withServerAction(page, () =>
    page.getByRole("button", { name: "Guardar" }).click(),
  );

  // Los totales de `/` con lo que va del día. El contador del grupo nace en
  // la lectura del servidor, así que se espera que no esté en cero.
  await page.reload();
  const trackerDay = dayTotal(todayGroup(page));
  const trackerWeek = trackerWeekTotal(page, thisWeek, today);
  await expect(trackerDay).not.toHaveText("Total 0:00");
  await expect(trackerWeek).not.toHaveText("Total 0:00");
  const dayMinutes = await minutesOf(trackerDay);
  const weekMinutes = await minutesOf(trackerWeek);

  await goToCalendarByNav(page);
  await expect(rangeButton(page)).toHaveAccessibleName("Elegir fecha: Esta semana");

  // Criterio 6 (CAL-38): el bloque del timer en la columna de hoy, y la línea
  // de ahora solo ahí (criterio 12).
  const region = calendarRegion(page);
  const todayColumn = dayColumn(page, today, today);
  const timer = entryBlock(
    todayColumn,
    runningBlockName({ description, day: today, today, start: "00:00" }),
  );
  await expect(timer).toBeVisible();
  await expect(timer).toContainText("en curso");
  await expect(nowLine(region)).toHaveCount(1);
  await expect(nowLine(todayColumn)).toHaveCount(1);

  // Criterio 6 (CAL-34): los dos totales suman el timer. Son los de `/` o un
  // minuto más, porque el contador sigue entre las dos lecturas; ninguno de
  // los dos es «0:00», porque `/` ya no lo era.
  const sameOrNext = (minutes: number): string[] => [
    durationText(minutes),
    durationText(minutes + 1),
  ];
  await expect(todayColumn).toHaveAccessibleName(
    columnName(today, today, sameOrNext(dayMinutes)),
  );
  await expect(periodTotal(page)).toHaveText(
    new RegExp(`^Total (?:${sameOrNext(weekMinutes).join("|")})$`),
  );

  // Criterio 6: a 5 minutos por franja un minuto mide 9,6 px y la altura
  // mínima ya no manda, así que el borde inferior del bloque es el de ahora.
  await zoomIn(page, "30 min");
  await zoomIn(page, "15 min");
  await zoomIn(page, "5 min");
  await expect(zoomButton(page, "Acercar")).toHaveAttribute("aria-disabled", "true");
  await expect
    .poll(async () => {
      const block = await boxOf(timer);
      const line = await boxOf(nowLine(todayColumn));
      return Math.abs(block.y + block.height - (line.y + line.height / 2));
    })
    .toBeLessThan(NOW_LINE_TOLERANCE_PX);

  // Criterio 12 (CAL-36): la línea está en la hora real de la persona, no solo
  // donde termina el bloque, que sale del mismo minuto. A «5 min» un minuto
  // mide 9,6 px; se toleran dos.
  const fiveMinuteScale = minuteHeight("5 min");
  await expect
    .poll(async () => {
      const { fromColumnTop } = await nowLineMetrics(todayColumn);
      return Math.abs(fromColumnTop - minuteOfDayIn(PERSON_TIMEZONE) * fiveMinuteScale);
    })
    .toBeLessThanOrEqual(2 * fiveMinuteScale);

  // Criterio 12: sin hoy en el período no hay línea.
  await followPeriodLink(
    page,
    "Semana anterior",
    addDays(thisWeek, -7),
    "week",
    "Semana anterior",
  );
  await expect(nowLine(page)).toHaveCount(0);

  // Criterio 13: de vuelta, el bloque abre con `Espacio` el diálogo del
  // timer, con el fin en curso y el transcurrido; `Esc` devuelve el foco.
  await followPeriodLink(page, "Hoy", thisWeek, "week", "Esta semana");
  await timer.focus();
  await page.keyboard.press("Space");
  const dialog = entryDialog(page, "Timer en curso");
  await expectEditDialog(dialog, { description, date: "Hoy", start: "00:00" });
  await expect(elapsedCounter(dialog)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(timer).toBeFocused();
});

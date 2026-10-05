import type { Locator, Page, Request } from "@playwright/test";

import {
  blockHandle,
  BODY_GRIP_PX,
  boxOf,
  calendarHref,
  calendarRegion,
  calendarSelection,
  chooseDialogAction,
  clickSlot,
  closedBlockName,
  columnName,
  dayColumn,
  deleteConfirmation,
  dialogButton,
  dialogClock,
  dialogDescription,
  dragBetween,
  entryBlock,
  entryBlocks,
  entryDialog,
  expectEditDialog,
  expectPeriod,
  hoverAt,
  minuteHeight,
  grabPoint,
  gridScroller,
  isCalendarPage,
  moveTo,
  openDetails,
  PERSON_TIMEZONE,
  pressAt,
  screenNotice,
  scrollGridTo,
  segmentText,
  settle,
  slotOffset,
  slotPoint,
  zoomButton,
  zoomIn,
  type ScreenPoint,
  type ZoomSize,
} from "./calendar-page";
import { addDays, dayLabel, todayIn, weekStartOf, type CivilDay } from "./days";
import {
  holdActionResponses,
  holdRefreshes,
  loseActionResponses,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import { escapeRegExp } from "./tracker-page";

/**
 * Recorridos del slice 8b: los gestos de arrastre del calendario (§7 del
 * contrato, «Recorridos obligatorios de `e2e/calendar-drag.spec.ts`»). Cuatro
 * tests, uno por recorrido, porque cada uno abre una sola sesión. Las entradas
 * van en la semana anterior, creadas con un clic en la franja y el diálogo, y
 * se arrastran con `page.mouse`: la grilla de una semana sin hoy abre con las
 * 08:00 arriba (CAL-14), así que las franjas de la mañana están a la vista.
 * Los pedidos se cuentan con `page.on("request")`, y cada ausencia se afirma
 * después de `settle`, un paso que sincroniza con la página. Sin reloj
 * emulado.
 */

/** El título del aviso de un gesto que no se guardó: el de la fila (CAL-62). */
const TIMES_NOT_SAVED = "No se pudo guardar el horario de la entrada.";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** Lo que pidió la página a `/calendario` desde que se empezó a contar. */
type CalendarRequests = { actions: number; refreshes: number };

/**
 * Una revalidación de la pantalla (`router.refresh`): un `GET` a
 * `/calendario` que no es una action ni el prefetch de un enlace de la barra,
 * que Next vuelve a pedir solo, con o sin gesto.
 */
function isRefresh(request: Request): boolean {
  const headers = request.headers();
  return (
    request.method() === "GET" &&
    headers["next-action"] === undefined &&
    headers["next-router-prefetch"] === undefined &&
    isCalendarPage(new URL(request.url()))
  );
}

/**
 * Cuenta las server actions (cabecera `next-action`) y las revalidaciones
 * (`GET` a `/calendario`) que salen de la página.
 */
function countRequests(page: Page): CalendarRequests {
  const counts: CalendarRequests = { actions: 0, refreshes: 0 };
  page.on("request", (request) => {
    if (!isCalendarPage(new URL(request.url()))) {
      return;
    }
    if (request.headers()["next-action"] !== undefined) {
      counts.actions += 1;
    } else if (isRefresh(request)) {
      counts.refreshes += 1;
    }
  });
  return counts;
}

/** Abre la semana anterior a la de hoy y espera su rótulo. */
async function openLastWeek(page: Page, today: CivilDay): Promise<CivilDay> {
  const lastWeek = addDays(weekStartOf(today), -7);
  await page.goto(calendarHref(lastWeek));
  await expectPeriod(page, lastWeek, "week", "Semana anterior");
  // CAL-14: la grilla abre con las 08:00 arriba, en un efecto después del
  // primer dibujo. Hasta que llega, las cajas se mueven.
  await expect
    .poll(async () => (await gridScroller(page)).scrollTop)
    .toBe(8 * 60 * minuteHeight("1 h"));
  return lastWeek;
}

/**
 * Crea una entrada con un clic en su franja y el diálogo del 8c, con el fin
 * que se pida, y espera que el servidor la haya escrito.
 */
async function addEntry(
  page: Page,
  entry: {
    readonly day: CivilDay;
    readonly today: CivilDay;
    readonly start: string;
    readonly end?: string;
    readonly description: string;
    readonly size?: ZoomSize;
  },
): Promise<void> {
  await clickSlot(page, entry.day, entry.today, entry.start, entry.size);
  const dialog = entryDialog(page, "Agregar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  await dialogDescription(dialog).fill(entry.description);
  if (entry.end !== undefined) {
    await dialogClock(dialog, "Hora de fin").fill(entry.end);
    await dialogClock(dialog, "Hora de fin").press("Tab");
  }
  await withServerAction(page, () => dialogButton(dialog, "Agregar").click());
  await expect(dialog).toBeHidden();
  // El foco va al bloque nuevo (§5.5 del 8c) y puede desplazar la grilla: se
  // espera antes de medir nada.
  await expect(entryBlocks(calendarRegion(page), entry.description)).toBeFocused();
}

/**
 * Reemplaza `document.visibilityState` por «hidden» y despacha
 * `visibilitychange`, como una pestaña que se oculta (CAL-63). `page.mouse`
 * no puede ocultar la pestaña.
 */
async function hideTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** Devuelve `visibilityState` al del documento, sin despachar nada. */
async function restoreTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });
}

/** Enfoca la ventana, que revalida por TT-40 salvo durante un gesto (CAL-89). */
async function focusWindow(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

/**
 * Lleva el foco a la región «Calendario», lo que hace un clic en un lugar
 * vacío de ella, y hace pasar una revalidación: el efecto de foco de la grilla
 * vuelve a correr con el dibujo nuevo. Si quedó un foco pendiente, ahí se lo
 * llevaría.
 */
async function focusRegionThroughRefresh(page: Page): Promise<void> {
  const region = calendarRegion(page);
  await region.focus();
  const refreshed = page.waitForResponse((response) => isRefresh(response.request()));
  await focusWindow(page);
  await refreshed;
  await settle(page);
}

/** Si el foco está adentro de `scope`, como el de una confirmación abierta. */
async function holdsFocus(scope: Locator): Promise<boolean> {
  return scope.evaluate((node) => node.contains(document.activeElement));
}

/**
 * El botón de un bloque detrás de un diálogo modal, que deja todo lo de
 * afuera con `aria-hidden`. Sirve para leerlo, no para usarlo.
 */
function blockBehindDialog(page: Page, description: string): Locator {
  return page.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(description)}, `),
    includeHidden: true,
  });
}

test("mover un bloque lo lleva al día y la franja del puntero, y soltarlo en su lugar o cancelar no pide nada", async ({
  page,
}) => {
  const requests = countRequests(page);
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const wednesday = addDays(lastWeek, 2);
  const thursday = addDays(lastWeek, 3);
  const friday = addDays(lastWeek, 4);
  const description = "Mover";

  await addEntry(page, { day: wednesday, today, start: "10:00", description });
  const original = entryBlock(
    dayColumn(page, wednesday, today),
    closedBlockName({
      description,
      day: wednesday,
      today,
      start: "10:00",
      end: "11:00",
      duration: "1:00",
    }),
  );
  const moved = entryBlock(
    dayColumn(page, thursday, today),
    closedBlockName({
      description,
      day: thursday,
      today,
      start: "14:00",
      end: "15:00",
      duration: "1:00",
    }),
  );

  // Criterio 11 (CAL-23, CAL-77): el puntero muestra el detalle, y con un
  // gesto en curso ningún bloque muestra el suyo, tampoco el que se dibuja en
  // el lugar candidato debajo del puntero (CAL-62).
  await hoverAt({ on: original, y: BODY_GRIP_PX });
  await expect(openDetails(page)).toHaveCount(1);
  await page.mouse.down();
  await moveTo(page, await grabPoint(page, wednesday, today, "12:00"));
  await expect(
    entryBlock(
      dayColumn(page, wednesday, today),
      closedBlockName({
        description,
        day: wednesday,
        today,
        start: "12:00",
        end: "13:00",
        duration: "1:00",
      }),
    ),
  ).toBeVisible();
  await expect(openDetails(page)).toHaveCount(0);

  // Criterio 1 (CAL-50, CAL-53): con el borde superior en la franja de las
  // 14:00 del jueves, soltar pide ese trío y el bloque queda ahí, con el foco
  // en su botón (criterio 12) y sin diálogo: un gesto no termina en clic.
  await moveTo(page, await grabPoint(page, thursday, today, "14:00"));
  await withServerAction(page, () => page.mouse.up());
  await expect(moved).toBeVisible();
  await expect(moved).toContainText("14:00 – 15:00");
  await expect(moved).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(dayColumn(page, wednesday, today)).toHaveAccessibleName(
    columnName(wednesday, today, "0:00"),
  );
  await expect(dayColumn(page, thursday, today)).toHaveAccessibleName(
    columnName(thursday, today, "1:00"),
  );

  // Criterio 1 (CAL-57): llevarlo al viernes y volver antes de soltar no pide.
  const home = (): Promise<ScreenPoint> => grabPoint(page, thursday, today, "14:00");
  const away = (): Promise<ScreenPoint> => grabPoint(page, friday, today, "14:00");
  let actions = requests.actions;
  await pressAt(page, { on: moved, y: BODY_GRIP_PX });
  await moveTo(page, await away());
  await moveTo(page, await home());
  await page.mouse.up();
  await expect(moved).toBeFocused();
  await settle(page);
  expect(requests.actions).toBe(actions);

  // Criterio 9 (CAL-63): `Esc` con el botón apretado devuelve el bloque al
  // jueves; soltar después sobre el fondo del viernes no pide, no abre el alta
  // de un clic, y el foco queda en el botón del bloque.
  actions = requests.actions;
  await pressAt(page, { on: moved, y: BODY_GRIP_PX });
  await moveTo(page, await away());
  await page.keyboard.press("Escape");
  await expect(moved).toBeVisible();
  await page.mouse.up();
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(moved).toBeFocused();
  expect(requests.actions).toBe(actions);

  // Criterio 9: la pestaña oculta cancela igual; restituida, soltar no pide
  // ni abre nada.
  actions = requests.actions;
  await pressAt(page, { on: moved, y: BODY_GRIP_PX });
  await moveTo(page, await away());
  await expect(moved).toHaveCount(0);
  await hideTab(page);
  await expect(moved).toBeVisible();
  await restoreTab(page);
  await page.mouse.up();
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests.actions).toBe(actions);

  // Criterio 12: con el foco ya en el botón al terminar, no queda un foco
  // pendiente que una revalidación lleve al bloque. El gesto no saca el bloque
  // de su columna, así que su botón conserva el foco de principio a fin; soltar
  // en su lugar no pide (CAL-57).
  actions = requests.actions;
  await pressAt(page, { on: moved, y: BODY_GRIP_PX });
  await moveTo(page, await grabPoint(page, thursday, today, "16:00"));
  await expect(moved).toHaveCount(0);
  await moveTo(page, await home());
  await page.mouse.up();
  await expect(moved).toBeFocused();
  await settle(page);
  expect(requests.actions).toBe(actions);
  await focusRegionThroughRefresh(page);
  await expect(calendarRegion(page)).toBeFocused();
  await expect(original).toHaveCount(0);
});

test("las asas estiran un extremo entre sus topes, y la medianoche se cruza moviendo y estirando", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const monday = lastWeek;
  const tuesday = addDays(lastWeek, 1);
  const wednesday = addDays(lastWeek, 2);
  const thursday = addDays(lastWeek, 3);

  // Criterio 2, a «30 min»: el asa de fin y la de inicio mueven un solo
  // extremo, con el borde en la marca más cercana al puntero.
  await zoomIn(page, "30 min");
  await scrollGridTo(page, "09:00", "30 min");
  await addEntry(page, {
    day: tuesday,
    today,
    start: "10:00",
    end: "11:00",
    description: "Estirar",
    size: "30 min",
  });
  const tuesdayColumn = dayColumn(page, tuesday, today);
  const stretched = entryBlocks(tuesdayColumn, "Estirar");
  await expect(stretched).toContainText("10:00 – 11:00");

  await expect(blockHandle(stretched, "end")).toHaveCount(1);
  await withServerAction(page, async () =>
    dragBetween(page, { on: blockHandle(stretched, "end") }, () =>
      slotPoint(page, tuesday, today, "12:30", "30 min"),
    ),
  );
  await expect(stretched).toContainText("10:00 – 12:30");
  await expect(stretched).toBeFocused();

  // CAL-55: por encima del inicio, el fin se detiene una franja después.
  await expect(blockHandle(stretched, "end")).toHaveCount(1);
  await withServerAction(page, async () =>
    dragBetween(page, { on: blockHandle(stretched, "end") }, () =>
      slotPoint(page, tuesday, today, "09:00", "30 min"),
    ),
  );
  await expect(stretched).toContainText("10:00 – 10:30");
  await expect(stretched).toBeFocused();

  await expect(blockHandle(stretched, "start")).toHaveCount(1);
  await withServerAction(page, async () =>
    dragBetween(page, { on: blockHandle(stretched, "start") }, () =>
      slotPoint(page, tuesday, today, "09:00", "30 min"),
    ),
  );
  await expect(stretched).toHaveAccessibleName(
    closedBlockName({
      description: "Estirar",
      day: tuesday,
      today,
      start: "09:00",
      end: "10:30",
      duration: "1:30",
    }),
  );
  await expect(stretched).toBeFocused();

  // Criterio 3 (CAL-54), a «1 h» y con la grilla al final del día.
  await zoomButton(page, "Alejar").click();
  await expect(zoomButton(page, "Alejar")).toHaveAttribute("aria-disabled", "true");
  await scrollGridTo(page, "23:59");
  await addEntry(page, {
    day: monday,
    today,
    start: "22:00",
    end: "23:30",
    description: "Lunes tarde",
  });
  await addEntry(page, {
    day: wednesday,
    today,
    start: "22:00",
    description: "Miércoles tarde",
  });

  // Mover el cuerpo una franja hacia abajo: pasa a cruzar la medianoche, con
  // su superíndice y un segmento en el martes. El destino queda dentro de la
  // banda del desplazamiento automático del borde inferior: con la grilla en
  // su máximo no se mueve, y el candidato es el del puntero.
  await scrollGridTo(page, "23:59");
  const end = await gridScroller(page);
  expect(end.scrollTop).toBe(end.maxScroll);
  await withServerAction(page, async () =>
    dragBetween(
      page,
      {
        on: entryBlocks(dayColumn(page, monday, today), "Lunes tarde"),
        y: BODY_GRIP_PX,
      },
      () => grabPoint(page, monday, today, "23:00"),
    ),
  );
  const crossing = entryBlock(
    dayColumn(page, monday, today),
    closedBlockName({
      description: "Lunes tarde",
      day: monday,
      today,
      start: "23:00",
      end: "00:30",
      extraDays: 1,
      duration: "1:30",
    }),
  );
  await expect(crossing).toBeVisible();
  await expect(crossing).toContainText("+1");
  await expect(segmentText(tuesdayColumn, "Lunes tarde")).toBeVisible();

  // El asa de fin sigue al puntero a la columna siguiente, y se detiene en la
  // última marca antes de 24 horas del inicio (CAL-56): las 21:00 del jueves.
  const evening = entryBlocks(dayColumn(page, wednesday, today), "Miércoles tarde");
  await expect(blockHandle(evening, "end")).toHaveCount(1);
  await withServerAction(page, async () =>
    dragBetween(page, { on: blockHandle(evening, "end") }, () =>
      slotPoint(page, thursday, today, "23:00"),
    ),
  );
  await expect(
    entryBlock(
      dayColumn(page, wednesday, today),
      closedBlockName({
        description: "Miércoles tarde",
        day: wednesday,
        today,
        start: "22:00",
        end: "21:00",
        extraDays: 1,
        duration: "23:00",
      }),
    ),
  ).toBeVisible();
});

test("arrastrar sobre el fondo de una columna selecciona las franjas y abre el alta con ese rango", async ({
  page,
}) => {
  const requests = countRequests(page);
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const friday = addDays(lastWeek, 4);
  const saturday = addDays(lastWeek, 5);
  const fridayColumn = dayColumn(page, friday, today);
  const region = calendarRegion(page);

  await zoomIn(page, "30 min");
  await zoomIn(page, "15 min");
  const at = (clock: string, day: CivilDay = friday): Promise<ScreenPoint> =>
    slotPoint(page, day, today, clock, "15 min");

  // Criterio 4 (CAL-44): hacia abajo, la selección cubre de la franja tocada
  // a la que está bajo el puntero, con el rango a la vista.
  await pressAt(page, { on: fridayColumn, y: slotOffset("08:30", "15 min") });
  await moveTo(page, await at("09:30"));
  await expect(calendarSelection(fridayColumn)).toContainText("08:30 – 09:45");
  await page.mouse.up();

  // Soltar abre «Agregar entrada» con el rango, no el borrador de un clic, y
  // sin la selección dibujada detrás (CAL-49). `Esc` lo cierra sin nada.
  const adding = entryDialog(page, "Agregar entrada");
  await expectEditDialog(adding, {
    description: "",
    date: dayLabel(friday, today),
    start: "08:30",
    end: "09:45",
    duration: "1:15",
  });
  await expect(calendarSelection(page.locator("body"))).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(adding).toBeHidden();
  await expect(calendarSelection(region)).toHaveCount(0);
  await expect(fridayColumn.getByRole("button")).toHaveCount(0);

  // Hacia arriba también; `Esc` con el botón apretado y soltar sobre el fondo
  // del viernes: ni el alta del rango ni la de un clic (criterios 9 y 11).
  const actions = requests.actions;
  await pressAt(page, { on: fridayColumn, y: slotOffset("09:30", "15 min") });
  await moveTo(page, await at("08:15"));
  await expect(calendarSelection(fridayColumn)).toContainText("08:15 – 09:45");
  await page.keyboard.press("Escape");
  await expect(calendarSelection(region)).toHaveCount(0);
  await page.mouse.up();
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(calendarSelection(region)).toHaveCount(0);
  expect(requests.actions).toBe(actions);

  // La selección no sale de su columna: con el puntero en el sábado sigue en
  // el viernes, hasta la franja de esa altura.
  await pressAt(page, { on: fridayColumn, y: slotOffset("08:30", "15 min") });
  await moveTo(page, await at("09:00", saturday));
  await expect(calendarSelection(fridayColumn)).toContainText("08:30 – 09:15");
  await expect(calendarSelection(dayColumn(page, saturday, today))).toHaveCount(0);
  await page.mouse.up();
  await expect(dialogDescription(adding)).toBeFocused();
  await expect(dialogClock(adding, "Hora de fin")).toHaveValue("09:15");
  await dialogDescription(adding).fill("Creada arrastrando");
  await withServerAction(page, () => dialogButton(adding, "Agregar").click());
  await expect(adding).toBeHidden();
  await expect(
    entryBlock(
      fridayColumn,
      closedBlockName({
        description: "Creada arrastrando",
        day: friday,
        today,
        start: "08:30",
        end: "09:15",
        duration: "0:45",
      }),
    ),
  ).toBeVisible();
});

test("un gesto que falla vuelve con su aviso y «Reintentar», y la revalidación espera a que termine", async ({
  page,
}) => {
  const requests = countRequests(page);
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const wednesday = addDays(lastWeek, 2);
  const thursday = addDays(lastWeek, 3);
  const region = calendarRegion(page);
  const wednesdayColumn = dayColumn(page, wednesday, today);
  const blockAt = (start: string, end: string): Locator =>
    entryBlock(
      wednesdayColumn,
      closedBlockName({
        description: "Falla",
        day: wednesday,
        today,
        start,
        end,
        duration: "1:00",
      }),
    );

  await addEntry(page, { day: wednesday, today, start: "09:00", description: "Falla" });
  await addEntry(page, { day: thursday, today, start: "09:00", description: "Otra" });

  // Criterio 8 (CAL-62, TT-55): con la respuesta retenida, el bloque está en
  // su lugar nuevo, atenuado, ocupado e inactivo.
  const releaseMove = await holdActionResponses(page, isCalendarPage);
  await dragBetween(
    page,
    { on: entryBlocks(wednesdayColumn, "Falla"), y: BODY_GRIP_PX },
    () => grabPoint(page, wednesday, today, "11:00"),
  );
  const inFlight = blockAt("11:00", "12:00");
  await expect(inFlight).toHaveAttribute("aria-busy", "true");
  await expect(inFlight).toHaveAttribute("aria-disabled", "true");

  // Un gesto por vez: apretar «Otra» y moverse unos píxeles adentro es un
  // clic, que abre su diálogo, y «Otra» no se mueve.
  const otherBlock = entryBlocks(dayColumn(page, thursday, today), "Otra");
  await pressAt(page, { on: otherBlock, y: 10 });
  const otherBox = await boxOf(otherBlock);
  await moveTo(page, { x: otherBox.x + otherBox.width / 2 + 6, y: otherBox.y + 22 });
  await page.mouse.up();
  const otherDialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(otherDialog)).toHaveValue("Otra");
  await expect(dialogClock(otherDialog, "Hora de inicio")).toHaveValue("09:00");
  await expect(blockBehindDialog(page, "Otra")).toContainText("09:00 – 10:00");

  // Criterio 12 (T-n6): con la confirmación del borrado abierta llega la
  // respuesta. «Falla» se pone al día, el foco no sale de la confirmación y
  // ningún bloque muestra su detalle detrás.
  await chooseDialogAction(page, otherDialog, "Otra", "Borrar");
  const confirmation = deleteConfirmation(page);
  await expect(confirmation).toBeVisible();
  await withServerAction(page, async () => releaseMove());
  const behind = blockBehindDialog(page, "Falla");
  await expect(behind).toContainText("11:00 – 12:00");
  await expect(behind).not.toHaveAttribute("aria-busy", "true");
  await settle(page);
  expect(await holdsFocus(confirmation)).toBe(true);
  await expect(openDetails(page)).toHaveCount(0);

  // «Cancelar» no deja un foco pendiente: un foco posterior en la región se
  // queda ahí y no va a «Falla».
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await focusRegionThroughRefresh(page);
  await expect(region).toBeFocused();

  // Criterio 8 (TT-89, TT-90): la respuesta se pierde. El bloque vuelve, la
  // región muestra el aviso de la fila con su causa y «Reintentar», y el foco
  // vuelve al bloque.
  const stopLosing = await loseActionResponses(page, isCalendarPage);
  const releaseRefreshes = await holdRefreshes(page, isCalendarPage);
  await dragBetween(
    page,
    { on: entryBlocks(wednesdayColumn, "Falla"), y: BODY_GRIP_PX },
    () => grabPoint(page, wednesday, today, "13:00"),
  );
  const notice = screenNotice(page, TIMES_NOT_SAVED);
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = notice.getByRole("button", { name: "Reintentar", exact: true });
  await expect(retry).toBeVisible();
  const back = blockAt("11:00", "12:00");
  await expect(back).toBeVisible();
  await expect(back).toBeFocused();

  // «Reintentar» lleva el foco a la región mientras viaja, nunca a `body`, y
  // con la respuesta al bloque en su lugar nuevo, sin aviso.
  await stopLosing();
  releaseRefreshes();
  const releaseRetry = await holdActionResponses(page, isCalendarPage);
  await retry.click();
  await expect(region).toBeFocused();
  await withServerAction(page, async () => releaseRetry());
  const landed = blockAt("13:00", "14:00");
  await expect(landed).toBeFocused();
  await expect(region.getByRole("alert")).toHaveCount(0);

  // Criterio 10 (CAL-89): con un gesto en curso, enfocar la ventana no
  // revalida.
  const actions = requests.actions;
  const refreshes = requests.refreshes;
  await pressAt(page, {
    on: landed,
    y: BODY_GRIP_PX,
  });
  await moveTo(page, await grabPoint(page, wednesday, today, "14:00"));
  await focusWindow(page);
  await settle(page);
  expect(requests.refreshes).toBe(refreshes);

  // Criterio 14: con el puntero junto al borde inferior del área visible, la
  // grilla se desplaza sola.
  const before = await gridScroller(page);
  await moveTo(page, {
    x: (await slotPoint(page, wednesday, today, "13:00")).x,
    y: before.bottom - 8,
  });
  await expect
    .poll(async () => (await gridScroller(page)).scrollTop)
    .toBeGreaterThan(before.scrollTop);

  // `Esc` y soltar: ningún pedido, y sale la revalidación que se juntó.
  const refreshed = page.waitForRequest(isRefresh);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await refreshed;
  await settle(page);
  expect(requests.actions).toBe(actions);
  await expect(landed).toBeFocused();
});

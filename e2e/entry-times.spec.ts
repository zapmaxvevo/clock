import type { Locator, Page, Request } from "@playwright/test";

import { workspaceTimeZone } from "./database";
import {
  addDays,
  calendarDayName,
  dayLabel,
  monthsBetween,
  todayIn,
  type CivilDay,
} from "./days";
import { expect, test } from "./session";
import {
  chooseMode,
  clockField,
  dateButton,
  dayTotal,
  descriptionInput,
  elapsedCounter,
  elapsedOf,
  entryRow,
  pickDate,
  setClock,
  startTimer,
  todayGroup,
  trackerBar,
  withServerAction,
} from "./tracker-page";

/**
 * Recorridos del slice 3: corregir las horas y la fecha de una entrada desde
 * su fila, y el inicio del timer activo desde el contador (TT-28, TT-54,
 * TT-55, TT-56, TT-108).
 */

/** El aviso de falla de la fila, que nombra la operación (TT-90). */
const TIMES_NOT_SAVED = "No se pudo guardar el horario de la entrada.";

/** El aviso de falla del editor del inicio del timer (TT-90). */
const RUNNING_START_NOT_SAVED = "No se pudo guardar el inicio del timer.";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

function isTrackerPage(url: URL): boolean {
  return url.pathname === "/";
}

function isAction(request: Request): boolean {
  return request.headers()["next-action"] !== undefined;
}

/**
 * Las horas de una fila editable son un botón que abre el editor del horario;
 * su nombre es el texto visible más lo que hace.
 */
function timesButton(row: Locator, start: string, end: string): Locator {
  return row.getByRole("button", { name: `${start} – ${end} — editar el horario` });
}

/** El botón de fecha de la fila, que abre el editor con el calendario abierto. */
function changeDateButton(scope: Locator, description: string): Locator {
  return scope.getByRole("button", {
    name: `Cambiar la fecha de la entrada «${description}»`,
  });
}

/**
 * La duración de la fila, que se muestra y no se edita. Se busca por su texto
 * entero y no pegada a las horas: con el editor abierto, las horas son valores
 * de campos y no texto de la fila.
 */
function durationOf(row: Locator, duration: string): Locator {
  return row.getByText(duration, { exact: true });
}

/** El grupo de un día que no es hoy, por el rótulo de su encabezado. */
function dayGroup(page: Page, day: CivilDay, today: CivilDay): Locator {
  return page.getByRole("region", { name: dayLabel(day, today), exact: true });
}

/** Junta los pedidos de server action que salen desde que se llama. */
function recordActions(page: Page): readonly Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request)) {
      sent.push(request);
    }
  });
  return sent;
}

/**
 * Carga una entrada de hoy desde la barra manual y espera su fila. Deja la
 * barra en modo manual, que es donde la dejaría la persona.
 *
 * La barra vuelve al borrador inicial después de la respuesta, en el mismo
 * commit que limpia la descripción. Lo que se tecleara antes en un campo de
 * hora, sin confirmar, quedaría pisado por ese borrador: la descripción vacía
 * es la señal de que la barra está lista para la entrada siguiente.
 */
async function addManualEntry(
  page: Page,
  description: string,
  start: string,
  end: string,
): Promise<void> {
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await setClock(bar, "Hora de inicio", start);
  await setClock(bar, "Hora de fin", end);
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(entryRow(todayGroup(page), description)).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("");
}

/**
 * Elige un día en el calendario que ya está abierto, mostrando el mes de
 * `shown`. Se mueve de a un mes, igual que `pickDate`, pero no abre nada:
 * el calendario lo abrió el botón de fecha de la fila.
 */
async function chooseInOpenCalendar(
  page: Page,
  shown: CivilDay,
  target: CivilDay,
): Promise<void> {
  const calendar = page.getByRole("grid");
  await expect(calendar).toBeVisible();
  const months = monthsBetween(shown, target);
  const step = page.getByRole("button", {
    name: months < 0 ? "Mes anterior" : "Mes siguiente",
  });
  for (let moved = 0; moved < Math.abs(months); moved += 1) {
    await step.click();
  }
  await calendar.getByRole("button", { name: calendarDayName(target) }).click();
}

/**
 * Cambia la fecha de una fila desde su botón de fecha y espera la escritura.
 * El botón abre el editor con el calendario en el mes de la entrada. Elegir
 * el día cierra el calendario y, cuando termina la animación de cierre,
 * devuelve el foco al selector de fecha del editor: recién ahí el Tab sale
 * del editor y confirma el trío con un solo pedido.
 */
async function moveToDay(
  page: Page,
  row: Locator,
  description: string,
  shown: CivilDay,
  target: CivilDay,
): Promise<void> {
  await changeDateButton(row, description).click();
  await withServerAction(page, async () => {
    await chooseInOpenCalendar(page, shown, target);
    await expect(dateButton(row)).toBeFocused();
    await page.keyboard.press("Tab");
  });
}

/**
 * Segundos de reloj desde la medianoche en una zona horaria. Coinciden con
 * los reales salvo el día de un cambio de horario, que la zona por omisión
 * del workspace no tiene.
 */
function secondsSinceMidnight(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return part("hour") * 3600 + part("minute") * 60 + part("second");
}

/**
 * Comprueba que un día del calendario abierto no se puede elegir. El
 * calendario dibuja los días de afuera del mes en las semanas que muestra,
 * así que el día siguiente a hoy casi siempre está en la grilla de hoy. Si no
 * está —hoy cierra el mes y la semana— hay que ir al mes siguiente, y que ese
 * paso esté inactivo ya dice que el día no se alcanza. Después vuelve al mes
 * de hoy, para que lo que siga encuentre el calendario como estaba.
 */
async function expectDayUnavailable(page: Page, day: CivilDay): Promise<void> {
  const calendar = page.getByRole("grid");
  await expect(calendar).toBeVisible();
  const dayButton = calendar.getByRole("button", { name: calendarDayName(day) });
  if ((await dayButton.count()) > 0) {
    await expect(dayButton).toBeDisabled();
    return;
  }
  const next = page.getByRole("button", { name: "Mes siguiente" });
  if (await next.isDisabled()) {
    return;
  }
  await next.click();
  await expect(dayButton).toBeDisabled();
  await page.getByRole("button", { name: "Mes anterior" }).click();
}

test("editar el inicio y el fin seguidos guarda una sola vez y actualiza la duración y el total", async ({
  page,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");
  await addManualEntry(page, "entrada a corregir", "09:00", "10:00");

  const today = todayGroup(page);
  const row = entryRow(today, "entrada a corregir");
  await expect(timesButton(row, "09:00", "10:00")).toBeVisible();
  await expect(dayTotal(today)).toHaveText("Total 1:00");

  // La escritura se retiene hasta haber visto la fila atenuada: sin eso el
  // estado en vuelo dura lo que tarde el servidor (TT-55).
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isTrackerPage, async (route) => {
    if (isAction(route.request())) {
      await held;
    }
    await route.fallback();
  });
  const writes = recordActions(page);

  // El editor abre con el foco en el inicio.
  await timesButton(row, "09:00", "10:00").click();
  const start = clockField(row, "Hora de inicio");
  const end = clockField(row, "Hora de fin");
  await expect(start).toBeFocused();

  /*
   * Moverse entre los tres controles no escribe: con el guardado por campo,
   * el inicio solo dejaría un estado intermedio. El fin y la fecha están
   * dentro del editor, así que los dos Tab quedan adentro.
   */
  await start.fill("08:00");
  await page.keyboard.press("Tab");
  await expect(end).toBeFocused();
  await end.fill("10:30");
  await page.keyboard.press("Tab");
  await expect(dateButton(row)).toBeFocused();

  // Criterio 3: mientras el editor está abierto la duración sale del
  // borrador, y no es un campo.
  await expect(durationOf(row, "2:30")).toBeVisible();
  await expect(row.getByRole("textbox", { name: "Duración" })).toHaveCount(0);

  // Salir del editor confirma el trío, y el foco sigue al control que viene
  // después en la fila aunque esté inactivo mientras la escritura viaja.
  await page.keyboard.press("Tab");
  await expect(row).toHaveAttribute("aria-busy", "true");
  await expect(
    row.getByRole("button", { name: "Acciones de la entrada «entrada a corregir»" }),
  ).toBeFocused();
  await expect.poll(() => writes.length).toBe(1);
  release();

  await expect(row).toHaveAttribute("aria-busy", "false");
  await expect(timesButton(row, "08:00", "10:30")).toBeVisible();
  await expect(durationOf(row, "2:30")).toBeVisible();
  await expect(dayTotal(today)).toHaveText("Total 2:30");
  expect(writes).toHaveLength(1);

  // La recarga lee lo que quedó guardado.
  await page.reload();
  const reloaded = entryRow(todayGroup(page), "entrada a corregir");
  await expect(timesButton(reloaded, "08:00", "10:30")).toBeVisible();
  await expect(dayTotal(todayGroup(page))).toHaveText("Total 2:30");
});

test("Esc descarta lo editado en la fila sin escribir", async ({ page }) => {
  await page.goto("/");
  await chooseMode(page, "manual");
  await addManualEntry(page, "entrada que no cambia", "09:00", "10:00");

  const today = todayGroup(page);
  const row = entryRow(today, "entrada que no cambia");
  const writes = recordActions(page);

  await timesButton(row, "09:00", "10:00").click();
  await clockField(row, "Hora de inicio").fill("08:00");
  await page.keyboard.press("Tab");
  const end = clockField(row, "Hora de fin");
  await end.fill("11:15");
  await end.press("Escape");

  // TT-55: los tres vuelven a los de la vista, y la duración con ellos.
  await expect(timesButton(row, "09:00", "10:00")).toBeVisible();
  await expect(durationOf(row, "1:00")).toBeVisible();
  await expect(dayTotal(today)).toHaveText("Total 1:00");
  expect(writes).toHaveLength(0);

  // Y en el servidor sigue lo de antes.
  await page.reload();
  await expect(
    timesButton(entryRow(todayGroup(page), "entrada que no cambia"), "09:00", "10:00"),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

test("cambiar la fecha de una fila la pasa al grupo del otro día y recalcula los dos totales", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const yesterday = addDays(today, -1);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addManualEntry(page, "se queda hoy", "09:00", "10:00");
  await addManualEntry(page, "pasa a ayer", "11:00", "11:30");
  await expect(dayTotal(todayGroup(page))).toHaveText("Total 1:30");

  await moveToDay(
    page,
    entryRow(todayGroup(page), "pasa a ayer"),
    "pasa a ayer",
    today,
    yesterday,
  );

  // TT-56: la fila está en el grupo de ayer, con sus mismas horas, y el foco
  // la acompaña hasta ahí.
  const yesterdayGroup = dayGroup(page, yesterday, today);
  const moved = entryRow(yesterdayGroup, "pasa a ayer");
  await expect(timesButton(moved, "11:00", "11:30")).toBeVisible();
  await expect(timesButton(moved, "11:00", "11:30")).toBeFocused();
  await expect(durationOf(moved, "0:30")).toBeVisible();
  await expect(entryRow(todayGroup(page), "pasa a ayer")).toHaveCount(0);

  // TT-45: los totales de los dos días.
  await expect(dayTotal(yesterdayGroup)).toHaveText("Total 0:30");
  await expect(dayTotal(todayGroup(page))).toHaveText("Total 1:00");
});

test("elegir un día y hacer clic en otra fila guarda el horario con un solo pedido", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const yesterday = addDays(today, -1);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addManualEntry(page, "fila de al lado", "09:00", "10:00");
  await addManualEntry(page, "cambia de día", "11:00", "11:30");

  const other = entryRow(todayGroup(page), "fila de al lado");
  const writes = recordActions(page);

  /*
   * El clic sale mientras el calendario se cierra, sin esperar a que el foco
   * vuelva al editor. Cae en la duración de la otra fila, que no es un
   * control: no abre nada ahí y el foco sale del editor.
   */
  await changeDateButton(todayGroup(page), "cambia de día").click();
  await withServerAction(page, async () => {
    await chooseInOpenCalendar(page, today, yesterday);
    await durationOf(other, "1:00").click();
  });

  const moved = entryRow(dayGroup(page, yesterday, today), "cambia de día");
  await expect(timesButton(moved, "11:00", "11:30")).toBeVisible();
  await expect(entryRow(todayGroup(page), "cambia de día")).toHaveCount(0);
  await expect(dayTotal(todayGroup(page))).toHaveText("Total 1:00");
  expect(writes).toHaveLength(1);
});

test("el inicio del timer se corrige desde el contador, sin días futuros, y el contador salta", async ({
  page,
}) => {
  const timeZone = await workspaceTimeZone();
  const today = todayIn(timeZone);
  const tomorrow = addDays(today, 1);

  await page.goto("/");
  await startTimer(page, "timer que empezó antes");
  const bar = trackerBar(page);
  const counter = elapsedCounter(bar);

  // Criterio 9: el botón superpuesto al contador abre el editor del inicio.
  // El editor se dibuja en un portal, fuera de la barra.
  await page.getByRole("button", { name: "Editar la hora de inicio" }).click();
  const date = page.getByRole("button", { name: /^Fecha de la entrada:/ });
  await expect(date).toHaveText("Hoy");

  // Criterio 10: el selector de día termina en hoy (TT-29). Elegir hoy otra
  // vez cierra el calendario sin cambiar nada.
  await date.click();
  await expectDayUnavailable(page, tomorrow);
  await page
    .getByRole("grid")
    .getByRole("button", { name: calendarDayName(today) })
    .click();
  await expect(page.getByRole("grid")).toBeHidden();
  await expect(date).toHaveText("Hoy");

  /*
   * 00:00 de hoy ya pasó a cualquier hora de la corrida, salvo durante su
   * primer minuto, y sin segundos: el contador queda en lo que va del día.
   * El Tab normaliza el campo antes de guardar.
   */
  const start = page.getByRole("textbox", { name: "Hora de inicio" });
  await start.fill("00:00");
  await page.keyboard.press("Tab");
  await withServerAction(page, () =>
    page.getByRole("button", { name: "Guardar" }).click(),
  );

  // El contador salta sin recargar, y sigue siendo el mismo `timer`.
  await expect
    .poll(async () =>
      Math.abs((await elapsedOf(counter)) - secondsSinceMidnight(timeZone)),
    )
    .toBeLessThanOrEqual(5);

  // La entrada sigue abierta: la barra la muestra corriendo y no es una fila.
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("timer que empezó antes");
  await expect(todayGroup(page).getByRole("listitem")).toHaveCount(0);

  // Lo guardado es lo que lee una carga nueva.
  await page.reload();
  await expect
    .poll(async () =>
      Math.abs(
        (await elapsedOf(elapsedCounter(trackerBar(page)))) -
          secondsSinceMidnight(timeZone),
      ),
    )
    .toBeLessThanOrEqual(5);
  await expect(trackerBar(page).getByRole("button", { name: "Detener" })).toBeVisible();
});

test("mover la única entrada de un día treinta días atrás la guarda y avisa arriba de la lista", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const yesterday = addDays(today, -1);
  const monthAgo = addDays(today, -30);

  await page.goto("/");
  await chooseMode(page, "manual");

  /*
   * La ventana de la lista se estira hacia atrás hasta el día de la entrada
   * cerrada más nueva que ya empezó. Si la movida lo fuera, la ventana la
   * seguiría hasta su día nuevo y no habría aviso; una entrada de hoy la
   * deja afuera. Va de 00:00 a 00:01 porque una entrada que todavía no
   * empezó no cuenta, y esas horas ya pasaron a cualquier hora de la
   * corrida, salvo durante el primer minuto del día del workspace. El usuario
   * es propio del test, así que nadie más le agrega entradas a esos días.
   */
  await addManualEntry(page, "entrada de hoy", "00:00", "00:01");
  await expect(entryRow(todayGroup(page), "entrada de hoy")).toBeVisible();

  const bar = trackerBar(page);
  await descriptionInput(bar).fill("única de ayer");
  await pickDate(page, bar, yesterday, today);
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:00");
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  const origin = dayGroup(page, yesterday, today);
  await expect(entryRow(origin, "única de ayer")).toBeVisible();

  await moveToDay(
    page,
    entryRow(origin, "única de ayer"),
    "única de ayer",
    yesterday,
    monthAgo,
  );

  // Criterio 12: el aviso de TT-108 nombra el día, con los textos del alta
  // manual, aunque el grupo de origen ya no esté.
  const notice = page
    .getByRole("status")
    .filter({ hasText: "La entrada se guardó, pero todavía no se ve en la lista." });
  await expect(notice).toContainText(
    `Quedó en el día ${dayLabel(monthAgo, today)}, anterior al tramo que la lista muestra.`,
  );
  await expect(origin).toHaveCount(0);
  await expect(
    page.getByRole("listitem").filter({ hasText: "única de ayer" }),
  ).toHaveCount(0);

  // Arriba de la lista: antes del primer grupo, que es el de hoy.
  const noticeBox = await notice.boundingBox();
  const firstGroupBox = await todayGroup(page).boundingBox();
  if (noticeBox === null || firstGroupBox === null) {
    throw new Error("El aviso y el grupo de hoy tienen que estar dibujados.");
  }
  expect(noticeBox.y).toBeLessThan(firstGroupBox.y);
});

test("con la red caída el horario de la fila vuelve y Reintentar lo guarda una sola vez", async ({
  page,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");
  await addManualEntry(page, "horario sin red", "09:00", "10:00");

  // La red se cae solo para la escritura, hasta que el test la devuelve.
  let failing = true;
  await page.route(isTrackerPage, async (route) => {
    if (failing && isAction(route.request())) {
      await route.abort();
      return;
    }
    await route.fallback();
  });

  const today = todayGroup(page);
  const row = entryRow(today, "horario sin red");
  await timesButton(row, "09:00", "10:00").click();
  await clockField(row, "Hora de inicio").fill("08:00");
  await page.keyboard.press("Tab");
  const end = clockField(row, "Hora de fin");
  await end.fill("10:30");
  // Enter en un campo de hora también confirma el trío.
  await end.press("Enter");

  // TT-89 y TT-90: el aviso nombra la operación y ofrece reintentar.
  const notice = page.getByRole("alert").filter({ hasText: TIMES_NOT_SAVED });
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = notice.getByRole("button", { name: "Reintentar" });
  await expect(retry).toBeVisible();

  // Los tres valores vuelven a los de la vista.
  await expect(timesButton(row, "09:00", "10:00")).toBeVisible();
  await expect(durationOf(row, "1:00")).toBeVisible();
  await expect(dayTotal(today)).toHaveText("Total 1:00");

  // Criterio 16: el reintento manda el mismo trío y deja una sola fila con
  // el horario nuevo.
  failing = false;
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect(timesButton(row, "08:00", "10:30")).toBeVisible();
  await expect(dayTotal(today)).toHaveText("Total 2:30");

  await page.reload();
  const reloaded = todayGroup(page);
  await expect(reloaded.getByRole("listitem")).toHaveCount(1);
  await expect(
    timesButton(entryRow(reloaded, "horario sin red"), "08:00", "10:30"),
  ).toBeVisible();
  await expect(dayTotal(reloaded)).toHaveText("Total 2:30");
});

test("con la red caída el inicio del timer no cambia y Reintentar lo guarda", async ({
  page,
}) => {
  const timeZone = await workspaceTimeZone();

  await page.goto("/");
  await startTimer(page, "inicio sin red");

  // La red se cae solo para la escritura, hasta que el test la devuelve.
  let failing = true;
  await page.route(isTrackerPage, async (route) => {
    if (failing && isAction(route.request())) {
      await route.abort();
      return;
    }
    await route.fallback();
  });

  await page.getByRole("button", { name: "Editar la hora de inicio" }).click();
  await page.getByRole("textbox", { name: "Hora de inicio" }).fill("00:00");
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Guardar" }).click();

  // Criterio 16: el aviso nombra la operación y ofrece reintentar.
  const notice = page.getByRole("alert").filter({ hasText: RUNNING_START_NOT_SAVED });
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = notice.getByRole("button", { name: "Reintentar" });
  await expect(retry).toBeVisible();

  // El timer sigue como estaba: corriendo y con el contador de un timer
  // recién arrancado, no el de lo que va del día.
  const bar = trackerBar(page);
  const counter = elapsedCounter(bar);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  expect(await elapsedOf(counter)).toBeLessThan(60);

  // El reintento manda el mismo pedido y el contador salta.
  failing = false;
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect
    .poll(async () =>
      Math.abs((await elapsedOf(counter)) - secondsSinceMidnight(timeZone)),
    )
    .toBeLessThanOrEqual(5);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();

  await page.reload();
  await expect
    .poll(async () =>
      Math.abs(
        (await elapsedOf(elapsedCounter(trackerBar(page)))) -
          secondsSinceMidnight(timeZone),
      ),
    )
    .toBeLessThanOrEqual(5);
});

test("lo que se teclea en el inicio mientras viaja «Agregar» sigue en el campo al llegar la respuesta", async ({
  page,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  await descriptionInput(bar).fill("la que viaja");
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:00");

  /*
   * La respuesta de «Agregar» se retiene: el servidor crea la entrada y el
   * navegador la recibe recién cuando el test la suelta. Mientras tanto se
   * empieza a teclear el inicio de la siguiente.
   */
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isTrackerPage, async (route) => {
    if (!isAction(route.request())) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });

  const sent = page.waitForRequest(isAction);
  await bar.getByRole("button", { name: "Agregar" }).click();
  await sent;
  const start = clockField(bar, "Hora de inicio");
  await start.fill("11");

  // TT-25: la barra queda lista para la siguiente sin sacar el foco del campo
  // en el que se está tecleando, y sin pisar lo tecleado.
  release();
  await expect(entryRow(todayGroup(page), "la que viaja")).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(start).toBeFocused();
  await expect(start).toHaveValue("11");

  // El resto de la hora llega al mismo campo; escribir la descripción sale
  // de él y confirma lo tecleado.
  await page.keyboard.type(":00");
  await descriptionInput(bar).fill("la siguiente");
  await setClock(bar, "Hora de fin", "11:30");
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );

  const row = entryRow(todayGroup(page), "la siguiente");
  await expect(timesButton(row, "11:00", "11:30")).toBeVisible();
  await expect(durationOf(row, "0:30")).toBeVisible();
});

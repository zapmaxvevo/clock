import type { Locator, Page, Route } from "@playwright/test";

import { addDays, dayLabel, todayIn, type CivilDay } from "./days";
import { withServerAction } from "./network";
import { expect, test } from "./session";
import {
  accountMenu,
  accountMenuButton,
  chooseDay,
  chooseFormat,
  chooseMode,
  chooseTimeZone,
  clockField,
  dateButton,
  descriptionInput,
  documentIsMarked,
  entryRow,
  formatOption,
  goToTrackerByNav,
  markDocument,
  nameField,
  openProfileFromMenu,
  pickDate,
  preferenceControl,
  setClock,
  todayGroup,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos del slice 7: el perfil, sus preferencias de hora y fecha, y cómo
 * las ve el rastreador (§7 del contrato). Cada recorrido entra con una persona
 * propia, que nace sin preferencias guardadas y ve los predeterminados de
 * P-03. La membresía no activa (PF-46) no se prueba acá: el rol de la base de
 * e2e no puede cambiar el estado de una membresía, y la cubren la integración
 * y el test del componente.
 */

/** La zona por omisión de la persona (P-03), un valor y no la del workspace. */
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/**
 * La opción de Buenos Aires no se escribe a mano: la lista del selector trae
 * los nombres canónicos del entorno, que no incluyen el valor por omisión
 * sino su equivalente (`America/Buenos_Aires` en Node 25). El servidor y el
 * runner corren en la misma máquina, así que calculan lo mismo.
 */
const BUENOS_AIRES_OPTION = new Intl.DateTimeFormat("en-US", {
  timeZone: DEFAULT_TIMEZONE,
}).resolvedOptions().timeZone;

/** Buenos Aires no tiene cambio de horario: su desplazamiento es fijo. */
const BUENOS_AIRES_OFFSET = "UTC−03:00";

const TOKYO = "Asia/Tokyo";

/** El nombre con que `signIn` crea a la persona, y sus iniciales (PF-44). */
const PERSON_NAME = "Persona de prueba";
const PERSON_INITIALS = "PD";

/** TT-90: el aviso de la falla nombra la preferencia. */
const DATE_FORMAT_NOT_SAVED = "No se pudo cambiar el formato de fecha.";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** Una hora de 12 h como la muestra un campo (PF-13): «9:05 AM», «12:00 PM». */
const TWELVE_HOUR_CLOCK = /^(?:[1-9]|1[0-2]):[0-5]\d [AP]M$/;

/** Abreviaturas del día en los rótulos, las de `date-fns` en español. */
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function isProfilePage(url: URL): boolean {
  return url.pathname === "/perfil";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * El rótulo de un día que no es hoy ni ayer con el formato `yyyy-MM-dd`
 * (§5.1): el día abreviado y `MM-dd`, o la fecha entera si es de otro año.
 * Se arma acá y no con `src/server/time`, por la misma razón que `days.ts`.
 */
function isoDayLabel(civil: CivilDay, today: CivilDay): string {
  const weekday =
    WEEKDAYS[new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay()];
  const date =
    civil.year === today.year
      ? `${pad(civil.month)}-${pad(civil.day)}`
      : `${civil.year}-${pad(civil.month)}-${pad(civil.day)}`;
  return `${weekday}, ${date}`;
}

/** El grupo de un día por el rótulo exacto de su encabezado. */
function dayGroup(page: Page, label: string): Locator {
  return page.getByRole("region", { name: label, exact: true });
}

/** Las horas de una fila son un botón que abre el editor del horario. */
function timesButton(row: Locator, start: string, end: string): Locator {
  return row.getByRole("button", { name: `${start} – ${end} — editar el horario` });
}

/** La duración de la fila, por su texto entero. */
function durationOf(row: Locator, duration: string): Locator {
  return row.getByText(duration, { exact: true });
}

/**
 * Carga una entrada de hoy desde la barra manual y espera su fila. Va de
 * 00:00 a 00:01 en la zona de la persona, que ya pasó a cualquier hora de la
 * corrida salvo durante su primer minuto.
 */
async function addTodayEntry(page: Page, description: string): Promise<void> {
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await setClock(bar, "Hora de inicio", "00:00");
  await setClock(bar, "Hora de fin", "00:01");
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(entryRow(todayGroup(page), description)).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue("");
}

/** Un ancho de teléfono, debajo del corte `md`. */
const PHONE_VIEWPORT = { width: 390, height: 844 };

/**
 * Afirma que cada campo deja ver su valor entero en un teléfono. Debajo de
 * `md` el texto de los campos sube a 16 px, y es ahí donde un ancho fijo
 * recorta «12:00 AM»: un input que recorta tiene un `scrollWidth` mayor que
 * su ancho visible. Se consulta con `expect.poll`, porque hasta que carga la
 * fuente el ancho del texto es el de la de reserva. Al terminar, la ventana
 * vuelve a su tamaño.
 */
async function expectWholeValuesOnPhone(
  page: Page,
  fields: readonly Locator[],
): Promise<void> {
  const viewport = page.viewportSize();
  await page.setViewportSize(PHONE_VIEWPORT);
  for (const field of fields) {
    await expect
      .poll(() => field.evaluate((node) => node.scrollWidth <= node.clientWidth), {
        message: `${String(field)} recorta su valor`,
      })
      .toBe(true);
  }
  if (viewport !== null) {
    await page.setViewportSize(viewport);
  }
}

test("el menú de la cuenta lleva al perfil, que muestra la identidad y los predeterminados", async ({
  page,
  email,
}) => {
  await page.goto("/");

  // Criterio 18: sin foto de Google, el disparador muestra las iniciales.
  const trigger = accountMenuButton(page);
  await expect(trigger).toHaveText(PERSON_INITIALS);
  await trigger.click();
  const menu = accountMenu(page);
  await expect(menu).toContainText(PERSON_NAME);
  await expect(menu).toContainText(email);
  await expect(menu.getByRole("menuitem", { name: "Salir", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await openProfileFromMenu(page);

  // PF-06 y PF-09: la identidad, en solo lectura.
  const main = page.getByRole("main");
  await expect(nameField(page)).toHaveValue(PERSON_NAME);
  await expect(main).toContainText(email);
  await expect(main).toContainText(PERSON_INITIALS);
  await expect(
    main.getByText("La foto y el correo salen de tu cuenta de Google."),
  ).toBeVisible();
  await expect(main.getByRole("textbox")).toHaveCount(1);

  // Criterio 15 y PF-37: los tres controles con los predeterminados. La zona
  // elegida es la opción equivalente a la de omisión, con su desplazamiento.
  const zone = preferenceControl(page, "Zona horaria");
  await expect(zone).toContainText(BUENOS_AIRES_OPTION);
  await expect(zone).toContainText(BUENOS_AIRES_OFFSET);
  await expect(preferenceControl(page, "Formato de fecha")).toContainText("dd/MM/yyyy");
  await expect(preferenceControl(page, "Formato de hora")).toContainText("24 horas");

  // PF-01 y PF-02: el primer día y la duración se ven y no se editan.
  await expect(main.getByText("Primer día de la semana")).toBeVisible();
  await expect(main.getByText("Lunes", { exact: true })).toBeVisible();
  await expect(main.getByText("Lo administra el equipo.")).toBeVisible();
  await expect(main.getByText("Formato de duración")).toBeVisible();
  await expect(main.getByText("Compacto (h:mm)")).toBeVisible();
  await expect(main.getByText("Lo define el workspace.")).toBeVisible();
  await expect(main.getByRole("combobox")).toHaveCount(4);
});

test("con 12 horas el rastreador cambia sin recargar, y el editor de la fila acepta «am»", async ({
  page,
}) => {
  await page.goto("/");
  await markDocument(page);
  await addTodayEntry(page, "entrada en 12 horas");

  await openProfileFromMenu(page);
  await chooseFormat(page, "Formato de hora", "12 horas");

  // Criterio 14: el formato nuevo llega a la lista por la navegación.
  await goToTrackerByNav(page);
  const row = entryRow(todayGroup(page), "entrada en 12 horas");
  await expect(timesButton(row, "12:00 AM", "12:01 AM")).toBeVisible();

  // Criterio 4: los campos de la barra también muestran 12 h.
  const bar = trackerBar(page);
  const barStart = clockField(bar, "Hora de inicio");
  await expect(barStart).toHaveValue(TWELVE_HOUR_CLOCK);
  await expect(clockField(bar, "Hora de fin")).toHaveValue(TWELVE_HOUR_CLOCK);
  await setClock(bar, "Hora de inicio", "12:00 am");
  await expect(barStart).toHaveValue("12:00 AM");

  // Criterios 4 y 5: el editor de la fila muestra 12 h y acepta el sufijo.
  // Ni su campo ni el de la barra recortan la hora más ancha.
  await timesButton(row, "12:00 AM", "12:01 AM").click();
  const rowStart = clockField(row, "Hora de inicio");
  await expect(rowStart).toHaveValue("12:00 AM");
  await expectWholeValuesOnPhone(page, [barStart, rowStart]);
  const end = clockField(row, "Hora de fin");
  await expect(end).toHaveValue("12:01 AM");
  await end.fill("12:02 am");
  await withServerAction(page, () => end.press("Enter"));

  await expect(timesButton(row, "12:00 AM", "12:02 AM")).toBeVisible();
  await expect(durationOf(row, "0:02")).toBeVisible();
  expect(await documentIsMarked(page)).toBe(true);

  // Lo guardado es 00:02, y una carga nueva lo sigue mostrando en 12 h.
  await page.reload();
  const reloaded = entryRow(todayGroup(page), "entrada en 12 horas");
  await expect(timesButton(reloaded, "12:00 AM", "12:02 AM")).toBeVisible();
  await expect(durationOf(reloaded, "0:02")).toBeVisible();
});

test("lo que otra pestaña elige en el perfil llega al rastreador al volver por la navegación", async ({
  page,
}) => {
  await page.goto("/");
  await addTodayEntry(page, "entrada de otra pestaña");
  await openProfileFromMenu(page);
  await markDocument(page);

  // Otra pestaña de la misma sesión elige 12 h y se cierra. Esta no se
  // entera: su layout sigue con los formatos que leyó al entrar.
  const other = await page.context().newPage();
  await other.goto("/perfil");
  await chooseFormat(other, "Formato de hora", "12 horas");
  await other.close();

  // La navegación conserva el layout: el rastreador tiene que dibujar con los
  // formatos de su propia lectura, no con los del layout.
  await goToTrackerByNav(page);
  const row = entryRow(todayGroup(page), "entrada de otra pestaña");
  await expect(timesButton(row, "12:00 AM", "12:01 AM")).toBeVisible();
  await expect(clockField(trackerBar(page), "Hora de inicio")).toHaveValue(
    TWELVE_HOUR_CLOCK,
  );
  expect(await documentIsMarked(page)).toBe(true);
});

test("con yyyy-MM-dd el encabezado de un día y el selector de fecha muestran el mismo rótulo", async ({
  page,
}) => {
  const today = todayIn(DEFAULT_TIMEZONE);
  const threeDaysAgo = addDays(today, -3);

  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await descriptionInput(bar).fill("entrada de hace tres días");
  await pickDate(page, bar, threeDaysAgo, today);
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:00");
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(
    entryRow(dayGroup(page, dayLabel(threeDaysAgo, today)), "entrada de hace tres días"),
  ).toBeVisible();

  await openProfileFromMenu(page);
  await chooseFormat(page, "Formato de fecha", "yyyy-MM-dd");
  await goToTrackerByNav(page);

  // Criterio 6: el encabezado lleva el día abreviado y la forma corta.
  const label = isoDayLabel(threeDaysAgo, today);
  await expect(
    entryRow(dayGroup(page, label), "entrada de hace tres días"),
  ).toBeVisible();
  await expect(dayGroup(page, dayLabel(threeDaysAgo, today))).toHaveCount(0);

  // El botón del selector de fecha de la barra dice lo mismo que el
  // encabezado. «Hoy» no cambia con el formato.
  const reloadedBar = trackerBar(page);
  await expect(dateButton(reloadedBar)).toHaveText("Hoy");
  await chooseDay(page, reloadedBar, today, threeDaysAgo);
  await expect(dateButton(reloadedBar)).toHaveText(label);
});

test("con la zona en Tokio la entrada cambia de hora y de día, y vuelve al elegir Buenos Aires", async ({
  page,
}) => {
  const today = todayIn(DEFAULT_TIMEZONE);

  await page.goto("/");
  await addTodayEntry(page, "entrada que viaja");
  await expect(
    timesButton(entryRow(todayGroup(page), "entrada que viaja"), "00:00", "00:01"),
  ).toBeVisible();

  await openProfileFromMenu(page);
  await chooseTimeZone(page, "Tokyo", TOKYO);
  await goToTrackerByNav(page);

  /*
   * PF-38: el instante no cambia. 00:00 de Buenos Aires son las 12:00 de
   * Tokio del mismo día civil, que en Tokio ya puede ser ayer según la hora
   * de la corrida.
   */
  const inTokyo = dayGroup(page, dayLabel(today, todayIn(TOKYO)));
  await expect(
    timesButton(entryRow(inTokyo, "entrada que viaja"), "12:00", "12:01"),
  ).toBeVisible();

  await openProfileFromMenu(page);
  await chooseTimeZone(page, "Buenos", BUENOS_AIRES_OPTION);
  await goToTrackerByNav(page);

  await expect(
    timesButton(entryRow(todayGroup(page), "entrada que viaja"), "00:00", "00:01"),
  ).toBeVisible();
});

test("si el cambio de formato no llega al servidor el control vuelve, y Reintentar lo guarda", async ({
  page,
}) => {
  await page.goto("/perfil");
  const control = preferenceControl(page, "Formato de fecha");
  await expect(control).toContainText("dd/MM/yyyy");

  // El pedido se corta antes de salir: el servidor no lo recibe.
  const abort = async (route: Route): Promise<void> => {
    if (route.request().headers()["next-action"] === undefined) {
      await route.fallback();
      return;
    }
    await route.abort();
  };
  await page.route(isProfilePage, abort);

  await control.click();
  await formatOption(page, "yyyy-MM-dd").click();

  // Criterio 16: el aviso de dos partes, y el control de vuelta en lo guardado.
  const notice = page.getByRole("alert").filter({ hasText: DATE_FORMAT_NOT_SAVED });
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = notice.getByRole("button", { name: "Reintentar" });
  await expect(retry).toBeVisible();
  await expect(control).toContainText("dd/MM/yyyy");
  await expect(control).not.toContainText("yyyy-MM-dd");

  await page.unroute(isProfilePage, abort);
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect(control).toContainText("yyyy-MM-dd");
  // «Reintentar» se fue con el aviso: el foco queda en el control, no en body.
  await expect(control).toBeFocused();

  await page.reload();
  await expect(preferenceControl(page, "Formato de fecha")).toContainText("yyyy-MM-dd");
});

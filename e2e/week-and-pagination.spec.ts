import type { Locator, Page } from "@playwright/test";

import { workspaceTimeZone } from "./database";
import {
  addDays,
  dayKeyOf,
  dayLabel,
  todayIn,
  weekLabel,
  weekStartOf,
  type CivilDay,
} from "./days";
import { openSecondTab, withServerAction } from "./network";
import { expect, test } from "./session";
import {
  chooseMode,
  dateButton,
  dayTotal,
  descriptionInput,
  editDescriptionButton,
  elapsedCounter,
  elapsedOf,
  entryRow,
  pickDate,
  setClock,
  startTimer,
  todayGroup,
  trackerBar,
  trackerWeek,
} from "./tracker-page";

/**
 * Recorridos del slice 5: la lista por semanas, «Cargar más» y la ventana que
 * se extiende hasta la entrada (TT-46, TT-47, TT-52, TT-86, TT-108, P-15).
 * Toda persona nueva tiene el lunes como primer día de la semana (PF-16), y
 * los rótulos y cortes esperados se calculan con `days.ts`, no con el código
 * que los produce.
 */

/** El total de una semana o de un día: la etiqueta y el valor. */
const TOTAL = /^Total \d+:\d{2}$/;

/** El encabezado de una semana, que recibe el foco después de «Cargar más». */
function weekHeading(page: Page, start: CivilDay, today: CivilDay): Locator {
  return page.getByRole("heading", {
    level: 2,
    name: weekLabel(start, today),
    exact: true,
  });
}

/**
 * El total de una semana. Está en su encabezado, que va antes que los días,
 * así que es el primero de los totales de la franja: los que siguen son los
 * de sus días.
 */
function weekTotal(week: Locator): Locator {
  return week.getByText(TOTAL).first();
}

/** El grupo de un día, por el rótulo de su encabezado (TT-44). */
function dayGroup(page: Page, day: CivilDay, today: CivilDay): Locator {
  return page.getByRole("region", { name: dayLabel(day, today), exact: true });
}

function loadMoreLink(page: Page): Locator {
  return page.getByRole("link", { name: "Cargar más", exact: true });
}

/** La URL lleva exactamente ese `desde` (ADR 0008). */
function withFrom(day: CivilDay | null): (url: URL) => boolean {
  return (url) =>
    url.pathname === "/" &&
    url.searchParams.get("desde") === (day === null ? null : dayKeyOf(day));
}

/**
 * Carga una entrada desde la barra manual, ya abierta, y espera a que el
 * servidor la haya escrito. No busca la fila: según la ventana, la entrada
 * puede no estar dibujada todavía. La descripción vacía y la fecha de vuelta
 * en hoy dicen que la barra quedó lista para la siguiente.
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
  if (dayKeyOf(day) !== dayKeyOf(today)) {
    await pickDate(page, bar, day, today);
  }
  await setClock(bar, "Hora de inicio", start);
  await setClock(bar, "Hora de fin", end);
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(dateButton(bar)).toHaveText("Hoy");
}

/**
 * Siembra entradas viejas y una de hoy, y deja la pantalla en `/` sin
 * `desde`. Las viejas se cargan con la ventana ya extendida hasta `oldest`,
 * así ninguna alta navega (P-15) mientras se siembra; la última es la de hoy,
 * que deja a las viejas fuera de la ventana por omisión. Va de 00:00 a 00:01
 * porque una entrada que todavía no empezó no cuenta para la ventana, y esas
 * horas ya pasaron a cualquier hora de la corrida, salvo durante el primer
 * minuto del día del workspace.
 */
async function seedPastWeeks(
  page: Page,
  today: CivilDay,
  oldest: CivilDay,
  entries: readonly { description: string; day: CivilDay; start: string; end: string }[],
): Promise<void> {
  await page.goto(`/?desde=${dayKeyOf(oldest)}`);
  await chooseMode(page, "manual");
  for (const entry of entries) {
    await addEntry(page, entry.description, entry.day, today, entry.start, entry.end);
  }
  await addEntry(page, "entrada de hoy", today, today, "00:00", "00:01");
  await page.goto("/");
  await expect(entryRow(todayGroup(page), "entrada de hoy")).toBeVisible();
}

/**
 * Instala el reloj emulado y recarga, para que los temporizadores de la
 * pantalla —el contador y la revalidación de P-11— nazcan sobre él. Va
 * después de sembrar con la barra manual: el `Date` emulado no se puede
 * extender, así que `TZDate` pierde su zona y el rótulo del botón de fecha,
 * que pasa por `dayKeyLabel`, nombra el día anterior al elegido.
 */
async function installClock(page: Page): Promise<void> {
  await page.clock.install();
  await page.reload();
}

/**
 * Arranca un timer y espera a que la barra muestre la vista del servidor. El
 * grupo de hoy que espera `startTimer` no alcanza cuando ya había una entrada
 * de hoy, y la respuesta tampoco: hasta que se aplica, la barra muestra la
 * vista optimista, con el contador quieto en cero. El contador que corre es
 * la vista del servidor.
 */
async function startTimerAndSettle(page: Page, description: string): Promise<void> {
  await startTimer(page, description);
  const counter = elapsedCounter(trackerBar(page));
  await expect.poll(() => elapsedOf(counter)).toBeGreaterThanOrEqual(1);
}

/**
 * Mueve el inicio del timer activo con el editor del contador, que se dibuja
 * en un portal. Al cerrarse el calendario el foco vuelve a su disparador, y
 * recién ahí se sigue con la hora.
 */
async function moveRunningStart(
  page: Page,
  day: CivilDay,
  today: CivilDay,
  time: string,
): Promise<void> {
  await page.getByRole("button", { name: "Editar la hora de inicio" }).click();
  const editor = page.getByRole("dialog", { name: "Inicio del timer" });
  await pickDate(page, editor, day, today);
  await expect(dateButton(editor)).toBeFocused();
  await editor.getByRole("textbox", { name: "Hora de inicio" }).fill(time);
  await page.keyboard.press("Tab");
  await withServerAction(page, () =>
    editor.getByRole("button", { name: "Guardar" }).click(),
  );
}

/**
 * Sigue «Cargar más» y espera a que la URL lleve el `desde` pedido y a que
 * se vaya el «Cargando…» que la lista anuncia mientras la navegación viaja.
 * El foco se mueve cuando el `desde` llega a la URL: quien llama lo afirma.
 */
async function followLoadMore(
  page: Page,
  link: Locator,
  target: CivilDay,
): Promise<void> {
  await link.click();
  await expect(page).toHaveURL(withFrom(target));
  await expect(page.getByRole("status").filter({ hasText: "Cargando…" })).toHaveCount(0);
}

/** Todas las filas con una descripción, en cualquier día del alcance. */
function entriesNamed(scope: Page | Locator, description: string): Locator {
  return scope.getByRole("listitem").filter({ hasText: description });
}

/** Borra una entrada desde el menú de su fila, en cualquier día (TT-60). */
async function deleteEntryIn(page: Page, description: string): Promise<void> {
  await page
    .getByRole("button", { name: `Acciones de la entrada «${description}»` })
    .click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Borrar" }).click();
}

test("la lista agrupa por semana, cada una con su rótulo y su total, y los días adentro", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const lastMonday = lastWeek;
  const lastSunday = addDays(lastWeek, 6);

  // La semana anterior siempre cae dentro de la ventana por omisión, que
  // arranca 13 días atrás redondeado a semana entera: no hace falta `desde`.
  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "lunes pasado", lastMonday, today, "09:00", "10:30");
  await addEntry(page, "domingo pasado", lastSunday, today, "09:00", "10:00");
  await addEntry(page, "entrada de hoy", today, today, "00:00", "00:01");

  // Criterios 3 y 16: las semanas son los únicos `h2`, de la más nueva a la
  // más vieja.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Esta semana",
    "Semana anterior",
  ]);

  const current = trackerWeek(page, thisWeek, today);
  await expect(weekTotal(current)).toHaveText("Total 0:01");
  await expect(current.getByRole("heading", { level: 3 })).toHaveText(["Hoy"]);
  await expect(entryRow(todayGroup(page), "entrada de hoy")).toBeVisible();

  // La semana anterior: el total suma sus dos días, y los días van del más
  // reciente al más viejo, cada uno como `h3` dentro de ella.
  const previous = trackerWeek(page, lastWeek, today);
  await expect(weekTotal(previous)).toHaveText("Total 2:30");
  await expect(previous.getByRole("heading", { level: 3 })).toHaveText([
    dayLabel(lastSunday, today),
    dayLabel(lastMonday, today),
  ]);
  await expect(previous.getByText(TOTAL)).toHaveText([
    "Total 2:30",
    "Total 1:00",
    "Total 1:30",
  ]);
  await expect(
    entryRow(
      previous.getByRole("region", { name: dayLabel(lastSunday, today), exact: true }),
      "domingo pasado",
    ),
  ).toBeVisible();
  await expect(
    entryRow(
      previous.getByRole("region", { name: dayLabel(lastMonday, today), exact: true }),
      "lunes pasado",
    ),
  ).toBeVisible();
});

test("el total de esta semana sube junto con el contador del timer y el de la anterior no", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const lastWeek = addDays(weekStartOf(today), -7);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "semana pasada", addDays(lastWeek, 2), today, "09:00", "10:00");
  await addEntry(page, "entrada de hoy", today, today, "00:00", "00:01");

  // El total se muestra en h:mm: el reloj emulado adelanta el minuto que
  // hace falta para verlo cambiar, como en el total del día. Se instala
  // después de sembrar, porque rompe el calendario (ver `installClock`).
  await installClock(page);
  await chooseMode(page, "timer");
  await startTimerAndSettle(page, "timer que suma a la semana");
  const counter = elapsedCounter(trackerBar(page));

  const current = trackerWeek(page, weekStartOf(today), today);
  const previous = trackerWeek(page, lastWeek, today);
  await expect(weekTotal(current)).toHaveText("Total 0:01");
  await expect(weekTotal(previous)).toHaveText("Total 1:00");

  // El salto del reloj dispara también la revalidación de P-11, que traería
  // un `serverNow` nuevo; se la retiene para observar el transcurrido del
  // cliente.
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      await held;
      await route.continue();
    },
  );

  await page.clock.fastForward(61_000);

  // Criterio 4 y TT-46: lo cerrado más el transcurrido, igual que el día.
  await expect(counter).toHaveText(/^0:01:\d{2}$/);
  await expect(weekTotal(current)).toHaveText("Total 0:02");
  await expect(dayTotal(todayGroup(page))).toHaveText("Total 0:02");
  // El transcurrido se suma solo a la semana del timer.
  await expect(weekTotal(previous)).toHaveText("Total 1:00");
  release();
});

test("Cargar más salta a la próxima semana con entradas, le da el foco y desaparece al final", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const thisWeek = weekStartOf(today);
  const fiveWeeksAgo = addDays(thisWeek, -35);
  const sevenWeeksAgo = addDays(thisWeek, -49);

  await seedPastWeeks(page, today, sevenWeeksAgo, [
    {
      description: "la más vieja",
      day: addDays(sevenWeeksAgo, 2),
      start: "09:00",
      end: "10:00",
    },
    {
      description: "lunes de hace cinco semanas",
      day: fiveWeeksAgo,
      start: "09:00",
      end: "10:00",
    },
    {
      description: "domingo de hace cinco semanas",
      day: addDays(fiveWeeksAgo, 6),
      start: "09:00",
      end: "11:00",
    },
  ]);

  // Las semanas del medio están vacías y no se dibujan (TT-86).
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Esta semana"]);

  // Criterio 8: el enlace lleva a la semana más reciente con entradas antes
  // de la ventana, no a la inmediatamente anterior.
  const loadMore = loadMoreLink(page);
  await expect(loadMore).toHaveAttribute("href", `/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await followLoadMore(page, loadMore, fiveWeeksAgo);

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Esta semana",
    weekLabel(fiveWeeksAgo, today),
  ]);
  await expect(weekHeading(page, fiveWeeksAgo, today)).toBeFocused();

  // La semana cargada está entera: su primer y su último día, y el total de
  // los dos.
  const loaded = trackerWeek(page, fiveWeeksAgo, today);
  await expect(weekTotal(loaded)).toHaveText("Total 3:00");
  await expect(loaded.getByRole("heading", { level: 3 })).toHaveText([
    dayLabel(addDays(fiveWeeksAgo, 6), today),
    dayLabel(fiveWeeksAgo, today),
  ]);

  // Otra vez, salteando la sexta semana, que está vacía.
  await expect(loadMore).toHaveAttribute("href", `/?desde=${dayKeyOf(sevenWeeksAgo)}`);
  await followLoadMore(page, loadMore, sevenWeeksAgo);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Esta semana",
    weekLabel(fiveWeeksAgo, today),
    weekLabel(sevenWeeksAgo, today),
  ]);
  await expect(weekHeading(page, sevenWeeksAgo, today)).toBeFocused();
  await expect(
    entryRow(dayGroup(page, addDays(sevenWeeksAgo, 2), today), "la más vieja"),
  ).toBeVisible();

  // Sin nada más atrás, no hay enlace.
  await expect(loadMore).toHaveCount(0);
});

test("lo cargado sobrevive a la edición de una entrada vieja, a la revalidación periódica y a la recarga", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const fiveWeeksAgo = addDays(weekStartOf(today), -35);
  const oldDay = addDays(fiveWeeksAgo, 1);

  await seedPastWeeks(page, today, fiveWeeksAgo, [
    { description: "informe viejo", day: oldDay, start: "09:00", end: "10:00" },
  ]);
  // Para adelantar la revalidación de P-11 sin esperar sus 60 segundos.
  await installClock(page);

  const loadMore = loadMoreLink(page);
  await expect(loadMore).toHaveAttribute("href", `/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await followLoadMore(page, loadMore, fiveWeeksAgo);
  const loaded = trackerWeek(page, fiveWeeksAgo, today);
  await expect(editDescriptionButton(loaded, "informe viejo")).toBeVisible();

  // Criterio 9: la edición revalida la página, y la revalidación vuelve a
  // dibujar la URL con su `desde`.
  await editDescriptionButton(loaded, "informe viejo").click();
  const field = descriptionInput(loaded);
  await field.fill("informe viejo corregido");
  await withServerAction(page, () => field.press("Enter"));

  /*
   * La fila está atenuada desde la vista optimista hasta que se aplica la
   * revalidación. Antes de eso, lo que sigue afirmaría sobre la pantalla
   * vieja, que todavía tiene la semana cargada aunque la revalidación la
   * fuera a sacar.
   */
  const row = entryRow(loaded, "informe viejo corregido");
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute("aria-busy", "true");
  await expect(editDescriptionButton(loaded, "informe viejo corregido")).toBeVisible();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(weekHeading(page, fiveWeeksAgo, today)).toBeVisible();

  // La revalidación periódica de P-11 vuelve a pedir la misma URL, con su
  // `desde`, así que tampoco achica la ventana.
  const refreshed = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/" &&
      response.request().headers()["rsc"] !== undefined,
  );
  await page.clock.fastForward(60_000);
  const refresh = await refreshed;
  expect(new URL(refresh.url()).searchParams.get("desde")).toBe(dayKeyOf(fiveWeeksAgo));
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(editDescriptionButton(loaded, "informe viejo corregido")).toBeVisible();

  // La recarga tampoco.
  await page.reload();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(
    editDescriptionButton(dayGroup(page, oldDay, today), "informe viejo corregido"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Esta semana",
    weekLabel(fiveWeeksAgo, today),
  ]);
});

test("si la semana del enlace se vació en otra pestaña, el foco va a la semana más vieja", async ({
  page,
  email,
  browser,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const lastWeek = addDays(weekStartOf(today), -7);
  const fiveWeeksAgo = addDays(weekStartOf(today), -35);

  await seedPastWeeks(page, today, fiveWeeksAgo, [
    {
      description: "semana pasada",
      day: addDays(lastWeek, 2),
      start: "09:00",
      end: "10:00",
    },
    {
      description: "se borra en otra pestaña",
      day: addDays(fiveWeeksAgo, 1),
      start: "09:00",
      end: "10:00",
    },
  ]);
  const loadMore = loadMoreLink(page);
  await expect(loadMore).toHaveAttribute("href", `/?desde=${dayKeyOf(fiveWeeksAgo)}`);

  // Otra pestaña de la misma persona borra la única entrada de esa semana.
  // Esta no se entera: su enlace sigue apuntando a la semana vacía.
  const other = await openSecondTab(browser, email);
  await other.goto(`/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await withServerAction(other, () => deleteEntryIn(other, "se borra en otra pestaña"));
  await expect(entriesNamed(other, "se borra en otra pestaña")).toHaveCount(0);
  await other.context().close();

  /*
   * Criterio 8: la URL lleva el `desde` pedido, pero la semana no llega
   * (TT-86) y el foco va al encabezado de la más vieja de la lista. Los `h2`
   * son los mismos que antes del clic, así que el foco es lo que dice que la
   * navegación ya se aplicó.
   */
  await followLoadMore(page, loadMore, fiveWeeksAgo);
  await expect(weekHeading(page, lastWeek, today)).toBeFocused();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Esta semana",
    "Semana anterior",
  ]);
  await expect(loadMore).toHaveCount(0);
});

test("duplicar una entrada que se ve solo por el timer extiende la lista hasta su semana", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const fiveWeeksAgo = addDays(weekStartOf(today), -35);
  const oldDay = addDays(fiveWeeksAgo, 1);

  /*
   * Todo se siembra con la ventana extendida hasta la semana vieja, para que
   * ni el alta ni mover el inicio naveguen. Después, sin `desde`, la entrada
   * vieja se ve solo porque el timer activo empezó ese mismo día.
   */
  await page.goto(`/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await chooseMode(page, "manual");
  await addEntry(page, "vieja a duplicar", oldDay, today, "09:00", "10:00");
  await addEntry(page, "cerrada hoy", today, today, "00:00", "00:01");
  await chooseMode(page, "timer");
  await startTimerAndSettle(page, "timer de hace cinco semanas");
  await moveRunningStart(page, oldDay, today, "11:00");
  await page.goto("/");
  await expect(page).toHaveURL(withFrom(null));
  const origin = dayGroup(page, oldDay, today);
  await expect(entriesNamed(origin, "vieja a duplicar")).toHaveCount(1);

  // La copia cae en el día de la original (TT-58), anterior a lo que la
  // ventana sería sin el timer: la regla de P-15 la sostiene en la URL.
  await withServerAction(page, async () => {
    await page
      .getByRole("button", { name: "Acciones de la entrada «vieja a duplicar»" })
      .click();
    await page.getByRole("menuitem", { name: "Duplicar" }).click();
  });
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(entriesNamed(origin, "vieja a duplicar")).toHaveCount(2);
});

test("continuar con un timer viejo corriendo extiende la lista hasta la semana del timer que se cierra", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const fiveWeeksAgo = addDays(weekStartOf(today), -35);
  const oldDay = addDays(fiveWeeksAgo, 1);

  // Como al duplicar: se siembra con la ventana extendida, y la página se
  // vuelve a cargar sin `desde` con el timer ya atrás.
  await page.goto(`/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await chooseMode(page, "manual");
  await addEntry(page, "cerrada hoy", today, today, "00:00", "00:01");
  await chooseMode(page, "timer");
  await startTimerAndSettle(page, "timer de hace cinco semanas");
  await moveRunningStart(page, oldDay, today, "09:00");
  await page.goto("/");
  await expect(page).toHaveURL(withFrom(null));

  /*
   * Continuar devuelve dos vistas: el timer nuevo, de esta semana, y el que
   * cierra, de hace cinco. La regla toma la más vieja: la URL pasa a llevarla
   * y la entrada cerrada está en su día.
   */
  const bar = trackerBar(page);
  await withServerAction(page, () =>
    todayGroup(page)
      .getByRole("button", { name: "Continuar «cerrada hoy»", exact: true })
      .click(),
  );
  await expect(descriptionInput(bar)).toHaveValue("cerrada hoy");
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(
    entryRow(dayGroup(page, oldDay, today), "timer de hace cinco semanas"),
  ).toBeVisible();
});

test("detener un timer que ya estaba cinco semanas atrás al cargar la página extiende la lista hasta su semana", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const fiveWeeksAgo = addDays(weekStartOf(today), -35);
  const startDay = addDays(fiveWeeksAgo, 1);

  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "cerrada hoy", today, today, "00:00", "00:01");
  await chooseMode(page, "timer");
  await startTimerAndSettle(page, "timer de hace cinco semanas");
  await moveRunningStart(page, startDay, today, "09:00");

  // La vista del timer también pasa por la regla de P-15: la URL pasa a
  // sostener su semana. Esperarlo evita que esa navegación llegue después de
  // la de abajo.
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));

  /*
   * La página se carga de nuevo sin `desde`, con el timer ya atrás: la
   * ventana lo dibuja por ser el timer activo, pero lo que la ventana sería
   * sin él es la por omisión. Sin esto, la URL que dejó la edición sostendría
   * la semana y el recorrido pasaría sin probar la regla de detener.
   */
  await page.goto("/");
  await expect(page).toHaveURL(withFrom(null));
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();

  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Detener" }).click(),
  );
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();

  // Criterio 17: la URL lleva la semana del inicio y la entrada detenida está
  // en su día, junto con la de hoy.
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(
    entryRow(dayGroup(page, startDay, today), "timer de hace cinco semanas"),
  ).toBeVisible();
  await expect(entryRow(todayGroup(page), "cerrada hoy")).toBeVisible();
});

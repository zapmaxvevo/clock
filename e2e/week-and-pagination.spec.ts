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
  withServerAction,
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

/** La franja de una semana, por su rótulo (TT-47). */
function weekGroup(page: Page, start: CivilDay, today: CivilDay): Locator {
  return page.getByRole("region", { name: weekLabel(start, today), exact: true });
}

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
  return page.getByRole("link", { name: "Cargar más" });
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

  const current = weekGroup(page, thisWeek, today);
  await expect(weekTotal(current)).toHaveText("Total 0:01");
  await expect(current.getByRole("heading", { level: 3 })).toHaveText(["Hoy"]);
  await expect(entryRow(todayGroup(page), "entrada de hoy")).toBeVisible();

  // La semana anterior: el total suma sus dos días, y los días van del más
  // reciente al más viejo, cada uno como `h3` dentro de ella.
  const previous = weekGroup(page, lastWeek, today);
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

test("el total de esta semana sube junto con el contador del timer", async ({ page }) => {
  // El total se muestra en h:mm: el reloj emulado adelanta el minuto que
  // hace falta para verlo cambiar, como en el total del día.
  await page.clock.install();
  const today = todayIn(await workspaceTimeZone());

  await page.goto("/");
  await chooseMode(page, "manual");
  await addEntry(page, "entrada de hoy", today, today, "00:00", "00:01");
  await chooseMode(page, "timer");
  await startTimer(page, "timer que suma a la semana");

  /*
   * `startTimer` toma el grupo de hoy como señal de que el arranque ya está
   * dibujado, pero acá ese grupo ya estaba por la entrada cerrada. Que llegue
   * la respuesta tampoco alcanza: hasta que se aplica, la barra muestra la
   * vista optimista, con el contador quieto en cero. Si el salto del reloj
   * cae ahí, la revalidación retenida de abajo deja el arranque sin aplicar.
   * El contador que corre es la vista del servidor.
   */
  const counter = elapsedCounter(trackerBar(page));
  await expect.poll(() => elapsedOf(counter)).toBeGreaterThanOrEqual(1);

  const current = weekGroup(page, weekStartOf(today), today);
  await expect(weekTotal(current)).toHaveText("Total 0:01");

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
  await loadMore.click();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Esta semana",
    weekLabel(fiveWeeksAgo, today),
  ]);
  await expect(weekHeading(page, fiveWeeksAgo, today)).toBeFocused();

  // La semana cargada está entera: su primer y su último día, y el total de
  // los dos.
  const loaded = weekGroup(page, fiveWeeksAgo, today);
  await expect(weekTotal(loaded)).toHaveText("Total 3:00");
  await expect(loaded.getByRole("heading", { level: 3 })).toHaveText([
    dayLabel(addDays(fiveWeeksAgo, 6), today),
    dayLabel(fiveWeeksAgo, today),
  ]);

  // Otra vez, salteando la sexta semana, que está vacía.
  await expect(loadMore).toHaveAttribute("href", `/?desde=${dayKeyOf(sevenWeeksAgo)}`);
  await loadMore.click();
  await expect(page).toHaveURL(withFrom(sevenWeeksAgo));
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

test("lo cargado sobrevive a la edición de una entrada vieja y a la recarga", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  const fiveWeeksAgo = addDays(weekStartOf(today), -35);
  const oldDay = addDays(fiveWeeksAgo, 1);

  await seedPastWeeks(page, today, fiveWeeksAgo, [
    { description: "informe viejo", day: oldDay, start: "09:00", end: "10:00" },
  ]);

  const loadMore = loadMoreLink(page);
  await expect(loadMore).toHaveAttribute("href", `/?desde=${dayKeyOf(fiveWeeksAgo)}`);
  await loadMore.click();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  const loaded = weekGroup(page, fiveWeeksAgo, today);
  await expect(editDescriptionButton(loaded, "informe viejo")).toBeVisible();

  // Criterio 9: la edición revalida la página, y la revalidación vuelve a
  // dibujar la URL con su `desde`.
  await editDescriptionButton(loaded, "informe viejo").click();
  const field = descriptionInput(loaded);
  await field.fill("informe viejo corregido");
  await withServerAction(page, () => field.press("Enter"));

  await expect(editDescriptionButton(loaded, "informe viejo corregido")).toBeVisible();
  await expect(page).toHaveURL(withFrom(fiveWeeksAgo));
  await expect(weekHeading(page, fiveWeeksAgo, today)).toBeVisible();

  // La recarga tampoco achica la ventana.
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
  await startTimer(page, "timer de hace cinco semanas");

  // El inicio se mueve con el editor del contador, que se dibuja en un
  // portal. Al cerrarse el calendario el foco vuelve a su disparador, y
  // recién ahí se sigue con la hora.
  await page.getByRole("button", { name: "Editar la hora de inicio" }).click();
  const editor = page.getByRole("dialog", { name: "Inicio del timer" });
  await pickDate(page, editor, startDay, today);
  await expect(dateButton(editor)).toBeFocused();
  await editor.getByRole("textbox", { name: "Hora de inicio" }).fill("09:00");
  await page.keyboard.press("Tab");
  await withServerAction(page, () =>
    editor.getByRole("button", { name: "Guardar" }).click(),
  );

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

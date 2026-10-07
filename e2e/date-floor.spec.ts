import {
  addEntry,
  BODY_GRIP_PX,
  closedBlockName,
  dayColumn,
  dragBetween,
  entryBlock,
  grabPoint,
  openLastWeek,
  PERSON_TIMEZONE,
} from "./calendar-page";
import { workspaceCreatedAt, workspaceTimeZone } from "./database";
import { addDays, dayLabel, todayIn, weekStartOf } from "./days";
import { withServerAction } from "./network";
import { expect, test } from "./session";
import {
  addButton,
  chooseMode,
  descriptionInput,
  entryRow,
  pickDate,
  setClock,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos del arreglo «el piso de fechas es fijo» (fase 1): con un
 * workspace creado hoy, como el de producción el primer día de uso, el lunes
 * de la semana pasada se carga desde la barra manual y desde el calendario, y
 * se mueve con un gesto. Con el piso en la creación del workspace, ese lunes
 * quedaba inactivo en el selector de fecha y rayado en el calendario.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que estos recorridos necesitan: un workspace de menos de un día, así que
 * el lunes de la semana pasada es anterior a su creación en cualquier zona.
 * Lo deja así `renewWorkspace`, en la preparación de la suite.
 */
async function expectWorkspaceOfToday(): Promise<void> {
  const age = Date.now() - (await workspaceCreatedAt()).getTime();
  expect(age, "el workspace de los e2e tiene que ser de hoy, no atrasado").toBeLessThan(
    DAY_MS,
  );
}

test("con el workspace creado hoy, la barra manual carga el lunes de la semana pasada", async ({
  page,
}) => {
  await expectWorkspaceOfToday();
  // El hoy que importa es el del workspace, que es el que dibuja la barra.
  const today = todayIn(await workspaceTimeZone());
  const lastMonday = addDays(weekStartOf(today), -7);
  const description = "lunes pasado desde la barra";

  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await descriptionInput(bar).fill(description);
  await pickDate(page, bar, lastMonday, today);
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:00");
  await withServerAction(page, () => addButton(bar).click());

  const group = page.getByRole("region", {
    name: dayLabel(lastMonday, today),
    exact: true,
  });
  await expect(entryRow(group, description)).toContainText(/09:00 – 10:00\s*1:00/);
  await expect(descriptionInput(bar)).toHaveValue("");

  // Lo escribió el servidor, no solo la vista optimista.
  await page.reload();
  await expect(entryRow(group, description)).toContainText(/09:00 – 10:00\s*1:00/);
});

test("con el workspace creado hoy, el calendario crea una entrada el lunes de la semana pasada y la mueve con un gesto", async ({
  page,
}) => {
  await expectWorkspaceOfToday();
  const today = todayIn(PERSON_TIMEZONE);
  const monday = await openLastWeek(page, today);
  const description = "lunes pasado desde el calendario";
  const column = dayColumn(page, monday, today);
  const blockAt = (start: string, end: string) =>
    entryBlock(
      column,
      closedBlockName({ description, day: monday, today, start, end, duration: "1:00" }),
    );

  await addEntry(page, { day: monday, today, start: "10:00", description });
  const created = blockAt("10:00", "11:00");
  await expect(created).toBeVisible();

  await withServerAction(page, () =>
    dragBetween(page, { on: created, y: BODY_GRIP_PX }, () =>
      grabPoint(page, monday, today, "14:00"),
    ),
  );
  const moved = blockAt("14:00", "15:00");
  await expect(moved).toBeVisible();
  await expect(created).toHaveCount(0);

  // Lo escribió el servidor, no solo la vista optimista.
  await page.reload();
  await expect(moved).toBeVisible();
  await expect(created).toHaveCount(0);
});

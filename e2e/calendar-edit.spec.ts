import { randomUUID } from "node:crypto";

import {
  addEntryButton,
  bottomToNowLine,
  calendarHref,
  calendarRegion,
  chooseDialogAction,
  clickSlot,
  closedBlockName,
  columnName,
  dayColumn,
  deleteConfirmation,
  dialogButton,
  dialogClock,
  dialogDescription,
  dialogNotice,
  entryBlock,
  entryBlocks,
  entryDialog,
  expectEditDialog,
  expectPeriod,
  expectSideBySide,
  followPeriodLink,
  isCalendarPage,
  NEAR_MIDNIGHT_MINUTES,
  NEAR_MIDNIGHT_REASON,
  NOW_LINE_TOLERANCE_PX,
  openDetails,
  outsideNotice,
  PERSON_TIMEZONE,
  pickDialogDay,
  runningBlockName,
  screenNotice,
  zoomIn,
  openLastWeek,
  addEntry,
} from "./calendar-page";
import { seedProject } from "./database";
import {
  addDays,
  dayLabel,
  minuteOfDayIn,
  todayIn,
  weekdayLabel,
  weekLabel,
  weekStartOf,
} from "./days";
import {
  holdActionResponses,
  holdRefreshes,
  loseActionResponses,
  recordActions,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import {
  escapeRegExp,
  openProjectPicker,
  pickProject,
  projectPicker,
  projectPopup,
  projectSearch,
  startTimer,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos del slice 8c: el calendario escribe (§7 del contrato,
 * «Recorridos obligatorios de `e2e/calendar-edit.spec.ts`»). Un test por
 * recorrido, porque cada uno abre una sola sesión y el endpoint de sesión ya
 * responde 429 con la suite completa; la segunda pestaña es otra página del
 * mismo contexto. El último es del 11b: el `Escape` del selector de proyecto
 * dentro del diálogo (m13 de sus correcciones de arranque). Las entradas se
 * crean desde la grilla y van en la semana anterior, salvo el timer: ninguna
 * hora queda en el futuro y la semana tiene todos sus días. La grilla de una
 * semana sin hoy abre con las 08:00 arriba (CAL-14), así que las franjas de la
 * mañana están a la vista. Toda persona nueva tiene el lunes como primer día,
 * `dd/MM/yyyy` y 24 h; lo esperado se calcula con `days.ts`. Sin reloj
 * emulado.
 */

/** El título de los avisos de «Guardar» (§5.4). */
const ENTRY_NOT_SAVED = "No se pudo guardar la entrada.";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** «Detener» con cambios sin guardar (decisión 4 del contrato). */
const SAVE_BEFORE_STOP = "Guardá los cambios antes de detener el timer.";

/** TT-07: la búsqueda del selector de proyecto sin coincidencias. */
const NO_PROJECT_MATCHES = "Ningún proyecto coincide con la búsqueda.";

test("un clic en una franja agrega la entrada, y guardarla en otra semana avisa con el enlace a esa semana", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const wednesday = addDays(lastWeek, 2);
  const description = "planificación del sprint";
  const region = calendarRegion(page);

  // Criterio 1 (CAL-74): en un período sin hoy, «Agregar entrada» propone su
  // primer día a las 08:00, con una franja de largo. «Cancelar» no pide nada
  // y devuelve el foco al botón.
  await addEntryButton(page).click();
  const proposed = entryDialog(page, "Agregar entrada");
  await expectEditDialog(proposed, {
    description: "",
    date: dayLabel(lastWeek, today),
    start: "08:00",
    end: "09:00",
    duration: "1:00",
  });
  await dialogButton(proposed, "Cancelar").click();
  await expect(proposed).toBeHidden();
  await expect(addEntryButton(page)).toBeFocused();

  // Criterio 1 (CAL-43, CAL-45): el clic en la franja de las 10:00 del
  // miércoles propone ese día y una franja. Enter en «Hora de fin» confirma
  // el fin y agrega en el mismo evento.
  await clickSlot(page, wednesday, today, "10:00");
  const adding = entryDialog(page, "Agregar entrada");
  await expectEditDialog(adding, {
    description: "",
    date: dayLabel(wednesday, today),
    start: "10:00",
    end: "11:00",
    duration: "1:00",
  });
  await dialogDescription(adding).fill(description);
  const end = dialogClock(adding, "Hora de fin");
  await end.fill("11:30");
  await withServerAction(page, () => end.press("Enter"));
  await expect(adding).toBeHidden();

  // El bloque nuevo, con el foco, y el total de su columna. Sigue en el
  // período, así que no hay aviso de CAL-46.
  const wednesdayColumn = dayColumn(page, wednesday, today);
  const block = entryBlock(
    wednesdayColumn,
    closedBlockName({
      description,
      day: wednesday,
      today,
      start: "10:00",
      end: "11:30",
      duration: "1:30",
    }),
  );
  await expect(block).toBeFocused();
  await expect(block).toContainText("10:00 – 11:30");
  await expect(wednesdayColumn).toHaveAccessibleName(
    columnName(wednesday, today, "1:30"),
  );
  await expect(
    region.getByRole("status").filter({ hasText: "La entrada quedó" }),
  ).toHaveCount(0);

  // Criterio 13 (CAL-46): con la fecha de hace tres semanas, la entrada sale
  // del período. El aviso nombra su día con el rótulo de columna, el foco
  // queda en la región y el enlace lleva a esa semana con el bloque a la vista.
  const moved = addDays(wednesday, -14);
  await page.keyboard.press("Enter");
  const editing = entryDialog(page, "Editar entrada");
  await expectEditDialog(editing, {
    description,
    date: dayLabel(wednesday, today),
    start: "10:00",
    end: "11:30",
    duration: "1:30",
  });
  await pickDialogDay(page, editing, moved);
  await withServerAction(page, () => dialogButton(editing, "Guardar").click());
  await expect(editing).toBeHidden();
  const notice = outsideNotice(page, weekdayLabel(moved, today), "week");
  await expect(notice).toBeVisible();
  await expect(region).toBeFocused();
  await expect(entryBlocks(region, description)).toHaveCount(0);

  await notice.getByRole("link", { name: "Ir a esa semana", exact: true }).click();
  const movedWeek = weekStartOf(moved);
  await expectPeriod(page, movedWeek, "week", weekLabel(movedWeek, today));
  await expect(
    entryBlock(
      dayColumn(page, moved, today),
      closedBlockName({
        description,
        day: moved,
        today,
        start: "10:00",
        end: "11:30",
        duration: "1:30",
      }),
    ),
  ).toBeInViewport();

  // P-m1: el aviso habla del período que se veía, así que en la semana de la
  // entrada ya no está.
  await expect(notice).toHaveCount(0);
});

test("guardar aplica descripción, proyecto y horario juntos, y un horario rechazado no guarda nada", async ({
  page,
}) => {
  const project = `Calendario ${randomUUID().slice(0, 8)}`;
  await seedProject({ name: project });
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const tuesday = addDays(lastWeek, 1);
  const column = dayColumn(page, tuesday, today);

  await addEntry(page, {
    day: tuesday,
    today,
    start: "09:00",
    description: "revisión inicial",
  });
  const created = entryBlock(
    column,
    closedBlockName({
      description: "revisión inicial",
      day: tuesday,
      today,
      start: "09:00",
      end: "10:00",
      duration: "1:00",
    }),
  );

  // Criterio 6: descripción, proyecto y fin cambian juntos con «Guardar».
  await created.click();
  const dialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  await dialogDescription(dialog).fill("revisión final");
  await pickProject(page, dialog, project, project);
  await dialogClock(dialog, "Hora de fin").fill("10:30");
  await dialogClock(dialog, "Hora de fin").press("Tab");
  await withServerAction(page, () => dialogButton(dialog, "Guardar").click());
  await expect(dialog).toBeHidden();
  const saved = entryBlock(
    column,
    closedBlockName({
      description: "revisión final",
      day: tuesday,
      today,
      start: "09:00",
      end: "10:30",
      duration: "1:30",
      project,
    }),
  );
  await expect(saved).toBeFocused();

  // Criterio 6: la descripción y un horario rechazado (TT-73) no se guardan
  // por separado. El aviso queda en el diálogo, sin «Reintentar»: no es de red.
  await saved.click();
  await expect(dialogDescription(dialog)).toBeFocused();
  await dialogDescription(dialog).fill("descripción descartada");
  await dialogClock(dialog, "Hora de inicio").fill("10:30");
  await dialogClock(dialog, "Hora de inicio").press("Tab");
  await withServerAction(page, () => dialogButton(dialog, "Guardar").click());
  const failure = dialogNotice(dialog, ENTRY_NOT_SAVED);
  await expect(failure).toContainText("La entrada tiene que durar al menos un minuto.");
  await expect(failure.getByRole("button", { name: "Reintentar" })).toHaveCount(0);

  // «Cancelar» descarta el borrador: el bloque es el de antes, también en una
  // lectura nueva.
  await dialogButton(dialog, "Cancelar").click();
  await expect(dialog).toBeHidden();
  await expect(saved).toBeFocused();
  await expect(entryBlocks(calendarRegion(page), "descripción descartada")).toHaveCount(
    0,
  );
  await page.reload();
  await expect(saved).toBeVisible();
});

test("con el timer corriendo se crea desde la grilla, y el diálogo del timer guarda y detiene", async ({
  page,
}) => {
  const minute = minuteOfDayIn(PERSON_TIMEZONE);
  test.skip(
    minute < NEAR_MIDNIGHT_MINUTES || minute > 1440 - NEAR_MIDNIGHT_MINUTES,
    NEAR_MIDNIGHT_REASON,
  );
  const today = todayIn(PERSON_TIMEZONE);
  const thisWeek = weekStartOf(today);
  const running = "timer de la escritura";
  const renamed = "timer renombrado";

  await page.goto("/");
  await startTimer(page, running);

  // Criterio 2 (P-01): con el timer corriendo, la grilla crea igual.
  const lastWeek = await openLastWeek(page, today);
  const thursday = addDays(lastWeek, 3);
  await addEntry(page, {
    day: thursday,
    today,
    start: "10:00",
    description: "con el timer abierto",
  });
  await expect(
    entryBlock(
      dayColumn(page, thursday, today),
      closedBlockName({
        description: "con el timer abierto",
        day: thursday,
        today,
        start: "10:00",
        end: "11:00",
        duration: "1:00",
      }),
    ),
  ).toBeVisible();

  // Criterio 10 (P-06): un cambio sin guardar deja «Detener» inactivo, con
  // su motivo asociado; deshacerlo lo devuelve, y una hora tecleada sin
  // confirmar también cuenta como cambio.
  await followPeriodLink(page, "Hoy", thisWeek, "week", "Esta semana");
  const todayColumn = dayColumn(page, today, today);
  const timer = entryBlocks(todayColumn, running);
  await expect(timer).toHaveAccessibleName(/, en curso$/);
  await timer.click();
  const dialog = entryDialog(page, "Timer en curso");
  await expect(dialogDescription(dialog)).toBeFocused();
  const stop = dialogButton(dialog, "Detener");
  await expect(stop).not.toHaveAttribute("aria-disabled", "true");

  await dialogDescription(dialog).fill(renamed);
  await expect(stop).toHaveAttribute("aria-disabled", "true");
  await expect(stop).toHaveAccessibleDescription(SAVE_BEFORE_STOP);
  await expect(dialog.getByText(SAVE_BEFORE_STOP, { exact: true })).toBeVisible();

  await dialogDescription(dialog).fill(running);
  await expect(stop).not.toHaveAttribute("aria-disabled", "true");
  const start = dialogClock(dialog, "Hora de inicio");
  await start.fill("00:00");
  await expect(stop).toHaveAttribute("aria-disabled", "true");

  // Criterio 10 (CAL-40): descripción e inicio juntos; Enter en «Hora de
  // inicio» confirma y guarda, y el diálogo se cierra.
  await dialogDescription(dialog).fill(renamed);
  await withServerAction(page, () => start.press("Enter"));
  await expect(dialog).toBeHidden();
  const renamedBlock = entryBlock(
    todayColumn,
    runningBlockName({ description: renamed, day: today, today, start: "00:00" }),
  );
  await expect(renamedBlock).toBeFocused();
  await expect(renamedBlock).toContainText("00:00 – en curso");

  // A «5 min» un minuto mide 9,6 px y la altura mínima deja de mandar a los
  // tres minutos, como en el recorrido 3 del 8: a «1 h», durante la primera
  // media hora del día el bloque mide la mínima y su borde no dice dónde
  // termina.
  await zoomIn(page, "30 min");
  await zoomIn(page, "15 min");
  await zoomIn(page, "5 min");
  await expect
    .poll(() => bottomToNowLine(renamedBlock, todayColumn))
    .toBeLessThan(NOW_LINE_TOLERANCE_PX);

  // «Detener» sin cambios detiene: el bloque ya no corre y tiene el foco. El
  // zoom se lo llevó, así que se le devuelve antes de abrir.
  await renamedBlock.focus();
  await page.keyboard.press("Enter");
  await expect(dialogDescription(dialog)).toBeFocused();
  await withServerAction(page, () => stop.click());
  await expect(dialog).toBeHidden();
  const stopped = entryBlocks(todayColumn, renamed);
  await expect(stopped).toHaveAccessibleName(
    new RegExp(
      `^${escapeRegExp(renamed)}, ${escapeRegExp(weekdayLabel(today, today))}, de 00:00 a `,
    ),
  );
  await expect(stopped).toBeFocused();
});

test("duplicar y borrar desde el menú del diálogo llevan el foco a la copia, al bloque y a la región", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const thursday = addDays(lastWeek, 3);
  const description = "entrada a duplicar";

  await addEntry(page, {
    day: thursday,
    today,
    start: "09:00",
    description: description,
  });
  const blocks = entryBlock(
    dayColumn(page, thursday, today),
    closedBlockName({
      description,
      day: thursday,
      today,
      start: "09:00",
      end: "10:00",
      duration: "1:00",
    }),
  );
  await expect(blocks).toHaveCount(1);
  const originalId = await blocks.getAttribute("data-entry-block");
  const copy = blocks.and(page.locator(`:not([data-entry-block="${originalId}"])`));

  // Criterio 11: el puntero muestra el detalle del bloque, y con el diálogo
  // abierto ningún bloque muestra el suyo.
  await blocks.hover();
  await expect(openDetails(page)).toHaveCount(1);
  await blocks.click();
  const dialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  await expect(openDetails(page)).toHaveCount(0);

  // CAL-69: «Duplicar» cierra el diálogo y deja la copia al lado, con el foco.
  await withServerAction(page, () =>
    chooseDialogAction(page, dialog, description, "Duplicar"),
  );
  await expect(dialog).toBeHidden();
  await expectSideBySide(blocks);
  await expect(copy).toBeFocused();

  // CAL-70: abrir la copia con el puntero y elegir «Borrar». Con la
  // confirmación abierta tampoco hay detalles; «Cancelar» devuelve el foco al
  // botón de la copia.
  await copy.click();
  await expect(dialogDescription(dialog)).toBeFocused();
  await chooseDialogAction(page, dialog, description, "Borrar");
  const confirmation = deleteConfirmation(page);
  await expect(confirmation).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(openDetails(page)).toHaveCount(0);
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(copy).toBeFocused();

  // Confirmar saca la copia y deja el foco en la región.
  await copy.click();
  await chooseDialogAction(page, dialog, description, "Borrar");
  await withServerAction(page, () =>
    confirmation.getByRole("button", { name: "Borrar", exact: true }).click(),
  );
  await expect(confirmation).toBeHidden();
  await expect(blocks).toHaveCount(1);
  await expect(blocks).toHaveAttribute("data-entry-block", originalId ?? "");
  await expect(calendarRegion(page)).toBeFocused();
});

test("«Reintentar» guarda el borrador actual, y guardar una entrada borrada en otra pestaña avisa en la pantalla", async ({
  page,
}) => {
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const friday = addDays(lastWeek, 4);
  const region = calendarRegion(page);

  await addEntry(page, { day: friday, today, start: "09:00", description: "A" });
  await entryBlocks(region, "A").click();
  const dialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();

  // Criterio 9: la respuesta de «Guardar» se pierde después de que el
  // servidor escribió, y las revalidaciones quedan retenidas para que la
  // pantalla no se entere por otro lado.
  const stopLosing = await loseActionResponses(page, isCalendarPage);
  const releaseRefreshes = await holdRefreshes(page, isCalendarPage);
  await dialogDescription(dialog).fill("B");
  await dialogButton(dialog, "Guardar").click();
  const lost = dialogNotice(dialog, ENTRY_NOT_SAVED);
  await expect(lost).toContainText(NETWORK_FAILURE);
  const retry = lost.getByRole("button", { name: "Reintentar", exact: true });
  await expect(retry).toBeVisible();

  // Otra pestaña de la misma sesión ve que el primer intento se aplicó.
  const other = await page.context().newPage();
  await other.goto(calendarHref(lastWeek));
  await expect(entryBlocks(calendarRegion(other), "B")).toHaveCount(1);

  // «Reintentar» después de editar manda lo editado, no el primer pedido. El
  // foco pasa a «Guardar» mientras el pedido viaja, nunca a `body`.
  await dialogDescription(dialog).fill("C");
  await stopLosing();
  const releaseResponse = await holdActionResponses(page, isCalendarPage);
  await retry.click();
  const save = dialogButton(dialog, "Guardar");
  await expect(save).toBeFocused();
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await withServerAction(page, async () => releaseResponse());
  releaseRefreshes();
  await expect(dialog).toBeHidden();
  await expect(region.getByRole("alert")).toHaveCount(0);
  const saved = entryBlocks(region, "C");
  await expect(saved).toHaveCount(1);
  await expect(entryBlocks(region, "B")).toHaveCount(0);

  // Criterio 12 (CAL-72): con el diálogo abierto, la otra pestaña borra la
  // entrada desde `/`. «Guardar» cierra el diálogo y el aviso queda en la
  // pantalla, con el foco en la región.
  await saved.click();
  await expect(dialogDescription(dialog)).toBeFocused();
  await other.goto("/");
  await other
    .getByRole("button", { name: "Acciones de la entrada «C»", exact: true })
    .click();
  await other.getByRole("menuitem", { name: "Borrar", exact: true }).click();
  await withServerAction(other, () =>
    deleteConfirmation(other)
      .getByRole("button", { name: "Borrar", exact: true })
      .click(),
  );
  await other.close();

  await dialogDescription(dialog).fill("D");
  await withServerAction(page, () => dialogButton(dialog, "Guardar").click());
  await expect(dialog).toBeHidden();
  const gone = screenNotice(page, ENTRY_NOT_SAVED);
  await expect(gone).toContainText("Esa entrada ya no existe.");
  await expect(region).toBeFocused();
});

test("`Escape` en el selector de proyecto del diálogo sin coincidencias cierra solo el selector y conserva el borrador", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const description = `escape del selector ${suffix}`;
  const draft = `borrador del diálogo ${suffix}`;
  const today = todayIn(PERSON_TIMEZONE);
  const lastWeek = await openLastWeek(page, today);
  const tuesday = addDays(lastWeek, 1);
  await addEntry(page, { day: tuesday, today, start: "09:00", description });
  const block = entryBlock(
    dayColumn(page, tuesday, today),
    closedBlockName({
      description,
      day: tuesday,
      today,
      start: "09:00",
      end: "10:00",
      duration: "1:00",
    }),
  );

  // m13 del 11b: con la lista vacía, el `Escape` del selector no llega al
  // diálogo. El borrador sin guardar sigue a la vista.
  await block.click();
  const dialog = entryDialog(page, "Editar entrada");
  await expect(dialogDescription(dialog)).toBeFocused();
  await dialogDescription(dialog).fill(draft);
  const sent = recordActions(page);
  await openProjectPicker(page, dialog);
  await projectSearch(page).fill(`inexistente ${suffix}`);
  await expect(
    projectPopup(page).getByRole("status").filter({ hasText: NO_PROJECT_MATCHES }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(projectPopup(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(projectPicker(dialog)).toBeFocused();
  await expect(dialogDescription(dialog)).toHaveValue(draft);

  // El segundo `Escape` cierra el diálogo sin guardar nada.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(block).toBeFocused();
  expect(sent).toHaveLength(0);
});

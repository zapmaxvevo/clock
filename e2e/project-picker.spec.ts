import type { Locator } from "@playwright/test";

import { archiveProject, markTaskDone, seedProject } from "./database";
import {
  holdActionResponses,
  isAction,
  recordActions,
  withServerAction,
} from "./network";
import { expect, test } from "./session";
import {
  addManualEntry,
  backgroundRgb,
  continueButton,
  descriptionInput,
  elapsedCounter,
  entryRow,
  isTrackerPage,
  openProjectPicker,
  pickProject,
  projectOption,
  projectPicker,
  projectPopup,
  projectSearch,
  startTimer,
  stopTimer,
  taskOption,
  todayGroup,
  trackerBar,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos del slice 10: el selector de proyecto y tarea en la barra y en
 * la fila (criterios 15 y 16).
 *
 * El workspace es uno solo para todos los specs y los proyectos no se pueden
 * borrar en la fase 1, así que todo lo sembrado lleva un sufijo propio del
 * recorrido, y las búsquedas del selector usan ese sufijo para dejar a la
 * vista solo lo del recorrido. Los proyectos se siembran antes de entrar a la
 * pantalla, que lee el catálogo al cargar. El vacío de TT-87 y la membresía
 * desactivada no se prueban acá: lo cubren el modelo y el test del componente
 * (§7 del contrato).
 */

/** TT-06: lo que muestra la barra sin proyecto. */
const NO_SELECTION = "Proyecto";

/** TT-10 y TT-50. */
const NO_PROJECT = "Sin proyecto";

/** TT-90: el aviso de «Iniciar» nombra la operación. */
const START_FAILED = "No se pudo iniciar el timer.";

/** TT-77. */
const PROJECT_UNAVAILABLE = "Ese proyecto ya no está disponible.";

/** TT-07: la búsqueda sin coincidencias. */
const NO_MATCHES = "Ningún proyecto coincide con la búsqueda.";

/**
 * El punto de color del proyecto dentro de un disparador. Es decorativo
 * (`aria-hidden`), así que no tiene rol ni nombre: se encuentra por la marca
 * de componente que le pone el selector, no por su estilo.
 */
function projectDot(picker: Locator): Locator {
  return picker.locator('[data-slot="project-dot"]');
}

test("la barra busca sin acentos, elige una tarea con su proyecto y el timer la conserva", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const client = `C ${suffix}`;
  const web = `Web ${suffix}`;
  const design = `Diseño ${suffix}`;
  const loose = `Suelto ${suffix}`;
  await seedProject({ name: web, client, tasks: [design] });
  await seedProject({ name: loose });

  await page.goto("/");
  const bar = trackerBar(page);
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);

  // TT-07: parte del nombre de la tarea, sin acento y en mayúsculas. Una
  // tarea que coincide trae su proyecto con solo esa tarea; el proyecto
  // suelto del recorrido no coincide, y «Sin proyecto» solo va con la
  // búsqueda vacía.
  await openProjectPicker(page, bar);
  await projectSearch(page).fill(`ISENO ${suffix}`);
  const popup = projectPopup(page);
  await expect(popup.getByRole("group", { name: client })).toBeVisible();
  await expect(projectOption(page, web)).toBeVisible();
  await expect(projectOption(page, taskOption(web, design))).toBeVisible();
  await expect(popup.getByRole("option")).toHaveCount(2);
  await expect(projectOption(page, loose)).toHaveCount(0);
  await expect(projectOption(page, NO_PROJECT)).toHaveCount(0);

  // TT-11: elegir la tarea fija también su proyecto.
  await projectOption(page, taskOption(web, design)).click();
  await expect(popup).toBeHidden();
  await expect(projectPicker(bar)).toBeFocused();
  await expect(projectPicker(bar)).toHaveText(taskOption(web, design));

  // TT-38: el timer guardó el par, y una carga nueva lo trae del servidor.
  await startTimer(page, `con tarea ${suffix}`);
  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(`con tarea ${suffix}`);
  await expect(projectPicker(bar)).toHaveText(taskOption(web, design));

  // TT-49: la fila muestra el proyecto con la tarea, y la barra detenida
  // vuelve a no tener proyecto.
  await stopTimer(page, `con tarea ${suffix}`);
  const row = entryRow(todayGroup(page), `con tarea ${suffix}`);
  await expect(projectPicker(row)).toHaveText(taskOption(web, design));
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);
});

test("con el timer corriendo, otro proyecto y «Sin proyecto» se guardan sobre la entrada abierta sin detenerla", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Corriendo ${suffix}`;
  const other = `Cambiado ${suffix}`;
  const description = `timer con proyecto ${suffix}`;
  await seedProject({ name: project });
  await seedProject({ name: other });

  await page.goto("/");
  const bar = trackerBar(page);
  await pickProject(page, bar, project, suffix);
  await startTimer(page, description);
  await expect(projectPicker(bar)).toHaveText(project);

  // TT-27: el cambio viaja sobre la entrada que corre, y una carga nueva lo
  // trae del servidor.
  await withServerAction(page, () => pickProject(page, bar, other, suffix));
  await expect(projectPicker(bar)).toHaveText(other);
  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(projectPicker(bar)).toHaveText(other);

  // TT-10: quitarle el proyecto también.
  await withServerAction(page, () => pickProject(page, bar, NO_PROJECT));
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);

  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(description);
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);
  await expect(entryRow(page.getByRole("main"), description)).toHaveCount(0);
});

test("mientras viaja «Detener», la barra muestra el último proyecto del timer y al llegar la respuesta queda sin proyecto", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const first = `Primero ${suffix}`;
  const second = `Segundo ${suffix}`;
  const description = `timer que se detiene ${suffix}`;
  await seedProject({ name: first });
  await seedProject({ name: second });

  await page.goto("/");
  const bar = trackerBar(page);
  await pickProject(page, bar, first, suffix);
  await startTimer(page, description);
  await withServerAction(page, () => pickProject(page, bar, second, suffix));
  await expect(projectPicker(bar)).toHaveText(second);

  // La respuesta de «Detener» se retiene: el servidor ya cerró la entrada y
  // la barra muestra la vista optimista, con el proyecto que tenía el timer y
  // no el que se eligió al iniciarlo.
  const release = await holdActionResponses(page, isTrackerPage);
  const sent = page.waitForRequest(isAction);
  await bar.getByRole("button", { name: "Detener" }).click();
  await sent;
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(projectPicker(bar)).toHaveText(second);

  // TT-65: con la respuesta, la entrada pasa a la lista con su proyecto y la
  // barra queda sin proyecto.
  release();
  const row = entryRow(todayGroup(page), description);
  await expect(row).toBeVisible();
  await expect(projectPicker(row)).toHaveText(second);
  await expect(projectPicker(bar)).toHaveText(NO_SELECTION);
});

test("la fila cambia de proyecto, deja el foco en su selector y muestra el punto del nuevo", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const before = `Antes ${suffix}`;
  const after = `Después ${suffix}`;
  const description = `entrada a mover ${suffix}`;
  await seedProject({ name: before, color: "blue" });
  await seedProject({ name: after, color: "red" });

  await page.goto("/");
  await addManualEntry(page, description, {
    project: { option: before, search: suffix },
  });
  const row = entryRow(todayGroup(page), description);
  await expect(projectPicker(row)).toHaveText(before);

  // TT-54: pickProject espera el foco en el disparador de la fila al elegir.
  await withServerAction(page, () => pickProject(page, row, after, suffix));
  await expect(projectPicker(row)).toHaveText(after);

  // TT-49: después de una carga nueva, el proyecto nuevo con su punto, del
  // color sembrado. El color llega por el tema, así que se afirma «es rojo»
  // y no el valor exacto de la paleta.
  await page.reload();
  const reloadedRow = entryRow(todayGroup(page), description);
  const picker = projectPicker(reloadedRow);
  await expect(picker).toHaveText(after);
  const dot = projectDot(picker);
  await expect(dot).toBeVisible();
  await expect
    .poll(async () => {
      const { red, green, blue } = await backgroundRgb(dot);
      return red > green && red > blue;
    })
    .toBe(true);
});

test("el selector no ofrece privados ajenos, archivados ni tareas hechas, y la fila conserva el archivado", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const foreign = `Privado ajeno ${suffix}`;
  const own = `Privado propio ${suffix}`;
  const shared = `Público ${suffix}`;
  const openTask = `Abierta ${suffix}`;
  const doneTask = `Hecha ${suffix}`;
  const description = `entrada archivada ${suffix}`;

  // La persona entra antes de sembrar: es lo que le crea la membresía que
  // la hace miembro del privado propio.
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await seedProject({ name: foreign, isPublic: false });
  await seedProject({ name: own, isPublic: false, members: [email] });
  await seedProject({ name: shared, tasks: [openTask, doneTask] });
  await markTaskDone(shared, doneTask);
  await page.reload();

  // TT-08: el privado del que es miembro sí, el ajeno no. PR-99: la tarea
  // hecha no, y su proyecto sí.
  const bar = trackerBar(page);
  await openProjectPicker(page, bar);
  await projectSearch(page).fill(suffix);
  await expect(projectOption(page, own)).toBeVisible();
  await expect(projectOption(page, shared)).toBeVisible();
  await expect(projectOption(page, taskOption(shared, openTask))).toBeVisible();
  await expect(projectOption(page, foreign)).toHaveCount(0);
  await expect(projectOption(page, taskOption(shared, doneTask))).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(projectPopup(page)).toBeHidden();
  await expect(projectPicker(bar)).toBeFocused();

  // m-9: la entrada se crea por la interfaz y el proyecto se archiva después.
  await addManualEntry(page, description, {
    project: { option: shared, search: suffix },
  });
  await archiveProject(shared);

  // TT-104 y PR-23: la fila lo conserva; el selector ya no lo ofrece, ni a
  // su tarea. El privado propio sigue, así la búsqueda no está vacía por
  // otra causa.
  await page.reload();
  const row = entryRow(todayGroup(page), description);
  await expect(projectPicker(row)).toHaveText(shared);
  await openProjectPicker(page, trackerBar(page));
  await projectSearch(page).fill(suffix);
  await expect(projectOption(page, own)).toBeVisible();
  await expect(projectOption(page, shared)).toHaveCount(0);
  await expect(projectOption(page, taskOption(shared, openTask))).toHaveCount(0);
});

test("un proyecto archivado después de elegirlo en la barra hace fallar «Iniciar» con TT-77", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Archivado al iniciar ${suffix}`;
  const description = `timer sin iniciar ${suffix}`;
  await seedProject({ name: project });

  await page.goto("/");
  const bar = trackerBar(page);
  await pickProject(page, bar, project, suffix);

  // PR-94: otra persona lo archiva mientras la barra lo tiene elegido.
  await archiveProject(project);
  await descriptionInput(bar).fill(description);
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Iniciar" }).click(),
  );

  // TT-77 no se reintenta: repetir no cambia el desenlace (TT-89). El
  // borrador se conserva, como lo tecleado, para elegir otro proyecto.
  const notice = page.getByRole("alert").filter({ hasText: START_FAILED });
  await expect(notice).toContainText(PROJECT_UNAVAILABLE);
  await expect(notice.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(projectPicker(bar)).toHaveText(project);

  await page.reload();
  await expect(trackerBar(page).getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(entryRow(page.getByRole("main"), description)).toHaveCount(0);
  await openProjectPicker(page, trackerBar(page));
  await projectSearch(page).fill(suffix);
  await expect(
    projectPopup(page).getByRole("status").filter({ hasText: NO_MATCHES }),
  ).toBeVisible();
  await expect(projectOption(page, project)).toHaveCount(0);
});

test("continuar una fila con proyecto y tarea arranca el timer con los dos", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Continuado ${suffix}`;
  const task = `Seguimiento ${suffix}`;
  const description = `entrada a continuar ${suffix}`;
  await seedProject({ name: project, tasks: [task] });

  await page.goto("/");
  await addManualEntry(page, description, {
    project: { option: taskOption(project, task), search: suffix },
  });

  // TT-57: el timer nuevo copia descripción, proyecto y tarea.
  await withServerAction(page, () =>
    continueButton(todayGroup(page), description).click(),
  );
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(bar)).toHaveValue(description);
  await expect(projectPicker(bar)).toHaveText(taskOption(project, task));

  await page.reload();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(projectPicker(bar)).toHaveText(taskOption(project, task));
});

test("el selector de la barra es accesible por teclado y sus letras no disparan atajos", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Teclado ${suffix}`;
  const task = `Atajo ${suffix}`;
  await seedProject({ name: project, tasks: [task] });

  await page.goto("/");
  const bar = trackerBar(page);
  const picker = bar.getByRole("combobox", { name: NO_SELECTION, exact: true });
  await expect(picker).toBeVisible();
  await expect(picker).toHaveText(NO_SELECTION);

  // Criterio 16: al abrir, el foco va al buscador.
  await picker.click();
  const search = projectSearch(page);
  await expect(search).toBeFocused();

  // TT-26: «n» escribe en el buscador y no arranca un timer.
  const sent = recordActions(page);
  await page.keyboard.press("n");
  await expect(search).toHaveValue("n");
  await expect(projectPopup(page)).toBeVisible();
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Detener" })).toHaveCount(0);
  expect(sent).toHaveLength(0);

  // Escape cierra sin elegir y devuelve el foco al disparador.
  await page.keyboard.press("Escape");
  await expect(projectPopup(page)).toBeHidden();
  await expect(picker).toBeFocused();
  await expect(picker).toHaveText(NO_SELECTION);

  // Elegir la tarea por teclado: la búsqueda deja el proyecto y su tarea, en
  // ese orden, y el foco vuelve al disparador.
  await picker.press("Enter");
  await expect(search).toBeFocused();
  await search.fill(task);
  const option = projectOption(page, taskOption(project, task));
  await expect(projectPopup(page).getByRole("option")).toHaveCount(2);
  const optionId = await option.getAttribute("id");
  expect(optionId).not.toBeNull();
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", optionId ?? "");
  await search.press("Enter");
  await expect(projectPopup(page)).toBeHidden();
  await expect(picker).toBeFocused();
  await expect(picker).toHaveText(taskOption(project, task));
  expect(sent).toHaveLength(0);
});

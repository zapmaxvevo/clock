import type { Browser, Locator, Page } from "@playwright/test";

import {
  archiveClient,
  archiveProject,
  clientIdOf,
  makeProjectManager,
  projectIdOf,
  projectUpdateAuditsOf,
  revokeProjectManager,
  seedClient,
  seedEntries,
  seedProject,
  setRole,
  type SeedProject,
} from "./database";
import { addDays, dayKeyOf, todayIn } from "./days";
import { OWNER_EMAIL } from "./environment";
import {
  dropActionRequests,
  holdRefreshes,
  loseActionResponses,
  openSecondTab,
  recordActions,
  withServerAction,
} from "./network";
import {
  archivedMark,
  billableByDefaultField,
  chooseClient,
  chooseProjectFilter,
  clientField,
  colorRadio,
  columnCell,
  dialogNotice,
  editButton,
  expectProjectsTitle,
  isProjectsPage,
  nameField,
  newTaskButton,
  noteField,
  openEditDialog,
  openProjects,
  PROJECT_NOT_SAVED,
  projectRow,
  projectSavedStatus,
  projectSearchField,
  PROJECTS_PATH,
  saveButton,
  screenEditNotice,
} from "./projects-page";
import { expectGroupNames, groupRow, reportsUrl } from "./reports-page";
import { expect, test } from "./session";
import {
  backgroundRgb,
  entryRow,
  projectPicker,
  todayGroup,
  uniqueSuffix,
} from "./tracker-page";

/**
 * Recorridos de P1: la edición de un proyecto desde su fila de `/proyectos`
 * (§9.3.1 del contrato, criterios 1 a 7, 16, 17 y 21).
 *
 * El workspace es uno solo para todos los specs y los proyectos no se borran
 * hasta P2, así que todo nombre lleva el sufijo del recorrido y la lista se
 * abre con ese sufijo en el buscador, que deja a la vista solo sus filas. La
 * persona de cada recorrido entra como `member`; lo que la interfaz todavía
 * no produce (la marca de responsable, un cliente archivado, un proyecto
 * archivado) se siembra, siempre después de que la persona entró, que es lo
 * que le crea la membresía.
 */

/** PR-72. */
const PROJECT_UNAVAILABLE = "Ese proyecto ya no está disponible.";

/** PR-84. */
const FORBIDDEN = "No tenés permiso para hacer esto.";

/** PR-77. */
const PROJECT_NAME_TAKEN = "Ya hay un proyecto con ese nombre para ese cliente.";

/** TT-89 y PR-90: el aviso de la falla de red, el único con «Reintentar». */
const SAVE_FAILED = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** PR-15: la ayuda del color, que la edición no lleva (D-P1-9). */
const COLOR_HINT = "Si no elegís uno, se asigna automáticamente.";

/** La zona de las personas de la suite, que no eligen otra (P-03). */
const PERSON_TIMEZONE = "America/Argentina/Buenos_Aires";

/** `/proyectos` con el sufijo del recorrido en el buscador (PR-95). */
function searchQuery(suffix: string): string {
  return `?buscar=${encodeURIComponent(suffix)}`;
}

/**
 * Siembra un proyecto del que la persona es responsable (PR-55) y abre la
 * lista con el sufijo en el buscador. La persona tiene que haber entrado.
 */
async function seedManagedProject(
  page: Page,
  email: string,
  project: SeedProject,
  suffix: string,
): Promise<void> {
  await seedProject(project);
  await makeProjectManager(email, project.name);
  await openProjects(page, searchQuery(suffix));
}

/**
 * Guarda el diálogo de edición y espera el éxito: el diálogo se cierra, la
 * pantalla anuncia el nombre que quedó y el foco vuelve a «Editar» de la fila
 * (D-P1-8).
 */
async function saveAndExpectSaved(
  page: Page,
  dialog: Locator,
  name: string,
): Promise<void> {
  await withServerAction(page, () => saveButton(dialog).click());
  await expect(dialog).toBeHidden();
  await expect(projectSavedStatus(page, name)).toBeVisible();
  await expect(editButton(projectRow(page, name), name)).toBeFocused();
}

/** La pestaña del owner de la suite en la lista, con el sufijo en el buscador. */
async function openAsOwner(browser: Browser, suffix: string): Promise<Page> {
  const ownerPage = await openSecondTab(
    browser,
    OWNER_EMAIL,
    `${PROJECTS_PATH}${searchQuery(suffix)}`,
  );
  await expectProjectsTitle(ownerPage);
  return ownerPage;
}

test("el owner cambia nombre, cliente, color, nota y facturable desde la fila, y el cambio se ve en el rastreador y en el reporte", async ({
  page,
  email,
  browser,
}) => {
  const suffix = uniqueSuffix();
  const original = `Original ${suffix}`;
  const renamed = `Renombrado ${suffix}`;
  const client = `Cliente nuevo ${suffix}`;
  const note = `Nota del proyecto ${suffix}`;
  const today = todayIn(PERSON_TIMEZONE);
  const recent = `entrada de hoy ${suffix}`;

  // La persona del recorrido tiene dos entradas del proyecto, una de hoy y
  // una de la semana pasada (PR-101 … PR-103: las pasadas también cambian).
  await page.goto("/");
  await seedProject({ name: original, color: "blue" });
  await seedClient(client);
  await seedEntries(email, PERSON_TIMEZONE, [
    {
      description: recent,
      day: dayKeyOf(today),
      start: "00:00",
      end: "00:01",
      project: original,
    },
    {
      description: `entrada pasada ${suffix}`,
      day: dayKeyOf(addDays(today, -8)),
      start: "10:00",
      end: "11:00",
      project: original,
    },
  ]);
  const projectId = await projectIdOf(original);

  const ownerPage = await openAsOwner(browser, suffix);
  const row = projectRow(ownerPage, original);

  // D-P1-7, D-P1-8: el botón dice «Editar» y nombra al proyecto; el diálogo
  // se titula «Editar proyecto» y lo describe con su nombre.
  const edit = editButton(row, original);
  await expect(edit).toHaveText("Editar");
  const dialog = await openEditDialog(ownerPage, original);
  await expect(dialog).toHaveAccessibleDescription(original);

  // Arranca con los valores de la fila; el color está elegido y sin la ayuda
  // del alta (D-P1-9).
  await expect(nameField(dialog)).toHaveValue(original);
  await expect(clientField(dialog)).toContainText("Sin cliente");
  await expect(colorRadio(dialog, "Azul")).toBeChecked();
  await expect(billableByDefaultField(dialog)).not.toBeChecked();
  await expect(noteField(dialog)).toHaveValue("");
  await expect(dialog.getByText(COLOR_HINT, { exact: true })).toHaveCount(0);

  await nameField(dialog).fill(renamed);
  await chooseClient(ownerPage, dialog, client);
  await colorRadio(dialog, "Rojo").check();
  await noteField(dialog).fill(note);
  await billableByDefaultField(dialog).check();
  await saveAndExpectSaved(ownerPage, dialog, renamed);

  // La fila muestra lo nuevo.
  const saved = projectRow(ownerPage, renamed);
  await expect(columnCell(saved, "Cliente")).toHaveText(client);
  await expect(
    saved.getByRole("img", { name: "Color: Rojo", exact: true }),
  ).toBeVisible();
  await expect(projectRow(ownerPage, original)).toHaveCount(0);

  // Criterio 1: una constancia con los cinco campos, de quien editó.
  const audits = await projectUpdateAuditsOf(projectId);
  expect(audits).toHaveLength(1);
  expect(audits[0].actorEmail).toBe(OWNER_EMAIL);
  expect(audits[0].previousValue).toEqual({
    name: original,
    clientId: null,
    color: "blue",
    note: "",
    billableByDefault: false,
  });
  expect(audits[0].nextValue).toEqual({
    name: renamed,
    clientId: (await clientIdOf(client)).toLowerCase(),
    color: "red",
    note,
    billableByDefault: true,
  });

  // Una carga nueva trae lo guardado, también la nota y el facturable, que la
  // fila no muestra.
  await ownerPage.reload();
  const reopened = await openEditDialog(ownerPage, renamed);
  await expect(nameField(reopened)).toHaveValue(renamed);
  await expect(clientField(reopened)).toContainText(client);
  await expect(colorRadio(reopened, "Rojo")).toBeChecked();
  await expect(noteField(reopened)).toHaveValue(note);
  await expect(billableByDefaultField(reopened)).toBeChecked();
  await ownerPage.context().close();

  // Criterio 21: la fila de la entrada tiene el nombre y el punto nuevos.
  await page.reload();
  const entry = entryRow(todayGroup(page), recent);
  await expect(projectPicker(entry)).toHaveText(renamed);
  const dot = projectPicker(entry).locator('[data-slot="project-dot"]');
  await expect
    .poll(async () => {
      const { red, green, blue } = await backgroundRgb(dot);
      return red > green && red > blue;
    })
    .toBe(true);

  // Y el reporte, con la entrada pasada, agrupa por el cliente nuevo.
  const range = { first: addDays(today, -8), last: today };
  await page.goto(reportsUrl(range, "cliente", [], { projects: [projectId] }));
  await expectGroupNames(page, [client]);
  await page.goto(reportsUrl(range, "proyecto", [], { projects: [projectId] }));
  await expect(groupRow(page, renamed)).toBeVisible();
});

test("si el nombre nuevo deja de coincidir con la búsqueda, la fila se va y el foco queda en el buscador", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Buscado ${suffix}`;
  const outside = `Fuera de la búsqueda ${uniqueSuffix()}`;

  await openProjects(page);
  await seedManagedProject(page, email, { name: project }, suffix);

  const dialog = await openEditDialog(page, project);
  await nameField(dialog).fill(outside);
  await withServerAction(page, () => saveButton(dialog).click());

  // D-P1-8: el diálogo sale con su fila, y la pantalla mueve el foco.
  await expect(dialog).toBeHidden();
  await expect(projectSavedStatus(page, outside)).toBeVisible();
  await expect(projectRow(page, project)).toHaveCount(0);
  await expect(projectRow(page, outside)).toHaveCount(0);
  await expect(projectSearchField(page)).toBeFocused();
  await expect(projectSearchField(page)).toHaveValue(suffix);
});

test("editar solo la nota deja una constancia con solo la nota, y guardar sin cambios cierra sin mandar", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Con nota ${suffix}`;
  const note = `Solo la nota ${suffix}`;

  await openProjects(page);
  await seedManagedProject(page, email, { name: project }, suffix);
  const projectId = await projectIdOf(project);

  // D-P1-3: el parche lleva solo lo que cambió.
  const dialog = await openEditDialog(page, project);
  await noteField(dialog).fill(note);
  await saveAndExpectSaved(page, dialog, project);
  const audits = await projectUpdateAuditsOf(projectId);
  expect(audits).toHaveLength(1);
  expect(audits[0].actorEmail).toBe(email);
  expect(audits[0].previousValue).toEqual({ note: "" });
  expect(audits[0].nextValue).toEqual({ note });

  // Criterio 16: sin cambios, «Guardar» cierra sin pedir nada.
  const sent = recordActions(page);
  const again = await openEditDialog(page, project);
  await expect(noteField(again)).toHaveValue(note);
  await saveButton(again).click();
  await expect(again).toBeHidden();
  await expect(editButton(projectRow(page, project), project)).toBeFocused();
  expect(sent).toHaveLength(0);
  expect(await projectUpdateAuditsOf(projectId)).toHaveLength(1);
});

test("un member ve «Editar» solo en el proyecto del que es responsable, y como admin edita uno ajeno", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const own = `Propio ${suffix}`;
  const foreign = `Ajeno ${suffix}`;
  const renamed = `Ajeno renombrado ${suffix}`;

  await openProjects(page);
  await seedProject({ name: foreign });
  await seedManagedProject(page, email, { name: own }, suffix);

  // PR-55, PR-57: el responsable sí; un member que no lo es, no.
  await expect(editButton(projectRow(page, own), own)).toBeVisible();
  const foreignRow = projectRow(page, foreign);
  await expect(foreignRow).toBeVisible();
  await expect(foreignRow.getByRole("button", { name: /^Editar/ })).toHaveCount(0);

  // PR-56: un admin edita cualquiera.
  await setRole(email, "admin");
  await page.reload();
  const dialog = await openEditDialog(page, foreign);
  await nameField(dialog).fill(renamed);
  await saveAndExpectSaved(page, dialog, renamed);
  const audits = await projectUpdateAuditsOf(await projectIdOf(renamed));
  expect(audits).toHaveLength(1);
  expect(audits[0].actorEmail).toBe(email);
});

test("un nombre repetido para el cliente muestra PR-77 sin «Reintentar», también al cambiar solo el cliente", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const taken = `Tomado ${suffix}`;
  const project = `Mismo nombre ${suffix}`;
  const client = `Cliente con el mismo ${suffix}`;

  // El otro «Mismo nombre» es privado y ajeno: la persona no lo ve, así su
  // fila es la única con ese nombre, y el índice igual lo cuenta. Se siembra
  // después de leer el id y la marca de responsable, que buscan por nombre.
  await openProjects(page);
  await seedProject({ name: taken });
  await seedManagedProject(page, email, { name: project }, suffix);
  const projectId = await projectIdOf(project);
  await seedProject({ name: project, client, isPublic: false });
  await page.reload();

  // PR-77: el mismo nombre que otro sin cliente.
  const dialog = await openEditDialog(page, project);
  await nameField(dialog).fill(taken);
  await withServerAction(page, () => saveButton(dialog).click());
  const notice = dialogNotice(dialog, PROJECT_NAME_TAKEN);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(PROJECT_NOT_SAVED);
  // TT-89: un nombre repetido ya describe el estado real y no se reintenta.
  await expect(dialog.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(nameField(dialog)).toHaveValue(taken);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // PR-50: con el mismo nombre, cambiar solo el cliente a uno que ya tiene
  // un proyecto así también choca. Abrir otra vez arranca de la fila.
  const second = await openEditDialog(page, project);
  await expect(nameField(second)).toHaveValue(project);
  await chooseClient(page, second, client);
  await withServerAction(page, () => saveButton(second).click());
  await expect(dialogNotice(second, PROJECT_NAME_TAKEN)).toBeVisible();
  await expect(second.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  expect(await projectUpdateAuditsOf(projectId)).toHaveLength(0);
});

test("una edición que no llegó al servidor ofrece «Reintentar» con lo escrito, y reintentar la guarda", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Sin red ${suffix}`;
  const renamed = `Con red ${suffix}`;

  await openProjects(page);
  await seedManagedProject(page, email, { name: project }, suffix);
  const projectId = await projectIdOf(project);

  const restore = await dropActionRequests(page, isProjectsPage);
  const dialog = await openEditDialog(page, project);
  await nameField(dialog).fill(renamed);
  await saveButton(dialog).click();

  // TT-89, PR-90: la falla de red se reintenta, y lo escrito sigue.
  const notice = dialogNotice(dialog, SAVE_FAILED);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(PROJECT_NOT_SAVED);
  await expect(nameField(dialog)).toHaveValue(renamed);
  expect(await projectUpdateAuditsOf(projectId)).toHaveLength(0);

  await restore();
  await withServerAction(page, () =>
    notice.getByRole("button", { name: "Reintentar" }).click(),
  );
  await expect(dialog).toBeHidden();
  await expect(projectSavedStatus(page, renamed)).toBeVisible();
  await expect(projectRow(page, renamed)).toBeVisible();
  expect(await projectUpdateAuditsOf(projectId)).toHaveLength(1);
});

test("«Reintentar» después de una respuesta perdida responde éxito y deja una sola constancia", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Respuesta perdida ${suffix}`;
  const renamed = `Respuesta recuperada ${suffix}`;

  await openProjects(page);
  await seedManagedProject(page, email, { name: project }, suffix);
  const projectId = await projectIdOf(project);

  const releaseRefreshes = await holdRefreshes(page, isProjectsPage);
  const restoreResponses = await loseActionResponses(page, isProjectsPage);
  const dialog = await openEditDialog(page, project);
  await nameField(dialog).fill(renamed);
  await saveButton(dialog).click();
  const notice = dialogNotice(dialog, SAVE_FAILED);
  await expect(notice).toBeVisible();

  // El primer intento se aplicó: sin esto, un pedido que no hubiera llegado
  // haría pasar el recorrido sin probar nada.
  expect(await projectUpdateAuditsOf(projectId)).toHaveLength(1);

  // D-P1-3: el reintento ya no difiere de lo guardado, responde éxito y no
  // escribe otra vez.
  await restoreResponses();
  await withServerAction(page, async () => {
    await notice.getByRole("button", { name: "Reintentar" }).click();
    releaseRefreshes();
  });
  await expect(dialog).toBeHidden();
  await expect(projectRow(page, renamed)).toBeVisible();
  expect(await projectUpdateAuditsOf(projectId)).toHaveLength(1);
});

test("si el proyecto se archiva con «Editar» abierto, el aviso de PR-72 queda en la pantalla con el foco", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Se archiva al editar ${suffix}`;

  await openProjects(page);
  await seedManagedProject(page, email, { name: project }, suffix);
  const dialog = await openEditDialog(page, project);
  await noteField(dialog).fill(`Nota tardía ${suffix}`);

  // Otra persona lo archiva. Con «Activos», la revalidación trae la lista
  // sin la fila, y con ella se va el diálogo.
  await archiveProject(project);
  await withServerAction(page, () => saveButton(dialog).click());

  await expect(dialog).toBeHidden();
  await expect(projectRow(page, project)).toHaveCount(0);
  const notice = screenEditNotice(page, PROJECT_UNAVAILABLE);
  await expect(notice).toBeVisible();
  await expect(notice).toBeFocused();
});

test("si la persona deja de ser responsable con «Editar» abierto, el aviso de PR-84 queda en la pantalla con el foco", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Deja de ser responsable ${suffix}`;

  await openProjects(page);
  await seedManagedProject(page, email, { name: project }, suffix);
  const dialog = await openEditDialog(page, project);
  await nameField(dialog).fill(`Sin permiso ${suffix}`);

  // La fila sigue, pero la revalidación la trae sin «Editar».
  await revokeProjectManager(email, project);
  await withServerAction(page, () => saveButton(dialog).click());

  await expect(dialog).toBeHidden();
  const row = projectRow(page, project);
  await expect(row).toBeVisible();
  await expect(editButton(row, project)).toHaveCount(0);
  const notice = screenEditNotice(page, FORBIDDEN);
  await expect(notice).toBeVisible();
  await expect(notice).toBeFocused();
});

test("el cliente archivado del proyecto aparece con «(archivado)» y se conserva al renombrar", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Con cliente archivado ${suffix}`;
  const renamed = `Renombrado con cliente archivado ${suffix}`;
  const client = `Cliente archivado ${suffix}`;

  await openProjects(page);
  await seedProject({ name: project, client });
  await archiveClient(client);
  await makeProjectManager(email, project);
  await openProjects(page, searchQuery(suffix));

  // D-P1-9, PR-98: el diálogo lo muestra, marcado.
  const dialog = await openEditDialog(page, project);
  await expect(clientField(dialog)).toContainText(`${client} (archivado)`);

  // Renombrar sin tocar el cliente no lo valida.
  await nameField(dialog).fill(renamed);
  await saveAndExpectSaved(page, dialog, renamed);
  await expect(columnCell(projectRow(page, renamed), "Cliente")).toContainText(client);
  const audits = await projectUpdateAuditsOf(await projectIdOf(renamed));
  expect(audits).toHaveLength(1);
  expect(audits[0].nextValue).toEqual({ name: renamed });
});

test("un proyecto archivado, con «Todos», no ofrece «Editar» ni «Nueva tarea»", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Archivado sin acciones ${suffix}`;

  // Es responsable: sin el archivado, tendría las dos acciones.
  await openProjects(page);
  await seedManagedProject(page, email, { name: project }, suffix);
  const row = projectRow(page, project);
  await expect(editButton(row, project)).toBeVisible();
  await expect(newTaskButton(row, project)).toBeVisible();

  await archiveProject(project);
  await page.reload();
  await expect(row).toHaveCount(0);
  await chooseProjectFilter(page, "Todos", suffix);

  // D-P1-4, D-P1-7: en solo lectura hasta restaurarlo (P2).
  await expect(row).toBeVisible();
  await expect(archivedMark(row)).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
});

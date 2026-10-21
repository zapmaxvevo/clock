import { randomUUID } from "node:crypto";

import type { Browser, Locator, Page } from "@playwright/test";

import { archiveProject, revokeProjectManager } from "./database";
import {
  holdRefreshes,
  loseActionResponses,
  openSecondTab,
  withServerAction,
} from "./network";
import {
  columnCell,
  dialogNotice,
  expectProjectsTitle,
  isProjectsPage,
  nameField,
  newTaskButton,
  openProjects,
  projectRow,
  projectRows,
  PROJECTS_PATH,
  saveButton,
  searchProjects,
  taskList,
} from "./projects-page";
import { expect, signIn, TEST_EMAIL_DOMAIN, test } from "./session";
import { uniqueSuffix } from "./tracker-page";

/**
 * Recorridos del slice 9: la pantalla de proyectos, sus tres altas y el
 * reintento de «Nuevo proyecto» por el ADR 0007 (criterios 6, 7, 10 y 12).
 * Desde P1 la lista es una tabla plana: cada proyecto es una fila, con su
 * cliente en una columna, y se busca con `projectRow`.
 *
 * El workspace es uno solo para todos los specs, que corren en paralelo, y la
 * base persiste entre corridas sin que nadie pueda borrar lo creado. Por eso
 * todo nombre lleva un sufijo propio del recorrido, y las afirmaciones de
 * orden miran solo las filas que el recorrido creó, aisladas con el buscador.
 * El vacío de PR-85 no se prueba acá: existe una sola vez en la vida de la
 * base, y lo cubren la integración y el test del componente.
 */

const NO_CLIENT = "Sin cliente";

/** PR-77. */
const PROJECT_NAME_TAKEN = "Ya hay un proyecto con ese nombre para ese cliente.";

/** TT-89 y PR-90: el aviso de la falla de red, el único con «Reintentar». */
const SAVE_FAILED = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** PR-72. */
const PROJECT_UNAVAILABLE = "Ese proyecto ya no está disponible.";

/** PR-84. */
const FORBIDDEN = "No tenés permiso para hacer esto.";

/** El título del aviso de «Nueva tarea», que nombra la operación (TT-90). */
const TASK_NOT_CREATED = "No se pudo crear la tarea.";

function headerButton(page: Page, name: "Nuevo cliente" | "Nuevo proyecto"): Locator {
  return page.getByRole("button", { name, exact: true });
}

/** Los diálogos se dibujan en un portal, así que se buscan en la página. */
function dialogNamed(
  page: Page,
  name: "Nuevo cliente" | "Nuevo proyecto" | "Nueva tarea",
): Locator {
  return page.getByRole("dialog", { name });
}

/**
 * El anuncio de un alta de cliente, en su región `aria-live`. Un cliente sin
 * proyectos no tiene fila (PR-62), así que es la única señal del éxito.
 */
function clientCreatedStatus(page: Page, name: string): Locator {
  return page.getByRole("status").filter({ hasText: `Cliente «${name}» creado` });
}

/**
 * Guarda un diálogo y espera a que se cierre con el foco de vuelta en su
 * botón de apertura, que es lo que dice que el alta terminó bien.
 */
async function saveAndClose(dialog: Locator, trigger: Locator): Promise<void> {
  await saveButton(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function createClient(page: Page, name: string): Promise<void> {
  const trigger = headerButton(page, "Nuevo cliente");
  await trigger.click();
  const dialog = dialogNamed(page, "Nuevo cliente");
  await nameField(dialog).fill(name);
  await saveAndClose(dialog, trigger);
  await expect(clientCreatedStatus(page, name)).toBeVisible();
}

type ProjectFields = {
  readonly name: string;
  /** El nombre del cliente, o `null` para dejarlo en «Sin cliente». */
  readonly client: string | null;
  /** El nombre accesible de un color de la paleta, o `null` para no elegir. */
  readonly color?: string | null;
};

/** Abre «Nuevo proyecto» y completa los campos, sin guardar. */
async function fillProjectDialog(page: Page, fields: ProjectFields): Promise<Locator> {
  await headerButton(page, "Nuevo proyecto").click();
  const dialog = dialogNamed(page, "Nuevo proyecto");
  await nameField(dialog).fill(fields.name);
  if (fields.client !== null) {
    await dialog.getByRole("combobox", { name: "Cliente" }).click();
    await page.getByRole("option", { name: fields.client, exact: true }).click();
    await expect(dialog.getByRole("combobox", { name: "Cliente" })).toContainText(
      fields.client,
    );
  }
  if (fields.color !== undefined && fields.color !== null) {
    await dialog
      .getByRole("radiogroup", { name: "Color" })
      .getByRole("radio", { name: fields.color, exact: true })
      .check();
  }
  return dialog;
}

/** Crea el proyecto y espera su fila, con su cliente o «Sin cliente». */
async function createProject(page: Page, fields: ProjectFields): Promise<void> {
  const dialog = await fillProjectDialog(page, fields);
  await saveAndClose(dialog, headerButton(page, "Nuevo proyecto"));
  const row = projectRow(page, fields.name);
  await expect(row).toBeVisible();
  await expect(columnCell(row, "Cliente")).toHaveText(fields.client ?? NO_CLIENT);
}

async function createTask(page: Page, projectName: string, name: string): Promise<void> {
  const project = projectRow(page, projectName);
  const trigger = newTaskButton(project, projectName);
  await trigger.click();
  const dialog = dialogNamed(page, "Nueva tarea");
  await nameField(dialog).fill(name);
  await saveAndClose(dialog, trigger);
  await expect(
    taskList(project, projectName).getByRole("listitem").filter({ hasText: name }),
  ).toBeVisible();
}

/**
 * Guarda «Nuevo proyecto» con la respuesta perdida y espera el aviso. El
 * diálogo sigue abierto, con el nombre como estaba.
 */
/**
 * Abre «Nueva tarea» de un proyecto sin cliente y escribe el nombre, sin
 * guardar: el recorrido cambia el estado por debajo antes de apretar
 * «Guardar».
 */
async function fillTaskDialog(
  page: Page,
  projectName: string,
  name: string,
): Promise<Locator> {
  const project = projectRow(page, projectName);
  await newTaskButton(project, projectName).click();
  const dialog = dialogNamed(page, "Nueva tarea");
  await nameField(dialog).fill(name);
  return dialog;
}

/**
 * El aviso de una tarea que no se creó, ya fuera del diálogo: la pantalla lo
 * muestra cuando la revalidación sacó al diálogo del árbol (PR-72, PR-84).
 */
function screenTaskNotice(page: Page, message: string): Locator {
  return page
    .getByRole("alert")
    .filter({ hasText: TASK_NOT_CREATED })
    .filter({ hasText: message });
}

async function createProjectLosingResponse(page: Page, name: string): Promise<Locator> {
  const dialog = await fillProjectDialog(page, { name, client: null });
  await saveButton(dialog).click();

  const notice = dialogNotice(dialog, SAVE_FAILED);
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(nameField(dialog)).toHaveValue(name);
  return dialog;
}

/**
 * Comprueba desde otra pestaña que el primer intento se aplicó. Sin esto, un
 * pedido que no hubiera llegado al servidor haría pasar el recorrido sin
 * probar nada: el reintento sería la primera alta.
 */
async function expectAppliedElsewhere(
  browser: Browser,
  email: string,
  name: string,
): Promise<void> {
  const otherPage = await openSecondTab(browser, email, PROJECTS_PATH);
  await expectProjectsTitle(otherPage);
  await expect(projectRow(otherPage, name)).toBeVisible();
  await otherPage.context().close();
}

/**
 * Lo que quedó en el servidor, leído de una carga nueva: un solo proyecto con
 * ese nombre, en «Sin cliente».
 */
async function expectSingleProject(page: Page, name: string): Promise<void> {
  await page.reload();
  await expectProjectsTitle(page);
  const row = projectRow(page, name);
  await expect(row).toHaveCount(1);
  await expect(columnCell(row, "Cliente")).toHaveText(NO_CLIENT);
}

test("las altas de la cabecera dejan cada proyecto en su fila, con su cliente, en orden alfabético sin agrupar", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const clientA = `A ${suffix}`;
  const clientB = `B ${suffix}`;
  // Agrupados por cliente, el orden sería «Beta», «Alfa», «Aaa»: la tabla
  // plana los ordena por nombre (D-P1-6).
  const projectA = `Beta de A ${suffix}`;
  const projectB = `Alfa de B ${suffix}`;
  const loose = `Aaa suelto ${suffix}`;

  // Criterio 12: se entra por la navegación.
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Proyectos", exact: true })
    .click();
  await expect(page).toHaveURL(isProjectsPage);
  await expectProjectsTitle(page);

  // PR-04: cada entidad se crea desde un solo lugar.
  await expect(headerButton(page, "Nuevo cliente")).toHaveCount(1);
  await expect(headerButton(page, "Nuevo proyecto")).toHaveCount(1);

  // m-7 y R3-m5: el anuncio nombra al cliente. El segundo nombra a A, así un
  // anuncio que quedó del primero no hace pasar el paso.
  await createClient(page, clientB);
  await createClient(page, clientA);

  await createProject(page, { name: projectB, client: clientB });
  await createProject(page, { name: projectA, client: clientA });
  await createProject(page, { name: loose, client: null, color: "Verde azulado" });

  // El orden, solo entre las filas que creó este recorrido: la búsqueda por
  // el sufijo deja a la vista las suyas.
  await searchProjects(page, suffix);
  const rows = projectRows(page);
  await expect(rows).toHaveCount(3);
  for (const [index, name] of [loose, projectB, projectA].entries()) {
    await expect(columnCell(rows.nth(index), "Nombre")).toHaveText(name);
  }

  // PR-14 y PR-97: el proyecto sin cliente dice «Sin cliente», con su punto
  // de color.
  const looseProject = projectRow(page, loose);
  await expect(columnCell(looseProject, "Cliente")).toHaveText(NO_CLIENT);
  await expect(
    looseProject.getByRole("img", { name: "Color: Verde azulado", exact: true }),
  ).toBeVisible();
  await expect(columnCell(projectRow(page, projectA), "Cliente")).toHaveText(clientA);
  await expect(columnCell(projectRow(page, projectB), "Cliente")).toHaveText(clientB);
});

test("el responsable crea una tarea y otra persona member no ve «Nueva tarea»", async ({
  page,
  browser,
}) => {
  const suffix = uniqueSuffix();
  const project = `Proyecto con tarea ${suffix}`;
  const task = `Tarea ${suffix}`;

  // PR-19 y PR-40: quien crea el proyecto queda como responsable y crea
  // tareas.
  await openProjects(page);
  await createProject(page, { name: project, client: null });
  await createTask(page, project, task);

  // Otra persona, que entra como `member` y no es responsable: ve el
  // proyecto público y su tarea, pero no puede sumarle tareas.
  const otherContext = await browser.newContext();
  await signIn(otherContext, `e2e-otra-persona-${randomUUID()}@${TEST_EMAIL_DOMAIN}`);
  const otherPage = await otherContext.newPage();
  await openProjects(otherPage);
  const seen = projectRow(otherPage, project);
  await expect(seen).toBeVisible();
  await expect(
    taskList(seen, project).getByRole("listitem").filter({ hasText: task }),
  ).toBeVisible();
  await expect(newTaskButton(seen, project)).toHaveCount(0);
  await expect(seen.getByRole("button", { name: /Nueva tarea/ })).toHaveCount(0);
  await otherContext.close();
});

test("si el proyecto se archiva con «Nueva tarea» abierto, el aviso de PR-72 queda a la vista con el foco", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Proyecto que se archiva ${suffix}`;

  await openProjects(page);
  await createProject(page, { name: project, client: null });
  const dialog = await fillTaskDialog(page, project, `Tarea tardía ${suffix}`);

  // Otra persona lo archiva mientras el diálogo está abierto. La revalidación
  // del alta trae un catálogo sin el proyecto, y con él se va el diálogo.
  await archiveProject(project);
  await withServerAction(page, () => saveButton(dialog).click());

  await expect(dialog).toBeHidden();
  await expect(projectRow(page, project)).toHaveCount(0);
  const notice = screenTaskNotice(page, PROJECT_UNAVAILABLE);
  await expect(notice).toBeVisible();
  await expect(notice).toBeFocused();
});

test("si la persona deja de ser responsable con «Nueva tarea» abierto, el aviso de PR-84 queda a la vista con el foco", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const project = `Proyecto sin responsable ${suffix}`;

  await openProjects(page);
  await createProject(page, { name: project, client: null });
  const dialog = await fillTaskDialog(page, project, `Tarea sin permiso ${suffix}`);

  // El proyecto sigue a la vista, pero la revalidación lo trae sin «Nueva
  // tarea», y el diálogo sale del árbol.
  await revokeProjectManager(email, project);
  await withServerAction(page, () => saveButton(dialog).click());

  await expect(dialog).toBeHidden();
  const seen = projectRow(page, project);
  await expect(seen).toBeVisible();
  await expect(newTaskButton(seen, project)).toHaveCount(0);
  const notice = screenTaskNotice(page, FORBIDDEN);
  await expect(notice).toBeVisible();
  await expect(notice).toBeFocused();
});

test("un proyecto con un nombre que ya existe para ese cliente muestra PR-77 y el diálogo sigue abierto", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const client = `Cliente ${suffix}`;
  const project = `Proyecto repetido ${suffix}`;

  await openProjects(page);
  await createClient(page, client);
  await createProject(page, { name: project, client });

  const dialog = await fillProjectDialog(page, { name: project, client });
  await withServerAction(page, () => saveButton(dialog).click());

  await expect(dialogNotice(dialog, PROJECT_NAME_TAKEN)).toBeVisible();
  // TT-89: un nombre repetido ya describe el estado real y no se reintenta.
  await expect(dialog.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(nameField(dialog)).toHaveValue(project);
  await expect(dialogNotice(dialog, SAVE_FAILED)).toHaveCount(0);
});

test("reintentar un alta de proyecto cuya respuesta se perdió deja un solo proyecto", async ({
  page,
  email,
  browser,
}) => {
  const project = `Proyecto reintentado ${uniqueSuffix()}`;

  await openProjects(page);
  const releaseRefreshes = await holdRefreshes(page, isProjectsPage);
  const restoreResponses = await loseActionResponses(page, isProjectsPage);

  // PR-90: el aviso de la falla de red ofrece reintentar.
  const dialog = await createProjectLosingResponse(page, project);
  await expectAppliedElsewhere(browser, email, project);

  await restoreResponses();
  const retry = dialogNotice(dialog, SAVE_FAILED).getByRole("button", {
    name: "Reintentar",
  });
  await withServerAction(page, async () => {
    await retry.click();
    releaseRefreshes();
  });

  // ADR 0007: el reintento lleva el id del primer intento y responde ese
  // proyecto, sin chocar con su nombre.
  await expect(dialog).toBeHidden();
  await expect(headerButton(page, "Nuevo proyecto")).toBeFocused();
  await expect(page.getByText(PROJECT_NAME_TAKEN)).toHaveCount(0);

  await expectSingleProject(page, project);
});

test("apretar Guardar otra vez con el aviso a la vista no crea otro proyecto", async ({
  page,
  email,
  browser,
}) => {
  const project = `Proyecto guardado otra vez ${uniqueSuffix()}`;

  await openProjects(page);
  const releaseRefreshes = await holdRefreshes(page, isProjectsPage);
  const restoreResponses = await loseActionResponses(page, isProjectsPage);

  const dialog = await createProjectLosingResponse(page, project);
  await expectAppliedElsewhere(browser, email, project);

  // R3-M1: «Guardar» en vez de «Reintentar». Con el aviso visible, reusa el
  // id pendiente; si no lo reusara, chocaría con el primero y mostraría PR-77.
  await restoreResponses();
  await withServerAction(page, async () => {
    await saveButton(dialog).click();
    releaseRefreshes();
  });

  await expect(dialog).toBeHidden();
  await expect(headerButton(page, "Nuevo proyecto")).toBeFocused();
  await expect(page.getByText(PROJECT_NAME_TAKEN)).toHaveCount(0);

  await expectSingleProject(page, project);
});

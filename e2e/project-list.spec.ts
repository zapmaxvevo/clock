import type { Page } from "@playwright/test";

import { archiveProject, makeProjectManager, seedProject } from "./database";
import { requestsDuring } from "./network";
import {
  archivedMark,
  chooseProjectFilter,
  columnCell,
  editButton,
  isProjectsPage,
  isProjectsUrl,
  newTaskButton,
  openProjects,
  PROJECT_COLUMNS,
  projectRow,
  projectRows,
  projectSearchField,
  projectsTable,
  projectStatusFilter,
  searchProjects,
  taskList,
  type ProjectFilterLabel,
} from "./projects-page";
import { expect, test } from "./session";
import { escapeRegExp, uniqueSuffix } from "./tracker-page";

/**
 * Recorridos de P1: la lista de `/proyectos`, con sus columnas, el buscador y
 * el filtro de estado en la URL (§9.3.2 del contrato, criterios 13 a 15).
 *
 * La base de los e2e acumula proyectos de todas las corridas, y nada se borra
 * hasta P2: cada recorrido aísla sus filas con el sufijo en el buscador, y
 * sus afirmaciones de orden miran solo esas. Los vacíos que dependen de la
 * lista entera («Todavía no hay proyectos», «No hay proyectos activos», «No
 * hay proyectos archivados») no se pueden producir en una base compartida: los
 * cubren el modelo y el test de la pantalla. Acá va el de la búsqueda.
 */

/** TT-07, D-P1-6: la búsqueda sin coincidencias, la misma redacción que el selector. */
const NO_MATCHES = "Ningún proyecto coincide con la búsqueda.";

/** Las filas de la tabla son exactamente `names`, en ese orden, por su celda «Nombre». */
async function expectRowNames(page: Page, names: readonly string[]): Promise<void> {
  const rows = projectRows(page);
  await expect(rows).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(columnCell(rows.nth(index), "Nombre")).toHaveText(
      new RegExp(`^${escapeRegExp(name)}(?:\\s*Archivado)?$`),
    );
  }
}

/** El filtro y el buscador muestran el estado de la URL (PR-95). */
async function expectListState(
  page: Page,
  filter: ProjectFilterLabel,
  search: string,
): Promise<void> {
  await expect(page).toHaveURL(isProjectsUrl(filter, search));
  await expect(projectStatusFilter(page)).toContainText(filter);
  await expect(projectSearchField(page)).toHaveValue(search);
}

test("la tabla muestra nombre, cliente, acceso, tareas y acciones, en orden alfabético, y busca por proyecto y cliente pero no por tarea", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const alpha = `Alfa ${suffix}`;
  const beta = `Beta ${suffix}`;
  const gamma = `Gamma ${suffix}`;
  const client = `Diseño Ñandú ${suffix}`;
  const taskA = `Tarea a ${suffix}`;
  const taskB = `Tarea b ${suffix}`;

  // La persona entra antes de sembrar: es lo que le crea la membresía que la
  // hace miembro del privado y responsable de «Alfa».
  await openProjects(page);
  await seedProject({ name: gamma, client, color: "green", tasks: [taskB, taskA] });
  await seedProject({ name: alpha });
  await seedProject({ name: beta, isPublic: false, members: [email] });
  await makeProjectManager(email, alpha);
  await page.reload();
  await searchProjects(page, suffix);

  // D-P1-6, criterio 13: las cinco columnas, sin tiempo imputado.
  await expect(projectsTable(page).getByRole("columnheader")).toHaveText([
    ...PROJECT_COLUMNS,
  ]);
  await expectRowNames(page, [alpha, beta, gamma]);

  // «Alfa»: sin cliente, público, sin tareas, y la persona es responsable.
  const alphaRow = projectRow(page, alpha);
  await expect(columnCell(alphaRow, "Cliente")).toHaveText("Sin cliente");
  await expect(columnCell(alphaRow, "Acceso")).toHaveText("Público");
  await expect(columnCell(alphaRow, "Tareas")).toHaveText("");
  await expect(editButton(alphaRow, alpha)).toHaveText("Editar");
  await expect(newTaskButton(alphaRow, alpha)).toBeVisible();

  // «Beta»: privado del que es miembro, sin ser responsable: sin acciones.
  const betaRow = projectRow(page, beta);
  await expect(columnCell(betaRow, "Acceso")).toHaveText("Privado");
  await expect(betaRow.getByRole("button")).toHaveCount(0);

  // «Gamma»: su cliente, su punto y sus tareas activas por nombre, en orden.
  const gammaRow = projectRow(page, gamma);
  await expect(columnCell(gammaRow, "Cliente")).toHaveText(client);
  await expect(
    gammaRow.getByRole("img", { name: "Color: Verde", exact: true }),
  ).toBeVisible();
  await expect(taskList(gammaRow, gamma).getByRole("listitem")).toHaveText([
    taskA,
    taskB,
  ]);

  // PR-31: por el cliente, sin acentos ni mayúsculas.
  await searchProjects(page, `DISENO NANDU ${suffix.toUpperCase()}`);
  await expectRowNames(page, [gamma]);

  // D-P1-6: el nombre de una tarea no trae su proyecto.
  await searchProjects(page, taskA);
  await expect(projectRows(page)).toHaveCount(0);
  await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible();
});

test("el filtro de estado muestra archivados con su marca, y la URL lo conserva al recargar y lo deshace al volver atrás", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const active = `Activo ${suffix}`;
  const archived = `Archivado ${suffix}`;
  await seedProject({ name: active });
  await seedProject({ name: archived });
  await archiveProject(archived);

  // PR-31: «Activos» por omisión.
  await openProjects(page);
  await expect(projectStatusFilter(page)).toContainText("Activos");
  await searchProjects(page, suffix);
  await expectRowNames(page, [active]);

  await chooseProjectFilter(page, "Archivados", suffix);
  await expectRowNames(page, [archived]);

  // D-P1-6: con «Todos», el archivado lleva su marca y el activo no.
  await chooseProjectFilter(page, "Todos", suffix);
  await expectRowNames(page, [active, archived]);
  await expect(archivedMark(projectRow(page, archived))).toBeVisible();
  await expect(archivedMark(projectRow(page, active))).toHaveCount(0);

  // PR-95: recargar conserva el filtro y la búsqueda.
  await page.reload();
  await expectListState(page, "Todos", suffix);
  await expectRowNames(page, [active, archived]);

  // Cada filtro es una entrada del historial.
  await page.goBack();
  await expectListState(page, "Archivados", suffix);
  await expectRowNames(page, [archived]);
  await page.goBack();
  await expectListState(page, "Activos", suffix);
  await expectRowNames(page, [active]);

  // ADR 0008: un `estado` inválido es «Activos» y no se lleva la búsqueda.
  await openProjects(page, `?estado=x&buscar=${encodeURIComponent(suffix)}`);
  await expect(projectStatusFilter(page)).toContainText("Activos");
  await expect(projectSearchField(page)).toHaveValue(suffix);
  await expectRowNames(page, [active]);
});

test("escribir en el buscador filtra sin pedir nada al servidor y deja la búsqueda en la URL", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const project = `Sin pedidos ${suffix}`;
  await seedProject({ name: project });
  await openProjects(page);

  // D-P1-6: tecla por tecla, sin navegar ni revalidar. Cuando la URL deja de
  // ser `/proyectos`, Next precarga el enlace «Proyectos» de la navegación:
  // ese pedido lleva `next-router-prefetch` y no es de la búsqueda. Un
  // `router.replace` sí pediría la página, sin esa cabecera.
  const sent = await requestsDuring(page, isProjectsPage, async () => {
    await projectSearchField(page).pressSequentially(suffix);
    await expect(page).toHaveURL(isProjectsUrl("Activos", suffix));
    await expectRowNames(page, [project]);
  });
  const searchRequests = sent.filter(
    (request) => request.headers()["next-router-prefetch"] === undefined,
  );
  expect(searchRequests.map((request) => request.url())).toEqual([]);
});

test("al volver atrás, el buscador y la tabla siguen la búsqueda de esa entrada del historial", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const first = `Uno ${suffix}`;
  const second = `Dos ${suffix}`;
  await seedProject({ name: first });
  await seedProject({ name: second });
  await openProjects(page);

  // Escribir reemplaza la entrada; elegir un filtro suma otra.
  await searchProjects(page, first);
  await expectRowNames(page, [first]);
  await chooseProjectFilter(page, "Todos", first);
  await searchProjects(page, second);
  await expectRowNames(page, [second]);

  // PR-95: la entrada anterior tiene «Activos» y la primera búsqueda.
  await page.goBack();
  await expectListState(page, "Activos", first);
  await expectRowNames(page, [first]);
});

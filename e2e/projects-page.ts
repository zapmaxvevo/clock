/**
 * Localizadores y acciones de `/proyectos`, compartidos por los recorridos de
 * sus altas (slice 9), del facturable por defecto (11a), de las etiquetas
 * (11b) y de la lista y la edición (P1). Como en `tracker-page.ts`, todo se
 * busca por rol y por texto accesible.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { PALETTE } from "@/modules/project/palette";

import { escapeRegExp } from "./tracker-page";

export const PROJECTS_PATH = "/proyectos";

/** Lo que pide la pantalla: sus server actions y sus revalidaciones. */
export function isProjectsPage(url: URL): boolean {
  return url.pathname === PROJECTS_PATH;
}

/** Entra a `/proyectos` y espera su título. */
export async function openProjects(page: Page, query = ""): Promise<void> {
  await page.goto(`${PROJECTS_PATH}${query}`);
  await expectProjectsTitle(page);
}

/** El título de la pantalla, que dice que la carga terminó. */
export async function expectProjectsTitle(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible();
}

/** El campo «Nombre» de un diálogo de alta o de edición. */
export function nameField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Nombre", exact: true });
}

/** «Guardar» de un diálogo: el de un alta, el de la edición o el de la edición masiva. */
export function saveButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Guardar", exact: true });
}

/** D-P1-6: los tres valores del filtro de estado y su parámetro en la URL. */
export const PROJECT_FILTERS = {
  Activos: null,
  Archivados: "archivados",
  Todos: "todos",
} as const;

export type ProjectFilterLabel = keyof typeof PROJECT_FILTERS;

/** La tabla de la lista, nombrada por su `caption` (§5.2 de P1). */
export function projectsTable(page: Page): Locator {
  return page.getByRole("table", { name: "Proyectos", exact: true });
}

/**
 * La celda «Nombre» se nombra por su contenido: el punto, que dice su color
 * (`colorDotLabel`), el nombre y, con «Todos», «Archivado» (D-P1-6). Se
 * reconoce con el nombre entero, así otro proyecto cuyo nombre contenga este
 * no la confunde. Entre las piezas puede haber un espacio o ninguno: depende
 * de cómo se dibujen, no de lo que dicen.
 */
function nameCellPattern(name: string): RegExp {
  const colors = PALETTE.map((color) => escapeRegExp(color.label)).join("|");
  return new RegExp(`^(?:Color: (?:${colors}) ?)?${escapeRegExp(name)}(?: ?Archivado)?$`);
}

/**
 * La fila de un proyecto por su nombre (§7 de P1): la usan los recorridos de
 * la lista, de la edición, de las altas y del facturable por defecto. La celda
 * del nombre puede ser un encabezado de fila o una celda; la fila se reconoce
 * por cualquiera de las dos.
 */
export function projectRow(page: Page, name: string): Locator {
  const pattern = nameCellPattern(name);
  return projectsTable(page)
    .getByRole("row")
    .filter({
      has: page
        .getByRole("rowheader", { name: pattern })
        .or(page.getByRole("cell", { name: pattern })),
    });
}

/** Las filas de datos de la tabla: las que tienen alguna celda, sin la de encabezados. */
export function projectRows(page: Page): Locator {
  return projectsTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("cell") });
}

/** Las celdas de una fila en el orden de las columnas, la del nombre incluida. */
export function rowCells(row: Locator): Locator {
  return row.getByRole("rowheader").or(row.getByRole("cell"));
}

/** D-P1-6: las columnas de la tabla, en su orden. «Acciones» solo la lee el lector de pantalla. */
export const PROJECT_COLUMNS = [
  "Nombre",
  "Cliente",
  "Acceso",
  "Tareas",
  "Acciones",
] as const;

/** La celda de una columna de la fila, por su lugar en `PROJECT_COLUMNS`. */
export function columnCell(
  row: Locator,
  column: (typeof PROJECT_COLUMNS)[number],
): Locator {
  return rowCells(row).nth(PROJECT_COLUMNS.indexOf(column));
}

/** D-P1-6: la marca «Archivado» al lado del nombre, con «Todos». */
export function archivedMark(row: Locator): Locator {
  return row.getByText("Archivado", { exact: true });
}

/** El buscador de la lista (§5.2 de P1). */
export function projectSearchField(page: Page): Locator {
  return page.getByRole("searchbox", { name: "Buscar proyecto o cliente", exact: true });
}

/**
 * El disparador del filtro de estado. Es un `Select`: su nombre empieza con la
 * etiqueta y puede seguir con la opción elegida, como el de `/equipo`.
 */
export function projectStatusFilter(page: Page): Locator {
  return page.getByRole("main").getByRole("combobox", { name: /^Estado/ });
}

/**
 * La URL de `/proyectos` con un filtro y una búsqueda (PR-95): «Activos» no
 * escribe `estado`, y la búsqueda vacía no escribe `buscar`.
 */
export function isProjectsUrl(
  filter: ProjectFilterLabel,
  search = "",
): (url: URL) => boolean {
  const value = PROJECT_FILTERS[filter];
  return (url) =>
    url.pathname === PROJECTS_PATH &&
    url.searchParams.get("estado") === value &&
    (url.searchParams.get("buscar") ?? "") === search;
}

/**
 * Elige un filtro de estado y espera la página que lo dibuja: elegir navega
 * (D-P1-6), así que la URL cambia y el disparador muestra la opción. La
 * búsqueda que había sigue en la URL.
 */
export async function chooseProjectFilter(
  page: Page,
  filter: ProjectFilterLabel,
  search = "",
): Promise<void> {
  await projectStatusFilter(page).click();
  await page.getByRole("option", { name: filter, exact: true }).click();
  await expect(page).toHaveURL(isProjectsUrl(filter, search));
  await expect(projectStatusFilter(page)).toContainText(filter);
}

/**
 * Escribe en el buscador de la lista y espera que la URL lo tenga. Escribir
 * no navega (D-P1-6): la URL cambia con `replaceState`.
 */
export async function searchProjects(page: Page, text: string): Promise<void> {
  await projectSearchField(page).fill(text);
  await expect(page).toHaveURL(
    (url) => url.pathname === PROJECTS_PATH && url.searchParams.get("buscar") === text,
  );
}

/** «Editar» de una fila: dice «Editar» y nombra al proyecto (D-P1-7). */
export function editButton(row: Locator, name: string): Locator {
  return row.getByRole("button", { name: `Editar «${name}»`, exact: true });
}

/** «Nueva tarea» de una fila, nombrada por su proyecto. */
export function newTaskButton(row: Locator, name: string): Locator {
  return row.getByRole("button", { name: `Nueva tarea en «${name}»`, exact: true });
}

/** Las tareas activas de un proyecto, en su lista nombrada por el proyecto. */
export function taskList(row: Locator, name: string): Locator {
  return row.getByRole("list", { name: `Tareas de «${name}»`, exact: true });
}

/** El diálogo de edición (D-P1-8). Va en un portal. */
export function editDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Editar proyecto", exact: true });
}

/** El diálogo de alta de proyecto, el de la cabecera y el de TT-09. Va en un portal. */
export function newProjectDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Nuevo proyecto", exact: true });
}

/** El selector «Cliente» de un diálogo de proyecto. */
export function clientField(dialog: Locator): Locator {
  return dialog.getByRole("combobox", { name: "Cliente" });
}

/** Un color de la paleta de un diálogo de proyecto, por su nombre accesible. */
export function colorRadio(dialog: Locator, color: string): Locator {
  return dialog
    .getByRole("radiogroup", { name: "Color" })
    .getByRole("radio", { name: color, exact: true });
}

/** La casilla «Facturable por defecto» de un diálogo de proyecto (PR-21). */
export function billableByDefaultField(dialog: Locator): Locator {
  return dialog.getByRole("checkbox", { name: "Facturable por defecto", exact: true });
}

/** El campo «Nota» de un diálogo de proyecto (PR-30). */
export function noteField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Nota", exact: true });
}

/**
 * Elige un cliente en el selector «Cliente» de un diálogo. La lista va en un
 * portal; `option` es el nombre, «Sin cliente» o «{nombre} (archivado)».
 */
export async function chooseClient(
  page: Page,
  dialog: Locator,
  option: string,
): Promise<void> {
  await clientField(dialog).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(clientField(dialog)).toContainText(option);
}

/** El aviso de un diálogo, que es un `alert` arriba de «Guardar». */
export function dialogNotice(dialog: Locator, message: string): Locator {
  return dialog.getByRole("alert").filter({ hasText: message });
}

/** D-P1-8: el anuncio de una edición guardada, en su región `status`. */
export function projectSavedStatus(page: Page, name: string): Locator {
  return page.getByRole("status").filter({ hasText: `Proyecto «${name}» guardado` });
}

/** TT-90: el título del aviso de una edición que no se guardó. */
export const PROJECT_NOT_SAVED = "No se pudieron guardar los cambios.";

/**
 * El aviso de una edición que no se guardó, ya fuera del diálogo: la pantalla
 * lo muestra cuando la revalidación sacó al diálogo del árbol (D-P1-8).
 */
export function screenEditNotice(page: Page, message: string): Locator {
  return page
    .getByRole("alert")
    .filter({ hasText: PROJECT_NOT_SAVED })
    .filter({ hasText: message });
}

/** Abre «Editar» de la fila de un proyecto y espera su diálogo. */
export async function openEditDialog(page: Page, name: string): Promise<Locator> {
  await editButton(projectRow(page, name), name).click();
  const dialog = editDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

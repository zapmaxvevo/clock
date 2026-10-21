import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action";
import type {
  ProjectActions,
  ProjectFilter,
  ProjectListItem,
  ProjectListView,
} from "@/modules/project/schema";
import { bodyRows, buttonsOf, textOf } from "@/test/markup";

import { ProjectsScreen, ProjectsSkeleton } from "./projects-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

/** Dobles escritos a mano: el marcado inicial no llama a ninguna action. */
function unreachable<T>(): Promise<ActionResult<T>> {
  return Promise.resolve({ ok: false, code: "unexpected", message: "doble" });
}

const actions: ProjectActions = {
  createClient: () => unreachable(),
  createProject: () => unreachable(),
  createTask: () => unreachable(),
  createTag: () => unreachable(),
  updateProject: () => unreachable(),
};

const emptyList: ProjectListView = {
  canCreateClient: true,
  canCreateProject: true,
  canCreateTag: true,
  clients: [],
  projects: [],
  tags: [],
};

function project(
  overrides: Partial<ProjectListItem> & Pick<ProjectListItem, "id" | "name">,
): ProjectListItem {
  return {
    color: "blue",
    client: null,
    isPublic: true,
    archived: false,
    tasks: [],
    canUpdate: false,
    canCreateTask: false,
    settings: null,
    ...overrides,
  };
}

/** Un proyecto que quien mira puede editar, con lo que arranca el diálogo. */
function editable(
  overrides: Partial<ProjectListItem> & Pick<ProjectListItem, "id" | "name">,
): ProjectListItem {
  return project({
    canUpdate: true,
    settings: {
      id: overrides.id,
      name: overrides.name,
      clientId: overrides.client?.id ?? null,
      color: overrides.color ?? "blue",
      note: "",
      billableByDefault: false,
    },
    ...overrides,
  });
}

type RenderOptions = { readonly filter?: ProjectFilter; readonly search?: string };

function render(list: ProjectListView, options: RenderOptions = {}): string {
  return renderToStaticMarkup(
    <ProjectsScreen
      list={list}
      filter={options.filter ?? "activos"}
      search={options.search ?? ""}
      actions={actions}
    />,
  );
}

/** Los botones con ese texto visible exacto. */
function buttonsNamed(markup: string, name: string): number {
  return buttonsOf(markup).filter((button) => textOf(button) === name).length;
}

function textsOf(markup: string, tag: string): string[] {
  const element = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "g");
  return [...markup.matchAll(element)].map((match) => textOf(match[1]));
}

/** La primera columna de cada fila: el nombre del proyecto. */
function rowNames(markup: string): string[] {
  return bodyRows(markup).map((cells) => cells[0]);
}

const acme = { id: "c-acme", name: "Acme", archived: false };
const web = project({
  id: "p-web",
  name: "Web",
  color: "teal",
  client: acme,
  tasks: [
    { id: "t-1", name: "Diseño" },
    { id: "t-2", name: "Maquetado" },
  ],
});
const interno = project({ id: "p-interno", name: "Interno" });
const legado = project({ id: "p-legado", name: "Legado", archived: true });

describe("ProjectsScreen", () => {
  it("sin proyectos muestra el vacío de PR-85, sin tabla, y un solo «Nuevo proyecto», el de la cabecera", () => {
    const markup = render(emptyList);

    expect(markup).toContain("Todavía no hay proyectos");
    expect(markup).not.toContain("<table");
    expect(buttonsNamed(markup, "Nuevo proyecto")).toBe(1);
    expect(buttonsNamed(markup, "Nuevo cliente")).toBe(1);
  });

  it("no ofrece crear lo que la lista no permite", () => {
    const markup = render({
      ...emptyList,
      canCreateClient: false,
      canCreateProject: false,
      canCreateTag: false,
    });

    expect(buttonsNamed(markup, "Nuevo proyecto")).toBe(0);
    expect(buttonsNamed(markup, "Nuevo cliente")).toBe(0);
    expect(buttonsNamed(markup, "Nueva etiqueta")).toBe(0);
  });

  it("ofrece «Nueva etiqueta» una vez, en la cabecera, con `canCreateTag` (PR-44, D-1)", () => {
    expect(buttonsNamed(render(emptyList), "Nueva etiqueta")).toBe(1);
  });

  it("la tabla tiene su título y las columnas de PR-31, sin columna de tiempo", () => {
    const markup = render({ ...emptyList, projects: [web] });

    expect(markup).toContain('<caption class="sr-only">Proyectos</caption>');
    const headers = [...markup.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)];
    expect(headers.map(([, header]) => textOf(header))).toEqual([
      "Nombre",
      "Cliente",
      "Acceso",
      "Tareas",
      "Acciones",
    ]);
    expect(markup).toMatch(
      /<th scope="col"[^>]*><span class="sr-only">Acciones<\/span><\/th>/,
    );
    expect(markup).not.toMatch(/Tiempo|Horas/);
  });

  it("dibuja una fila por proyecto en el orden recibido, sin grupos por cliente", () => {
    const markup = render({ ...emptyList, projects: [interno, web] });

    expect(rowNames(markup)).toEqual(["Interno", "Web"]);
    expect(markup).not.toContain("<h3");
  });

  it("cada fila muestra el punto con su nombre, el cliente o «Sin cliente», el acceso y las tareas por nombre", () => {
    const privado = project({ id: "p-privado", name: "Privado", isPublic: false });
    const markup = render({ ...emptyList, projects: [interno, privado, web] });
    const rows = bodyRows(markup);

    expect(markup).toMatch(
      /<span role="img" aria-label="Color: Verde azulado"[^>]*style="background-color:#0D9488"/,
    );
    expect(rows.map((cells) => cells.slice(0, 3))).toEqual([
      ["Interno", "Sin cliente", "Público"],
      ["Privado", "Sin cliente", "Privado"],
      ["Web", "Acme", "Público"],
    ]);
    const tasks = markup.match(/<ul aria-label="Tareas de «Web»"[^>]*>(.*?)<\/ul>/);
    expect(textsOf(tasks?.[1] ?? "", "li")).toEqual(["Diseño", "Maquetado"]);
    // Sin tareas, la celda queda vacía.
    expect(rows[0][3]).toBe("");
    expect(markup).not.toContain("Tareas de «Interno»");
  });

  it("«Editar» dice «Editar», se nombra con el proyecto y aparece solo con `canUpdate` (D-P1-7, D-P1-8)", () => {
    const markup = render({
      ...emptyList,
      projects: [interno, editable({ id: "p-web", name: "Web" })],
    });
    const edits = buttonsOf(markup).filter((button) => textOf(button) === "Editar");

    expect(edits).toHaveLength(1);
    expect(edits[0]).toContain('aria-label="Editar «Web»"');
    expect(markup).not.toContain("Editar «Interno»");
    // El título del diálogo no es el texto del botón.
    expect(markup).not.toContain("Editar proyecto");
  });

  it("sin `settings` no hay «Editar», aunque `canUpdate` venga marcado", () => {
    const markup = render({
      ...emptyList,
      projects: [project({ id: "p-web", name: "Web", canUpdate: true })],
    });

    expect(buttonsNamed(markup, "Editar")).toBe(0);
  });

  it("ofrece «Nueva tarea» solo en los proyectos que lo permiten, y los de la cabecera una vez", () => {
    const markup = render({
      ...emptyList,
      projects: [
        project({ id: "p-app", name: "App" }),
        project({ id: "p-interno", name: "Interno", canCreateTask: true }),
        project({ id: "p-web", name: "Web", canCreateTask: true }),
      ],
    });

    expect(markup).toContain('aria-label="Nueva tarea en «Web»"');
    expect(markup).toContain('aria-label="Nueva tarea en «Interno»"');
    expect(markup).not.toContain('aria-label="Nueva tarea en «App»"');
    expect(buttonsNamed(markup, "Nuevo proyecto")).toBe(1);
    expect(buttonsNamed(markup, "Nuevo cliente")).toBe(1);
  });

  it("un archivado no ofrece «Editar» ni «Nueva tarea» (D-P1-7)", () => {
    const markup = render({ ...emptyList, projects: [legado] }, { filter: "archivados" });

    expect(rowNames(markup)).toEqual(["Legado"]);
    expect(buttonsNamed(markup, "Editar")).toBe(0);
    expect(markup).not.toContain("Nueva tarea en «Legado»");
  });

  it("«Activos» deja afuera los archivados; «Todos» los muestra con «Archivado» y «Archivados», sin la marca", () => {
    const list = { ...emptyList, projects: [interno, legado, web] };

    expect(rowNames(render(list))).toEqual(["Interno", "Web"]);
    expect(rowNames(render(list, { filter: "todos" }))).toEqual([
      "Interno",
      "LegadoArchivado",
      "Web",
    ]);
    expect(rowNames(render(list, { filter: "archivados" }))).toEqual(["Legado"]);
  });

  it("el filtro de estado muestra el valor recibido y el buscador, la búsqueda, que filtra la tabla", () => {
    const markup = render(
      { ...emptyList, projects: [interno, legado, web] },
      { filter: "todos", search: "acme" },
    );

    expect(markup).toMatch(/<label[^>]*>Estado<\/label>/);
    expect(markup).toMatch(/<button[^>]*>.*?Todos.*?<\/button>/);
    expect(markup).toMatch(
      /<input[^>]*type="search"[^>]*aria-label="Buscar proyecto o cliente"[^>]*value="acme"/,
    );
    expect(rowNames(markup)).toEqual(["Web"]);
  });

  it("con «Activos» y todo archivado dice «No hay proyectos activos», con la sugerencia (PR-89)", () => {
    const markup = render({ ...emptyList, projects: [legado] });

    expect(markup).toContain("No hay proyectos activos");
    expect(markup).toContain("Elegí «Archivados» o «Todos» en el estado para verlos.");
    expect(markup).not.toContain("<table");
  });

  it("con «Archivados» y ninguno dice «No hay proyectos archivados»", () => {
    const markup = render({ ...emptyList, projects: [web] }, { filter: "archivados" });

    expect(markup).toContain("No hay proyectos archivados");
    expect(markup).not.toContain("Todavía no hay proyectos");
  });

  it("con una búsqueda sin coincidencias dice lo mismo que el selector (TT-07)", () => {
    const markup = render({ ...emptyList, projects: [web] }, { search: "zzz" });

    expect(markup).toContain("Ningún proyecto coincide con la búsqueda.");
    expect(markup).not.toContain("<table");
  });

  it("la sección «Etiquetas», después de los proyectos, lista las activas en el orden recibido (PR-112)", () => {
    const markup = render({
      ...emptyList,
      projects: [web],
      tags: [
        { id: "t-design", name: "Diseño" },
        { id: "t-review", name: "Revisión" },
      ],
    });
    const section = markup.match(
      /<section aria-labelledby="tags-heading"[^>]*><h2 id="tags-heading"[^>]*>Etiquetas<\/h2>(.*?)<\/section>/,
    );

    expect(markup.indexOf("<table")).toBeLessThan(markup.indexOf('id="tags-heading"'));
    expect(textsOf(section?.[1] ?? "", "li")).toEqual(["Diseño", "Revisión"]);
    expect(markup).not.toContain("Todavía no hay etiquetas");
  });

  it("sin etiquetas, la sección dice «Todavía no hay etiquetas» (H-13, PR-88)", () => {
    const markup = render(emptyList);
    const section = markup.match(
      /<section aria-labelledby="tags-heading"[^>]*>(.*?)<\/section>/,
    );

    expect(section?.[1]).toContain("Todavía no hay etiquetas");
    expect(section?.[1]).not.toContain("<li");
  });

  it("deja montadas las regiones que anuncian el alta de un cliente, de una etiqueta y la edición", () => {
    const markup = render({ ...emptyList, projects: [web] });

    expect(markup.match(/<p role="status"[^>]*><\/p>/g)).toHaveLength(3);
  });

  it("deja montada y vacía la región de avisos de un diálogo que sale del árbol", () => {
    const markup = render(emptyList);

    expect(markup).toMatch(/<div role="alert" tabindex="-1"[^>]*><\/div>/);
  });

  it("el esqueleto de carga dice qué carga, sin `aria-busy`", () => {
    const markup = renderToStaticMarkup(<ProjectsSkeleton />);

    expect(markup).toMatch(
      /^<div role="status"[^>]*><span class="sr-only">Cargando los proyectos<\/span>/,
    );
    expect(markup).not.toContain("aria-busy");
  });
});

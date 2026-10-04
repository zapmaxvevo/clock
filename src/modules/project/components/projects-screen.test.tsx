import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ActionResult } from "@/server/action";
import type {
  ProjectActions,
  ProjectCatalog,
  ProjectView,
} from "@/modules/project/schema";

import { ProjectsScreen, ProjectsSkeleton } from "./projects-screen";

/** Dobles escritos a mano: el marcado inicial no llama a ninguna action. */
function unreachable<T>(): Promise<ActionResult<T>> {
  return Promise.resolve({ ok: false, code: "unexpected", message: "doble" });
}

const actions: ProjectActions = {
  createClient: () => unreachable(),
  createProject: () => unreachable(),
  createTask: () => unreachable(),
};

const emptyCatalog: ProjectCatalog = {
  canCreateClient: true,
  canCreateProject: true,
  clients: [],
  groups: [],
};

function project(overrides: Partial<ProjectView> & Pick<ProjectView, "id" | "name">) {
  return {
    color: "blue",
    isPublic: true,
    canCreateTask: false,
    tasks: [],
    ...overrides,
  } satisfies ProjectView;
}

function render(catalog: ProjectCatalog): string {
  return renderToStaticMarkup(<ProjectsScreen catalog={catalog} actions={actions} />);
}

function buttonsNamed(markup: string, name: string): number {
  const exact = new RegExp(`<button[^>]*>${name}</button>`, "g");
  return markup.match(exact)?.length ?? 0;
}

function textsOf(markup: string, tag: string): string[] {
  const element = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "g");
  return [...markup.matchAll(element)].map((match) => match[1]);
}

describe("ProjectsScreen", () => {
  it("sin proyectos muestra el vacío de PR-85 y un solo «Nuevo proyecto», el de la cabecera", () => {
    const markup = render(emptyCatalog);

    expect(markup).toContain("Todavía no hay proyectos");
    expect(buttonsNamed(markup, "Nuevo proyecto")).toBe(1);
    expect(buttonsNamed(markup, "Nuevo cliente")).toBe(1);
    expect(markup).not.toContain("<section");
  });

  it("no ofrece crear lo que el catálogo no permite", () => {
    const markup = render({
      ...emptyCatalog,
      canCreateClient: false,
      canCreateProject: false,
    });

    expect(buttonsNamed(markup, "Nuevo proyecto")).toBe(0);
    expect(buttonsNamed(markup, "Nuevo cliente")).toBe(0);
  });

  it("dibuja los grupos en el orden del catálogo, con «Sin cliente» para el grupo sin cliente", () => {
    const markup = render({
      ...emptyCatalog,
      clients: [{ id: "c-acme", name: "Acme" }],
      groups: [
        {
          client: { id: "c-acme", name: "Acme" },
          projects: [project({ id: "p-web", name: "Web" })],
        },
        { client: null, projects: [project({ id: "p-interno", name: "Interno" })] },
      ],
    });

    expect(textsOf(markup, "h2")).toEqual(["Acme", "Sin cliente"]);
    expect(textsOf(markup, "h3")).toEqual(["Web", "Interno"]);
    expect(markup).not.toContain("Todavía no hay proyectos");
  });

  it("cada proyecto muestra su punto de color con nombre y sus tareas", () => {
    const markup = render({
      ...emptyCatalog,
      groups: [
        {
          client: null,
          projects: [
            project({
              id: "p-web",
              name: "Web",
              color: "teal",
              tasks: [
                { id: "t-1", name: "Diseño" },
                { id: "t-2", name: "Maquetado" },
              ],
            }),
          ],
        },
      ],
    });

    expect(markup).toMatch(
      /<span role="img" aria-label="Color: Verde azulado"[^>]*style="background-color:#0D9488"/,
    );
    const tasks = markup.match(/<ul aria-label="Tareas de «Web»"[^>]*>(.*?)<\/ul>/);
    expect(textsOf(tasks?.[1] ?? "", "li")).toEqual(["Diseño", "Maquetado"]);
  });

  it("ofrece «Nueva tarea» solo en los proyectos que lo permiten, y los de la cabecera una vez", () => {
    const markup = render({
      ...emptyCatalog,
      groups: [
        {
          client: { id: "c-acme", name: "Acme" },
          projects: [
            project({ id: "p-web", name: "Web", canCreateTask: true }),
            project({ id: "p-app", name: "App" }),
          ],
        },
        {
          client: null,
          projects: [project({ id: "p-interno", name: "Interno", canCreateTask: true })],
        },
      ],
    });

    expect(markup).toContain('aria-label="Nueva tarea en «Web»"');
    expect(markup).toContain('aria-label="Nueva tarea en «Interno»"');
    expect(markup).not.toContain('aria-label="Nueva tarea en «App»"');
    expect(buttonsNamed(markup, "Nuevo proyecto")).toBe(1);
    expect(buttonsNamed(markup, "Nuevo cliente")).toBe(1);
  });

  it("deja montada la región que anuncia el alta de un cliente", () => {
    const markup = render(emptyCatalog);

    expect(markup).toMatch(/<p role="status"[^>]*><\/p>/);
  });

  it("deja montada y vacía la región de avisos de un diálogo que sale del árbol", () => {
    const markup = render(emptyCatalog);

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

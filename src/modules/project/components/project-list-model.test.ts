import { describe, expect, it } from "vitest";

import type { ProjectListItem } from "@/modules/project/schema";

import { projectListRows, projectsHref, searchOf } from "./project-list-model";

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

const web = project({
  id: "p-web",
  name: "Web",
  client: { id: "c-acme", name: "Ácme Córp", archived: false },
  tasks: [{ id: "t-guardias", name: "Guardias" }],
});
const interno = project({ id: "p-interno", name: "Interno" });
const legado = project({ id: "p-legado", name: "Legado", archived: true });
const projects = [interno, legado, web];

function namesOf(rows: readonly ProjectListItem[]): string[] {
  return rows.map((row) => row.name);
}

describe("projectListRows", () => {
  it("«Activos» deja los activos, «Archivados» los archivados y «Todos» todos, en el orden recibido", () => {
    expect(namesOf(projectListRows(projects, "activos", "").rows)).toEqual([
      "Interno",
      "Web",
    ]);
    expect(namesOf(projectListRows(projects, "archivados", "").rows)).toEqual(["Legado"]);
    expect(namesOf(projectListRows(projects, "todos", "").rows)).toEqual([
      "Interno",
      "Legado",
      "Web",
    ]);
    expect(projectListRows(projects, "todos", "").empty).toBeNull();
  });

  it("busca por el nombre del proyecto sin distinguir mayúsculas ni acentos, y recorta lo escrito", () => {
    expect(namesOf(projectListRows(projects, "activos", "  INTÉRNO ").rows)).toEqual([
      "Interno",
    ]);
  });

  it("busca por el nombre del cliente sin distinguir mayúsculas ni acentos", () => {
    const result = projectListRows(projects, "activos", "acme corp");

    expect(namesOf(result.rows)).toEqual(["Web"]);
    expect(result.empty).toBeNull();
  });

  it("un nombre de tarea no trae su proyecto (D-P1-6)", () => {
    const result = projectListRows(projects, "activos", "guardias");

    expect(result.rows).toEqual([]);
    expect(result.empty).toBe("noMatches");
  });

  it("la búsqueda se aplica dentro del filtro", () => {
    expect(namesOf(projectListRows(projects, "archivados", "leg").rows)).toEqual([
      "Legado",
    ]);
    expect(projectListRows(projects, "activos", "leg").rows).toEqual([]);
  });

  it("sin ningún proyecto el vacío es `none`, con cualquier filtro y búsqueda (PR-85)", () => {
    for (const filter of ["activos", "archivados", "todos"] as const) {
      expect(projectListRows([], filter, "")).toEqual({ rows: [], empty: "none" });
      expect(projectListRows([], filter, "web")).toEqual({ rows: [], empty: "none" });
    }
  });

  it("con búsqueda y sin filas el vacío es `noMatches`, antes que el del filtro", () => {
    expect(projectListRows([legado], "activos", "web").empty).toBe("noMatches");
    expect(projectListRows([web], "archivados", "zzz").empty).toBe("noMatches");
    expect(projectListRows(projects, "todos", "zzz").empty).toBe("noMatches");
  });

  it("sin búsqueda, «Activos» con todo archivado es `noActive` y «Archivados» sin archivados es `noArchived` (PR-89)", () => {
    expect(projectListRows([legado], "activos", "").empty).toBe("noActive");
    expect(projectListRows([web, interno], "archivados", "").empty).toBe("noArchived");
    // Solo espacios es la búsqueda vacía.
    expect(projectListRows([legado], "activos", "   ").empty).toBe("noActive");
  });
});

describe("projectsHref", () => {
  it("«Activos» sin búsqueda es `/proyectos`", () => {
    expect(projectsHref({ filter: "activos", search: "" })).toBe("/proyectos");
  });

  it("omite `estado` con «Activos» y `buscar` vacío", () => {
    expect(projectsHref({ filter: "archivados", search: "" })).toBe(
      "/proyectos?estado=archivados",
    );
    expect(projectsHref({ filter: "todos", search: "" })).toBe("/proyectos?estado=todos");
    expect(projectsHref({ filter: "activos", search: "web" })).toBe(
      "/proyectos?buscar=web",
    );
  });

  it("con los dos, codifica la búsqueda", () => {
    expect(projectsHref({ filter: "todos", search: "Ácme & Co" })).toBe(
      "/proyectos?estado=todos&buscar=%C3%81cme+%26+Co",
    );
  });
});

describe("searchOf", () => {
  it("devuelve `buscar` tal como está en la URL", () => {
    expect(searchOf(new URLSearchParams("estado=todos&buscar=web+app"))).toBe("web app");
  });

  it("sin `buscar`, repetido o de más de 100 caracteres, es vacío (ADR 0008)", () => {
    expect(searchOf(new URLSearchParams(""))).toBe("");
    expect(searchOf(new URLSearchParams("buscar=a&buscar=b"))).toBe("");
    expect(searchOf(new URLSearchParams({ buscar: "x".repeat(101) }))).toBe("");
    expect(searchOf(new URLSearchParams({ buscar: "x".repeat(100) }))).toBe(
      "x".repeat(100),
    );
  });
});

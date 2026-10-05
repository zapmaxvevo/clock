import { describe, expect, it } from "vitest";

import type {
  ProjectSelection,
  TrackingCatalog,
  TrackingProjectView,
} from "@/modules/project/schema";

import { pickerView, sameSelection, selectionIds, type PickerView } from "./picker-model";

function project(
  id: string,
  name: string,
  taskNames: readonly string[] = [],
): TrackingProjectView {
  return {
    id,
    name,
    color: "blue",
    tasks: taskNames.map((taskName, index) => ({
      id: `${id}-t${index}`,
      name: taskName,
    })),
    billableByDefault: false,
  };
}

const catalog: TrackingCatalog = {
  canCreateProject: true,
  groups: [
    {
      client: { id: "c-acme", name: "Acme" },
      projects: [
        project("p-web", "Web", ["Diseño", "Desarrollo"]),
        project("p-app", "App móvil", ["Diseño de íconos"]),
      ],
    },
    {
      client: { id: "c-globex", name: "Globex" },
      projects: [project("p-soporte", "Soporte", ["Guardias"])],
    },
    { client: null, projects: [project("p-interno", "Interno")] },
  ],
};

/** Cada opción como la lee una persona: «Proyecto» o «Proyecto: Tarea». */
function optionNames(view: PickerView): string[][] {
  return view.groups.map((group) =>
    group.items.map(({ selection }) =>
      selection.task === null
        ? (selection.project?.name ?? "")
        : `${selection.project?.name ?? ""}: ${selection.task.name}`,
    ),
  );
}

function groupNames(view: PickerView): (string | null)[] {
  return view.groups.map((group) => group.client?.name ?? null);
}

describe("pickerView", () => {
  it("con la búsqueda vacía ofrece «Sin proyecto» primero y todo el catálogo, con las tareas debajo de su proyecto", () => {
    const view = pickerView(catalog, "");

    expect(view.none?.selection).toEqual({ project: null, task: null });
    expect(groupNames(view)).toEqual(["Acme", "Globex", null]);
    expect(optionNames(view)).toEqual([
      [
        "Web",
        "Web: Diseño",
        "Web: Desarrollo",
        "App móvil",
        "App móvil: Diseño de íconos",
      ],
      ["Soporte", "Soporte: Guardias"],
      ["Interno"],
    ]);
    expect(view.empty).toBeNull();
  });

  it("una búsqueda de solo espacios cuenta como vacía", () => {
    expect(pickerView(catalog, "   ").none).not.toBeNull();
  });

  it("con cualquier búsqueda no ofrece «Sin proyecto»", () => {
    expect(pickerView(catalog, "web").none).toBeNull();
    expect(pickerView(catalog, "sin").none).toBeNull();
  });

  it("un cliente que coincide trae todos sus proyectos con todas sus tareas", () => {
    const view = pickerView(catalog, "acm");

    expect(groupNames(view)).toEqual(["Acme"]);
    expect(optionNames(view)).toEqual([
      [
        "Web",
        "Web: Diseño",
        "Web: Desarrollo",
        "App móvil",
        "App móvil: Diseño de íconos",
      ],
    ]);
  });

  it("un proyecto que coincide trae todas sus tareas, en el grupo de su cliente", () => {
    const view = pickerView(catalog, "soport");

    expect(groupNames(view)).toEqual(["Globex"]);
    expect(optionNames(view)).toEqual([["Soporte", "Soporte: Guardias"]]);
  });

  it("una tarea que coincide trae su proyecto con solo las tareas que coinciden", () => {
    const view = pickerView(catalog, "desarr");

    expect(groupNames(view)).toEqual(["Acme"]);
    expect(optionNames(view)).toEqual([["Web", "Web: Desarrollo"]]);
  });

  it("no distingue acentos ni mayúsculas, en la búsqueda ni en los nombres", () => {
    const expected = [["Web", "Web: Diseño", "App móvil", "App móvil: Diseño de íconos"]];

    expect(optionNames(pickerView(catalog, "diseno"))).toEqual(expected);
    expect(optionNames(pickerView(catalog, "DISEÑO"))).toEqual(expected);
    expect(optionNames(pickerView(catalog, "ICONOS"))).toEqual([
      ["App móvil", "App móvil: Diseño de íconos"],
    ]);
    expect(optionNames(pickerView(catalog, "Móvil"))).toEqual([
      ["App móvil", "App móvil: Diseño de íconos"],
    ]);
  });

  it("los proyectos sin cliente se encuentran por su nombre y no por «Sin cliente»", () => {
    expect(groupNames(pickerView(catalog, "intern"))).toEqual([null]);
    expect(pickerView(catalog, "sin cliente").groups).toEqual([]);
  });

  it("un proyecto sin tareas no trae opciones de tarea (PR-87)", () => {
    const [option, ...rest] = pickerView(catalog, "interno").groups[0].items;

    expect(option.selection.task).toBeNull();
    expect(rest).toEqual([]);
  });

  it("la búsqueda sin coincidencias da su vacío, distinto del de TT-87", () => {
    const view = pickerView(catalog, "zzz");

    expect(view.groups).toEqual([]);
    expect(view.empty).toEqual({ kind: "noMatches" });
  });

  it("el catálogo sin proyectos da el vacío de TT-87, con el enlace según canCreateProject", () => {
    const empty: TrackingCatalog = { canCreateProject: true, groups: [] };

    expect(pickerView(empty, "").empty).toEqual({
      kind: "noProjects",
      canCreateProject: true,
    });
    expect(pickerView({ ...empty, canCreateProject: false }, "").empty).toEqual({
      kind: "noProjects",
      canCreateProject: false,
    });
    expect(pickerView(empty, "web").empty).toEqual({
      kind: "noProjects",
      canCreateProject: true,
    });
  });

  it("el catálogo sin proyectos sigue ofreciendo «Sin proyecto», para quitar uno archivado", () => {
    const empty: TrackingCatalog = { canCreateProject: false, groups: [] };

    expect(pickerView(empty, "").none).not.toBeNull();
  });

  it("cada opción lleva el par que elige, sin las tareas del catálogo", () => {
    const [webOption, designOption] = pickerView(catalog, "").groups[0].items;

    expect(webOption.selection).toEqual({
      project: { id: "p-web", name: "Web", color: "blue" },
      task: null,
    });
    expect(designOption.selection).toEqual({
      project: { id: "p-web", name: "Web", color: "blue" },
      task: { id: "p-web-t0", name: "Diseño" },
    });
  });
});

describe("sameSelection", () => {
  const web = { id: "a1b2", name: "Web", color: "blue" } as const;
  const design = { id: "c3d4", name: "Diseño" };
  const none: ProjectSelection = { project: null, task: null };

  it("compara los ids del proyecto y de la tarea sin distinguir mayúsculas", () => {
    expect(
      sameSelection(
        { project: web, task: design },
        { project: { ...web, id: "A1B2" }, task: { ...design, id: "C3D4" } },
      ),
    ).toBe(true);
  });

  it("distingue el proyecto solo, otra tarea y «Sin proyecto»", () => {
    expect(
      sameSelection({ project: web, task: design }, { project: web, task: null }),
    ).toBe(false);
    expect(
      sameSelection(
        { project: web, task: design },
        { project: web, task: { id: "e5f6", name: "Otra" } },
      ),
    ).toBe(false);
    expect(sameSelection({ project: web, task: null }, none)).toBe(false);
    expect(sameSelection(none, none)).toBe(true);
  });
});

describe("selectionIds", () => {
  it("manda los ids del par, nulos para «Sin proyecto» y para el proyecto sin tarea", () => {
    const web = { id: "a1b2", name: "Web", color: "blue" } as const;

    expect(selectionIds({ project: web, task: { id: "c3d4", name: "Diseño" } })).toEqual({
      projectId: "a1b2",
      taskId: "c3d4",
    });
    expect(selectionIds({ project: web, task: null })).toEqual({
      projectId: "a1b2",
      taskId: null,
    });
    expect(selectionIds({ project: null, task: null })).toEqual({
      projectId: null,
      taskId: null,
    });
  });
});

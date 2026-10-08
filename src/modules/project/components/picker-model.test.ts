import { describe, expect, it } from "vitest";

import type {
  ProjectSelection,
  TrackingCatalog,
  TrackingProjectView,
} from "@/modules/project/schema";

import {
  isTrackablePair,
  pickerView,
  sameSelection,
  selectionIds,
  type PickerView,
} from "./picker-model";

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
  canCreateTag: true,
  tags: [],
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
    const empty: TrackingCatalog = {
      canCreateProject: true,
      canCreateTag: true,
      tags: [],
      groups: [],
    };

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
    const empty: TrackingCatalog = {
      canCreateProject: false,
      canCreateTag: true,
      tags: [],
      groups: [],
    };

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

describe("pickerView con `excluded` (TS-18, D13-9)", () => {
  const none = { projectId: null, taskId: null };
  const pair = (projectId: string, taskId: string | null = null) => ({
    projectId,
    taskId,
  });

  /** Las opciones inactivas, como «Proyecto» o «Proyecto: Tarea». */
  function inactiveNames(view: PickerView): string[] {
    return view.groups.flatMap((group) =>
      group.items
        .filter((option) => option.inactive === true)
        .map(({ selection }) => selection.project?.name ?? ""),
    );
  }

  it("sin `excluded` no marca ninguna opción inactiva", () => {
    expect(inactiveNames(pickerView(catalog, ""))).toEqual([]);
  });

  it("no ofrece una tarea ya usada ni «Sin proyecto» ya usado", () => {
    const view = pickerView(catalog, "", [pair("p-web", "p-web-t1"), none]);

    expect(view.none).toBeNull();
    expect(optionNames(view)[0]).toEqual([
      "Web",
      "Web: Diseño",
      "App móvil",
      "App móvil: Diseño de íconos",
    ]);
    expect(view.empty).toBeNull();
  });

  it("el proyecto usado que todavía ofrece tareas queda, inactivo, con sus tareas", () => {
    const view = pickerView(catalog, "", [pair("p-web")]);
    const [web, design, development] = view.groups[0].items;

    expect(web.selection.task).toBeNull();
    expect(web.inactive).toBe(true);
    expect(design.inactive).toBeUndefined();
    expect(development.inactive).toBeUndefined();
    expect(inactiveNames(view)).toEqual(["Web"]);
  });

  it("los ids se comparan sin distinguir mayúsculas", () => {
    const view = pickerView(catalog, "", [pair("P-WEB", "P-WEB-T0")]);

    expect(optionNames(view)[0]).not.toContain("Web: Diseño");
  });

  it("el proyecto usado sin tareas que ofrecer no se dibuja, y un cliente sin opciones tampoco", () => {
    const view = pickerView(catalog, "", [
      pair("p-soporte"),
      pair("p-soporte", "p-soporte-t0"),
      pair("p-interno"),
    ]);

    expect(groupNames(view)).toEqual(["Acme"]);
  });

  it("con la búsqueda, el proyecto usado queda inactivo solo si alguna tarea coincide", () => {
    expect(optionNames(pickerView(catalog, "desarr", [pair("p-web")]))).toEqual([
      ["Web", "Web: Desarrollo"],
    ]);
    expect(
      pickerView(catalog, "desarr", [pair("p-web"), pair("p-web", "p-web-t1")]),
    ).toEqual({ none: null, groups: [], empty: { kind: "noMatches" } });
  });

  it("con proyectos, la búsqueda vacía y todo usado, el vacío es `allUsed`", () => {
    const everything = [
      none,
      pair("p-web"),
      pair("p-web", "p-web-t0"),
      pair("p-web", "p-web-t1"),
      pair("p-app"),
      pair("p-app", "p-app-t0"),
      pair("p-soporte"),
      pair("p-soporte", "p-soporte-t0"),
      pair("p-interno"),
    ];

    expect(pickerView(catalog, "", everything)).toEqual({
      none: null,
      groups: [],
      empty: { kind: "allUsed" },
    });
    expect(pickerView(catalog, "web", everything).empty).toEqual({ kind: "noMatches" });
  });

  it("con todos los proyectos usados y «Sin proyecto» libre, no hay vacío", () => {
    const view = pickerView(catalog, "", [
      pair("p-web"),
      pair("p-web", "p-web-t0"),
      pair("p-web", "p-web-t1"),
      pair("p-app"),
      pair("p-app", "p-app-t0"),
      pair("p-soporte"),
      pair("p-soporte", "p-soporte-t0"),
      pair("p-interno"),
    ]);

    expect(view.none).not.toBeNull();
    expect(view.groups).toEqual([]);
    expect(view.empty).toBeNull();
  });

  it("con el catálogo sin proyectos gana TT-87 (TS-88), sin «Sin proyecto» si ya es fila", () => {
    const empty: TrackingCatalog = {
      canCreateProject: true,
      canCreateTag: true,
      tags: [],
      groups: [],
    };

    expect(pickerView(empty, "", [none])).toEqual({
      none: null,
      groups: [],
      empty: { kind: "noProjects", canCreateProject: true },
    });
    expect(pickerView(empty, "", []).none).not.toBeNull();
  });
});

describe("isTrackablePair (D13-8)", () => {
  it("«Sin proyecto» se puede cargar siempre, también con el catálogo vacío", () => {
    const pair = { projectId: null, taskId: null };

    expect(isTrackablePair(catalog, pair)).toBe(true);
    expect(isTrackablePair({ ...catalog, groups: [] }, pair)).toBe(true);
  });

  it("un proyecto, si está en algún grupo del catálogo", () => {
    expect(isTrackablePair(catalog, { projectId: "p-interno", taskId: null })).toBe(true);
    expect(isTrackablePair(catalog, { projectId: "P-SOPORTE", taskId: null })).toBe(true);
    expect(isTrackablePair(catalog, { projectId: "p-archivado", taskId: null })).toBe(
      false,
    );
  });

  it("una tarea, si además está entre las de su proyecto", () => {
    expect(isTrackablePair(catalog, { projectId: "p-web", taskId: "p-web-t1" })).toBe(
      true,
    );
    expect(isTrackablePair(catalog, { projectId: "p-web", taskId: "p-hecha" })).toBe(
      false,
    );
    expect(isTrackablePair(catalog, { projectId: "p-web", taskId: "p-soporte-t0" })).toBe(
      false,
    );
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

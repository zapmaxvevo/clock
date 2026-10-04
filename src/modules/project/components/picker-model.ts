import { samePair, type ProjectPair } from "@/lib/project-pair";
import type {
  ClientView,
  ProjectSelection,
  TrackingCatalog,
  TrackingGroupView,
  TrackingProjectView,
} from "@/modules/project/schema";

/** Una opción del selector: «Sin proyecto», un proyecto o una tarea de un proyecto. */
export type PickerOption = {
  readonly key: string;
  readonly selection: ProjectSelection;
};

/** Las opciones de un cliente. `client` nulo es «Sin cliente». */
export type PickerGroup = {
  readonly key: string;
  readonly client: ClientView | null;
  readonly items: readonly PickerOption[];
};

/** TT-87 y TT-07: los dos vacíos se distinguen. */
export type PickerEmpty =
  | { readonly kind: "noProjects"; readonly canCreateProject: boolean }
  | { readonly kind: "noMatches" };

export type PickerView = {
  /** TT-10: «Sin proyecto», primero y solo con la búsqueda vacía. */
  readonly none: PickerOption | null;
  readonly groups: readonly PickerGroup[];
  readonly empty: PickerEmpty | null;
};

/** «Sin proyecto»: el par de una entrada sin proyecto ni tarea (TT-93). */
export const NO_SELECTION: ProjectSelection = { project: null, task: null };

const NONE: PickerOption = { key: "none", selection: NO_SELECTION };

/**
 * TT-07: la búsqueda no distingue mayúsculas ni acentos. `NFD` separa cada
 * letra de su marca diacrítica, y la marca se descarta.
 */
function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function matches(name: string, query: string): boolean {
  return normalizeSearch(name).includes(query);
}

/** TT-07: las tareas van siempre debajo de su proyecto. */
function projectOptions(project: TrackingProjectView, query: string): PickerOption[] {
  const { tasks, ...ref } = project;
  const shownTasks =
    query === "" || matches(project.name, query)
      ? tasks
      : tasks.filter((task) => matches(task.name, query));
  return [
    { key: `project:${project.id}`, selection: { project: ref, task: null } },
    ...shownTasks.map((task) => ({
      key: `task:${task.id}`,
      selection: { project: ref, task },
    })),
  ];
}

/**
 * Un cliente que coincide trae todos sus proyectos; un proyecto que coincide,
 * todas sus tareas; una tarea que coincide, su proyecto con las tareas que
 * coinciden.
 */
function groupOptions(group: TrackingGroupView, query: string): PickerOption[] {
  const clientMatches = group.client !== null && matches(group.client.name, query);
  const shownProjects =
    query === "" || clientMatches
      ? group.projects
      : group.projects.filter(
          (project) =>
            matches(project.name, query) ||
            project.tasks.some((task) => matches(task.name, query)),
        );
  return shownProjects.flatMap((project) =>
    projectOptions(project, clientMatches ? "" : query),
  );
}

/**
 * Lo que dibuja el selector a partir del catálogo y la búsqueda. Es el único
 * que filtra: la primitiva recibe esta salida tal cual.
 */
export function pickerView(catalog: TrackingCatalog, search: string): PickerView {
  const query = normalizeSearch(search);
  const none = query === "" ? NONE : null;
  if (catalog.groups.length === 0) {
    return {
      none,
      groups: [],
      empty: { kind: "noProjects", canCreateProject: catalog.canCreateProject },
    };
  }
  const groups = catalog.groups
    .map((group) => ({
      key: group.client?.id ?? "no-client",
      client: group.client,
      items: groupOptions(group, query),
    }))
    .filter((group) => group.items.length > 0);
  return {
    none,
    groups,
    empty: groups.length === 0 ? { kind: "noMatches" } : null,
  };
}

/** El mismo par. Los ids se comparan sin distinguir mayúsculas, como en la base. */
export function sameSelection(a: ProjectSelection, b: ProjectSelection): boolean {
  return samePair(selectionIds(a), selectionIds(b));
}

/** Los ids que viajan a la action: la selección sin sus nombres ni su color. */
export function selectionIds(selection: ProjectSelection): ProjectPair {
  return { projectId: selection.project?.id ?? null, taskId: selection.task?.id ?? null };
}

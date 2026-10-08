import { sameId, samePair, type ProjectPair } from "@/lib/project-pair";
import { normalizeSearch } from "@/lib/text";
import type {
  ClientView,
  ProjectSelection,
  TaskView,
  TrackingCatalog,
  TrackingGroupView,
  TrackingProjectView,
} from "@/modules/project/schema";

/** Una opción del selector: «Sin proyecto», un proyecto o una tarea de un proyecto. */
export type PickerOption = {
  readonly key: string;
  readonly selection: ProjectSelection;
  /**
   * D13-9: el proyecto ya usado que sigue a la vista como encabezado de sus
   * tareas, sin poder elegirse.
   */
  readonly inactive?: true;
};

/** Las opciones de un cliente. `client` nulo es «Sin cliente». */
export type PickerGroup = {
  readonly key: string;
  readonly client: ClientView | null;
  readonly items: readonly PickerOption[];
};

/** TT-87, TT-07 y TS-18: los vacíos se distinguen. */
export type PickerEmpty =
  | { readonly kind: "noProjects"; readonly canCreateProject: boolean }
  | { readonly kind: "noMatches" }
  /** Con proyectos y la búsqueda vacía, todo lo que hay ya está en `excluded`. */
  | { readonly kind: "allUsed" };

export type PickerView = {
  /** TT-10: «Sin proyecto», primero y solo con la búsqueda vacía. */
  readonly none: PickerOption | null;
  readonly groups: readonly PickerGroup[];
  readonly empty: PickerEmpty | null;
};

/** «Sin proyecto»: el par de una entrada sin proyecto ni tarea (TT-93). */
export const NO_SELECTION: ProjectSelection = { project: null, task: null };

const NONE: PickerOption = { key: "none", selection: NO_SELECTION };

const NONE_PAIR: ProjectPair = { projectId: null, taskId: null };

function matches(name: string, query: string): boolean {
  return normalizeSearch(name).includes(query);
}

function isExcluded(excluded: readonly ProjectPair[], pair: ProjectPair): boolean {
  return excluded.some((used) => samePair(used, pair));
}

/**
 * TT-07: las tareas van siempre debajo de su proyecto. D13-9: lo excluido no
 * se dibuja, salvo el proyecto que todavía ofrece tareas, que queda inactivo.
 */
function projectOptions(
  project: TrackingProjectView,
  query: string,
  excluded: readonly ProjectPair[],
): PickerOption[] {
  const { tasks } = project;
  // Solo `ProjectRef`: el facturable por defecto lo busca en el catálogo quien elige.
  const ref = { id: project.id, name: project.name, color: project.color };
  const shownTasks = (
    query === "" || matches(project.name, query)
      ? tasks
      : tasks.filter((task) => matches(task.name, query))
  ).filter((task) => !isExcluded(excluded, { projectId: project.id, taskId: task.id }));
  const taskOptions = shownTasks.map((task) => ({
    key: `task:${task.id}`,
    selection: { project: ref, task },
  }));
  const projectOption: PickerOption = {
    key: `project:${project.id}`,
    selection: { project: ref, task: null },
  };
  if (!isExcluded(excluded, { projectId: project.id, taskId: null })) {
    return [projectOption, ...taskOptions];
  }
  return taskOptions.length === 0
    ? []
    : [{ ...projectOption, inactive: true }, ...taskOptions];
}

/**
 * Un cliente que coincide trae todos sus proyectos; un proyecto que coincide,
 * todas sus tareas; una tarea que coincide, su proyecto con las tareas que
 * coinciden.
 */
function groupOptions(
  group: TrackingGroupView,
  query: string,
  excluded: readonly ProjectPair[],
): PickerOption[] {
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
    projectOptions(project, clientMatches ? "" : query, excluded),
  );
}

/**
 * Lo que dibuja el selector a partir del catálogo y la búsqueda. Es el único
 * que filtra: la primitiva recibe esta salida tal cual. `excluded` son los
 * pares que ya tienen fila en la planilla (TS-18); sin él, se ofrece todo.
 */
export function pickerView(
  catalog: TrackingCatalog,
  search: string,
  excluded: readonly ProjectPair[] = [],
): PickerView {
  const query = normalizeSearch(search);
  const none = query === "" && !isExcluded(excluded, NONE_PAIR) ? NONE : null;
  // TS-88: sin proyectos gana el vacío de TT-87, aunque todo esté excluido.
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
      items: groupOptions(group, query, excluded),
    }))
    .filter((group) => group.items.length > 0);
  return { none, groups, empty: emptyOf(query, none, groups) };
}

function emptyOf(
  query: string,
  none: PickerOption | null,
  groups: readonly PickerGroup[],
): PickerEmpty | null {
  if (groups.length > 0 || none !== null) {
    return null;
  }
  return query === "" ? { kind: "allUsed" } : { kind: "noMatches" };
}

/** Lo que el catálogo ofrece de un par con proyecto: proyecto, tarea y cliente. */
export type CatalogEntry = {
  readonly client: ClientView | null;
  readonly project: TrackingProjectView;
  readonly task: TaskView | null;
};

/**
 * El proyecto y la tarea del par en el catálogo, con el cliente de su grupo;
 * `null` si el catálogo no los ofrece o si el par no tiene proyecto.
 */
export function catalogEntryOf(
  catalog: TrackingCatalog,
  pair: ProjectPair,
): CatalogEntry | null {
  if (pair.projectId === null) {
    return null;
  }
  for (const group of catalog.groups) {
    const project = group.projects.find((candidate) =>
      sameId(candidate.id, pair.projectId),
    );
    if (project === undefined) {
      continue;
    }
    if (pair.taskId === null) {
      return { client: group.client, project, task: null };
    }
    const task = project.tasks.find((candidate) => sameId(candidate.id, pair.taskId));
    return task === undefined ? null : { client: group.client, project, task };
  }
  return null;
}

/**
 * D13-8: el par se puede cargar si el catálogo lo ofrece, que es la regla del
 * dueño ya aplicada (ADR 0010). «Sin proyecto» siempre.
 */
export function isTrackablePair(catalog: TrackingCatalog, pair: ProjectPair): boolean {
  if (pair.projectId === null) {
    return pair.taskId === null;
  }
  return catalogEntryOf(catalog, pair) !== null;
}

/** El mismo par. Los ids se comparan sin distinguir mayúsculas, como en la base. */
export function sameSelection(a: ProjectSelection, b: ProjectSelection): boolean {
  return samePair(selectionIds(a), selectionIds(b));
}

/** Los ids que viajan a la action: la selección sin sus nombres ni su color. */
export function selectionIds(selection: ProjectSelection): ProjectPair {
  return { projectId: selection.project?.id ?? null, taskId: selection.task?.id ?? null };
}

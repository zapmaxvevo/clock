import { normalizeSearch } from "@/lib/text";
import {
  projectsSearchParams,
  type ProjectFilter,
  type ProjectListItem,
} from "@/modules/project/schema";

/** PR-85, PR-89, TT-07: los vacíos de la lista se distinguen. */
export type ProjectListEmpty = "none" | "noActive" | "noArchived" | "noMatches";

export type ProjectListRows = {
  readonly rows: readonly ProjectListItem[];
  readonly empty: ProjectListEmpty | null;
};

function inFilter(project: ProjectListItem, filter: ProjectFilter): boolean {
  if (filter === "todos") {
    return true;
  }
  return project.archived === (filter === "archivados");
}

/** D-P1-6: por nombre de proyecto y de cliente; no por tarea. */
function matches(project: ProjectListItem, query: string): boolean {
  return (
    normalizeSearch(project.name).includes(query) ||
    (project.client !== null && normalizeSearch(project.client.name).includes(query))
  );
}

/** D-P1-6: las filas que deja el filtro y la búsqueda, y el vacío que corresponde. */
export function projectListRows(
  projects: readonly ProjectListItem[],
  filter: ProjectFilter,
  search: string,
): ProjectListRows {
  if (projects.length === 0) {
    return { rows: [], empty: "none" };
  }
  const query = normalizeSearch(search);
  const rows = projects.filter(
    (project) => inFilter(project, filter) && (query === "" || matches(project, query)),
  );
  return { rows, empty: rows.length > 0 ? null : emptyOf(filter, query) };
}

function emptyOf(filter: ProjectFilter, query: string): ProjectListEmpty | null {
  if (query !== "") {
    return "noMatches";
  }
  if (filter === "activos") {
    return "noActive";
  }
  // Con «Todos» y algún proyecto siempre hay filas.
  return filter === "archivados" ? "noArchived" : null;
}

/** PR-95: «Activos» con la búsqueda vacía es `/proyectos`; si no, los parámetros que difieren. */
export function projectsHref(state: {
  readonly filter: ProjectFilter;
  readonly search: string;
}): string {
  const params = new URLSearchParams();
  if (state.filter !== "activos") {
    params.set("estado", state.filter);
  }
  if (state.search !== "") {
    params.set("buscar", state.search);
  }
  const query = params.toString();
  return query === "" ? "/proyectos" : `/proyectos?${query}`;
}

/**
 * La búsqueda de la URL con la regla de la página (ADR 0008): repetida o de
 * más de 100 caracteres, vacía.
 */
export function searchOf(params: { getAll(name: string): string[] }): string {
  const values = params.getAll("buscar");
  const parsed = projectsSearchParams.shape.buscar.parse(
    values.length === 1 ? values[0] : values,
  );
  return parsed ?? "";
}

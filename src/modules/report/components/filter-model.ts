import { normalizeSearch } from "@/lib/text";
import { projectLabels } from "@/modules/project/components/labels";
import type { PaletteKey } from "@/modules/project/palette";
import {
  REPORT_MAX_FILTER_VALUES,
  REPORT_WITHOUT_PROJECT,
  type ReportFilters,
  type ReportGrouping,
  type ReportRange,
  type ReportReadyState,
} from "@/modules/report/schema";

import { filterAll, reportLabels } from "./labels";
import type { ApplyEffect } from "./range-picker-model";
import { reportHref } from "./report-href";

export type FilterKind = "clients" | "projects";

/** Una opción del panel: la clave es el id, o `sin-proyecto`. */
export type FilterOption = {
  readonly key: string;
  readonly name: string;
  /** El cliente de un proyecto, en gris; `null` en el resto. */
  readonly detail: string | null;
  readonly color: PaletteKey | null;
  /** Archivado: va en el grupo de aparte (D-R4-8). */
  readonly retired: boolean;
};

/** «Sin proyecto»: primero, siempre visible y sin cliente ni color (RP-26). */
const WITHOUT_PROJECT_OPTION: FilterOption = {
  key: REPORT_WITHOUT_PROJECT,
  name: projectLabels.noProject,
  detail: null,
  color: null,
  retired: false,
};

/** Las opciones de un filtro, del estado; en proyectos, «Sin proyecto» primero. */
export function filterOptionsOf(
  options: ReportReadyState["filterOptions"],
  kind: FilterKind,
): readonly FilterOption[] {
  if (kind === "clients") {
    return options.clients.map((client) => ({
      key: client.id,
      name: client.name,
      detail: null,
      color: null,
      retired: client.archived,
    }));
  }
  return [
    WITHOUT_PROJECT_OPTION,
    ...options.projects.map((project) => ({
      key: project.id,
      name: project.name,
      detail: project.client?.name ?? null,
      color: project.color,
      retired: project.archived,
    })),
  ];
}

/** Lo elegido de un filtro, como claves; en proyectos, `sin-proyecto` si está. */
export function chosenKeys(filters: ReportFilters, kind: FilterKind): readonly string[] {
  if (kind === "clients") {
    return filters.clients;
  }
  return filters.withoutProject
    ? [...filters.projects, REPORT_WITHOUT_PROJECT]
    : filters.projects;
}

/** Los filtros con `keys` como lo elegido en `kind`, en el orden de `options`. */
export function withChosen(
  filters: ReportFilters,
  kind: FilterKind,
  keys: readonly string[],
  options: readonly FilterOption[],
): ReportFilters {
  const chosen = new Set(keys);
  const ids = options
    .filter((option) => option.key !== REPORT_WITHOUT_PROJECT && chosen.has(option.key))
    .map((option) => option.key);
  if (kind === "clients") {
    return { ...filters, clients: ids };
  }
  return {
    ...filters,
    projects: ids,
    withoutProject: chosen.has(REPORT_WITHOUT_PROJECT),
  };
}

/**
 * Lo que el panel muestra con la búsqueda: las vigentes y las de aparte, cada
 * una en su orden. «Sin proyecto» no se filtra.
 */
export function visibleOptions(
  options: readonly FilterOption[],
  query: string,
): {
  readonly current: readonly FilterOption[];
  readonly retired: readonly FilterOption[];
} {
  const normalized = normalizeSearch(query);
  const visible = options.filter(
    (option) =>
      option.key === REPORT_WITHOUT_PROJECT ||
      normalizeSearch(option.name).includes(normalized),
  );
  return {
    current: visible.filter((option) => !option.retired),
    retired: visible.filter((option) => option.retired),
  };
}

/** «todos», el nombre de la única o la cantidad (D-R4-8). */
export function filterSummary(
  kind: FilterKind,
  keys: readonly string[],
  options: readonly FilterOption[],
): string {
  if (keys.length === 0) {
    return filterAll[kind];
  }
  const only =
    keys.length === 1 ? options.find((option) => option.key === keys[0]) : undefined;
  return only?.name ?? String(keys.length);
}

/**
 * «Aplicar»: con más de `REPORT_MAX_FILTER_VALUES` claves —`sin-proyecto` es
 * una—, sigue abierto con el mensaje; si no, el `href`.
 */
export function applyFilter(
  location: {
    readonly range: ReportRange;
    readonly grouping: ReportGrouping;
    readonly filters: ReportFilters;
  },
  kind: FilterKind,
  keys: readonly string[],
  options: readonly FilterOption[],
): ApplyEffect {
  if (keys.length > REPORT_MAX_FILTER_VALUES) {
    return {
      open: true,
      error: reportLabels.filterTooMany(REPORT_MAX_FILTER_VALUES),
      href: null,
    };
  }
  return {
    open: false,
    error: null,
    href: reportHref({
      range: location.range,
      ...location.grouping,
      filters: withChosen(location.filters, kind, keys, options),
    }),
  };
}

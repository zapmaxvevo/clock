import {
  REPORT_GROUP_PARAMS,
  REPORT_WITHOUT_PROJECT,
  type ReportFilters,
  type ReportGroupBy,
  type ReportRange,
} from "@/modules/report/schema";

/**
 * La URL de un reporte (D-R2a-4), la única función que la arma: siempre con
 * los tres parámetros, para que un enlace copiado dé la misma vista (RP-32),
 * `subagrupar` como cuarto solo si hay subniveles (D-R3-5) y después las
 * listas de los filtros que eligen algo (D-R4-2). `filters` es obligatorio: un
 * enlace que los olvide no compila (D-R4-10).
 */
export function reportHref({
  range,
  groupBy,
  subgroups = [],
  filters,
}: {
  readonly range: ReportRange;
  readonly groupBy: ReportGroupBy;
  readonly subgroups?: readonly ReportGroupBy[];
  readonly filters: ReportFilters;
}): string {
  const params = new URLSearchParams({
    desde: range.first,
    hasta: range.last,
    agrupar: REPORT_GROUP_PARAMS[groupBy],
  });
  if (subgroups.length > 0) {
    params.set(
      "subagrupar",
      subgroups.map((subgroup) => REPORT_GROUP_PARAMS[subgroup]).join(","),
    );
  }
  // Cada lista ordenada, así una misma elección da la misma URL; «Sin
  // proyecto» va última.
  const projects = [
    ...[...filters.projects].sort(),
    ...(filters.withoutProject ? [REPORT_WITHOUT_PROJECT] : []),
  ];
  if (filters.clients.length > 0) {
    params.set("clientes", [...filters.clients].sort().join(","));
  }
  if (projects.length > 0) {
    params.set("proyectos", projects.join(","));
  }
  return `/reportes?${params.toString()}`;
}

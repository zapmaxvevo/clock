import {
  REPORT_GROUP_PARAMS,
  REPORT_WITHOUT_PROJECT,
  type ReportExportFormat,
  type ReportFilters,
  type ReportGroupBy,
  type ReportRange,
} from "@/modules/report/schema";

/**
 * Lo que dice la URL de un reporte: el período, los niveles, las personas sin
 * horas y los filtros.
 */
type ReportLocation = {
  readonly range: ReportRange;
  readonly groupBy: ReportGroupBy;
  readonly subgroups?: readonly ReportGroupBy[];
  /** D-R9-12: obligatorio, como `filters`; un enlace que la olvide no compila. */
  readonly peopleWithoutTime: boolean;
  readonly filters: ReportFilters;
};

/**
 * La URL de un reporte (D-R2a-4), la única función que la arma: siempre con
 * los tres parámetros, para que un enlace copiado dé la misma vista (RP-32),
 * `subagrupar` como cuarto solo si hay subniveles (D-R3-5), `sin-horas=1` solo
 * con la opción y la persona en el primer nivel (D-R9-4) y después las listas
 * de los filtros que eligen algo (D-R4-2). `filters` y `peopleWithoutTime` son
 * obligatorios: un enlace que los olvide no compila (D-R4-10, D-R9-12).
 */
export function reportHref(view: ReportLocation): string {
  return `/reportes?${reportQuery(view)}`;
}

/**
 * D-R6-4, D-R6-10: la descarga de un formato, con la misma query string que
 * `reportHref` para los mismos argumentos.
 */
export function reportExportHref(
  format: ReportExportFormat,
  view: ReportLocation,
): string {
  return `/reportes/exportar/${format}?${reportQuery(view)}`;
}

/** La query de un reporte, la misma para la página y para sus descargas. */
function reportQuery({
  range,
  groupBy,
  subgroups = [],
  peopleWithoutTime,
  filters,
}: ReportLocation): string {
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
  if (peopleWithoutTime && groupBy === "person") {
    params.set("sin-horas", "1");
  }
  // Cada lista ordenada, así una misma elección da la misma URL; «Sin
  // proyecto» va última.
  const projects = [
    ...[...filters.projects].sort(),
    ...(filters.withoutProject ? [REPORT_WITHOUT_PROJECT] : []),
  ];
  if (filters.people.length > 0) {
    // Los ids de Better Auth distinguen mayúsculas: se escriben tal cual.
    params.set("personas", [...filters.people].sort().join(","));
  }
  if (filters.clients.length > 0) {
    params.set("clientes", [...filters.clients].sort().join(","));
  }
  if (projects.length > 0) {
    params.set("proyectos", projects.join(","));
  }
  return params.toString();
}

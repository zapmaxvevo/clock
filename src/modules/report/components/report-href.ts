import {
  REPORT_GROUP_PARAMS,
  type ReportGroupBy,
  type ReportRange,
} from "@/modules/report/schema";

/**
 * La URL de un reporte (D-R2a-4), la única función que la arma: siempre con
 * los tres parámetros, para que un enlace copiado dé la misma vista (RP-32).
 */
export function reportHref({
  range,
  groupBy,
}: {
  readonly range: ReportRange;
  readonly groupBy: ReportGroupBy;
}): string {
  const params = new URLSearchParams({
    desde: range.first,
    hasta: range.last,
    agrupar: REPORT_GROUP_PARAMS[groupBy],
  });
  return `/reportes?${params.toString()}`;
}

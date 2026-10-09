import {
  REPORT_GROUP_PARAMS,
  type ReportGroupBy,
  type ReportRange,
} from "@/modules/report/schema";

/**
 * La URL de un reporte (D-R2a-4), la única función que la arma: siempre con
 * los tres parámetros, para que un enlace copiado dé la misma vista (RP-32), y
 * `subagrupar` como cuarto solo si hay subniveles (D-R3-5).
 */
export function reportHref({
  range,
  groupBy,
  subgroups = [],
}: {
  readonly range: ReportRange;
  readonly groupBy: ReportGroupBy;
  readonly subgroups?: readonly ReportGroupBy[];
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
  return `/reportes?${params.toString()}`;
}

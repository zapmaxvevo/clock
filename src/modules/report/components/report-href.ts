import type { ReportGroupBy, ReportRange } from "@/modules/report/schema";

/** La URL dice `persona` y `proyecto`; el código, `person` y `project`. */
const groupByParam: Record<ReportGroupBy, string> = {
  person: "persona",
  project: "proyecto",
};

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
    agrupar: groupByParam[groupBy],
  });
  return `/reportes?${params.toString()}`;
}

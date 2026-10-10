import { daysBetweenKeys } from "@/server/time";

import {
  REPORT_CHART_DAILY_MAX_DAYS,
  REPORT_CHART_WEEKLY_MAX_DAYS,
  type ReportRange,
  type ReportTimeGroupBy,
} from "./schema";

/**
 * D-R5-4, ADR 0021: la granularidad del gráfico sale del largo del período,
 * contado en días civiles: por día hasta 31, por semana hasta 182 y si no por
 * mes. No mira la agrupación de la tabla.
 */
export function chartGranularityOf(range: ReportRange): ReportTimeGroupBy {
  const days = daysBetweenKeys(range.first, range.last) + 1;
  if (days <= REPORT_CHART_DAILY_MAX_DAYS) {
    return "date";
  }
  if (days <= REPORT_CHART_WEEKLY_MAX_DAYS) {
    return "week";
  }
  return "month";
}

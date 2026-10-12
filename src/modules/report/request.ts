import {
  reportFiltersOf,
  reportGroupParams,
  reportPeopleWithoutTimeParams,
  reportRangeParams,
  reportSubgroupParams,
} from "./schema";
import type { ReportRequest } from "./service";

/**
 * D-R6-4: la query de una URL como el `searchParams` de una página: un
 * `string` por parámetro, o un arreglo si se repite.
 */
export function searchParamsRecord(
  params: URLSearchParams,
): Readonly<Record<string, string | readonly string[]>> {
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const values = params.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
}

/**
 * RP-32: el pedido de la página y de la ruta de exportación. Cada parámetro se
 * valida por su lado y uno inválido se descarta sin arrastrar a los otros.
 * Quién puede usar cada filtro lo decide el service (D-R4-4).
 */
export function reportRequestOf(
  params: Readonly<Record<string, unknown>>,
): ReportRequest {
  // Un rango inválido o repetido se descarta entero.
  const range = reportRangeParams.safeParse(params);
  const groupBy = reportGroupParams.safeParse(params);
  const subgroups = reportSubgroupParams.safeParse(params);
  return {
    range: range.success ? range.data : null,
    groupBy: groupBy.success ? groupBy.data : null,
    subgroups: subgroups.success ? subgroups.data : [],
    filters: reportFiltersOf(params),
    peopleWithoutTime: reportPeopleWithoutTimeParams.safeParse(params).success,
  };
}

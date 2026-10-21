import type { DurationFormat } from "@/server/time";

/**
 * D-WS2b-8: el ancho de la columna «Duración», de la tabla del reporte y de la
 * del gráfico. Con el completo, `99999:59:59` entra en una línea con `text-sm`
 * y cifras tabulares (medido en el navegador); con el compacto, el de siempre.
 */
const DURATION_COLUMN_WIDTH = {
  compact: "w-24",
  full: "w-28",
} as const satisfies Record<DurationFormat, string>;

/** `w-24` con el compacto; con el completo, la medida de D-WS2b-8. */
export function durationColumnWidth(format: DurationFormat): string {
  return DURATION_COLUMN_WIDTH[format];
}

import { createHash } from "node:crypto";

import type { ReportChart } from "@/modules/report/schema";

/**
 * Ayudantes de los tests de `report`, de unidad y de integración, que comparten
 * más de un archivo.
 */

/**
 * D-R10-9: el `id` de un grupo de descripción que calcula la base, calculado
 * acá: los 32 primeros hexadecimales del SHA-256 del texto entero en UTF-8.
 */
export function descriptionIdOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

/**
 * El gráfico del criterio 17 de R7: octubre de 2026 por día, 31 barras con las
 * marcas «01/10» a «31/10»; la del 13, de 6000 s, es la más alta; la del 4, de
 * 30 s; las demás, en cero.
 */
export const octoberByDay: ReportChart = {
  granularity: "date",
  bars: Array.from({ length: 31 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      firstDay: `2026-10-${day}`,
      label: `${day}/10`,
      partial: null,
      tick: `${day}/10`,
      seconds: index === 12 ? 6000 : index === 3 ? 30 : 0,
    };
  }),
};

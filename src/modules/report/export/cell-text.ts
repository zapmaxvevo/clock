import { formatDecimalHours, formatDuration, type DurationFormat } from "@/server/time";

import type { ExportCell } from "./types";

/**
 * D-R6-9, D-R7-6: el texto de una celda, el mismo en el CSV y en el PDF: la
 * duración en el formato del documento, las horas con coma truncadas al
 * centésimo y las claves canónicas.
 */
export function cellText(cell: ExportCell, durationFormat: DurationFormat): string {
  switch (cell.kind) {
    case "text":
      return cell.text;
    case "integer":
      return String(cell.value);
    case "day":
      return cell.dayKey;
    case "clock":
      return cell.clock;
    case "duration":
      return formatDuration(cell.seconds, durationFormat);
    case "hours":
      return formatDecimalHours(cell.minutes);
    case "empty":
      return "";
  }
}

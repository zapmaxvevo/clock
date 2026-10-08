import type { DateRange } from "react-day-picker";

import { civilDate, dayKeyOfCivilDate } from "@/components/civil-date";
import {
  reportMessages,
  reportRangeInput,
  type ReportGroupBy,
  type ReportRange,
} from "@/modules/report/schema";

import { reportHref } from "./report-href";

/** Lo que hace «Aplicar» con lo que hay elegido en el calendario. */
export type ApplyOutcome =
  /** La selección está vacía: «Aplicar» no hace nada. */
  | { readonly kind: "empty" }
  /** RP-34: el mensaje queda en el selector y no se navega. */
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "navigate"; readonly href: string };

/** El período que se ve, como lo elige el calendario de rango. */
export function selectionOf(range: ReportRange): DateRange {
  return { from: civilDate(range.first), to: civilDate(range.last) };
}

/**
 * D-R2a-4: con el inicio elegido y sin fin, el período es ese día. Valida con
 * el mismo esquema que la URL, así un período que la página descartaría no se
 * pide nunca. La agrupación se conserva.
 */
export function applySelection(
  selection: DateRange | undefined,
  groupBy: ReportGroupBy,
): ApplyOutcome {
  const from = selection?.from;
  if (from === undefined) {
    return { kind: "empty" };
  }
  const parsed = reportRangeInput.safeParse({
    first: dayKeyOfCivilDate(from),
    last: dayKeyOfCivilDate(selection?.to ?? from),
  });
  if (!parsed.success) {
    return {
      kind: "invalid",
      message: parsed.error.issues.at(0)?.message ?? reportMessages.invalidDate,
    };
  }
  return { kind: "navigate", href: reportHref({ range: parsed.data, groupBy }) };
}

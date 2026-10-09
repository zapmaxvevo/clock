import type { DateRange } from "react-day-picker";

import { civilDate, dayKeyOfCivilDate } from "@/components/civil-date";
import {
  reportMessages,
  reportRangeInput,
  type ReportGrouping,
  type ReportRange,
} from "@/modules/report/schema";

import { reportHref } from "./report-href";

/**
 * Lo que deja «Aplicar»: si el selector sigue abierto, el mensaje de la región
 * de alerta y adónde navegar, o `null` si no se navega.
 */
export type ApplyEffect = {
  readonly open: boolean;
  readonly error: string | null;
  readonly href: string | null;
};

/** El período que se ve, como lo elige el calendario de rango. */
export function selectionOf(range: ReportRange): DateRange {
  return { from: civilDate(range.first), to: civilDate(range.last) };
}

/**
 * D-R2a-4: con el inicio elegido y sin fin, el período es ese día. Valida con
 * el mismo esquema que la URL, así un período que la página descartaría no se
 * pide nunca. Sin selección no pasa nada (`aria-disabled`); con un período
 * inválido el selector sigue abierto con el mensaje de RP-34; con uno válido
 * cierra y navega, con la misma agrupación y sus subniveles.
 */
export function applySelection(
  selection: DateRange | undefined,
  grouping: ReportGrouping,
): ApplyEffect {
  const from = selection?.from;
  if (from === undefined) {
    return { open: true, error: null, href: null };
  }
  const parsed = reportRangeInput.safeParse({
    first: dayKeyOfCivilDate(from),
    last: dayKeyOfCivilDate(selection?.to ?? from),
  });
  if (!parsed.success) {
    return {
      open: true,
      error: parsed.error.issues.at(0)?.message ?? reportMessages.invalidDate,
      href: null,
    };
  }
  return {
    open: false,
    error: null,
    href: reportHref({ range: parsed.data, ...grouping }),
  };
}

"use client";

import { useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";

import type { CellWriteFailure } from "./cell-writes";
import type { EntryChangeFailure } from "./entry-changes";
import { entryChangeFailureTitle, timesheetLabels } from "./labels";
import type { RowRemovalFailure } from "./row-removals";

/** Las fallas que la región de la pantalla puede mostrar, una por fuente. */
export type ScreenFailures = {
  readonly cell: CellWriteFailure | null;
  readonly row: RowRemovalFailure | null;
  /** La del detalle solo cuando se ve en la pantalla, no en el editor ni en la lista. */
  readonly detail: EntryChangeFailure | null;
};

type NoticeSource = keyof ScreenFailures;

/** El orden en que se mira cuál llegó, si dos llegan en el mismo dibujo. */
const SOURCES: readonly NoticeSource[] = ["cell", "row", "detail"];

/**
 * Un aviso a la vez (§5.5, §5.9): si llegó una falla que la pantalla no
 * mostraba, las fuentes con otro aviso a la vista se bajan. Devuelve cuáles.
 */
export function staleNoticesOf(
  seen: ScreenFailures,
  current: ScreenFailures,
): readonly NoticeSource[] {
  const arrived = SOURCES.find(
    (source) => current[source] !== null && current[source] !== seen[source],
  );
  if (arrived === undefined) {
    return [];
  }
  return SOURCES.filter((source) => source !== arrived && current[source] !== null);
}

/**
 * Aplica «un aviso a la vez» en el dibujo en que llega una falla. La falla
 * del detalle que pasa de la lista a la pantalla cuenta como recién llegada
 * (§5.2). Lo llama el dueño de las tres fuentes, que es quien las baja.
 */
export function useLatestNotice(
  current: ScreenFailures,
  dismiss: Readonly<Record<NoticeSource, () => void>>,
): void {
  const [seen, setSeen] = useState(current);
  if (SOURCES.some((source) => seen[source] !== current[source])) {
    setSeen(current);
    for (const source of staleNoticesOf(seen, current)) {
      dismiss[source]();
    }
  }
}

/**
 * El aviso de un pedido del detalle, en la región o en la lista: la
 * operación, el mensaje del servidor y la entrada; «Reintentar» solo con
 * `unexpected` (TT-89).
 */
export function EntryChangeFeedback({
  failure,
  onRetry,
}: {
  readonly failure: EntryChangeFailure;
  readonly onRetry: () => void;
}) {
  return (
    <ActionFeedback
      title={entryChangeFailureTitle(failure)}
      message={failure.message}
      onRetry={failure.code === "unexpected" ? onRetry : undefined}
    >
      <p className="text-muted-foreground text-sm">{failure.request.name}</p>
    </ActionFeedback>
  );
}

type TimesheetNoticesProps = {
  readonly failures: ScreenFailures;
  readonly onRetryCell: () => void;
  readonly onRetryRow: () => void;
  readonly onRetryDetail: () => void;
};

/**
 * La región de los avisos de la pantalla. Lo que falló vive en ella y
 * sobrevive a la revalidación (§5.9); el anuncio lo da el `alert` de cada
 * aviso.
 */
export function TimesheetNotices({
  failures,
  onRetryCell,
  onRetryRow,
  onRetryDetail,
}: TimesheetNoticesProps) {
  const { cell, row, detail } = failures;
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {cell !== null && (
        <ActionFeedback
          title={timesheetLabels.cellNotSaved}
          message={cell.message}
          onRetry={cell.code === "unexpected" ? onRetryCell : undefined}
        >
          <p className="text-muted-foreground text-sm">{cell.request.name}</p>
        </ActionFeedback>
      )}
      {row !== null && (
        <ActionFeedback
          title={timesheetLabels.rowNotRemoved}
          message={row.message}
          onRetry={row.code === "unexpected" ? onRetryRow : undefined}
        />
      )}
      {detail !== null && (
        <EntryChangeFeedback failure={detail} onRetry={onRetryDetail} />
      )}
    </div>
  );
}

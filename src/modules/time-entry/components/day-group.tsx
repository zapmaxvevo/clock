"use client";

import { useEffect, useOptimistic, useRef } from "react";

import { deleteEntry } from "@/modules/time-entry/actions";
import type { DayGroupView, TimeEntryView } from "@/modules/time-entry/schema";
import { formatDuration } from "@/server/time";

import { useElapsedSeconds } from "./elapsed-counter";
import { EntryRow } from "./entry-row";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";
import { retryHandlerOf, useEntryAction } from "./use-entry-action";

type DayGroupProps = {
  readonly group: DayGroupView;
  /** Solo se usa en el grupo del día del timer activo. */
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  readonly canTrack: boolean;
};

/**
 * Un día de la lista con su total. El borrado vive acá y no en la fila porque
 * sacar una entrada mueve las dos cosas a la vez: la fila y el total del grupo
 * (TT-60). El total del día del timer activo suma además el transcurrido y
 * sube junto con el contador (TT-45, TT-46); la suma es en segundos y se
 * formatea una sola vez, así no acumula el truncamiento de cada fila.
 */
export function DayGroup({ group, running, serverNow, canTrack }: DayGroupProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [removedIds, showRemoved] = useOptimistic<readonly string[], string>(
    [],
    (current, id) => [...current, id],
  );
  const remove = useEntryAction(deleteEntry, {
    optimistic: (input) => showRemoved(input.id),
  });

  const removing = removedIds.length > 0;
  const wasRemoving = useRef(false);
  useEffect(() => {
    // La fila borrada se lleva el foco con ella: aterriza en el encabezado del
    // día, que sigue en pantalla.
    if (removing && !wasRemoving.current) {
      headingRef.current?.focus();
    }
    wasRemoving.current = removing;
  }, [removing]);

  const entries = group.entries.filter((entry) => !removedIds.includes(entry.id));
  const removedSeconds = group.entries
    .filter((entry) => removedIds.includes(entry.id))
    .reduce((total, entry) => total + (entry.durationSeconds ?? 0), 0);

  const runningStartedAt =
    group.isRunningDay && running !== null ? running.startedAt : null;
  const elapsed = useElapsedSeconds(runningStartedAt, serverNow);
  const totalLabel =
    runningStartedAt === null && removedSeconds === 0
      ? group.closedTotalLabel
      : formatDuration(
          Math.floor((Math.max(0, group.closedSeconds - removedSeconds) + elapsed) / 60),
        );
  const headingId = `dia-${group.date}`;

  return (
    <section aria-labelledby={headingId} className="rounded-lg border">
      <header className="bg-muted/40 flex items-center justify-between gap-4 border-b px-3 py-2">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="focus:ring-ring rounded-md text-sm font-medium focus:ring-3 focus:outline-none"
        >
          {group.label}
        </h2>
        <p className="text-sm">
          <span className="text-muted-foreground">Total</span>{" "}
          <span className="font-medium tabular-nums">{totalLabel}</span>
        </p>
      </header>

      {entries.length > 0 && (
        <ul>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              canTrack={canTrack}
              onDelete={() => remove.run({ id: entry.id })}
            />
          ))}
        </ul>
      )}

      {remove.failure !== null && (
        <div className="px-3 py-2">
          <TrackerFeedback
            title={trackerLabels.entryNotDeleted}
            message={remove.failure.message}
            retryDisabled={remove.pending}
            onRetry={retryHandlerOf(remove)}
          />
        </div>
      )}
    </section>
  );
}

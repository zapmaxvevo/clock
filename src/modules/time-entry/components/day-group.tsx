"use client";

import { useEffect, useOptimistic, useRef } from "react";

import {
  deleteEntry,
  updateDescription,
  updateEntryTimes,
} from "@/modules/time-entry/actions";
import type {
  DayGroupView,
  TimeEntryView,
  UpdateDescriptionInput,
  UpdateEntryTimesInput,
} from "@/modules/time-entry/schema";
import { formatDuration } from "@/server/time";

import { useElapsedSeconds } from "./elapsed-counter";
import { EntryRow } from "./entry-row";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";
import {
  retryHandlerOf,
  useEntryAction,
  type EntryActionHandle,
} from "./use-entry-action";

type DayGroupProps = {
  readonly group: DayGroupView;
  /** Solo se usa en el grupo del día del timer activo. */
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  readonly canTrack: boolean;
  /** Día de hoy en la zona del workspace. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día al que se puede mover una entrada. */
  readonly minDayKey: string;
  /** Cualquier operación nueva deja viejo el aviso de TT-108 de la lista. */
  readonly onOperationStart: () => void;
  /**
   * TT-108: la edición dejó la entrada en un día que la lista no dibuja.
   * `takeFocus` si el foco estaba en la fila, que ya no se va a ver.
   */
  readonly onOutsideWindow: (day: string, takeFocus: boolean) => void;
  /** TT-56: la entrada pasó a otro día con el foco en ella; la lista la sigue. */
  readonly onMoved: (moved: MovedEntry) => void;
  /** La fila de este grupo que tiene que tomar el foco al montarse. */
  readonly focusEntryId: string | null;
  readonly onEntryFocused: () => void;
};

/** Una entrada que la edición llevó a otro día. */
export type MovedEntry = {
  readonly id: string;
  /** Día local del grupo nuevo. */
  readonly date: string;
};

/** Reductor de las vistas optimistas por fila: la edición nueva reemplaza a la anterior. */
function replaceById<Edit extends { readonly id: string }>(
  current: readonly Edit[],
  next: Edit,
): readonly Edit[] {
  return [...current.filter((edit) => edit.id !== next.id), next];
}

/**
 * Si el foco está en la fila o no está en ningún lado, la persona estaba
 * trabajando en ella: cuando la fila se va, el foco la sigue. Si ya está en
 * otro control, no se la mueve.
 */
function focusIsOnEntry(id: string): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    active.closest(`[data-entry-id="${id}"]`) !== null
  );
}

/**
 * Un día de la lista con su total. Las tres mutaciones sobre una fila viven
 * acá y no en la fila: el borrado mueve también el total del grupo (TT-60),
 * la edición del horario puede llevarse la fila a otro día (TT-56), y las tres
 * pueden terminar con la fila fuera de la lista —borrada desde otra pestaña
 * (TT-80)— así que su aviso tiene que quedar en algo que sobreviva. El de una
 * fila movida fuera del tramo dibujado no es del grupo sino de la lista: si la
 * fila era la única del día, el grupo se va con ella.
 * El total del día del timer activo suma además el transcurrido y sube junto
 * con el contador (TT-45, TT-46); la suma es en segundos y se formatea una
 * sola vez, así no acumula el truncamiento de cada fila.
 */
export function DayGroup({
  group,
  running,
  serverNow,
  canTrack,
  todayKey,
  minDayKey,
  onOperationStart,
  onOutsideWindow,
  onMoved,
  focusEntryId,
  onEntryFocused,
}: DayGroupProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [edits, showEdit] = useOptimistic<
    readonly UpdateDescriptionInput[],
    UpdateDescriptionInput
  >([], replaceById);
  const save = useEntryAction(updateDescription, {
    optimistic: (input) => showEdit(input),
  });

  const [removedIds, showRemoved] = useOptimistic<readonly string[], string>(
    [],
    (current, id) => [...current, id],
  );
  const remove = useEntryAction(deleteEntry, {
    optimistic: (input) => showRemoved(input.id),
  });

  /**
   * TT-55: la fila no cambia de grupo de forma optimista. Queda atenuada en su
   * día con el trío confirmado, y la revalidación la dibuja donde corresponda.
   */
  const [timeEdits, showTimeEdit] = useOptimistic<
    readonly UpdateEntryTimesInput[],
    UpdateEntryTimesInput
  >([], replaceById);
  const saveTimes = useEntryAction(updateEntryTimes, {
    optimistic: (input) => showTimeEdit(input),
    onSuccess: (data, input) => {
      const takeFocus = focusIsOnEntry(input.id);
      if (data.outsideWindow) {
        onOutsideWindow(input.date, takeFocus);
      } else if (takeFocus && data.entry.dayDate !== group.date) {
        onMoved({ id: input.id, date: data.entry.dayDate });
      }
    },
  });

  /** Una operación nueva deja viejo el aviso de TT-108 de la lista. */
  function run<Input>(handle: EntryActionHandle<Input>, input: Input): void {
    onOperationStart();
    handle.run(input);
  }

  function retryOf<Input>(handle: EntryActionHandle<Input>): (() => void) | undefined {
    const retry = retryHandlerOf(handle);
    return retry === undefined
      ? undefined
      : () => {
          onOperationStart();
          retry();
        };
  }

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
  const totalLabel = formatDuration(
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
          {entries.map((entry) => {
            const edit = edits.find((pending) => pending.id === entry.id);
            const timeEdit = timeEdits.find((pending) => pending.id === entry.id);
            return (
              <EntryRow
                key={entry.id}
                entry={entry}
                description={edit?.description ?? entry.description}
                busy={
                  (save.pending && edit !== undefined) ||
                  (saveTimes.pending && timeEdit !== undefined)
                }
                canTrack={canTrack}
                pendingTimes={timeEdit ?? null}
                todayKey={todayKey}
                minDayKey={minDayKey}
                onSave={(description) => run(save, { id: entry.id, description })}
                onSaveTimes={(times) =>
                  run(saveTimes, {
                    id: entry.id,
                    date: times.date,
                    start: times.start,
                    end: times.end,
                  })
                }
                onDelete={() => run(remove, { id: entry.id })}
                focusTimesOnMount={focusEntryId === entry.id}
                onTimesFocused={onEntryFocused}
              />
            );
          })}
        </ul>
      )}

      {(save.failure !== null ||
        remove.failure !== null ||
        saveTimes.failure !== null) && (
        <div className="flex flex-col gap-2 px-3 py-2">
          {save.failure !== null && (
            <TrackerFeedback
              title={trackerLabels.descriptionNotSaved}
              message={save.failure.message}
              retryDisabled={save.pending}
              onRetry={retryOf(save)}
            />
          )}
          {saveTimes.failure !== null && (
            <TrackerFeedback
              title={trackerLabels.entryTimesNotSaved}
              message={saveTimes.failure.message}
              retryDisabled={saveTimes.pending}
              onRetry={retryOf(saveTimes)}
            />
          )}
          {remove.failure !== null && (
            <TrackerFeedback
              title={trackerLabels.entryNotDeleted}
              message={remove.failure.message}
              retryDisabled={remove.pending}
              onRetry={retryOf(remove)}
            />
          )}
        </div>
      )}
    </section>
  );
}

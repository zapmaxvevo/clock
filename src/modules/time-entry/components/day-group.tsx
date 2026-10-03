"use client";

import { useEffect, useOptimistic, useRef } from "react";

import {
  deleteEntry,
  duplicateEntry,
  updateDescription,
  updateEntryTimes,
} from "@/modules/time-entry/actions";
import type {
  DayGroupView,
  TimeEntryView,
  UpdateDescriptionInput,
  UpdateEntryTimesInput,
} from "@/modules/time-entry/schema";

import { EntryRow } from "./entry-row";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";
import {
  retryHandlerOf,
  useEntryAction,
  type EntryActionHandle,
} from "./use-entry-action";
import { useGroupTotalLabel } from "./use-group-total";
import { useNewEntryId } from "./use-new-entry-id";

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
  /**
   * P-15: la semana de la entrada que devolvió una mutación del grupo. La
   * lista la compara con la ventana y la extiende si hace falta.
   */
  readonly onEntryWeek: (weekStart: string) => void;
  /** TT-56: la entrada pasó a otro día con el foco en ella; la lista la sigue. */
  readonly onMoved: (moved: MovedEntry) => void;
  /** La fila de este grupo que tiene que tomar el foco al montarse. */
  readonly focusEntryId: string | null;
  readonly onEntryFocused: () => void;
  /** TT-57: continuar es de la lista, que también lo dispara con «c». */
  readonly onContinue: (sourceId: string) => void;
  /** La entrada cuya continuación está en vuelo. */
  readonly continuingId: string | null;
  /** La fila que anuncia el atajo «c», o `null` con los atajos apagados. */
  readonly shortcutEntryId: string | null;
  /**
   * Las entradas cuyo borrado viaja, de toda la lista: la lista las necesita
   * para que «c» no continúe una fila que se está yendo.
   */
  readonly removedIds: readonly string[];
  /** Vista optimista del borrado: se llama dentro de la transición del grupo. */
  readonly showRemoved: (id: string) => void;
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
 * Un día de la lista con su total. Las mutaciones sobre una fila viven acá y
 * no en la fila: el borrado y la copia mueven también el total del grupo
 * (TT-60, TT-58), la edición del horario puede llevarse la fila a otro día
 * (TT-56), y todas pueden terminar con la fila fuera de la lista —borrada desde otra pestaña
 * (TT-80)— así que su aviso tiene que quedar en algo que sobreviva. La semana
 * de la entrada que devuelven la edición del horario, la de la descripción y
 * la copia sube a la lista, que es la que conoce la ventana (P-15) y la que
 * sigue en pantalla si el grupo se va con su única fila.
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
  onEntryWeek,
  onMoved,
  focusEntryId,
  onEntryFocused,
  onContinue,
  continuingId,
  shortcutEntryId,
  removedIds,
  showRemoved,
}: DayGroupProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [edits, showEdit] = useOptimistic<
    readonly UpdateDescriptionInput[],
    UpdateDescriptionInput
  >([], replaceById);
  const save = useEntryAction(updateDescription, {
    optimistic: (input) => showEdit(input),
    onSuccess: (data) => onEntryWeek(data.entry.weekStart),
  });

  const remove = useEntryAction(deleteEntry, {
    optimistic: (input) => showRemoved(input.id),
  });

  /**
   * TT-55: la fila no cambia de grupo de forma optimista. Queda atenuada en su
   * día con el trío confirmado, y la revalidación la dibuja donde corresponda.
   * Si es un día de una semana que la ventana no dibuja, la lista la extiende
   * y el foco sigue a la fila igual.
   */
  const [timeEdits, showTimeEdit] = useOptimistic<
    readonly UpdateEntryTimesInput[],
    UpdateEntryTimesInput
  >([], replaceById);
  const saveTimes = useEntryAction(updateEntryTimes, {
    optimistic: (input) => showTimeEdit(input),
    onSuccess: (data, input) => {
      if (focusIsOnEntry(input.id) && data.entry.dayDate !== group.date) {
        onMoved({ id: input.id, date: data.entry.dayDate });
      }
      onEntryWeek(data.entry.weekStart);
    },
  });

  /** TT-58: la copia aparece con la revalidación; no hay fila optimista. */
  const duplicate = useEntryAction(duplicateEntry, {
    onSuccess: (data) => onEntryWeek(data.created.weekStart),
  });
  const nextDuplicateId = useNewEntryId(duplicate.failure);

  function handleDuplicate(sourceId: string): void {
    const id = nextDuplicateId(sourceId);
    duplicate.run({ id, sourceId });
  }

  /**
   * Una operación nueva deja viejo el aviso de duplicar: mientras ese aviso se
   * ve, repetir «Duplicar» reusa el id pendiente, y quien quiera otra copia la
   * pide después de que baje (§8).
   */
  function run<Input>(handle: EntryActionHandle<Input>, input: Input): void {
    duplicate.clear();
    handle.run(input);
  }

  function retryOf<Input>(handle: EntryActionHandle<Input>): (() => void) | undefined {
    const retry = retryHandlerOf(handle);
    return retry === undefined
      ? undefined
      : () => {
          duplicate.clear();
          retry();
        };
  }

  const removing = group.entries.some((entry) => removedIds.includes(entry.id));
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
  const totalLabel = useGroupTotalLabel({
    closedSeconds: group.closedSeconds,
    entries: group.entries,
    removedIds,
    runningStartedAt: group.isRunningDay && running !== null ? running.startedAt : null,
    serverNow,
  });
  const headingId = `dia-${group.date}`;

  return (
    <section aria-labelledby={headingId} className="rounded-lg border">
      <header className="bg-muted/40 flex items-center justify-between gap-4 border-b px-3 py-2">
        <h3
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="focus:ring-ring rounded-md text-sm font-medium focus:ring-3 focus:outline-none"
        >
          {group.label}
        </h3>
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
                onContinue={() => onContinue(entry.id)}
                continuing={continuingId === entry.id}
                continueShortcut={shortcutEntryId === entry.id}
                onDuplicate={() => handleDuplicate(entry.id)}
                focusTimesOnMount={focusEntryId === entry.id}
                onTimesFocused={onEntryFocused}
              />
            );
          })}
        </ul>
      )}

      {(save.failure !== null ||
        remove.failure !== null ||
        saveTimes.failure !== null ||
        duplicate.failure !== null) && (
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
          {duplicate.failure !== null && (
            <TrackerFeedback
              title={trackerLabels.entryNotDuplicated}
              message={duplicate.failure.message}
              retryDisabled={duplicate.pending}
              onRetry={retryOf(duplicate)}
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

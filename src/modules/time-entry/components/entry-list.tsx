"use client";

import Link, { useLinkStatus } from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { buttonVariants } from "@/components/ui/button";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import { continueEntry } from "@/modules/time-entry/actions";
import {
  timeEntryMessages,
  type TimeEntryView,
  type WeekGroupView,
} from "@/modules/time-entry/schema";

import { BulkActions, type SelectedEntry } from "./bulk-actions";
import { DayGroup, type MovedEntry } from "./day-group";
import { startedWeeks } from "./entry-week";
import { entryNameOf, trackerLabels } from "./labels";
import { useReachWeek } from "./reach-week";
import {
  keepVisible,
  toggleDay,
  toggleEntry,
  withoutIds,
  type Selection,
} from "./selection";
import { useTrackerShortcuts } from "./use-tracker-shortcuts";
import { WeekGroup } from "./week-group";

type EntryListProps = {
  readonly weeks: readonly WeekGroupView[];
  /** Solo lo usan la semana y el día del timer activo. */
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  readonly canTrack: boolean;
  /** Día de hoy en la zona del workspace. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día al que se puede mover una entrada. */
  readonly minDayKey: string;
  /** La entrada que continúa el atajo «c», o `null` si no hay ninguna. */
  readonly lastEntryId: string | null;
  /** El `desde` de «Cargar más», o `null` si no queda nada más atrás (TT-52). */
  readonly loadMoreFrom: string | null;
};

/**
 * La lista de semanas, con sus días adentro. Es dueña de lo que tiene que
 * sobrevivir a que un grupo desaparezca: el foco de una fila movida a otro
 * día, que se vuelve a montar en otro grupo —también cuando ese día está en
 * una semana que la lista recién dibuja después de extender la ventana
 * (P-15)—, y el foco después de «Cargar más».
 *
 * Aplica la regla de P-15 a lo que avisan los grupos y al resultado de
 * continuar, con `useReachWeek`.
 *
 * También es dueña de continuar (TT-57): lo usan todas las filas y el atajo
 * «c», que es de la lista porque es la que conoce las filas. Por lo mismo
 * guarda la vista optimista del borrado de todos los grupos: «c» no continúa
 * una fila que se está yendo.
 *
 * Es dueña de la selección (TT-62), que tiene que sobrevivir a «Cargar más», a
 * P-15 y a la revalidación, y de las filas que ocupa una operación en masa. La
 * selección se recorta en cada render a las filas que la lista dibuja: nunca
 * se edita ni se borra una fila que no está en pantalla.
 */
export function EntryList({
  weeks,
  running,
  serverNow,
  canTrack,
  todayKey,
  minDayKey,
  lastEntryId,
  loadMoreFrom,
}: EntryListProps) {
  /** La fila que el foco sigue a su grupo nuevo, hasta que lo toma. */
  const [moved, setMoved] = useState<MovedEntry | null>(null);
  const clearMoved = useCallback(() => setMoved(null), []);
  const reachWeek = useReachWeek();
  const desde = useSearchParams().get("desde");

  /** La semana que pidió «Cargar más», mientras su navegación viaja. */
  const [requestedWeek, setRequestedWeek] = useState<string | null>(null);
  /** La semana cuyo encabezado toma el foco, hasta que lo toma. */
  const [focusWeek, setFocusWeek] = useState<string | null>(null);
  const clearFocusWeek = useCallback(() => setFocusWeek(null), []);
  /** La navegación de «Cargar más» viaja: el aviso de carga lo anuncia. */
  const [loadingMore, setLoadingMore] = useState(false);
  // Si la navegación termina sin llegar a la URL pedida, la semana se baja.
  const handleLoadPending = useCallback((pending: boolean) => {
    setLoadingMore(pending);
    if (!pending) {
      setRequestedWeek(null);
    }
  }, []);
  // La navegación llegó cuando la URL lleva la semana pedida. Si esa semana
  // no se dibujó —sus entradas se borraron entre el render y el clic, y TT-86
  // no la dibuja—, el foco va a la semana más vieja de la lista.
  if (requestedWeek !== null && desde === requestedWeek) {
    setRequestedWeek(null);
    setFocusWeek(
      weeks.some((week) => week.start === requestedWeek)
        ? requestedWeek
        : (weeks.at(-1)?.start ?? null),
    );
  }

  /** La entrada cuya continuación viaja: su botón queda inactivo. */
  const [continuingId, showContinuing] = useOptimistic<string | null, string>(
    null,
    (_current, sourceId) => sourceId,
  );
  const continuation = useAction(continueEntry, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: (input) => showContinuing(input.sourceId),
    onSuccess: (data) => reachWeek(startedWeeks(data)),
  });
  const nextContinueId = useNewId(continuation.failure);

  const [removedIds, showRemoved] = useOptimistic<readonly string[], string>(
    [],
    (current, id) => [...current, id],
  );

  /** TT-62: los ids elegidos, de la pestaña y de este momento. */
  const [selection, setSelection] = useState<Selection>([]);
  /** TT-55: las filas que ocupa una operación en masa, mientras viaja. */
  const [bulkBusyIds, showBusy] = useOptimistic<readonly string[], readonly string[]>(
    [],
    (_current, ids) => ids,
  );
  const selectionLocked = bulkBusyIds.length > 0;

  // Las filas de un borrado en vuelo siguen en `weeks` hasta la revalidación:
  // no se recortan, y si el borrado falla vuelven elegidas.
  const shownEntries = new Map<string, SelectedEntry>(
    weeks.flatMap((week) =>
      week.days.flatMap((group) =>
        group.entries.map((entry): [string, SelectedEntry] => [
          entry.id,
          {
            id: entry.id,
            name: entryNameOf(entry.description),
            dayLabel: group.label,
            startLabel: entry.startLabel,
            // Los días traen solo entradas cerradas —el timer activo no es una
            // fila de la lista—, así que el fin siempre está: el `??` es por el
            // tipo de la vista, que comparte con el timer.
            endLabel: entry.endLabel ?? entry.startLabel,
          },
        ]),
      ),
    ),
  );
  const visibleSelection = keepVisible(selection, new Set(shownEntries.keys()));
  if (visibleSelection !== selection) {
    setSelection(visibleSelection);
  }
  // TT-92: sin permiso no hay casillas ni barra. La región queda montada, con
  // el aviso de una operación que la revalidación dejó sin permiso.
  const selectedEntries = canTrack
    ? visibleSelection.flatMap((id) => shownEntries.get(id) ?? [])
    : [];

  // ADR 0007: con otro timer en pantalla, reintentar la continuación ya no
  // tiene sentido. Si es la que creó el pedido cuya respuesta se perdió, el
  // pedido se aplicó; si vino de otra pestaña, reintentar la cerraría. Un
  // error de dominio describe el desenlace y se queda.
  const runningId = running?.id ?? null;
  const [shownRunningId, setShownRunningId] = useState(runningId);
  if (shownRunningId !== runningId) {
    setShownRunningId(runningId);
    if (continuation.failure?.code === "unexpected") {
      continuation.clear();
    }
  }

  function handleContinue(sourceId: string): void {
    const id = nextContinueId(sourceId);
    continuation.run({ id, sourceId });
  }

  const retryContinue = retryHandlerOf(continuation);

  // TT-26: «c» es el botón de continuar de la fila de `lastEntryId`, y nada
  // si esa fila no está en la lista —tampoco mientras viaja su borrado— o si
  // su continuación ya viaja.
  const lastEntryShown =
    lastEntryId !== null &&
    !removedIds.includes(lastEntryId) &&
    weeks.some((week) =>
      week.days.some((group) => group.entries.some((entry) => entry.id === lastEntryId)),
    );
  const continueLast =
    canTrack && lastEntryShown && continuingId !== lastEntryId ? lastEntryId : null;
  const shortcutsEnabled = useTrackerShortcuts({
    continueLast: continueLast === null ? undefined : () => handleContinue(continueLast),
  });

  return (
    <div className="flex flex-col gap-4">
      <BulkActions
        entries={selectedEntries}
        todayKey={todayKey}
        minDayKey={minDayKey}
        showRemoved={showRemoved}
        showBusy={showBusy}
        onDrop={(ids) => setSelection((current) => withoutIds(current, ids))}
        onClear={() => setSelection([])}
        onEntryWeeks={reachWeek}
      />

      {continuation.failure !== null && (
        <ActionFeedback
          title={trackerLabels.entryNotContinued}
          message={continuation.failure.message}
          retryDisabled={continuation.pending}
          onRetry={retryContinue}
        />
      )}

      {weeks.map((week) => (
        <WeekGroup
          key={week.start}
          week={week}
          running={running}
          serverNow={serverNow}
          removedIds={removedIds}
          takeFocus={focusWeek === week.start}
          onFocused={clearFocusWeek}
        >
          {week.days.map((group) => (
            <DayGroup
              key={group.date}
              group={group}
              running={running}
              serverNow={serverNow}
              canTrack={canTrack}
              todayKey={todayKey}
              minDayKey={minDayKey}
              onEntryWeek={(weekStart) => reachWeek([weekStart])}
              onMoved={setMoved}
              focusEntryId={moved !== null && moved.date === group.date ? moved.id : null}
              onEntryFocused={clearMoved}
              onContinue={handleContinue}
              continuingId={continuingId}
              shortcutEntryId={shortcutsEnabled && canTrack ? lastEntryId : null}
              removedIds={removedIds}
              showRemoved={showRemoved}
              selection={visibleSelection}
              onToggleEntry={(id) => setSelection((current) => toggleEntry(current, id))}
              onToggleDay={(dayIds) =>
                setSelection((current) => toggleDay(current, dayIds))
              }
              bulkBusyIds={bulkBusyIds}
              selectionLocked={selectionLocked}
            />
          ))}
        </WeekGroup>
      ))}

      {/*
       * Un enlace y no un botón: navega, así que se abre aparte y «Atrás»
       * vuelve. Sin `prefetch={true}`: guardaría en la caché del router una
       * ventana armada antes de la próxima mutación (ADR 0008).
       */}
      {loadMoreFrom !== null && (
        <Link
          href={`/?desde=${loadMoreFrom}`}
          scroll={false}
          onNavigate={() => setRequestedWeek(loadMoreFrom)}
          className={buttonVariants({ variant: "outline", className: "self-center" })}
        >
          <LoadMoreLabel onPendingChange={handleLoadPending} />
        </Link>
      )}
      {/*
       * Fuera del enlace, para no cambiar su nombre, y fuera del condicional:
       * montado desde el principio para que se anuncie, y sigue montado
       * cuando la última página se lleva el enlace.
       */}
      <p role="status" className="sr-only">
        {loadingMore ? trackerLabels.loadingMore : ""}
      </p>
    </div>
  );
}

type LoadMoreLabelProps = {
  /**
   * La navegación del enlace empezó o terminó, haya llegado o no a su URL.
   * Si el enlace se va con la navegación en vuelo, avisa que terminó.
   */
  readonly onPendingChange: (pending: boolean) => void;
};

/**
 * El texto de «Cargar más» (TT-52). Mientras su navegación viaja se atenúa; el
 * enlace no se deshabilita, así no pierde el foco.
 */
function LoadMoreLabel({ onPendingChange }: LoadMoreLabelProps) {
  const { pending } = useLinkStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current !== pending) {
      onPendingChange(pending);
    }
    wasPending.current = pending;
  }, [pending, onPendingChange]);

  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  return (
    <span className={pending ? "opacity-60" : undefined}>{trackerLabels.loadMore}</span>
  );
}

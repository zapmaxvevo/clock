"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState, type Ref } from "react";

import { continueEntry } from "@/modules/time-entry/actions";
import type { DayGroupView, TimeEntryView } from "@/modules/time-entry/schema";
import { dayKeyLabel } from "@/server/time";

import { DayGroup, type MovedEntry } from "./day-group";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";
import { retryHandlerOf, useEntryAction } from "./use-entry-action";
import { useNewEntryId } from "./use-new-entry-id";
import { useTrackerShortcuts } from "./use-tracker-shortcuts";

type OutsideWindowNoticeProps = {
  readonly ref?: Ref<HTMLDivElement>;
  /** Día en el que quedó la entrada. */
  readonly day: string;
  readonly todayKey: string;
};

/**
 * TT-108: una entrada guardada en un día anterior al tramo que la lista
 * dibuja. Lo usan el alta manual y la edición de horas, con los mismos textos.
 * Se puede enfocar desde el código: cuando la fila que tenía el foco se va de
 * la lista, el foco viene acá.
 */
export function OutsideWindowNotice({ ref, day, todayKey }: OutsideWindowNoticeProps) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="focus-visible:ring-ring rounded-lg focus-visible:ring-3 focus-visible:outline-none"
    >
      <TrackerFeedback
        tone="info"
        title={trackerLabels.outsideWindowTitle}
        message={trackerLabels.outsideWindowMessage(dayKeyLabel(day, todayKey))}
      />
    </div>
  );
}

type EntryListProps = {
  readonly days: readonly DayGroupView[];
  /** Solo lo usa el grupo del día del timer activo. */
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  readonly canTrack: boolean;
  /** Día de hoy en la zona del workspace. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día al que se puede mover una entrada. */
  readonly minDayKey: string;
  /** La entrada que continúa el atajo «c», o `null` si no hay ninguna. */
  readonly lastEntryId: string | null;
};

/** El aviso de TT-108 a la vista, y si tiene que tomar el foco al aparecer. */
type OutsideWindow = {
  readonly day: string;
  readonly takeFocus: boolean;
};

/**
 * La lista de días. Es dueña de lo que tiene que sobrevivir a que un grupo
 * desaparezca: el aviso de TT-108 de una fila movida fuera del tramo que se
 * dibuja —si la movida era la única de su día, la revalidación borra el grupo
 * y el aviso se iría con él— y el foco de una fila movida a otro día, que se
 * vuelve a montar en otro grupo. Cualquier operación nueva de cualquier grupo
 * baja el aviso.
 *
 * También es dueña de continuar (TT-57): lo usan todas las filas y el atajo
 * «c», que es de la lista porque es la que conoce las filas. Por lo mismo
 * guarda la vista optimista del borrado de todos los grupos: «c» no continúa
 * una fila que se está yendo.
 */
export function EntryList({
  days,
  running,
  serverNow,
  canTrack,
  todayKey,
  minDayKey,
  lastEntryId,
}: EntryListProps) {
  const [outsideWindow, setOutsideWindow] = useState<OutsideWindow | null>(null);
  /** La fila que el foco sigue a su grupo nuevo, hasta que lo toma. */
  const [moved, setMoved] = useState<MovedEntry | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outsideWindow?.takeFocus === true) {
      noticeRef.current?.focus();
    }
  }, [outsideWindow]);

  const clearMoved = useCallback(() => setMoved(null), []);

  /** La entrada cuya continuación viaja: su botón queda inactivo. */
  const [continuingId, showContinuing] = useOptimistic<string | null, string>(
    null,
    (_current, sourceId) => sourceId,
  );
  const continuation = useEntryAction(continueEntry, {
    optimistic: (input) => showContinuing(input.sourceId),
  });
  const nextContinueId = useNewEntryId(continuation.failure);

  const [removedIds, showRemoved] = useOptimistic<readonly string[], string>(
    [],
    (current, id) => [...current, id],
  );

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
    setOutsideWindow(null);
    continuation.run({ id, sourceId });
  }

  const retryContinue = retryHandlerOf(continuation);

  // TT-26: «c» es el botón de continuar de la fila de `lastEntryId`, y nada
  // si esa fila no está en la lista —tampoco mientras viaja su borrado— o si
  // su continuación ya viaja.
  const lastEntryShown =
    lastEntryId !== null &&
    !removedIds.includes(lastEntryId) &&
    days.some((group) => group.entries.some((entry) => entry.id === lastEntryId));
  const continueLast =
    canTrack && lastEntryShown && continuingId !== lastEntryId ? lastEntryId : null;
  const shortcutsEnabled = useTrackerShortcuts({
    continueLast: continueLast === null ? undefined : () => handleContinue(continueLast),
  });

  return (
    <div className="flex flex-col gap-4">
      {continuation.failure !== null && (
        <TrackerFeedback
          title={trackerLabels.entryNotContinued}
          message={continuation.failure.message}
          retryDisabled={continuation.pending}
          onRetry={
            retryContinue === undefined
              ? undefined
              : () => {
                  setOutsideWindow(null);
                  retryContinue();
                }
          }
        />
      )}

      {outsideWindow !== null && (
        <OutsideWindowNotice
          ref={noticeRef}
          day={outsideWindow.day}
          todayKey={todayKey}
        />
      )}

      {days.map((group) => (
        <DayGroup
          key={group.date}
          group={group}
          running={running}
          serverNow={serverNow}
          canTrack={canTrack}
          todayKey={todayKey}
          minDayKey={minDayKey}
          onOperationStart={() => setOutsideWindow(null)}
          onOutsideWindow={(day, takeFocus) => setOutsideWindow({ day, takeFocus })}
          onMoved={setMoved}
          focusEntryId={moved !== null && moved.date === group.date ? moved.id : null}
          onEntryFocused={clearMoved}
          onContinue={handleContinue}
          continuingId={continuingId}
          shortcutEntryId={shortcutsEnabled && canTrack ? lastEntryId : null}
          removedIds={removedIds}
          showRemoved={showRemoved}
        />
      ))}
    </div>
  );
}

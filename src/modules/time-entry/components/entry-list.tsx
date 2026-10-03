"use client";

import Link from "next/link";
import { useCallback, useOptimistic, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { continueEntry } from "@/modules/time-entry/actions";
import type { TimeEntryView, WeekGroupView } from "@/modules/time-entry/schema";

import { DayGroup, type MovedEntry } from "./day-group";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";
import { retryHandlerOf, useEntryAction } from "./use-entry-action";
import { useNewEntryId } from "./use-new-entry-id";
import { useReachWeek } from "./use-reach-week";
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
  /** El piso de la ventana sin el timer activo, contra el que compara P-15. */
  readonly reachFrom: string;
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
 * continuar: la semana de cada entrada devuelta se compara con `reachFrom`.
 *
 * También es dueña de continuar (TT-57): lo usan todas las filas y el atajo
 * «c», que es de la lista porque es la que conoce las filas. Por lo mismo
 * guarda la vista optimista del borrado de todos los grupos: «c» no continúa
 * una fila que se está yendo.
 */
export function EntryList({
  weeks,
  running,
  serverNow,
  canTrack,
  todayKey,
  minDayKey,
  lastEntryId,
  reachFrom,
  loadMoreFrom,
}: EntryListProps) {
  /** La fila que el foco sigue a su grupo nuevo, hasta que lo toma. */
  const [moved, setMoved] = useState<MovedEntry | null>(null);
  const clearMoved = useCallback(() => setMoved(null), []);
  const reachWeek = useReachWeek(reachFrom);

  /** La semana que pidió «Cargar más», mientras su navegación viaja. */
  const [requestedWeek, setRequestedWeek] = useState<string | null>(null);
  /** La semana cuyo encabezado toma el foco, hasta que lo toma. */
  const [focusWeek, setFocusWeek] = useState<string | null>(null);
  const clearFocusWeek = useCallback(() => setFocusWeek(null), []);
  // La ventana nueva incluye la semana pedida, así que su `loadMoreFrom` es
  // otro: cuando cambia, la navegación terminó. Si la semana pedida no llegó
  // —sus entradas se borraron entre el render y el clic, y TT-86 no la
  // dibuja—, el foco va a la semana más vieja de la lista.
  if (requestedWeek !== null && loadMoreFrom !== requestedWeek) {
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
  const continuation = useEntryAction(continueEntry, {
    optimistic: (input) => showContinuing(input.sourceId),
    onSuccess: (data) =>
      reachWeek(
        data.stopped === null
          ? [data.running.weekStart]
          : [data.running.weekStart, data.stopped.weekStart],
      ),
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
      {continuation.failure !== null && (
        <TrackerFeedback
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
            />
          ))}
        </WeekGroup>
      ))}

      {/*
       * Un enlace y no un botón: navega, así que funciona sin JavaScript, se
       * abre aparte y «Atrás» vuelve. Sin `prefetch={true}`: guardaría en la
       * caché del router una ventana armada antes de la próxima mutación
       * (ADR 0008).
       */}
      {loadMoreFrom !== null && (
        <Link
          href={`/?desde=${loadMoreFrom}`}
          scroll={false}
          onNavigate={() => setRequestedWeek(loadMoreFrom)}
          className={buttonVariants({ variant: "outline", className: "self-center" })}
        >
          {trackerLabels.loadMore}
        </Link>
      )}
    </div>
  );
}

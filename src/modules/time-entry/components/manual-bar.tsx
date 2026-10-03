"use client";

import { PlusIcon } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { timeEntryMessages } from "@/modules/time-entry/schema";
import { formatDuration } from "@/server/time";

import { ClockField } from "./clock-field";
import { DateField } from "./date-field";
import { trackerLabels } from "./labels";
import {
  commitChange,
  draftDuration,
  draftExtraDays,
  withDate,
  withDuration,
  withEnd,
  withStart,
  type ManualField,
  type TimeDraft,
  type TimeDraftChange,
} from "./time-draft";

type ManualBarProps = {
  /** El campo de descripción es del contenedor: conmutar de modo no lo pierde. */
  readonly descriptionField: ReactNode;
  /**
   * El borrador también es del contenedor: si un timer de otra pestaña obliga
   * a la barra a pasar al modo timer, lo tecleado sigue ahí al volver (TT-30).
   */
  readonly draft: TimeDraft;
  readonly onDraftChange: (draft: TimeDraft) => void;
  /** Día de hoy en la zona del workspace. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día que se puede elegir. */
  readonly minDayKey: string;
  readonly canTrack: boolean;
  /** Hay un agregado en vuelo. */
  readonly adding: boolean;
  readonly onAdd: () => void;
  /** El contenedor mira si el foco quedó acá para devolverlo a la descripción (TT-25). */
  readonly addRef?: Ref<HTMLButtonElement>;
};

/**
 * Barra del modo manual (TT-18, TT-25). No decide nada sobre el borrador: lo
 * pide entero a `time-draft.ts` y entrega lo que le devuelve. El pedido y
 * sus avisos son del contenedor, por el mismo motivo que el borrador.
 */
export function ManualBar({
  descriptionField,
  draft,
  onDraftChange,
  todayKey,
  minDayKey,
  canTrack,
  adding,
  onAdd,
  addRef,
}: ManualBarProps) {
  const tooShortId = useId();

  const minutes = draftDuration(draft);
  const extraDays = draftExtraDays(draft);
  const tooShort = minutes === 0;
  /**
   * «Agregar» no se deshabilita con `disabled` mientras la duración es cero o
   * el pedido viaja: un botón deshabilitado no recibe el clic, y el clic que
   * saca el foco del campo de fin es el mismo que lo habilita. Con
   * `aria-disabled` el clic llega después de que el campo confirmó su valor, y
   * `handleAdd` decide con el borrador ya actualizado.
   */
  const unavailable = tooShort || adding;

  function commit(
    change: TimeDraftChange<ManualField>,
    shown: (next: TimeDraft) => string,
  ): string | null {
    return commitChange(change, onDraftChange, shown);
  }

  function handleAdd(): void {
    if (!canTrack || unavailable) {
      return;
    }
    onAdd();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
        <div className="min-w-0 flex-1 basis-64">{descriptionField}</div>

        <span className="text-muted-foreground text-sm">{trackerLabels.noProject}</span>

        <div className="flex items-center gap-2">
          <ClockField
            value={draft.start}
            onCommit={(text) => commit(withStart(draft, text), (next) => next.start)}
            label={trackerLabels.startTime}
            disabled={!canTrack}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <span className="flex items-start">
            <ClockField
              value={draft.end}
              onCommit={(text) => commit(withEnd(draft, text), (next) => next.end)}
              label={trackerLabels.endTime}
              disabled={!canTrack}
            />
            {extraDays > 0 && (
              <sup className="text-muted-foreground ml-0.5 text-xs">
                +{extraDays}
                <span className="sr-only">{trackerLabels.endsNextDay}</span>
              </sup>
            )}
          </span>

          <DateField
            value={draft.date}
            onChange={(date) => onDraftChange(withDate(draft, date))}
            todayKey={todayKey}
            minDayKey={minDayKey}
            disabled={!canTrack}
          />

          <ClockField
            value={formatDuration(minutes)}
            onCommit={(text) =>
              commit(withDuration(draft, text), (next) =>
                formatDuration(draftDuration(next)),
              )
            }
            label="Duración"
            disabled={!canTrack}
          />
        </div>

        <Button
          ref={addRef}
          type="button"
          variant="success"
          disabled={!canTrack}
          aria-disabled={unavailable}
          aria-describedby={tooShort ? tooShortId : undefined}
          onClick={handleAdd}
          // Inactivo sin `pointer-events-none`, que volvería a tragarse el clic:
          // el puntero llega, pero el botón no responde al paso ni a la presión.
          className="aria-disabled:hover:bg-success aria-disabled:active:translate-y-0"
        >
          <PlusIcon aria-hidden="true" />
          Agregar
        </Button>
      </div>

      {tooShort && (
        <p id={tooShortId} className="text-muted-foreground text-sm">
          {timeEntryMessages.tooShort}
        </p>
      )}
    </>
  );
}

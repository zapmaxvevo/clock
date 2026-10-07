"use client";

import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { clockLabel } from "@/server/time";

import { ClockField } from "./clock-field";
import { DateField } from "./date-field";
import { trackerLabels } from "./labels";
import {
  commitChange,
  draftExtraDays,
  sameDraft,
  withDate,
  withEnd,
  withStart,
  type TimeDraft,
} from "./time-draft";

type EntryTimesEditorProps = {
  /** El trío con el que se abrió: `Esc` vuelve a él y confirmarlo igual no escribe. */
  readonly initial: TimeDraft;
  /** El borrador vigente. Es de la fila, que deriva de él la duración visible. */
  readonly draft: TimeDraft;
  readonly onDraftChange: (draft: TimeDraft) => void;
  /** Día de hoy en la zona de la persona. */
  readonly todayKey: string;
  /** Piso de fechas. No hay techo: una entrada cerrada puede ir al futuro (P-10). */
  readonly minDayKey: string;
  /** El botón de fecha de la fila abre el editor con el calendario abierto. */
  readonly openCalendar: boolean;
  /** Avisa el trío confirmado, solo si cambió. No llama a ninguna action. */
  readonly onConfirm: (draft: TimeDraft) => void;
  /** El editor terminó, confirmado o descartado; `returnFocus` si el foco seguía en él. */
  readonly onClose: (returnFocus: boolean) => void;
};

/**
 * El horario de una fila: inicio, fin y fecha (TT-54). El trío se confirma al
 * salir del editor —no de cada campo— o con Enter en una hora, así tabular
 * del inicio al fin no escribe estados intermedios. `Esc` descarta los tres
 * (TT-55). El calendario se dibuja en un portal y cuenta como parte del
 * editor: pasar el foco a él no confirma.
 *
 * La duración cero no se valida acá: el veredicto es del servidor, que puede
 * aceptar dos horas iguales cuando conserva los instantes guardados (ADR 0006).
 */
export function EntryTimesEditor({
  initial,
  draft,
  onDraftChange,
  todayKey,
  minDayKey,
  openCalendar,
  onConfirm,
  onClose,
}: EntryTimesEditorProps) {
  const { time } = useDisplayFormats();
  const groupRef = useRef<HTMLDivElement>(null);
  /**
   * El blur de un campo normaliza su valor y, en el mismo evento, el foco
   * puede estar saliendo del editor: la confirmación lee el trío de acá, con
   * el valor recién normalizado, y no el del render anterior.
   */
  const draftRef = useRef(draft);
  const calendarOpenRef = useRef(openCalendar);
  /** Un editor se cierra una sola vez, aunque lleguen Enter y blur seguidos. */
  const closedRef = useRef(false);

  useEffect(() => {
    if (openCalendar) {
      return;
    }
    const start = groupRef.current?.querySelector("input");
    start?.focus();
    start?.select();
  }, [openCalendar]);

  function change(next: TimeDraft): void {
    draftRef.current = next;
    onDraftChange(next);
  }

  function confirm(returnFocus: boolean): void {
    if (closedRef.current) {
      return;
    }
    closedRef.current = true;
    if (!sameDraft(draftRef.current, initial)) {
      onConfirm(draftRef.current);
    }
    onClose(returnFocus);
  }

  function cancel(): void {
    if (closedRef.current) {
      return;
    }
    closedRef.current = true;
    change(initial);
    onClose(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget;
    if (next !== null && groupRef.current?.contains(next)) {
      return;
    }
    // Cambiar de ventana no es salir del editor: al volver, el foco vuelve
    // al mismo campo.
    if (next === null && !document.hasFocus()) {
      return;
    }
    if (calendarOpenRef.current) {
      return;
    }
    confirm(false);
  }

  function handleCalendarOpenChange(open: boolean, focusReturns: boolean): void {
    calendarOpenRef.current = open;
    if (open || focusReturns) {
      return;
    }
    // Un clic afuera cierra el calendario sin devolverle el foco al editor. El
    // cierre llega en medio del cambio de foco —el calendario ya lo perdió y
    // el control tocado todavía no lo recibió—, así que se mira dónde quedó en
    // la tarea siguiente. Un clic sobre una hora del propio editor no lo cierra.
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active !== null && groupRef.current?.contains(active) === true) {
        return;
      }
      confirm(false);
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Las teclas del calendario también llegan acá, porque el portal sigue en
    // el árbol de React: con el calendario abierto, `Esc` solo lo cierra. Uno
    // que llega mientras el calendario se termina de cerrar ya es del editor.
    if (event.key !== "Escape" || event.defaultPrevented || calendarOpenRef.current) {
      return;
    }
    event.preventDefault();
    cancel();
  }

  const extraDays = draftExtraDays(draft);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label="Horario de la entrada"
      data-tracker-shortcuts="off"
      className="flex flex-wrap items-center gap-2"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <ClockField
        value={clockLabel(draft.start, time)}
        onCommit={(text) =>
          commitChange(withStart(draftRef.current, text, time), change, (next) =>
            clockLabel(next.start, time),
          )
        }
        onCancel={cancel}
        onSubmit={() => confirm(true)}
        label={trackerLabels.startTime}
        format={time}
      />
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      <span className="flex items-start">
        <ClockField
          value={clockLabel(draft.end, time)}
          onCommit={(text) =>
            commitChange(withEnd(draftRef.current, text, time), change, (next) =>
              clockLabel(next.end, time),
            )
          }
          onCancel={cancel}
          onSubmit={() => confirm(true)}
          label={trackerLabels.endTime}
          format={time}
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
        onChange={(date) => change(withDate(draftRef.current, date))}
        todayKey={todayKey}
        minDayKey={minDayKey}
        defaultOpen={openCalendar}
        onOpenChange={handleCalendarOpenChange}
      />
    </div>
  );
}

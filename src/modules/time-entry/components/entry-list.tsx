"use client";

import { useCallback, useEffect, useRef, useState, type Ref } from "react";

import type { DayGroupView, TimeEntryView } from "@/modules/time-entry/schema";
import { dayKeyLabel } from "@/server/time";

import { DayGroup, type MovedEntry } from "./day-group";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";

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
 */
export function EntryList({
  days,
  running,
  serverNow,
  canTrack,
  todayKey,
  minDayKey,
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

  return (
    <div className="flex flex-col gap-4">
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
        />
      ))}
    </div>
  );
}

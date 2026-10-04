"use client";

import { useRef, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { CalendarState, TimeEntryView } from "@/modules/time-entry/schema";

import { useElapsedSeconds } from "../elapsed-counter";
import { useTrackerRefresh } from "../use-tracker-refresh";
import { CalendarGrid } from "./calendar-grid";
import { nowPosition } from "./calendar-layout";
import { CalendarToolbar, ZoomControls } from "./calendar-toolbar";
import { calendarZoomCookie, type CalendarZoom } from "./calendar-zoom";
import { EntryDialog } from "./entry-dialog";
import { calendarLabels } from "./labels";

type CalendarViewProps = {
  readonly state: CalendarState;
  readonly initialZoom: CalendarZoom;
};

/**
 * El dueño de la pantalla del calendario en el cliente: el zoom con su
 * cookie, el diálogo de una entrada, a quién vuelve el foco y la
 * revalidación periódica (P-11).
 */
export function CalendarView({ state, initialZoom }: CalendarViewProps) {
  const [zoom, setZoom] = useState(initialZoom);
  const [open, setOpen] = useState(false);
  /**
   * La entrada del diálogo, como estaba al abrirlo (CAL-72): una revalidación
   * no la cambia. No se limpia al cerrar, así el cuerpo no queda vacío durante
   * la animación de salida, y su id es el del bloque al que vuelve el foco.
   */
  const [dialogEntry, setDialogEntry] = useState<TimeEntryView | null>(null);
  /** El botón del bloque de `dialogEntry`; `null` si una revalidación lo sacó. */
  const openerRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLElement>(null);

  useTrackerRefresh();
  // CAL-36: la línea de ahora es el minuto del servidor más lo transcurrido
  // desde esa lectura, sin la zona ni el reloj de la máquina (TT-32).
  const elapsed = useElapsedSeconds(state.serverNow, state.serverNow);
  const now = nowPosition(state, elapsed);

  function openEntry(id: string): void {
    const entry =
      state.running?.id === id
        ? state.running
        : state.entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      return;
    }
    setDialogEntry(entry);
    setOpen(true);
  }

  function changeZoom(next: CalendarZoom): void {
    // CAL-12: la próxima visita llega dibujada con el zoom elegido.
    document.cookie = calendarZoomCookie(next);
    setZoom(next);
  }

  return (
    <TooltipProvider>
      <section
        ref={regionRef}
        aria-label={calendarLabels.region}
        tabIndex={-1}
        className="flex flex-col gap-3 outline-none"
      >
        <CalendarToolbar state={state} />
        <CalendarGrid
          // Cada vista y cada período se desplazan de nuevo (CAL-14); una
          // revalidación no.
          key={`${state.mode}:${state.periodStart}`}
          state={state}
          now={now}
          zoom={zoom}
          corner={<ZoomControls zoom={zoom} onChange={changeZoom} />}
          openerId={dialogEntry?.id ?? null}
          openerRef={openerRef}
          dialogOpen={open}
          onOpen={openEntry}
        />
      </section>
      <EntryDialog
        open={open}
        entry={dialogEntry}
        serverNow={state.serverNow}
        todayKey={state.todayKey}
        onClose={() => setOpen(false)}
        openerRef={openerRef}
        regionRef={regionRef}
      />
    </TooltipProvider>
  );
}

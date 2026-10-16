"use client";

import {
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type Ref,
} from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { cn } from "@/lib/utils";
import type {
  CalendarDayView,
  CalendarState,
  TimeEntryView,
} from "@/modules/time-entry/schema";
import { clockLabel, MINUTES_PER_DAY } from "@/server/time";

import { draftExtraDays, type TimeDraft } from "../time-draft";
import { CalendarBlock } from "./calendar-block";
import {
  selectionAnchor,
  type EntryGestureKind,
  type SegmentGestures,
} from "./calendar-gestures";
import {
  entrySegments,
  layoutColumn,
  minuteHeight,
  SLOT_HEIGHT_PX,
  slotAt,
  type NowPosition,
  type Segment,
} from "./calendar-layout";
import type { CalendarZoom } from "./calendar-zoom";

/** Lo que una columna dibuja de una entrada. */
export type ColumnItem = {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  /** La entrada como se dibuja: con el trío del gesto o del pedido en vuelo. */
  readonly entry: TimeEntryView;
  /** La entrada como la trajo la lectura, de la que parte un gesto. */
  readonly source: TimeEntryView;
  readonly segment: Segment;
};

/** Lo atenuado: rayado y no solo otro color (CAL-30, CAL-48). */
const DIMMED_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px)",
};

/** El encabezado de una columna, que la nombra. */
export function headerId(date: string): string {
  return `calendar-day-${date}`;
}

type DayColumnProps = {
  readonly day: CalendarDayView;
  readonly state: CalendarState;
  readonly now: NowPosition;
  readonly zoom: CalendarZoom;
  /** La entrada del último diálogo abierto: su botón recibe `openerRef`. */
  readonly openerId: string | null;
  readonly openerRef: Ref<HTMLButtonElement>;
  /** Con un diálogo abierto o un gesto en curso, ningún bloque muestra su detalle. */
  readonly detailsOff: boolean;
  /** Un clic, `Enter` o `Espacio` en un bloque (CAL-74). */
  readonly onOpen: (id: string) => void;
  /** CAL-43: el clic en una franja libre; `slotAt` decide si abre algo. */
  readonly onSlot: (date: string, minute: number) => void;
  readonly items: readonly ColumnItem[];
  /** La selección del alta que se está arrastrando en esta columna (CAL-44). */
  readonly selection: TimeDraft | null;
  readonly gesturesOf: (item: ColumnItem) => SegmentGestures;
  /** La entrada cuyo pedido de horario viaja (CAL-62). */
  readonly busyId: string | null;
  /** La entrada del gesto en curso. */
  readonly draggedId: string | null;
  readonly onGestureStart: (
    item: ColumnItem,
    kind: EntryGestureKind,
    event: PointerEvent<HTMLElement>,
  ) => void;
  /** Apretar el fondo, en la celda de `selectionAnchor`: puede empezar una selección (CAL-44). */
  readonly onCreateStart: (anchor: number, event: PointerEvent<HTMLElement>) => void;
};

/**
 * La columna de un día, con lo atenuado (CAL-30, CAL-48), los bloques y la
 * línea de ahora si es la de hoy (CAL-35).
 */
export function DayColumn({
  day,
  items,
  state,
  now,
  zoom,
  openerId,
  openerRef,
  detailsOff,
  onOpen,
  onSlot,
  selection,
  gesturesOf,
  busyId,
  draggedId,
  onGestureStart,
  onCreateStart,
}: DayColumnProps) {
  const scale = minuteHeight(zoom);
  /**
   * P-m1: el `pointerdown` empezó sobre un bloque. Si se suelta sobre una
   * franja, el clic va a la columna, y no es un clic en la franja.
   */
  const pressedOnBlock = useRef(false);

  /**
   * El minuto de la franja bajo el puntero y su altura en la columna, o `null`
   * si ahí no se abre nada.
   */
  function slotUnder(
    event: MouseEvent<HTMLDivElement>,
  ): { readonly minute: number; readonly offset: number } | null {
    // Lo que se dibuja en un portal —el detalle de un bloque— propaga sus
    // eventos por el árbol de React hasta acá sin estar en la columna.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
      return null;
    }
    if (event.target instanceof Element && event.target.closest("[data-entry-block]")) {
      return null;
    }
    const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const minute = slotAt(day, offset, zoom, state.canTrack);
    return minute === null ? null : { minute, offset };
  }

  /**
   * CAL-43: el fondo de la columna abre el alta en la franja tocada; sobre un
   * bloque no. No es un control (CAL-76): el alta por teclado es «Agregar
   * entrada».
   */
  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    const fromBlock = pressedOnBlock.current;
    pressedOnBlock.current = false;
    const slot = slotUnder(event);
    if (slot !== null && !fromBlock) {
      onSlot(day.date, slot.minute);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    pressedOnBlock.current =
      event.target instanceof Element &&
      event.currentTarget.contains(event.target) &&
      event.target.closest("[data-entry-block]") !== null;
    // Donde un clic no abre nada, tampoco empieza una selección.
    const slot = slotUnder(event);
    if (slot !== null) {
      onCreateStart(selectionAnchor(slot.offset, zoom), event);
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={headerId(day.date)}
      data-calendar-day={day.date}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      className={cn(
        "relative border-r last:border-r-0",
        state.canTrack && !day.beforeFloor && "cursor-pointer",
      )}
      style={{
        height: MINUTES_PER_DAY * scale,
        backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
        backgroundSize: `100% ${SLOT_HEIGHT_PX}px`,
      }}
    >
      {day.beforeFloor && (
        <div aria-hidden="true" className="absolute inset-0" style={DIMMED_STYLE} />
      )}
      {day.missingMinutes.map((range) => (
        <div
          key={range.from}
          aria-hidden="true"
          className="absolute inset-x-0"
          style={{
            ...DIMMED_STYLE,
            top: range.from * scale,
            height: (range.to - range.from) * scale,
          }}
        />
      ))}
      {layoutColumn(items, zoom).map(({ item, ...placement }) => (
        <CalendarBlock
          key={item.key}
          entry={item.entry}
          segment={item.segment}
          placement={placement}
          serverNow={state.serverNow}
          todayKey={state.todayKey}
          detailsOff={detailsOff}
          onOpen={() => onOpen(item.entry.id)}
          buttonRef={
            item.segment.firstVisible && item.entry.id === openerId
              ? openerRef
              : undefined
          }
          gestures={gesturesOf(item)}
          busy={item.entry.id === busyId}
          dragging={item.entry.id === draggedId}
          onGestureStart={(kind, event) => onGestureStart(item, kind, event)}
        />
      ))}
      {selection !== null && <CalendarSelection times={selection} zoom={zoom} />}
      {now.date === day.date && (
        // CAL-35: decorativa, fuera del árbol de accesibilidad; sobre los
        // bloques, debajo del enfocado, del eje y de los encabezados.
        <div
          aria-hidden="true"
          data-calendar-now=""
          className="bg-primary pointer-events-none absolute inset-x-0 z-[5] h-0.5 -translate-y-1/2"
          style={{ top: now.minute * scale }}
        />
      )}
    </div>
  );
}

/** CAL-44: lo que cubre el alta que se arrastra, con su rango. */
function CalendarSelection({
  times,
  zoom,
}: {
  readonly times: TimeDraft;
  readonly zoom: CalendarZoom;
}) {
  const { time } = useDisplayFormats();
  const scale = minuteHeight(zoom);
  // La selección no sale de su columna: un solo segmento, también con un fin
  // de 24:00 escrito «00:00» (TT-72).
  const [segment] = entrySegments(
    {
      dayDate: times.date,
      startClock: times.start,
      endClock: times.end,
      extraDays: draftExtraDays(times),
    },
    [times.date],
  );
  if (segment === undefined) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      data-calendar-selection=""
      className="bg-primary/15 border-primary pointer-events-none absolute inset-x-0.5 z-10 rounded-md border px-1.5 py-0.5 text-xs"
      style={{ top: segment.from * scale, height: (segment.to - segment.from) * scale }}
    >
      {clockLabel(times.start, time)} – {clockLabel(times.end, time)}
    </div>
  );
}

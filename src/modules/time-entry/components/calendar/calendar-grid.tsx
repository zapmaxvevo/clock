"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { cn } from "@/lib/utils";
import type {
  CalendarDayView,
  CalendarState,
  TimeEntryView,
  UpdateEntryTimesInput,
} from "@/modules/time-entry/schema";
import { clockLabel, MINUTES_PER_DAY, minutesToClock } from "@/server/time";

import type { TimeDraft } from "../time-draft";
import { useGroupTotalLabel } from "../use-group-total";
import { DayColumn, headerId, type ColumnItem } from "./calendar-day-column";
import { movedView, segmentGestures, type GestureGrid } from "./calendar-gestures";
import {
  chronological,
  entrySegments,
  initialScrollMinute,
  minuteHeight,
  runningSegments,
  type NowPosition,
} from "./calendar-layout";
import { dayTotalOf } from "./calendar-totals";
import type { CalendarZoom } from "./calendar-zoom";
import { useCalendarGesture, type GesturePreview } from "./use-calendar-gesture";
import { usePendingBlockFocus } from "./use-pending-block-focus";

type CalendarGridProps = {
  readonly state: CalendarState;
  readonly now: NowPosition;
  readonly zoom: CalendarZoom;
  /** Los controles del zoom, en la esquina superior izquierda (CAL-11). */
  readonly corner: ReactNode;
  /** La entrada del último diálogo abierto: su botón recibe `openerRef`. */
  readonly openerId: string | null;
  readonly openerRef: Ref<HTMLButtonElement>;
  /** Con el diálogo abierto, los detalles de los bloques se cierran. */
  readonly dialogOpen: boolean;
  /** Un clic, `Enter` o `Espacio` en un bloque (CAL-74). */
  readonly onOpen: (id: string) => void;
  /** Las entradas cuyo borrado viaja: no se dibujan ni suman (TT-60). */
  readonly removedIds: readonly string[];
  /** CAL-43: el clic en una franja libre; `slotAt` decide si abre algo. */
  readonly onSlot: (date: string, minute: number) => void;
  /** La entrada cuyo botón toma el foco cuando se dibuja (§5.5). */
  readonly focusEntryId: string | null;
  readonly onEntryFocused: () => void;
  /** La región de la pantalla: el foco pasa al bloque solo desde ella o desde `body`. */
  readonly regionRef: RefObject<HTMLElement | null>;
  /** El pedido de horario en vuelo: su bloque se dibuja con ese trío, atenuado (CAL-62). */
  readonly movingTimes: UpdateEntryTimesInput | null;
  /** `state.canTrack` y ningún pedido de horario en vuelo. */
  readonly gesturesEnabled: boolean;
  readonly onDropTimes: (input: UpdateEntryTimesInput) => void;
  readonly onSelectRange: (draft: TimeDraft) => void;
  readonly onGestureChange: (active: boolean, entryId: string | null) => void;
};

/** Cómo se dibuja cada entrada mientras un gesto o un pedido de horario la mueven. */
type Displayed = (entry: TimeEntryView) => TimeEntryView;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Las entradas de cada día del período, con sus segmentos, en orden cronológico (CAL-76). */
function columnItems(
  state: CalendarState,
  now: NowPosition,
  removedIds: readonly string[],
  displayed: Displayed,
): ReadonlyMap<string, readonly ColumnItem[]> {
  const dates = state.days.map((day) => day.date);
  const byDay = new Map<string, ColumnItem[]>(dates.map((date) => [date, []]));
  const entries = state.entries.filter((entry) => !removedIds.includes(entry.id));
  // El orden es el de `startedAt`, que el gesto no cambia: el de `Tab` sigue el
  // de antes hasta la revalidación.
  for (const source of chronological(entries, state.running)) {
    const entry = source === state.running ? source : displayed(source);
    const segments =
      source === state.running
        ? runningSegments(entry, now, dates)
        : entrySegments(entry, dates);
    for (const segment of segments) {
      byDay.get(segment.date)?.push({
        key: entry.id,
        from: segment.from,
        to: segment.to,
        entry,
        source,
        segment,
      });
    }
  }
  return byDay;
}

/**
 * La grilla de 24 horas de reloj (CAL-06, CAL-10, CAL-30): el eje, una
 * columna por día con su encabezado y su total, lo atenuado, los bloques y la
 * línea de ahora. Se monta de nuevo con cada período, y ahí se desplaza
 * (CAL-14).
 */
export function CalendarGrid({
  state,
  now,
  zoom,
  corner,
  openerId,
  openerRef,
  dialogOpen,
  onOpen,
  removedIds,
  onSlot,
  focusEntryId,
  onEntryFocused,
  regionRef,
  movingTimes,
  gesturesEnabled,
  onDropTimes,
  onSelectRange,
  onGestureChange,
}: CalendarGridProps) {
  const { time } = useDisplayFormats();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scale = minuteHeight(zoom);
  const dates = state.days.map((day) => day.date);
  const grid: GestureGrid = { days: state.days, minDayKey: state.minDayKey, zoom };
  const gesture = useCalendarGesture({
    scrollRef,
    grid,
    enabled: gesturesEnabled,
    entryIds: state.entries
      .filter((entry) => !removedIds.includes(entry.id))
      .map((entry) => entry.id),
    onDrop: onDropTimes,
    onSelectRange,
    onActiveChange: onGestureChange,
  });
  const { preview } = gesture;
  const draggedId = preview?.kind === "entry" ? preview.entryId : null;

  const displayed: Displayed = (entry) => {
    if (preview?.kind === "entry" && preview.entryId === entry.id) {
      return movedView(entry, preview.times, time);
    }
    if (movingTimes !== null && movingTimes.id === entry.id) {
      return movedView(entry, movingTimes, time);
    }
    return entry;
  };
  const items = columnItems(state, now, removedIds, displayed);

  usePendingBlockFocus({
    regionRef,
    focusEntryId,
    onEntryFocused,
    state,
    movingTimes,
    preview,
  });

  // Solo al montar: una revalidación no mueve lo que la persona desplazó.
  const [initialScroll] = useState(() => initialScrollMinute(now, dates) * scale);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: initialScroll });
  }, [initialScroll]);

  // Con otro zoom queda arriba la misma hora, no el mismo píxel.
  const previousZoom = useRef(zoom);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller !== null && previousZoom.current !== zoom) {
      scroller.scrollTop = (scroller.scrollTop * previousZoom.current) / zoom;
    }
    previousZoom.current = zoom;
  }, [zoom]);

  const height = MINUTES_PER_DAY * scale;

  return (
    <div
      ref={scrollRef}
      onClickCapture={gesture.onClickCapture}
      // Arrastrar no selecciona texto.
      className="relative max-h-[calc(100dvh-14rem)] min-h-96 overflow-auto rounded-lg border select-none"
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `6.5rem repeat(${state.days.length}, minmax(7rem, 1fr))`,
        }}
      >
        <div
          // El gesto mide acá el alto de los encabezados y el ancho del eje.
          data-calendar-corner=""
          className="bg-background sticky top-0 left-0 z-40 flex items-center border-b px-1"
        >
          {corner}
        </div>
        {state.days.map((day) => (
          <DayHeader key={day.date} day={day} state={state} removedIds={removedIds} />
        ))}

        <div
          aria-hidden="true"
          className="bg-background sticky left-0 z-20 border-r"
          style={{ height }}
        >
          {HOURS.map((hour) => (
            <span
              key={hour}
              className={cn(
                "text-muted-foreground absolute right-2 text-xs tabular-nums",
                hour > 0 && "-translate-y-1/2",
              )}
              style={{ top: hour * 60 * scale }}
            >
              {clockLabel(minutesToClock(hour * 60), time)}
            </span>
          ))}
        </div>
        {state.days.map((day, dayIndex) => (
          <DayColumn
            key={day.date}
            day={day}
            items={items.get(day.date) ?? []}
            state={state}
            now={now}
            zoom={zoom}
            openerId={openerId}
            openerRef={openerRef}
            // CAL-23, CAL-77: con un gesto en curso ningún bloque muestra su detalle.
            detailsOff={dialogOpen || preview !== null}
            onOpen={onOpen}
            onSlot={onSlot}
            selection={selectionIn(preview, dayIndex)}
            // Con un pedido de horario en vuelo los gestos están apagados, también
            // en su bloque.
            gesturesOf={(item) =>
              segmentGestures(item.entry, item.segment, gesturesEnabled)
            }
            busyId={movingTimes?.id ?? null}
            draggedId={draggedId}
            onGestureStart={(item, kind, event) =>
              gesture.beginEntry(kind, item.source, event)
            }
            onCreateStart={(anchor, event) =>
              gesture.beginCreate(dayIndex, anchor, event)
            }
          />
        ))}
      </div>
    </div>
  );
}

/** CAL-09, CAL-31: el rótulo del día y su total; hoy, resaltado con fondo. */
function DayHeader({
  day,
  state,
  removedIds,
}: {
  readonly day: CalendarDayView;
  readonly state: CalendarState;
  readonly removedIds: readonly string[];
}) {
  const total = useGroupTotalLabel(dayTotalOf(day, state, removedIds));
  return (
    <div
      id={headerId(day.date)}
      aria-current={day.isToday ? "date" : undefined}
      className="bg-background sticky top-0 z-30 flex flex-col items-center gap-0.5 border-r border-b px-1 py-1.5 text-sm"
    >
      <span
        className={cn(
          "rounded-md px-1.5",
          day.isToday
            ? "bg-primary text-primary-foreground font-semibold"
            : "font-medium",
        )}
      >
        {day.label}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
    </div>
  );
}

/** La selección del alta en curso, si es de esta columna. */
function selectionIn(preview: GesturePreview | null, dayIndex: number): TimeDraft | null {
  return preview?.kind === "create" && preview.dayIndex === dayIndex
    ? preview.times
    : null;
}

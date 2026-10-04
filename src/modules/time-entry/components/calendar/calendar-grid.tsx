"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { cn } from "@/lib/utils";
import type {
  CalendarDayView,
  CalendarState,
  TimeEntryView,
} from "@/modules/time-entry/schema";
import { clockLabel, MINUTES_PER_DAY, minutesToClock } from "@/server/time";

import { useGroupTotalLabel } from "../use-group-total";
import { CalendarBlock } from "./calendar-block";
import {
  entrySegments,
  initialScrollMinute,
  layoutColumn,
  minuteHeight,
  runningSegments,
  SLOT_HEIGHT_PX,
  type NowPosition,
  type Segment,
} from "./calendar-layout";
import { dayTotalOf } from "./calendar-totals";
import type { CalendarZoom } from "./calendar-zoom";

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
};

/** Lo que una columna dibuja de una entrada. */
type ColumnItem = {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly entry: TimeEntryView;
  readonly segment: Segment;
};

/** Lo atenuado: rayado y no solo otro color (CAL-30, CAL-48). */
const DIMMED_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px)",
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Las entradas de cada día del período, con sus segmentos, en orden
 * cronológico (CAL-76): `entries` ya viene por inicio y después por id, y el
 * timer entra en el lugar de su inicio.
 */
function columnItems(
  state: CalendarState,
  now: NowPosition,
): ReadonlyMap<string, readonly ColumnItem[]> {
  const dates = state.days.map((day) => day.date);
  const byDay = new Map<string, ColumnItem[]>(dates.map((date) => [date, []]));
  const timeline =
    state.running === null
      ? state.entries
      : [...state.entries, state.running].sort(
          (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
        );
  for (const entry of timeline) {
    const segments =
      entry === state.running
        ? runningSegments(entry, now, dates)
        : entrySegments(entry, dates);
    for (const segment of segments) {
      byDay.get(segment.date)?.push({
        key: entry.id,
        from: segment.from,
        to: segment.to,
        entry,
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
}: CalendarGridProps) {
  const { time } = useDisplayFormats();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scale = minuteHeight(zoom);
  const dates = state.days.map((day) => day.date);
  const items = columnItems(state, now);

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
      // El foco no queda bajo los encabezados ni el eje, que son pegajosos (WCAG 2.4.11).
      className="relative max-h-[calc(100dvh-14rem)] min-h-96 scroll-pt-14 scroll-pl-[6.5rem] overflow-auto rounded-lg border"
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `6.5rem repeat(${state.days.length}, minmax(7rem, 1fr))`,
        }}
      >
        <div className="bg-background sticky top-0 left-0 z-40 flex items-center border-b px-1">
          {corner}
        </div>
        {state.days.map((day) => (
          <DayHeader key={day.date} day={day} state={state} />
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
        {state.days.map((day) => (
          <DayColumn
            key={day.date}
            day={day}
            items={items.get(day.date) ?? []}
            state={state}
            now={now}
            zoom={zoom}
            openerId={openerId}
            openerRef={openerRef}
            dialogOpen={dialogOpen}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

function headerId(date: string): string {
  return `calendar-day-${date}`;
}

/** CAL-09, CAL-31: el rótulo del día y su total; hoy, resaltado con fondo. */
function DayHeader({
  day,
  state,
}: {
  readonly day: CalendarDayView;
  readonly state: CalendarState;
}) {
  const total = useGroupTotalLabel(dayTotalOf(day, state, []));
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

type DayColumnProps = Pick<
  CalendarGridProps,
  "state" | "now" | "zoom" | "openerId" | "openerRef" | "dialogOpen" | "onOpen"
> & {
  readonly day: CalendarDayView;
  readonly items: readonly ColumnItem[];
};

/**
 * La columna de un día, con lo atenuado (CAL-30, CAL-48), los bloques y la
 * línea de ahora si es la de hoy (CAL-35).
 */
function DayColumn({
  day,
  items,
  state,
  now,
  zoom,
  openerId,
  openerRef,
  dialogOpen,
  onOpen,
}: DayColumnProps) {
  const scale = minuteHeight(zoom);
  return (
    <div
      role="group"
      aria-labelledby={headerId(day.date)}
      data-calendar-day={day.date}
      className="relative border-r last:border-r-0"
      style={{
        height: MINUTES_PER_DAY * scale,
        backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
        backgroundSize: `100% ${SLOT_HEIGHT_PX}px`,
      }}
    >
      {day.beforeWorkspace && (
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
          dialogOpen={dialogOpen}
          onOpen={() => onOpen(item.entry.id)}
          buttonRef={
            item.segment.firstVisible && item.entry.id === openerId
              ? openerRef
              : undefined
          }
        />
      ))}
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

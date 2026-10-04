"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
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
import {
  clockLabel,
  clockToMinutes,
  MINUTES_PER_DAY,
  minutesToClock,
} from "@/server/time";

import type { TimeDraft } from "../time-draft";
import { useGroupTotalLabel } from "../use-group-total";
import { CalendarBlock } from "./calendar-block";
import {
  movedView,
  NO_GESTURES,
  segmentGestures,
  type EntryGestureKind,
  type GestureGrid,
  type SegmentGestures,
} from "./calendar-gestures";
import {
  chronological,
  entrySegments,
  initialScrollMinute,
  layoutColumn,
  minuteHeight,
  runningSegments,
  SLOT_HEIGHT_PX,
  slotAt,
  type NowPosition,
  type Segment,
} from "./calendar-layout";
import { dayTotalOf } from "./calendar-totals";
import type { CalendarZoom } from "./calendar-zoom";
import { useCalendarGesture, type GesturePreview } from "./use-calendar-gesture";

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

/** Lo que una columna dibuja de una entrada. */
type ColumnItem = {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  /** La entrada como se dibuja: con el trío del gesto o del pedido en vuelo. */
  readonly entry: TimeEntryView;
  /** La entrada como la trajo la lectura, de la que parte un gesto. */
  readonly source: TimeEntryView;
  readonly segment: Segment;
};

/** Cómo se dibuja cada entrada mientras un gesto o un pedido de horario la mueven. */
type Displayed = (entry: TimeEntryView) => TimeEntryView;

/** Lo atenuado: rayado y no solo otro color (CAL-30, CAL-48). */
const DIMMED_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px)",
};

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

  // §5.5: el bloque de la entrada editada, creada, detenida o copiada toma el
  // foco cuando se dibuja —en este render o después de la revalidación—, si el
  // foco quedó en la región o en `body`. El diálogo que se cierra lo deja en la
  // región después de su animación, así que también se espera a que llegue.
  useEffect(() => {
    const region = regionRef.current;
    if (focusEntryId === null || region === null) {
      return;
    }
    const scope: HTMLElement = region;
    function focusBlock(): void {
      const button = scope.querySelector<HTMLButtonElement>(
        `button[data-entry-block="${focusEntryId}"]`,
      );
      const active = document.activeElement;
      // Con el foco ya en el botón no queda nada pendiente: un foco posterior
      // en la región no lo vuelve a llevar ahí.
      if (button !== null && active === button) {
        onEntryFocused();
        return;
      }
      if (active !== null && active !== document.body && active !== scope) {
        return;
      }
      if (button === null) {
        return;
      }
      button.focus();
      onEntryFocused();
    }
    focusBlock();
    scope.addEventListener("focus", focusBlock);
    return () => scope.removeEventListener("focus", focusBlock);
    // Un bloque que cambió de columna se desmonta: con otro dibujo se vuelve a buscar.
  }, [focusEntryId, onEntryFocused, regionRef, state, movingTimes, preview]);

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
            dialogOpen={dialogOpen || preview !== null}
            onOpen={onOpen}
            onSlot={onSlot}
            selection={selectionIn(preview, dayIndex)}
            gesturesOf={(item) =>
              movingTimes?.id === item.entry.id
                ? NO_GESTURES
                : segmentGestures(item.entry, item.segment, gesturesEnabled)
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

function headerId(date: string): string {
  return `calendar-day-${date}`;
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

type DayColumnProps = Pick<
  CalendarGridProps,
  "state" | "now" | "zoom" | "openerId" | "openerRef" | "dialogOpen" | "onOpen" | "onSlot"
> & {
  readonly day: CalendarDayView;
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
  /** Apretar el fondo, en la franja de `slotAt`: puede empezar una selección (CAL-44). */
  readonly onCreateStart: (anchor: number, event: PointerEvent<HTMLElement>) => void;
};

/** La selección del alta en curso, si es de esta columna. */
function selectionIn(preview: GesturePreview | null, dayIndex: number): TimeDraft | null {
  return preview?.kind === "create" && preview.dayIndex === dayIndex
    ? preview.times
    : null;
}

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
  onSlot,
  selection,
  gesturesOf,
  busyId,
  draggedId,
  onGestureStart,
  onCreateStart,
}: DayColumnProps) {
  const scale = minuteHeight(zoom);

  /** El minuto de la franja bajo el puntero, o `null` si ahí no se abre nada. */
  function slotUnder(event: MouseEvent<HTMLDivElement>): number | null {
    // Lo que se dibuja en un portal —el detalle de un bloque— propaga sus
    // eventos por el árbol de React hasta acá sin estar en la columna.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
      return null;
    }
    if (event.target instanceof Element && event.target.closest("[data-entry-block]")) {
      return null;
    }
    const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
    return slotAt(day, offset, zoom, state.canTrack);
  }

  /**
   * CAL-43: el fondo de la columna abre el alta en la franja tocada; sobre un
   * bloque no. No es un control (CAL-76): el alta por teclado es «Agregar
   * entrada».
   */
  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    const minute = slotUnder(event);
    if (minute !== null) {
      onSlot(day.date, minute);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    const minute = slotUnder(event);
    if (minute !== null) {
      onCreateStart(minute, event);
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
        state.canTrack && !day.beforeWorkspace && "cursor-pointer",
      )}
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

/** CAL-44: las franjas que cubre el alta que se arrastra, con su rango. */
function CalendarSelection({
  times,
  zoom,
}: {
  readonly times: TimeDraft;
  readonly zoom: CalendarZoom;
}) {
  const { time } = useDisplayFormats();
  const scale = minuteHeight(zoom);
  const from = clockToMinutes(times.start) ?? 0;
  // Un fin de 24:00 se escribe «00:00» (TT-72).
  const to =
    times.end === "00:00" ? MINUTES_PER_DAY : (clockToMinutes(times.end) ?? from);
  return (
    <div
      aria-hidden="true"
      data-calendar-selection=""
      className="bg-primary/15 border-primary pointer-events-none absolute inset-x-0.5 z-10 rounded-md border px-1.5 py-0.5 text-xs"
      style={{ top: from * scale, height: (to - from) * scale }}
    >
      {clockLabel(times.start, time)} – {clockLabel(times.end, time)}
    </div>
  );
}

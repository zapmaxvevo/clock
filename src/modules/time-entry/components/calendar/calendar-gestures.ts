import type { CalendarDayView, TimeEntryView } from "@/modules/time-entry/schema";
import {
  addDaysToKey,
  clockDifferenceMinutes,
  clockLabel,
  clockToMinutes,
  formatDuration,
  MINUTES_PER_DAY,
  minutesToClock,
  shiftClock,
  type TimeFormat,
} from "@/server/time";

import { draftDuration, draftExtraDays, fromView, type TimeDraft } from "../time-draft";
import {
  clamp,
  isMissing,
  minuteHeight,
  slotDraft,
  slotOf,
  type ClosedEntryView,
  type Segment,
} from "./calendar-layout";
import type { CalendarZoom } from "./calendar-zoom";

/**
 * La regla de los gestos de arrastre del calendario (ADR 0014): qué ofrece cada
 * segmento, el trío candidato de cada gesto con su marca de casa, sus topes y
 * sus huecos, la vista dibujada con otro trío, el umbral, la condición de
 * inicio y el desplazamiento automático. Sin DOM ni React.
 */

/** Minutos de reloj desde las 00:00 del primer día visible (§5.1). */
export type GridMinute = number;

/** Lo que el gesto necesita del período, de `CalendarState`. */
export type GestureGrid = {
  readonly days: readonly Pick<
    CalendarDayView,
    "date" | "beforeWorkspace" | "missingMinutes"
  >[];
  readonly minDayKey: string;
  readonly zoom: CalendarZoom;
};

export type EntryGestureKind = "move" | "start" | "end";

/** Un gesto sobre una entrada cerrada, con lo que tenía al empezar. */
type EntryGesture = {
  readonly kind: EntryGestureKind;
  readonly entryId: string;
  /** El trío de la entrada al empezar, `fromView(entry)`. */
  readonly original: TimeDraft;
  /** Su inicio en la recta: negativo si empezó el día anterior al período. */
  readonly start: GridMinute;
  /** Distancia de reloj del trío, `clockDifferenceMinutes` (CAL-51). */
  readonly span: number;
  /** En `move`, del inicio al punto tomado; 0 en los otros. */
  readonly grab: number;
};

/** Una selección para el alta, dentro de una columna (CAL-44). */
type CreateGesture = {
  readonly kind: "create";
  readonly dayIndex: number;
  /** El minuto de la franja tocada, el de `slotAt`. */
  readonly anchor: number;
};

export type Gesture = EntryGesture | CreateGesture;

/** Qué gestos ofrece un segmento (CAL-05, CAL-39, CAL-58, CAL-90, CAL-100). */
export type SegmentGestures = {
  readonly move: boolean;
  readonly start: boolean;
  readonly end: boolean;
};

export const NO_GESTURES: SegmentGestures = { move: false, start: false, end: false };

/**
 * `segmentGestures`: sin permiso, en el timer y en la entrada que el trío no
 * expresa, nada. El cuerpo mueve con distancia de reloj (CAL-90); el asa de
 * inicio está en el segmento del día de inicio, y la de fin en el que termina
 * donde termina la entrada, que con un fin a las 00:00 es el del día anterior.
 */
export function segmentGestures(
  entry: TimeEntryView,
  segment: Segment,
  canTrack: boolean,
): SegmentGestures {
  if (!canTrack || entry.endClock === null || !entry.editableTimes) {
    return NO_GESTURES;
  }
  const endDay = addDaysToKey(entry.dayDate, entry.extraDays);
  const endMinute = clockToMinutes(entry.endClock) ?? 0;
  const endsHere =
    endMinute === 0 && entry.extraDays > 0
      ? segment.date === addDaysToKey(endDay, -1) && segment.to === MINUTES_PER_DAY
      : segment.date === endDay && segment.to === endMinute;
  return {
    move: clockDifferenceMinutes(entry.startClock, entry.endClock) > 0,
    start: segment.startsHere,
    end: endsHere,
  };
}

/** El gesto sobre una entrada, tomado en `pointer`. */
export function entryGesture(
  kind: EntryGestureKind,
  entry: ClosedEntryView,
  days: readonly string[],
  pointer: GridMinute,
): EntryGesture {
  const original = fromView(entry);
  const index = days.indexOf(entry.dayDate);
  // Con `editableTimes` dura menos de un día: si su día no está a la vista,
  // empezó el anterior al primero.
  const start =
    (index === -1 ? -1 : index) * MINUTES_PER_DAY +
    (clockToMinutes(entry.startClock) ?? 0);
  return {
    kind,
    entryId: entry.id,
    original,
    start,
    span: clockDifferenceMinutes(original.start, original.end),
    grab: kind === "move" ? pointer - start : 0,
  };
}

/** El trío del que parte el gesto: el de la entrada, o el de un clic (`slotDraft`). */
export function initialCandidate(gesture: Gesture, grid: GestureGrid): TimeDraft {
  if (gesture.kind !== "create") {
    return gesture.original;
  }
  const day = grid.days[gesture.dayIndex];
  return slotDraft(day.date, gesture.anchor, grid.zoom, day.missingMinutes);
}

/** La recta del período con las marcas del zoom (§5.1). */
function lineOf(grid: GestureGrid) {
  const { zoom, days } = grid;
  const end = days.length * MINUTES_PER_DAY;
  const firstOpen = days.findIndex((day) => !day.beforeWorkspace);
  const floor =
    grid.minDayKey < days[0].date
      ? -Infinity
      : (firstOpen === -1 ? days.length : firstOpen) * MINUTES_PER_DAY;
  return {
    end,
    floor,
    round: (x: number) => Math.round(x / zoom) * zoom,
    nextMark: (x: number) => Math.floor(x / zoom) * zoom + zoom,
    lastMark: (x: number) => Math.ceil(x / zoom) * zoom - zoom,
    dayOf: (point: GridMinute) =>
      addDaysToKey(days[0].date, Math.floor(point / MINUTES_PER_DAY)),
    /** Un punto de un día visible que no existe; los días de afuera no se miran (§8). */
    missing: (point: GridMinute) => {
      const index = Math.floor(point / MINUTES_PER_DAY);
      const day = days[index];
      return (
        day !== undefined &&
        isMissing(point - index * MINUTES_PER_DAY, day.missingMinutes)
      );
    },
  };
}

/**
 * El trío que propone el gesto con el puntero en `pointer`: el original si el
 * extremo que se mueve vuelve a su marca de casa (CAL-57); si no, con el
 * ajuste de CAL-53 y los topes de CAL-48, CAL-55, CAL-56 y CAL-61 aplicados.
 * `null` si un extremo cae en un minuto que no existe (CAL-30, CAL-59).
 */
export function candidateAt(
  gesture: Gesture,
  pointer: GridMinute,
  grid: GestureGrid,
): TimeDraft | null {
  const line = lineOf(grid);
  switch (gesture.kind) {
    case "move": {
      const { original, start, span, grab } = gesture;
      const home = line.round(start);
      const wanted = line.round(pointer - grab);
      if (wanted === home) {
        return original;
      }
      // Al menos un minuto en el período, y nunca antes del piso (CAL-48, CAL-61).
      const startMinute = clamp(
        wanted,
        Math.max(line.floor, line.nextMark(-span)),
        line.end - grid.zoom,
      );
      if (line.missing(startMinute) || line.missing(startMinute + span)) {
        return null;
      }
      const startClock = minutesToClock(startMinute);
      return {
        date: line.dayOf(startMinute),
        start: startClock,
        end: shiftClock(startClock, span),
      };
    }
    case "start": {
      const { original, start, span } = gesture;
      const end = start + span;
      const wanted = line.round(pointer);
      if (wanted === line.round(start)) {
        return original;
      }
      // Entre 24 horas antes del fin y la última marca anterior a él (CAL-55, CAL-56).
      const startMinute = clamp(
        wanted,
        Math.max(line.floor, line.nextMark(end - MINUTES_PER_DAY)),
        line.lastMark(end),
      );
      if (line.missing(startMinute)) {
        return null;
      }
      // El fin no cambia de rótulo y conserva su instante (ADR 0006).
      return {
        date: line.dayOf(startMinute),
        start: minutesToClock(startMinute),
        end: original.end,
      };
    }
    case "end": {
      const { original, start, span } = gesture;
      const wanted = line.round(pointer);
      if (wanted === line.round(start + span)) {
        return original;
      }
      const endMinute = clamp(
        wanted,
        line.nextMark(start),
        line.lastMark(start + MINUTES_PER_DAY),
      );
      if (line.missing(endMinute)) {
        return null;
      }
      // Un fin anterior al inicio es del día siguiente (TT-72).
      return {
        date: original.date,
        start: original.start,
        end: minutesToClock(endMinute),
      };
    }
    case "create": {
      const { dayIndex, anchor } = gesture;
      const base = dayIndex * MINUTES_PER_DAY;
      const longest = MINUTES_PER_DAY - grid.zoom;
      const slot = slotOf(pointer - base, grid.zoom);
      let from = Math.min(anchor, slot);
      let to = Math.max(anchor, slot) + grid.zoom;
      // Más de 24 horas menos una franja: se recorta del lado del puntero.
      if (to - from > longest) {
        if (slot >= anchor) {
          to = from + longest;
        } else {
          from = to - longest;
        }
      }
      if (line.missing(base + from) || line.missing(base + to)) {
        return null;
      }
      return {
        date: grid.days[dayIndex].date,
        start: minutesToClock(from),
        // Un fin de 24:00 se escribe «00:00» (TT-72).
        end: minutesToClock(to),
      };
    }
  }
}

/** La entrada dibujada con otro trío: la del gesto y la del pedido en vuelo (ADR 0012). */
export function movedView(
  entry: TimeEntryView,
  times: TimeDraft,
  format: TimeFormat,
): TimeEntryView {
  const minutes = draftDuration(times);
  return {
    ...entry,
    dayDate: times.date,
    startClock: times.start,
    endClock: times.end,
    extraDays: draftExtraDays(times),
    startLabel: clockLabel(times.start, format),
    endLabel: clockLabel(times.end, format),
    durationSeconds: minutes * 60,
    durationLabel: formatDuration(minutes),
  };
}

/** El punto bajo el puntero en una columna, acotado a ella (CAL-61). */
export function gridMinuteAt(
  dayIndex: number,
  offsetPx: number,
  zoom: CalendarZoom,
): GridMinute {
  return (
    dayIndex * MINUTES_PER_DAY + clamp(offsetPx / minuteHeight(zoom), 0, MINUTES_PER_DAY)
  );
}

/** Una columna medida en pantalla: el índice de su día y sus bordes. */
export type ColumnBox = {
  readonly index: number;
  readonly left: number;
  readonly right: number;
};

/** CAL-61: la columna cuyo ancho contiene `x`, o la más cercana; `undefined` sin columnas. */
export function nearestColumn<Column extends ColumnBox>(
  columns: readonly Column[],
  x: number,
): Column | undefined {
  const distance = (column: Column) =>
    x < column.left ? column.left - x : x >= column.right ? x - column.right + 1 : 0;
  return columns.reduce<Column | undefined>(
    (best, column) =>
      best === undefined || distance(column) < distance(best) ? column : best,
    undefined,
  );
}

/** ADR 0014: el botón principal del mouse. */
export function startsGesture(pointer: {
  readonly pointerType: string;
  readonly button: number;
  readonly isPrimary: boolean;
}): boolean {
  return pointer.pointerType === "mouse" && pointer.button === 0 && pointer.isPrimary;
}

const DRAG_THRESHOLD_PX = 4;

/** Desde acá el gesto deja de ser un clic. */
export function passedThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

const AUTOSCROLL_EDGE_PX = 32;

/** Píxeles por cuadro hacia un borde a esa distancia: 0 fuera de la banda, hasta 16 en el borde. */
export function autoScrollStep(distanceToEdge: number): number {
  if (distanceToEdge >= AUTOSCROLL_EDGE_PX) {
    return 0;
  }
  return Math.ceil((AUTOSCROLL_EDGE_PX - Math.max(distanceToEdge, 0)) / 2);
}

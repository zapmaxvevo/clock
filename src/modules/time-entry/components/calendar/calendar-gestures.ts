import type { CalendarDayView, TimeEntryView } from "@/modules/time-entry/schema";
import type { TimeFormat } from "@/server/time";

import type { TimeDraft } from "../time-draft";
import type { Segment } from "./calendar-layout";
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
export type EntryGesture = {
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
export type CreateGesture = {
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

const PENDING = "Sin implementar: slice 8b.";

export function segmentGestures(
  entry: TimeEntryView,
  segment: Segment,
  canTrack: boolean,
): SegmentGestures {
  void entry;
  void segment;
  void canTrack;
  throw new Error(PENDING);
}

/** El gesto sobre una entrada, tomado en `pointer`. */
export function entryGesture(
  kind: EntryGestureKind,
  entry: TimeEntryView,
  days: readonly string[],
  pointer: GridMinute,
): EntryGesture {
  void kind;
  void entry;
  void days;
  void pointer;
  throw new Error(PENDING);
}

/** El trío del que parte el gesto: el de la entrada, o el de un clic (`slotDraft`). */
export function initialCandidate(gesture: Gesture, grid: GestureGrid): TimeDraft {
  void gesture;
  void grid;
  throw new Error(PENDING);
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
  void gesture;
  void pointer;
  void grid;
  throw new Error(PENDING);
}

/** La entrada dibujada con otro trío: la del gesto y la del pedido en vuelo (ADR 0012). */
export function movedView(
  entry: TimeEntryView,
  times: TimeDraft,
  format: TimeFormat,
): TimeEntryView {
  void entry;
  void times;
  void format;
  throw new Error(PENDING);
}

/** El punto bajo el puntero en una columna, acotado a ella (CAL-61). */
export function gridMinuteAt(
  dayIndex: number,
  offsetPx: number,
  zoom: CalendarZoom,
): GridMinute {
  void dayIndex;
  void offsetPx;
  void zoom;
  throw new Error(PENDING);
}

/** ADR 0014: el botón principal del mouse. */
export function startsGesture(pointer: {
  readonly pointerType: string;
  readonly button: number;
  readonly isPrimary: boolean;
}): boolean {
  void pointer;
  throw new Error(PENDING);
}

export const DRAG_THRESHOLD_PX = 4;

/** Desde acá el gesto deja de ser un clic. */
export function passedThreshold(dx: number, dy: number): boolean {
  void dx;
  void dy;
  throw new Error(PENDING);
}

export const AUTOSCROLL_EDGE_PX = 32;

/** Píxeles por cuadro hacia un borde a esa distancia: 0 fuera de la banda, hasta 16 en el borde. */
export function autoScrollStep(distanceToEdge: number): number {
  void distanceToEdge;
  throw new Error(PENDING);
}

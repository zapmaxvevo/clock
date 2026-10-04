"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import type { TimeEntryView, UpdateEntryTimesInput } from "@/modules/time-entry/schema";

import { sameDraft, type TimeDraft } from "../time-draft";
import {
  autoScrollStep,
  candidateAt,
  entryGesture,
  gridMinuteAt,
  initialCandidate,
  passedThreshold,
  startsGesture,
  type EntryGestureKind,
  type Gesture,
  type GestureGrid,
  type GridMinute,
} from "./calendar-gestures";

export type GesturePreview =
  | { readonly kind: "entry"; readonly entryId: string; readonly times: TimeDraft }
  | { readonly kind: "create"; readonly dayIndex: number; readonly times: TimeDraft };

type GestureOptions = {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly grid: GestureGrid;
  /** Con permiso de carga y sin un pedido de horario en vuelo. */
  readonly enabled: boolean;
  /** Las entradas que se dibujan: si la del gesto se va, el gesto se cancela. */
  readonly entryIds: readonly string[];
  readonly onDrop: (input: UpdateEntryTimesInput) => void;
  readonly onSelectRange: (draft: TimeDraft) => void;
  /** Avisa el principio y el fin, con el id de la entrada si es un gesto sobre una. */
  readonly onActiveChange: (active: boolean, entryId: string | null) => void;
};

/**
 * Las tres fases de un gesto (§5.4): armado hasta pasar el umbral, vivo con la
 * captura, y muerto hasta soltar después de cancelar.
 */
type Session =
  | {
      readonly phase: "armed";
      readonly gesture: Gesture;
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly phase: "live";
      readonly gesture: Gesture;
      readonly pointerId: number;
      readonly candidate: TimeDraft;
      readonly x: number;
      readonly y: number;
    }
  | { readonly phase: "dead"; readonly pointerId: number };

function entryIdOf(gesture: Gesture): string | null {
  return gesture.kind === "create" ? null : gesture.entryId;
}

function previewOf(gesture: Gesture, times: TimeDraft): GesturePreview {
  return gesture.kind === "create"
    ? { kind: "create", dayIndex: gesture.dayIndex, times }
    : { kind: "entry", entryId: gesture.entryId, times };
}

/** Las columnas del período, en orden, con el índice de su día. */
function columnsOf(
  scroller: HTMLElement,
  grid: GestureGrid,
): readonly { readonly index: number; readonly rect: DOMRect }[] {
  const dates = grid.days.map((day) => day.date);
  return [...scroller.querySelectorAll<HTMLElement>("[data-calendar-day]")].map(
    (column) => ({
      index: dates.indexOf(column.dataset.calendarDay ?? ""),
      rect: column.getBoundingClientRect(),
    }),
  );
}

/**
 * El punto de la recta bajo el puntero: la columna cuyo ancho lo contiene, o
 * la más cercana (CAL-61); en una selección, siempre la suya.
 */
function pointerMinute(
  scroller: HTMLElement,
  grid: GestureGrid,
  ownDay: number | null,
  x: number,
  y: number,
): GridMinute | null {
  const columns = columnsOf(scroller, grid);
  const column =
    ownDay !== null
      ? columns.find((candidate) => candidate.index === ownDay)
      : columns.reduce<(typeof columns)[number] | undefined>((best, candidate) => {
          const distance = (rect: DOMRect) =>
            x < rect.left ? rect.left - x : x >= rect.right ? x - rect.right + 1 : 0;
          return best === undefined || distance(candidate.rect) < distance(best.rect)
            ? candidate
            : best;
        }, undefined);
  if (column === undefined || column.index === -1) {
    return null;
  }
  return gridMinuteAt(column.index, y - column.rect.top, grid.zoom);
}

/**
 * El área visible de las columnas: la de la grilla sin los encabezados
 * pegajosos ni el eje, que mide la esquina del zoom.
 */
function visibleArea(scroller: HTMLElement): DOMRect {
  const outer = scroller.getBoundingClientRect();
  const corner = scroller
    .querySelector("[data-calendar-corner]")
    ?.getBoundingClientRect();
  const top = outer.top + (corner?.height ?? 0);
  const left = outer.left + (corner?.width ?? 0);
  return new DOMRect(left, top, outer.right - left, outer.bottom - top);
}

/**
 * El ciclo de un gesto de arrastre sobre la grilla (ADR 0014): el único lugar
 * que mira eventos, coordenadas, la captura del puntero y el desplazamiento
 * automático. Todo lo que se decide, lo decide `calendar-gestures.ts`.
 */
export function useCalendarGesture(options: GestureOptions): {
  /** `null` sin gesto, antes del umbral y con el gesto cancelado. */
  readonly preview: GesturePreview | null;
  readonly beginEntry: (
    kind: EntryGestureKind,
    entry: TimeEntryView,
    event: PointerEvent<HTMLElement>,
  ) => void;
  readonly beginCreate: (
    dayIndex: number,
    anchor: number,
    event: PointerEvent<HTMLElement>,
  ) => void;
  /** En captura sobre la grilla: defensa contra un clic que siga a un gesto. */
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
} {
  const [preview, setPreview] = useState<GesturePreview | null>(null);
  const session = useRef<Session | null>(null);
  /** El clic que sigue a un gesto, terminado o cancelado, no llega a nadie (§5.4, paso 7). */
  const clickMark = useRef(false);
  const frame = useRef<number | null>(null);
  /** Lo último que pasó el componente: los manejadores del documento lo leen al dispararse. */
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const stopAutoScroll = useCallback(() => {
    if (frame.current !== null) {
      window.cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  /** El candidato con el puntero en `(x, y)`, o el anterior si cae en un hueco. */
  const follow = useCallback((x: number, y: number) => {
    const current = session.current;
    const scroller = latest.current.scrollRef.current;
    if (current?.phase !== "live" || scroller === null) {
      return;
    }
    const { grid } = latest.current;
    const ownDay = current.gesture.kind === "create" ? current.gesture.dayIndex : null;
    const pointer = pointerMinute(scroller, grid, ownDay, x, y);
    const candidate =
      (pointer === null ? null : candidateAt(current.gesture, pointer, grid)) ??
      current.candidate;
    session.current = { ...current, candidate, x, y };
    setPreview(previewOf(current.gesture, candidate));
  }, []);

  /** Un cuadro por vez mientras el gesto vive: el puntero junto a un borde desplaza la grilla. */
  const startAutoScroll = useCallback(() => {
    function tick(): void {
      const current = session.current;
      const scroller = latest.current.scrollRef.current;
      if (current?.phase !== "live" || scroller === null) {
        frame.current = null;
        return;
      }
      const area = visibleArea(scroller);
      const dy =
        autoScrollStep(area.bottom - current.y) - autoScrollStep(current.y - area.top);
      const dx =
        autoScrollStep(area.right - current.x) - autoScrollStep(current.x - area.left);
      if (dx !== 0 || dy !== 0) {
        scroller.scrollBy(dx, dy);
        follow(current.x, current.y);
      }
      frame.current = window.requestAnimationFrame(tick);
    }
    frame.current = window.requestAnimationFrame(tick);
  }, [follow]);

  const detach = useRef<(() => void) | null>(null);

  const release = useCallback((pointerId: number) => {
    const scroller = latest.current.scrollRef.current;
    if (scroller?.hasPointerCapture(pointerId)) {
      scroller.releasePointerCapture(pointerId);
    }
  }, []);

  /** Termina la sesión y suelta los oyentes del documento. */
  const finish = useCallback(() => {
    session.current = null;
    stopAutoScroll();
    detach.current?.();
    detach.current = null;
  }, [stopAutoScroll]);

  /**
   * CAL-63: cancelar deja todo como estaba, sin pedido. Un gesto vivo queda
   * muerto hasta soltar: conserva la captura, ignora el movimiento y deja la
   * marca del clic; uno armado vuelve a ser un clic.
   */
  const cancel = useCallback(() => {
    const current = session.current;
    if (current === null || current.phase === "dead") {
      return;
    }
    if (current.phase === "armed") {
      finish();
      return;
    }
    stopAutoScroll();
    session.current = { phase: "dead", pointerId: current.pointerId };
    clickMark.current = true;
    setPreview(null);
    latest.current.onActiveChange(false, entryIdOf(current.gesture));
  }, [finish, stopAutoScroll]);

  const handleMove = useCallback(
    (event: globalThis.PointerEvent) => {
      const current = session.current;
      if (current === null || event.pointerId !== current.pointerId) {
        return;
      }
      if (current.phase === "dead") {
        return;
      }
      if (current.phase === "live") {
        follow(event.clientX, event.clientY);
        return;
      }
      if (!passedThreshold(event.clientX - current.x, event.clientY - current.y)) {
        return;
      }
      // La captura se toma al pasar el umbral: antes, el clic llega a su destino.
      latest.current.scrollRef.current?.setPointerCapture(current.pointerId);
      const candidate = initialCandidate(current.gesture, latest.current.grid);
      session.current = {
        phase: "live",
        gesture: current.gesture,
        pointerId: current.pointerId,
        candidate,
        x: event.clientX,
        y: event.clientY,
      };
      setPreview(previewOf(current.gesture, candidate));
      latest.current.onActiveChange(true, entryIdOf(current.gesture));
      follow(event.clientX, event.clientY);
      startAutoScroll();
    },
    [startAutoScroll, follow],
  );

  const handleUp = useCallback(
    (event: globalThis.PointerEvent) => {
      const current = session.current;
      if (current === null || event.pointerId !== current.pointerId) {
        return;
      }
      if (current.phase === "armed") {
        finish();
        return;
      }
      clickMark.current = true;
      finish();
      release(current.pointerId);
      if (current.phase === "dead") {
        return;
      }
      setPreview(null);
      const { gesture, candidate } = current;
      if (gesture.kind === "create") {
        latest.current.onSelectRange(candidate);
      } else if (!sameDraft(candidate, gesture.original)) {
        latest.current.onDrop({ id: gesture.entryId, ...candidate });
      }
      latest.current.onActiveChange(false, entryIdOf(gesture));
    },
    [finish, release],
  );

  const begin = useCallback(
    (gesture: Gesture, event: PointerEvent<HTMLElement>) => {
      if (!latest.current.enabled || !startsGesture(event) || session.current !== null) {
        return;
      }
      session.current = {
        phase: "armed",
        gesture,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      function onLost(lost: globalThis.PointerEvent): void {
        // Sin el `pointerup` que la suelta: el navegador la quitó.
        if (session.current !== null && lost.pointerId === session.current.pointerId) {
          cancel();
        }
      }
      function onKey(key: KeyboardEvent): void {
        if (key.key === "Escape" && session.current?.phase === "live") {
          key.preventDefault();
          key.stopPropagation();
          cancel();
        }
      }
      function onHidden(): void {
        if (document.visibilityState === "hidden") {
          cancel();
        }
      }
      const scroller = latest.current.scrollRef.current;
      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
      document.addEventListener("pointercancel", onLost);
      scroller?.addEventListener("lostpointercapture", onLost);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", cancel);
      document.addEventListener("visibilitychange", onHidden);
      detach.current = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.removeEventListener("pointercancel", onLost);
        scroller?.removeEventListener("lostpointercapture", onLost);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("blur", cancel);
        document.removeEventListener("visibilitychange", onHidden);
      };
    },
    [cancel, handleMove, handleUp],
  );

  const beginEntry = useCallback(
    (kind: EntryGestureKind, entry: TimeEntryView, event: PointerEvent<HTMLElement>) => {
      const scroller = latest.current.scrollRef.current;
      const { grid } = latest.current;
      const pointer =
        scroller === null
          ? null
          : pointerMinute(scroller, grid, null, event.clientX, event.clientY);
      if (pointer === null) {
        return;
      }
      const days = grid.days.map((day) => day.date);
      begin(entryGesture(kind, entry, days, pointer), event);
    },
    [begin],
  );

  const beginCreate = useCallback(
    (dayIndex: number, anchor: number, event: PointerEvent<HTMLElement>) => {
      begin({ kind: "create", dayIndex, anchor }, event);
    },
    [begin],
  );

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!clickMark.current) {
      return;
    }
    clickMark.current = false;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  // La marca se borra en el siguiente `pointerdown`, llegue o no el clic.
  useEffect(() => {
    function clearMark(): void {
      clickMark.current = false;
    }
    document.addEventListener("pointerdown", clearMark, true);
    return () => document.removeEventListener("pointerdown", clearMark, true);
  }, []);

  // Otro zoom, la entrada que se va o los gestos apagados cancelan (CAL-63).
  const { zoom } = options.grid;
  const previousZoom = useRef(zoom);
  const gestureEntry = preview?.kind === "entry" ? preview.entryId : null;
  const entryGone = gestureEntry !== null && !options.entryIds.includes(gestureEntry);
  useEffect(() => {
    if (previousZoom.current !== zoom || entryGone || !options.enabled) {
      cancel();
    }
    previousZoom.current = zoom;
  }, [zoom, entryGone, options.enabled, cancel]);

  // Desmontar la grilla, por otro período, termina el gesto sin más.
  useEffect(
    () => () => {
      const current = session.current;
      if (current?.phase === "live") {
        latest.current.onActiveChange(false, null);
      }
      if (current !== null) {
        release(current.pointerId);
      }
      finish();
    },
    [finish, release],
  );

  return { preview, beginEntry, beginCreate, onClickCapture };
}

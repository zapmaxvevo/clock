import type { TimeEntryView } from "@/modules/time-entry/schema";
import {
  addDaysToKey,
  clockToMinutes,
  MINUTES_PER_DAY,
  minutesToClock,
  type MinuteRange,
} from "@/server/time";

import type { TimeDraft } from "../time-draft";
import type { CalendarZoom } from "./calendar-zoom";

/**
 * La geometría de la grilla del calendario, en funciones puras y sin zona
 * (ADR 0012): la vista ya trae el día y las horas de reloj, y partir una
 * entrada en días es aritmética civil.
 */

/** Alto de una franja, sea del tamaño que sea (CAL-11). */
export const SLOT_HEIGHT_PX = 48;
/** CAL-24: una entrada corta se ve y se puede tocar. */
export const MIN_BLOCK_HEIGHT_PX = 22;
/** CAL-14: lo que queda arriba en un período sin hoy. Constante hasta verificar PF-15. */
export const DEFAULT_SCROLL_CLOCK = "08:00";

/** Píxeles de un minuto de reloj con ese zoom. */
export function minuteHeight(zoom: CalendarZoom): number {
  return SLOT_HEIGHT_PX / zoom;
}

/** Lo que una entrada dibuja en un día del período (CAL-26 a CAL-28). */
export type Segment = {
  readonly date: string;
  /** Minutos de reloj, `[from, to]`, entre 0 y 1440. */
  readonly from: number;
  readonly to: number;
  /** Es el día de inicio: lleva el horario con su superíndice (CAL-26). */
  readonly startsHere: boolean;
  /** Es el primero visible: es el botón (CAL-76). */
  readonly firstVisible: boolean;
};

function segmentsBetween(
  start: NowPosition,
  end: NowPosition,
  days: readonly string[],
): readonly Segment[] {
  const segments: Segment[] = [];
  for (const date of days) {
    if (date < start.date || date > end.date) {
      continue;
    }
    const startsHere = date === start.date;
    // Una entrada que termina a las 00:00 no dibuja nada en ese día; en el de
    // inicio sí, aunque dure cero.
    if (!startsHere && date === end.date && end.minute === 0) {
      continue;
    }
    const from = startsHere ? start.minute : 0;
    const to = date === end.date ? end.minute : MINUTES_PER_DAY;
    segments.push({
      date,
      from,
      // En la hora repetida el fin de reloj puede quedar antes del inicio (CAL-92).
      to: Math.max(to, from),
      startsHere,
      firstVisible: segments.length === 0,
    });
  }
  return segments;
}

/**
 * Un segmento por día del período que la entrada toca. Sin segmentos, la
 * entrada está fuera del período: es la definición que usan el 8c y el 8b.
 */
export function entrySegments(
  entry: Pick<TimeEntryView, "dayDate" | "startClock" | "endClock" | "extraDays">,
  days: readonly string[],
): readonly Segment[] {
  return segmentsBetween(
    { date: entry.dayDate, minute: clockToMinutes(entry.startClock) ?? 0 },
    {
      date: addDaysToKey(entry.dayDate, entry.extraDays),
      minute: clockToMinutes(entry.endClock ?? "") ?? MINUTES_PER_DAY,
    },
    days,
  );
}

/** Los segmentos del timer, con el fin en la línea de ahora (CAL-38, CAL-93). */
export function runningSegments(
  running: Pick<TimeEntryView, "dayDate" | "startClock">,
  now: NowPosition,
  days: readonly string[],
): readonly Segment[] {
  const start = {
    date: running.dayDate,
    minute: clockToMinutes(running.startClock) ?? 0,
  };
  // Un ahora anterior al inicio, por el redondeo al minuto, deja el bloque en cero.
  const end = now.date < start.date ? start : now;
  return segmentsBetween(start, end, days);
}

/** Un punto de la grilla, el día y el minuto de reloj: la línea de ahora y los extremos de un segmento. */
export type NowPosition = { readonly date: string; readonly minute: number };

/** El minuto del servidor más lo transcurrido, pasando de día a la medianoche. */
export function nowPosition(
  anchor: {
    readonly todayKey: string;
    readonly nowMinute: number;
    readonly serverNow: string;
  },
  elapsedSeconds: number,
): NowPosition {
  // Los segundos que `serverNow` ya llevaba de su minuto: todas las zonas en
  // uso se apartan de UTC en minutos enteros.
  const secondsIntoMinute = new Date(anchor.serverNow).getUTCSeconds();
  const minutes =
    anchor.nowMinute + Math.floor((secondsIntoMinute + elapsedSeconds) / 60);
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  return {
    date: addDaysToKey(anchor.todayKey, days),
    minute: minutes - days * MINUTES_PER_DAY,
  };
}

/** Un minuto que no existe ese día por el cambio de horario (CAL-30). */
export function isMissing(minute: number, ranges: readonly MinuteRange[]): boolean {
  return ranges.some((range) => minute >= range.from && minute < range.to);
}

/** El minuto de una posición vertical, ajustado hacia abajo a la franja. */
export function minuteAt(offsetPx: number, zoom: CalendarZoom): number {
  const slot = Math.floor(offsetPx / SLOT_HEIGHT_PX);
  return Math.min(Math.max(slot, 0), MINUTES_PER_DAY / zoom - 1) * zoom;
}

/**
 * CAL-43: la franja tocada y una franja de largo. Si el fin cae dentro de un
 * hueco de `missingMinutes`, pasa al final del hueco: el primer minuto que
 * existe después (Madrid, 01:00 a zoom 60 en el día del adelanto: 01:00–03:00).
 * Un fin que pasa de las 24:00 es la hora del día siguiente, como en el trío
 * (TT-72).
 */
export function slotDraft(
  date: string,
  minute: number,
  zoom: CalendarZoom,
  missingMinutes: readonly MinuteRange[],
): TimeDraft {
  const end = minute + zoom;
  const gap = missingMinutes.find((range) => end >= range.from && end < range.to);
  return {
    date,
    start: minutesToClock(minute),
    end: minutesToClock(gap === undefined ? end : gap.to),
  };
}

/**
 * CAL-74: hoy si está a la vista, si no el primer día, nunca antes del piso.
 * La hora es la franja de ahora si el día es hoy, y si no `DEFAULT_SCROLL_CLOCK`.
 */
export function addEntryDraft(
  days: readonly string[],
  now: NowPosition,
  minDayKey: string,
  zoom: CalendarZoom,
): TimeDraft {
  const shown = days.includes(now.date) ? now.date : days[0];
  const date = shown < minDayKey ? minDayKey : shown;
  const start =
    date === now.date
      ? Math.floor(now.minute / zoom) * zoom
      : (clockToMinutes(DEFAULT_SCROLL_CLOCK) ?? 0);
  return { date, start: minutesToClock(start), end: minutesToClock(start + zoom) };
}

/** CAL-14: el minuto que queda arriba al montar. */
export function initialScrollMinute(now: NowPosition, days: readonly string[]): number {
  if (days.includes(now.date)) {
    return Math.max(0, now.minute - 60);
  }
  return clockToMinutes(DEFAULT_SCROLL_CLOCK) ?? 0;
}

/**
 * Las cerradas y el timer en orden cronológico, el de `Tab` (CAL-76): por
 * inicio y, a igual inicio, por id, como las lee el repository. El timer entra
 * en el lugar de su inicio y no al final.
 */
export function chronological(
  entries: readonly TimeEntryView[],
  running: TimeEntryView | null,
): readonly TimeEntryView[] {
  const all = running === null ? entries : [...entries, running];
  return [...all].sort(
    (a, b) =>
      Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export type PlacedBlock<Item> = {
  readonly item: Item;
  readonly top: number;
  readonly height: number;
  readonly lane: number;
  readonly lanes: number;
};

type Drawn<Item> = {
  readonly item: Item;
  /** El orden de llegada. */
  readonly order: number;
  readonly top: number;
  readonly height: number;
};

function bottomOf<Item>(blocks: readonly Drawn<Item>[]): number {
  return Math.max(...blocks.map((block) => block.top + block.height));
}

/** Cada bloque del grupo toma el primer carril que ya quedó libre. */
function placeGroup<Item>(
  group: readonly Drawn<Item>[],
): readonly (PlacedBlock<Item> & { readonly order: number })[] {
  const laneBottoms: number[] = [];
  const lanes = group.map((block) => {
    const free = laneBottoms.findIndex((bottom) => bottom <= block.top);
    const lane = free === -1 ? laneBottoms.length : free;
    laneBottoms[lane] = block.top + block.height;
    return lane;
  });
  return group.map((block, index) => ({
    ...block,
    lane: lanes[index],
    lanes: laneBottoms.length,
  }));
}

/**
 * CAL-25: los bloques de una columna, con carriles para los que se pisan. Un
 * grupo es un conjunto conectado por superposición de lo dibujado, con la
 * altura mínima incluida, así ningún bloque tapa a otro; dentro del grupo cada
 * bloque toma el primer carril libre y todos miden `1 / lanes` del ancho.
 *
 * Los ítems llegan en orden cronológico —el de `entries`, por inicio y
 * después por id— y salen en ese mismo orden, que es el del DOM y el de `Tab`
 * (CAL-76): en la hora repetida de un atraso el reloj no lo refleja. Los
 * carriles se asignan por `from` y, a igual `from`, por ese orden.
 */
export function layoutColumn<
  Item extends { readonly key: string; readonly from: number; readonly to: number },
>(items: readonly Item[], zoom: CalendarZoom): readonly PlacedBlock<Item>[] {
  const scale = minuteHeight(zoom);
  const drawn = items
    .map((item, order) => ({
      item,
      order,
      top: item.from * scale,
      height: Math.max((item.to - item.from) * scale, MIN_BLOCK_HEIGHT_PX),
    }))
    .sort((a, b) => a.top - b.top || a.order - b.order);

  const groups: Drawn<Item>[][] = [];
  for (const block of drawn) {
    const current = groups.at(-1);
    if (current !== undefined && block.top < bottomOf(current)) {
      current.push(block);
    } else {
      groups.push([block]);
    }
  }
  return groups
    .flatMap(placeGroup)
    .sort((a, b) => a.order - b.order)
    .map(({ item, top, height, lane, lanes }) => ({ item, top, height, lane, lanes }));
}

import {
  clockDifferenceMinutes,
  crossesMidnight,
  dayKey,
  formatClock,
  parseClockInput,
  parseDurationInput,
  shiftClock,
  type TimeFormat,
} from "@/server/time";

/**
 * El borrador de un trío `{ date, start, end }` y sus transiciones: el de la
 * barra manual y el del editor de horario de una fila. Es la lógica del
 * cliente sobre horas, y vive acá y no en los componentes para que tenga
 * test: ellos solo guardan el resultado de estas funciones.
 *
 * Las tres cadenas son canónicas: el día como "2026-10-02" y las dos horas
 * como "HH:mm" de 24 h, también con el formato de 12 h. El formato de la
 * persona entra solo al interpretar lo que teclea, con los intérpretes de
 * `src/server/time` (TT-19, TT-20), y al mostrar, con `clockLabel`.
 */
export type TimeDraft = {
  readonly date: string;
  readonly start: string;
  readonly end: string;
};

/** Los campos de hora que tienen la barra manual y la fila. */
export type TimeField = "start" | "end";

/** Los de la barra manual, que suma la duración; la fila no la edita. */
export type ManualField = TimeField | "duration";

export type TimeDraftChange<Field extends ManualField = TimeField> = {
  readonly draft: TimeDraft;
  /** `null` si el valor se aceptó. Con un campo, el borrador quedó igual (TT-21). */
  readonly rejected: Field | null;
};

/**
 * Borrador inicial: hoy y la hora actual de la persona, sin duración. Lo usa
 * la barra al montarse y después de un agregado exitoso (TT-25).
 */
export function reset(serverNow: string, timeZone: string): TimeDraft {
  const instant = new Date(serverNow);
  const clock = formatClock(instant, timeZone);
  return { date: dayKey(instant, timeZone), start: clock, end: clock };
}

/** El trío de una entrada cerrada, con las horas canónicas de la vista y no sus rótulos. */
export function fromView(entry: {
  readonly dayDate: string;
  readonly startClock: string;
  readonly endClock: string;
}): TimeDraft {
  return { date: entry.dayDate, start: entry.startClock, end: entry.endClock };
}

/** Mismo día y mismas dos horas: confirmar ese trío no es un cambio. */
export function sameDraft(left: TimeDraft, right: TimeDraft): boolean {
  return left.date === right.date && left.start === right.start && left.end === right.end;
}

/**
 * Adapta una transición al contrato de `ClockField`: si se aceptó, entrega el
 * borrador nuevo y devuelve el texto que el campo muestra; si se rechazó,
 * devuelve `null` y el campo vuelve al valor anterior (TT-21).
 */
export function commitChange<Field extends ManualField>(
  change: TimeDraftChange<Field>,
  apply: (draft: TimeDraft) => void,
  shown: (draft: TimeDraft) => string,
): string | null {
  if (change.rejected !== null) {
    return null;
  }
  apply(change.draft);
  return shown(change.draft);
}

/** Duración derivada, en minutos. Dos horas iguales dan 0, que TT-73 rechaza. */
export function draftDuration(draft: TimeDraft): number {
  return clockDifferenceMinutes(draft.start, draft.end);
}

/** Días que abarca el fin respecto del inicio: 1 cuando cruza la medianoche (TT-72). */
export function draftExtraDays(draft: TimeDraft): number {
  return crossesMidnight(draft.start, draft.end) ? 1 : 0;
}

/** TT-18: mover el inicio conserva el fin y la duración se recalcula sola. */
export function withStart(
  draft: TimeDraft,
  text: string,
  format: TimeFormat,
): TimeDraftChange {
  const start = parseClockInput(text, format);
  if (start === null) {
    return { draft, rejected: "start" };
  }
  return { draft: { ...draft, start }, rejected: null };
}

/** TT-18: mover el fin conserva el inicio. */
export function withEnd(
  draft: TimeDraft,
  text: string,
  format: TimeFormat,
): TimeDraftChange {
  const end = parseClockInput(text, format);
  if (end === null) {
    return { draft, rejected: "end" };
  }
  return { draft: { ...draft, end }, rejected: null };
}

/** TT-18: la duración es un dispositivo de entrada para el fin, y lo mueve. */
export function withDuration(
  draft: TimeDraft,
  text: string,
): TimeDraftChange<"duration"> {
  const minutes = parseDurationInput(text);
  if (minutes === null) {
    return { draft, rejected: "duration" };
  }
  return { draft: { ...draft, end: shiftClock(draft.start, minutes) }, rejected: null };
}

/** El día llega canónico del calendario, así que no hay nada que interpretar. */
export function withDate(draft: TimeDraft, date: string): TimeDraft {
  return { ...draft, date };
}

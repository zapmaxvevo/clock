import {
  clockDifferenceMinutes,
  crossesMidnight,
  dayKey,
  formatClock,
  parseClockInput,
  parseDurationInput,
  shiftClock,
} from "@/server/time";

/**
 * El borrador de la barra manual y sus transiciones. Es la única lógica del
 * slice que vive en el cliente, y vive acá y no en el componente para que
 * tenga test: la barra solo guarda el resultado de estas funciones.
 *
 * Las tres cadenas son canónicas: el día como "2026-10-02" y las dos horas
 * como "HH:mm" de 24 h. Los formatos tolerantes que la persona teclea los
 * interpretan los intérpretes de `src/server/time` (TT-19, TT-20).
 */
export type ManualDraft = {
  readonly date: string;
  readonly start: string;
  readonly end: string;
};

/** Cuál de los tres campos de texto rechazó lo que se escribió (TT-21). */
export type ManualField = "start" | "end" | "duration";

export type ManualDraftChange = {
  readonly draft: ManualDraft;
  /** `null` si el valor se aceptó. Con un campo, el borrador quedó igual. */
  readonly rejected: ManualField | null;
};

/**
 * Borrador inicial: hoy y la hora actual del workspace, sin duración. Lo usa
 * la barra al montarse y después de un agregado exitoso (TT-25).
 */
export function reset(serverNow: string, timeZone: string): ManualDraft {
  const instant = new Date(serverNow);
  const clock = formatClock(instant, timeZone);
  return { date: dayKey(instant, timeZone), start: clock, end: clock };
}

/** Duración derivada, en minutos. Dos horas iguales dan 0, que TT-73 rechaza. */
export function draftDuration(draft: ManualDraft): number {
  return clockDifferenceMinutes(draft.start, draft.end);
}

/** Días que abarca el fin respecto del inicio: 1 cuando cruza la medianoche (TT-72). */
export function draftExtraDays(draft: ManualDraft): number {
  return crossesMidnight(draft.start, draft.end) ? 1 : 0;
}

/** TT-18: mover el inicio conserva el fin y la duración se recalcula sola. */
export function withStart(draft: ManualDraft, text: string): ManualDraftChange {
  const start = parseClockInput(text);
  if (start === null) {
    return { draft, rejected: "start" };
  }
  return { draft: { ...draft, start }, rejected: null };
}

/** TT-18: mover el fin conserva el inicio. */
export function withEnd(draft: ManualDraft, text: string): ManualDraftChange {
  const end = parseClockInput(text);
  if (end === null) {
    return { draft, rejected: "end" };
  }
  return { draft: { ...draft, end }, rejected: null };
}

/** TT-18: la duración es un dispositivo de entrada para el fin, y lo mueve. */
export function withDuration(draft: ManualDraft, text: string): ManualDraftChange {
  const minutes = parseDurationInput(text);
  if (minutes === null) {
    return { draft, rejected: "duration" };
  }
  return { draft: { ...draft, end: shiftClock(draft.start, minutes) }, rejected: null };
}

/** El día llega canónico del calendario, así que no hay nada que interpretar. */
export function withDate(draft: ManualDraft, date: string): ManualDraft {
  return { ...draft, date };
}

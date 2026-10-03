import { z } from "zod";

import { isClock, parseDayKey } from "@/server/time";

/** Días que trae la lista del rastreador antes de extenderse hacia atrás. */
export const TRACKER_WINDOW_DAYS = 14;

/** Largo máximo de la descripción. Lo valida Zod y lo repite un `check` de la base. */
export const DESCRIPTION_MAX = 3000;

/** Textos que la interfaz muestra tal cual. Un código puede tener más de uno. */
export const timeEntryMessages = {
  descriptionTooLong: "La descripción no puede superar los 3000 caracteres.",
  descriptionNullCharacter: "La descripción tiene un carácter que no se puede guardar.",
  notFound: "Esa entrada ya no existe.",
  forbidden: "No tenés permiso para hacer esto.",
  forbiddenOtherOwner: "No tenés permiso para editar esta entrada.",
  alreadyStopped: "Este timer ya había sido detenido.",
  endBeforeStart: "La hora de fin tiene que ser posterior a la de inicio.",
  timerRunning: "Detené el timer para agregar tiempo a mano.",
  tooShort: "La entrada tiene que durar al menos un minuto.",
  nonexistentClock: "Esa hora no existe por el cambio de horario.",
  beforeWorkspace: "No se pueden cargar horas anteriores a la creación del workspace.",
  invalidDate: "Fecha inválida.",
  invalidClock: "Hora inválida.",
  futureTime: "No se pueden cargar horas que todavía no pasaron.",
  runningEntryTimes: "Esta entrada es la que está corriendo.",
  multiDayTimes: "Esta entrada dura más de un día; sus horarios no se pueden editar acá.",
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
} as const;

// Postgres no guarda el carácter nulo en un `text`: sin este control, la
// descripción que lo trae llega a la base y vuelve como `unexpected`.
const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, timeEntryMessages.descriptionTooLong)
  .refine(
    (value) => !value.includes("\u0000"),
    timeEntryMessages.descriptionNullCharacter,
  );

/** Id de una entrada nueva, elegido por el cliente: ver el ADR 0007. */
const newEntryId = z.uuidv4();

/** El cliente no manda instantes: el inicio lo pone la base. */
export const startTimerInput = z.object({
  id: newEntryId,
  description: description.default(""),
});

export const stopTimerInput = z.object({ id: z.uuid() });

export const updateDescriptionInput = z.object({
  id: z.uuid(),
  description,
});

export const deleteEntryInput = z.object({ id: z.uuid() });

/** Día del calendario. La forma sola no alcanza: "2026-02-30" la cumple y no existe. */
const dayKeyInput = z
  .string()
  .refine((value) => parseDayKey(value) !== null, timeEntryMessages.invalidDate);

/** Hora de pared canónica. Los formatos tolerantes los normaliza el cliente. */
const clockInput = z.string().refine(isClock, timeEntryMessages.invalidClock);

/**
 * La hora de pared viaja como hora de pared y el servidor la convierte con la
 * zona del workspace. La duración no viaja: se deriva de las dos horas, así no
 * puede llegar una que no se corresponda. Ver el ADR 0005.
 */
export const createManualEntryInput = z.object({
  description: description.default(""),
  /** Día local del inicio, en la zona horaria del workspace. */
  date: dayKeyInput,
  /** Hora de pared del inicio, 24 h. */
  start: clockInput,
  /** Hora de pared del fin. Menor que el inicio significa el día siguiente (TT-72). */
  end: clockInput,
});

/**
 * El trío completo y no el campo que cambió: los tres se interpretan juntos.
 * Ver el ADR 0006 para el extremo que no cambió.
 */
export const updateEntryTimesInput = z.object({
  id: z.uuid(),
  /** Día local del inicio. Mismo formato y misma refinación que el alta manual. */
  date: dayKeyInput,
  start: clockInput,
  /** Menor que el inicio significa el día siguiente (TT-72). */
  end: clockInput,
});

export const updateRunningStartInput = z.object({
  id: z.uuid(),
  /** Día local del inicio: un timer puede llevar días corriendo (TT-42). */
  date: dayKeyInput,
  start: clockInput,
});

export type StartTimerInput = z.input<typeof startTimerInput>;
/** Lo que recibe el service: `description` ya validada y con su default. */
export type StartTimerValues = z.output<typeof startTimerInput>;
export type StopTimerInput = z.infer<typeof stopTimerInput>;
export type UpdateDescriptionInput = z.infer<typeof updateDescriptionInput>;
export type DeleteEntryInput = z.infer<typeof deleteEntryInput>;
export type CreateManualEntryInput = z.input<typeof createManualEntryInput>;
/** Lo que recibe el service: `description` ya validada y con su default. */
export type CreateManualEntryValues = z.output<typeof createManualEntryInput>;
export type UpdateEntryTimesInput = z.infer<typeof updateEntryTimesInput>;
export type UpdateRunningStartInput = z.infer<typeof updateRunningStartInput>;

/**
 * Todo lo que depende de zona horaria o de formato se resuelve en el servidor.
 * El cliente solo cuenta el transcurrido del timer activo.
 */
export const timeEntryView = z.object({
  id: z.uuid(),
  /** "" es «sin descripción»: la columna es not null default ''. */
  description: z.string(),
  startedAt: z.iso.datetime(),
  /** null mientras el timer corre. */
  endedAt: z.iso.datetime().nullable(),
  /** Día local del inicio, "2026-10-02". */
  dayDate: z.string(),
  startLabel: z.string(),
  endLabel: z.string().nullable(),
  /** Superíndice de días del cruce de medianoche. 0 en una entrada que corre. */
  extraDays: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).nullable(),
  durationLabel: z.string().nullable(),
  /**
   * El trío de la vista, interpretado con la regla de `updateEntryTimes`, vuelve
   * a dar el mismo fin. En falso la fila muestra sus horarios en solo lectura
   * (TT-110). Siempre falso en una entrada que corre (TT-111).
   */
  editableTimes: z.boolean(),
});

export const dayGroupView = z.object({
  date: z.string(),
  label: z.string(),
  /** El cliente suma acá el transcurrido del timer activo. */
  isRunningDay: z.boolean(),
  /** Exacto. El total con formato lo arma el cliente, que suma el transcurrido. */
  closedSeconds: z.number().int().min(0),
  /** Solo entradas cerradas, de la más reciente a la más vieja. */
  entries: z.array(timeEntryView),
});

export const trackerState = z.object({
  /** Referencia contra la que el cliente corrige el desfase de su reloj. */
  serverNow: z.iso.datetime(),
  timeZone: z.string(),
  /** Día de hoy en la zona del workspace. */
  todayKey: z.string(),
  /** Día local de creación del workspace: el primero que admite carga. */
  minDayKey: z.string(),
  canTrack: z.boolean(),
  running: timeEntryView.nullable(),
  days: z.array(dayGroupView),
  hasAnyEntry: z.boolean(),
});

export type TimeEntryView = z.infer<typeof timeEntryView>;
export type DayGroupView = z.infer<typeof dayGroupView>;
export type TrackerState = z.infer<typeof trackerState>;

export type TimeEntryErrorCode =
  | "validation"
  | "not_found"
  | "forbidden"
  | "already_stopped"
  | "timer_running"
  | "unexpected";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: TimeEntryErrorCode; readonly message: string };

export type StartTimerResult = {
  /**
   * El timer que quedó corriendo. En un reintento resuelto por el ADR 0007, la
   * fila que creó el primer intento, en el estado en que esté: puede estar
   * cerrada.
   */
  readonly running: TimeEntryView;
  /** La entrada que estaba corriendo y se cerró en el mismo instante. */
  readonly stopped: TimeEntryView | null;
};

export type StopTimerResult = { readonly stopped: TimeEntryView };

export type UpdateDescriptionResult = { readonly entry: TimeEntryView };

export type DeleteEntryResult = { readonly id: string };

export type CreateManualEntryResult = {
  readonly created: TimeEntryView;
  /** La entrada quedó fuera del tramo que la lista dibuja. */
  readonly outsideWindow: boolean;
};

export type UpdateEntryTimesResult = {
  readonly entry: TimeEntryView;
  /** La entrada quedó por debajo del tramo que la lista dibuja (TT-108). */
  readonly outsideWindow: boolean;
};

export type UpdateRunningStartResult = { readonly running: TimeEntryView };

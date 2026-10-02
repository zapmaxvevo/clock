import { z } from "zod";

/** Días que trae la lista del rastreador antes de extenderse hacia atrás. */
export const TRACKER_WINDOW_DAYS = 14;

/** Largo máximo de la descripción. Lo valida Zod y lo repite un `check` de la base. */
export const DESCRIPTION_MAX = 3000;

/** Textos que la interfaz muestra tal cual. Un código puede tener más de uno. */
export const timeEntryMessages = {
  descriptionTooLong: "La descripción no puede superar los 3000 caracteres.",
  notFound: "Esa entrada ya no existe.",
  forbidden: "No tenés permiso para hacer esto.",
  forbiddenOtherOwner: "No tenés permiso para editar esta entrada.",
  alreadyStopped: "Este timer ya había sido detenido.",
  endBeforeStart: "La hora de fin tiene que ser posterior a la de inicio.",
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
} as const;

const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, timeEntryMessages.descriptionTooLong);

/** El cliente no manda instantes: el inicio lo pone la base. */
export const startTimerInput = z.object({
  description: description.default(""),
});

export const stopTimerInput = z.object({ id: z.uuid() });

export const updateDescriptionInput = z.object({
  id: z.uuid(),
  description,
});

export const deleteEntryInput = z.object({ id: z.uuid() });

export type StartTimerInput = z.input<typeof startTimerInput>;
/** Lo que recibe el service: `description` ya validada y con su default. */
export type StartTimerValues = z.output<typeof startTimerInput>;
export type StopTimerInput = z.infer<typeof stopTimerInput>;
export type UpdateDescriptionInput = z.infer<typeof updateDescriptionInput>;
export type DeleteEntryInput = z.infer<typeof deleteEntryInput>;

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
});

export const dayGroupView = z.object({
  date: z.string(),
  label: z.string(),
  /** El cliente suma acá el transcurrido del timer activo. */
  isRunningDay: z.boolean(),
  closedSeconds: z.number().int().min(0),
  closedTotalLabel: z.string(),
  /** Solo entradas cerradas, de la más reciente a la más vieja. */
  entries: z.array(timeEntryView),
});

export const trackerState = z.object({
  /** Referencia contra la que el cliente corrige el desfase de su reloj. */
  serverNow: z.iso.datetime(),
  timeZone: z.string(),
  canTrack: z.boolean(),
  running: timeEntryView.nullable(),
  days: z.array(dayGroupView),
  hasAnyEntry: z.boolean(),
});

export type TimeEntryView = z.infer<typeof timeEntryView>;
export type DayGroupView = z.infer<typeof dayGroupView>;
export type TrackerState = z.infer<typeof trackerState>;

export type TimeEntryErrorCode =
  "validation" | "not_found" | "forbidden" | "already_stopped" | "unexpected";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: TimeEntryErrorCode; readonly message: string };

export type StartTimerResult = {
  readonly running: TimeEntryView;
  /** La entrada que estaba corriendo y se cerró en el mismo instante. */
  readonly stopped: TimeEntryView | null;
};

export type StopTimerResult = { readonly stopped: TimeEntryView };

export type UpdateDescriptionResult = { readonly entry: TimeEntryView };

export type DeleteEntryResult = { readonly id: string };

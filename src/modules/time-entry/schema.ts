import { z } from "zod";

import { sameId, type ProjectPair } from "@/lib/project-pair";
import { normalizedIds } from "@/lib/tag-ids";
import { noNullCharacter } from "@/lib/text";
import type { ActionErrorCode } from "@/server/errors";
import { isClock, MINUTES_PER_DAY, parseDayKey } from "@/server/time";
import { PALETTE_KEYS } from "@/modules/project/palette";

/**
 * Días que trae la lista del rastreador antes de extenderse hacia atrás y
 * redondearse a semanas.
 */
export const TRACKER_WINDOW_DAYS = 14;

/** Largo máximo de la descripción. Lo valida Zod y lo repite un `check` de la base. */
export const DESCRIPTION_MAX = 3000;

/** Tope de entradas de una operación en masa (TT-63, TT-64). */
export const BULK_MAX = 200;

/** D-4: tope de etiquetas de una entrada. */
export const TAGS_MAX = 50;

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
  beforeFloor: "No se pueden cargar horas anteriores al 1 de enero de 2000.",
  invalidDate: "Fecha inválida.",
  invalidClock: "Hora inválida.",
  futureTime: "No se pueden cargar horas que todavía no pasaron.",
  runningEntryTimes: "Esta entrada es la que está corriendo.",
  multiDayTimes: "Esta entrada dura más de un día; sus horarios no se pueden editar acá.",
  sameEntryId: "La entrada nueva no puede usar el id de la original.",
  taskNeedsProject: "Elegí un proyecto antes que una tarea.",
  tooManyTags: `Se pueden elegir hasta ${TAGS_MAX} etiquetas por entrada.`,
  bulkEmpty: "Elegí al menos una entrada.",
  bulkTooMany: `Se pueden elegir hasta ${BULK_MAX} entradas a la vez.`,
  bulkNoChanges: "Elegí al menos un cambio.",
  bulkEditRejected:
    "Ninguna entrada cambió: algunas de las elegidas no se pueden editar.",
  bulkDeleteRejected:
    "No se borró ninguna entrada: algunas de las elegidas no se pueden borrar.",
  /** TS-79: una causa, dos casos, un remedio (TS-34, TS-119): las entradas, en el detalle (TS-42). */
  cellNeedsEntryEdit: "Editá las entradas de esta celda desde el detalle.",
  /** TS-52: la fila supera el tope de `ids`; la persona no eligió nada. */
  rowTooManyEntries: `Esta fila tiene más de ${BULK_MAX} entradas en la semana; borralas por partes desde el rastreador.`,
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
} as const;

const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, timeEntryMessages.descriptionTooLong)
  .refine(noNullCharacter, timeEntryMessages.descriptionNullCharacter);

/** Id de una entrada nueva, elegido por el cliente: ver el ADR 0007. */
const newEntryId = z.uuidv4();

/** TT-11 y TT-70: la tarea no viaja sola. */
function hasProjectForTask(pair: ProjectPair): boolean {
  return pair.taskId === null || pair.projectId !== null;
}

const taskNeedsProject = {
  message: timeEntryMessages.taskNeedsProject,
  path: ["taskId"],
};

/** En las altas el par es opcional: una barra sin proyecto manda lo mismo que antes. */
const newEntryPair = {
  projectId: z.uuid().nullable().default(null),
  taskId: z.uuid().nullable().default(null),
};

/** TT-14: ausente, el servidor aplica el por defecto del proyecto (`billableFor`). */
const newEntryBillable = { billable: z.boolean().optional() };

/**
 * Las etiquetas de una entrada, enteras: el pedido fija el conjunto, no «las
 * que cambiaron» (D-5).
 */
const tagIds = z
  .array(z.uuid())
  .max(TAGS_MAX, timeEntryMessages.tooManyTags)
  .transform(normalizedIds);

/** En las altas, al lado del par. Ausente es ninguna. */
const newEntryTags = { tagIds: tagIds.default([]) };

/** El cliente no manda instantes: el inicio lo pone la base. */
export const startTimerInput = z
  .object({
    id: newEntryId,
    description: description.default(""),
    ...newEntryPair,
    ...newEntryBillable,
    ...newEntryTags,
  })
  .refine(hasProjectForTask, taskNeedsProject);

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

/**
 * Los parámetros de búsqueda de `/` (ADR 0008). Se usa solo con `safeParse`:
 * un `desde` que falta, que no es un día válido o que llega repetido
 * (`?desde=a&desde=b`, un arreglo) no pasa, y la pantalla lo ignora.
 */
export const trackerSearchParams = z.object({ desde: dayKeyInput });

/** Los parámetros de `/calendario` (CAL-17), cada uno con su `safeParse`. */
export const calendarWeekParams = z.object({ semana: dayKeyInput });
export const calendarModeParams = z.object({ vista: z.literal("dia") });

const CALENDAR_MODES = ["week", "day"] as const;
/** La vista de la grilla. No se llama `CalendarView`, que es el componente. */
export type CalendarMode = (typeof CALENDAR_MODES)[number];

/** Hora de pared canónica. Los formatos tolerantes los normaliza el cliente. */
const clockInput = z.string().refine(isClock, timeEntryMessages.invalidClock);

/**
 * La hora de pared viaja como hora de pared y el servidor la convierte con la
 * zona de la persona. La duración no viaja: se deriva de las dos horas, así no
 * puede llegar una que no se corresponda. Ver el ADR 0005.
 */
export const createManualEntryInput = z
  .object({
    /** Id de la entrada que se crea, elegido por el cliente (ADR 0007). */
    id: newEntryId,
    description: description.default(""),
    /** Día local del inicio, en la zona horaria de la persona. */
    date: dayKeyInput,
    /** Hora de pared del inicio, 24 h. */
    start: clockInput,
    /** Hora de pared del fin. Menor que el inicio significa el día siguiente (TT-72). */
    end: clockInput,
    ...newEntryPair,
    ...newEntryBillable,
    ...newEntryTags,
  })
  .refine(hasProjectForTask, taskNeedsProject);

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

/** El id nuevo no puede ser el de la original, ni con otras mayúsculas. */
function isNewId(input: { readonly id: string; readonly sourceId: string }): boolean {
  return !sameId(input.id, input.sourceId);
}

/** Un alta que parte de una entrada existente: continuar y duplicar. */
const fromSourceInput = z
  .object({
    /** Id de la entrada que se crea, elegido por el cliente (ADR 0007). */
    id: newEntryId,
    /** La entrada de la que parte. */
    sourceId: z.uuid(),
  })
  .refine(isNewId, timeEntryMessages.sameEntryId);

export const continueEntryInput = fromSourceInput;

export const duplicateEntryInput = fromSourceInput;

export const discardTimerInput = z.object({ id: z.uuid() });

/** El par entero y obligatorio: la action fija los dos valores, no «el que cambió». */
export const updateEntryProjectInput = z
  .object({
    id: z.uuid(),
    projectId: z.uuid().nullable(),
    taskId: z.uuid().nullable(),
  })
  .refine(hasProjectForTask, taskNeedsProject);

/** Los ids de una operación en masa, normalizados como los de las etiquetas. */
const entryIds = z
  .array(z.uuid())
  .min(1, timeEntryMessages.bulkEmpty)
  .max(BULK_MAX, timeEntryMessages.bulkTooMany)
  .transform(normalizedIds);

/** El par entero, como en `updateEntryProject`: la tarea no viaja sola (TT-70). */
const entryPair = z
  .strictObject(
    { projectId: z.uuid().nullable(), taskId: z.uuid().nullable() },
    { error: timeEntryMessages.unexpected },
  )
  .refine(hasProjectForTask, taskNeedsProject);

/**
 * Cómo cambian las etiquetas de cada entrada: «add» suma a las que tiene,
 * «replace» deja exactamente las pedidas. Estricto, con el texto de
 * `unexpected`: ninguna interfaz manda otra cosa.
 */
const bulkTags = z.discriminatedUnion(
  "mode",
  [
    z.strictObject(
      {
        mode: z.literal("add"),
        // Agregar ninguna no es un cambio: el diálogo no lo manda.
        ids: z
          .array(z.uuid())
          .min(1, timeEntryMessages.unexpected)
          .max(TAGS_MAX, timeEntryMessages.tooManyTags)
          .transform(normalizedIds),
      },
      { error: timeEntryMessages.unexpected },
    ),
    z.strictObject(
      { mode: z.literal("replace"), ids: tagIds },
      { error: timeEntryMessages.unexpected },
    ),
  ],
  { error: timeEntryMessages.unexpected },
);

/**
 * Lo que cambia en cada entrada. Un campo ausente no cambia; uno presente
 * reemplaza, también con "" en la descripción. `project` es el par entero,
 * como en `updateEntryChanges`: `null` en los dos es «Sin proyecto».
 * `billable` presente gana sobre el por defecto del proyecto (D-2). Estricto
 * en cada nivel: una clave que no se conoce se rechaza con el texto de
 * `unexpected` y no con el de Zod, que está en inglés.
 */
export const bulkEditChanges = z
  .strictObject(
    {
      description: description.optional(),
      /** Día local del inicio. */
      date: dayKeyInput.optional(),
      start: clockInput.optional(),
      /** Menor que el inicio que quede significa el día siguiente (TT-72). */
      end: clockInput.optional(),
      project: entryPair.optional(),
      billable: z.boolean().optional(),
      tags: bulkTags.optional(),
    },
    { error: timeEntryMessages.unexpected },
  )
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    timeEntryMessages.bulkNoChanges,
  );

/** El modo y los ids de las etiquetas en bloque, ya normalizados. */
export type BulkTagsChange = z.output<typeof bulkTags>;

export const bulkEditEntriesInput = z.object({ ids: entryIds, changes: bulkEditChanges });

export const bulkDeleteEntriesInput = z.object({ ids: entryIds });

/** El trío de una entrada cerrada, entero: los tres se interpretan juntos (ADR 0006). */
const entryTriple = z.strictObject(
  { date: dayKeyInput, start: clockInput, end: clockInput },
  { error: timeEntryMessages.unexpected },
);

/** Día y hora del inicio del timer que corre (TT-28, TT-42). */
const runningStart = z.strictObject(
  { date: dayKeyInput, start: clockInput },
  { error: timeEntryMessages.unexpected },
);

/**
 * Los grupos de campos que la persona tocó en el diálogo, la fila o la barra
 * (ADR 0013). Ausente no cambia; presente reemplaza, también "" en la
 * descripción y el conjunto vacío en `tags`. Estricto en cada nivel: un grupo
 * o una clave que no se conoce se rechaza con el texto de `unexpected`.
 * `times` es de una entrada cerrada y `runningStart` de la que corre: nunca
 * los dos. `billable`, presente, gana sobre el por defecto del proyecto que
 * cambia en `project`.
 */
export const updateEntryChanges = z
  .strictObject(
    {
      description: description.optional(),
      project: entryPair.optional(),
      times: entryTriple.optional(),
      runningStart: runningStart.optional(),
      billable: z.boolean().optional(),
      tags: tagIds.optional(),
    },
    { error: timeEntryMessages.unexpected },
  )
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    timeEntryMessages.bulkNoChanges,
  )
  .refine(
    (changes) => changes.times === undefined || changes.runningStart === undefined,
    timeEntryMessages.unexpected,
  );

export const updateEntryInput = z.object({ id: z.uuid(), changes: updateEntryChanges });

/** El par de una fila de la planilla: `null` en los dos es «Sin proyecto» (TS-20). */
const timesheetPair = {
  projectId: z.uuid().nullable(),
  taskId: z.uuid().nullable(),
};

/**
 * «Dejar la celda en este valor» (sección 5 de la paridad). No lleva lo que la
 * pestaña vio ni un id: el servidor decide con lo que la celda tiene (ADR 0019).
 */
export const setTimesheetCellInput = z
  .object({
    /** Día de la columna, en la zona de la persona. */
    date: dayKeyInput,
    ...timesheetPair,
    /**
     * Lo que la celda tiene que mostrar, en minutos (TS-25). Menos de uno es
     * TS-35 y TT-73; 24 horas o más no lo arma el intérprete (TS-26, TS-82).
     */
    minutes: z
      .number(timeEntryMessages.unexpected)
      .int(timeEntryMessages.unexpected)
      .min(1, timeEntryMessages.tooShort)
      .max(MINUTES_PER_DAY - 1, timeEntryMessages.unexpected),
  })
  .refine(hasProjectForTask, taskNeedsProject);

/** TS-52: las entradas de la fila de un par, acotadas a los siete días desde `weekStart`. */
export const removeTimesheetRowInput = z
  .object({
    /** El primer día de la semana que la persona ve: la cota (D13-6). */
    weekStart: dayKeyInput,
    ...timesheetPair,
    /**
     * Los `entryIds` de la fila que la grilla mostraba: lo único que se borra
     * (D13-6). Los de la masiva: de 1 a `BULK_MAX`, normalizados.
     */
    ids: entryIds,
  })
  .refine(hasProjectForTask, taskNeedsProject);

/** El parámetro de `/planilla` (TS-10), con `safeParse`, como el del calendario. */
export const timesheetWeekParams = z.object({ semana: dayKeyInput });

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
export type ContinueEntryInput = z.infer<typeof continueEntryInput>;
export type DuplicateEntryInput = z.infer<typeof duplicateEntryInput>;
export type DiscardTimerInput = z.infer<typeof discardTimerInput>;
export type UpdateEntryProjectInput = z.infer<typeof updateEntryProjectInput>;
export type BulkEditChanges = z.output<typeof bulkEditChanges>;
export type BulkEditEntriesInput = z.input<typeof bulkEditEntriesInput>;
/** Lo que recibe el service: los ids ya normalizados. */
export type BulkEditEntriesValues = z.output<typeof bulkEditEntriesInput>;
export type BulkDeleteEntriesInput = z.input<typeof bulkDeleteEntriesInput>;
export type BulkDeleteEntriesValues = z.output<typeof bulkDeleteEntriesInput>;
export type UpdateEntryChanges = z.input<typeof updateEntryChanges>;
export type UpdateEntryInput = z.input<typeof updateEntryInput>;
/** Lo que recibe el service: la descripción ya recortada. */
export type UpdateEntryValues = z.output<typeof updateEntryInput>;
export type SetTimesheetCellInput = z.input<typeof setTimesheetCellInput>;
export type SetTimesheetCellValues = z.output<typeof setTimesheetCellInput>;
export type RemoveTimesheetRowInput = z.input<typeof removeTimesheetRowInput>;
/** Lo que recibe el service: los ids ya normalizados. */
export type RemoveTimesheetRowValues = z.output<typeof removeTimesheetRowInput>;

/** Con la forma de `ProjectRef`: lo que una vista muestra del proyecto. */
const projectRefView = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(PALETTE_KEYS),
});

/** Con la forma de `TaskRef`. */
const taskRefView = z.object({ id: z.uuid(), name: z.string() });

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
  /** Primer día de la semana de `dayDate`, según el primer día de la persona: "2026-09-28". */
  weekStart: z.string(),
  /** Hora del inicio en el formato de la persona: "13:05" o "1:05 PM". */
  startLabel: z.string(),
  endLabel: z.string().nullable(),
  /** Hora canónica del inicio, "HH:mm" de 24 h: la del trío (ADR 0005). */
  startClock: z.string(),
  /** Hora canónica del fin, o `null` mientras corre. */
  endClock: z.string().nullable(),
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
  /**
   * El proyecto de la entrada, con su nombre y su color de ahora, esté
   * archivado o no (TT-104, PR-102).
   */
  project: projectRefView.nullable(),
  /** Nulo si la entrada no tiene tarea. */
  task: taskRefView.nullable(),
  /** TT-14, TT-15: un booleano visible, sin importes. */
  billable: z.boolean(),
  /**
   * Con la forma de `TagRef`, en orden alfabético, archivadas incluidas y con
   * su nombre de ahora (PR-47, PR-68).
   */
  tags: z.array(z.object({ id: z.uuid(), name: z.string() })),
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

export const weekGroupView = z.object({
  /** Primer día de la semana, "2026-09-28". */
  start: z.string(),
  /** «Esta semana», «Semana anterior» o el rango (TT-47). */
  label: z.string(),
  /** El cliente suma acá el transcurrido del timer activo (TT-46). */
  isRunningWeek: z.boolean(),
  /** Exacto, en segundos: la suma de los `closedSeconds` de sus días. */
  closedSeconds: z.number().int().min(0),
  /** Solo días con entradas, del más reciente al más viejo. */
  days: z.array(dayGroupView),
});

export const trackerState = z.object({
  /** Referencia contra la que el cliente corrige el desfase de su reloj. */
  serverNow: z.iso.datetime(),
  timeZone: z.string(),
  /** Día de hoy en la zona de la persona. */
  todayKey: z.string(),
  /** El piso de carga, como día en la zona de la persona: el primero que admite carga. */
  minDayKey: z.string(),
  canTrack: z.boolean(),
  running: timeEntryView.nullable(),
  /** La entrada que continúa el atajo «c»: la cerrada más reciente que ya empezó. */
  lastEntryId: z.uuid().nullable(),
  /** Solo semanas con entradas o con el timer activo, de la más nueva a la más vieja. */
  weeks: z.array(weekGroupView),
  /**
   * El piso de la ventana que se dibuja: primer día de su semana más vieja.
   * Ningún componente lo lee; es el observable con que los tests fijan la
   * ventana sin depender de qué semanas tienen entradas (contrato, §5.3).
   */
  windowFrom: z.string(),
  /**
   * El piso que la ventana tendría sin el timer activo. Es contra el que el
   * cliente compara la semana de una entrada después de una mutación (P-15).
   */
  reachFrom: z.string(),
  /** El `desde` de «Cargar más», o `null` si no queda nada más atrás. */
  loadMoreFrom: z.string().nullable(),
  hasAnyEntry: z.boolean(),
});

/** Minutos de reloj de un día, `[from, to)`, entre 0 y 1440. */
const minuteRange = z.object({
  from: z.number().int().min(0).max(1440),
  to: z.number().int().min(0).max(1440),
});

export const calendarDayView = z.object({
  /** "2026-10-01". */
  date: z.string(),
  /** «jue, 01/10», con año si no es el de hoy (CAL-09). Nunca «Hoy» ni «Ayer». */
  label: z.string(),
  isToday: z.boolean(),
  /** Anterior al piso de carga: atenuado (CAL-48). */
  beforeFloor: z.boolean(),
  /** Exacto: lo que suman las entradas cerradas que empiezan ese día (CAL-32, P-02). */
  closedSeconds: z.number().int().min(0),
  /** Lo que no existe ese día por el cambio de horario (CAL-30). */
  missingMinutes: z.array(minuteRange),
});

export const calendarState = z.object({
  /** Referencia del desfase de TT-32. */
  serverNow: z.iso.datetime(),
  todayKey: z.string(),
  /** El piso de carga, como día en la zona de la persona: el piso del alta. */
  minDayKey: z.string(),
  /** Minuto del día de `serverNow` en la zona de la persona: la línea de ahora. */
  nowMinute: z.number().int().min(0).max(1439),
  canTrack: z.boolean(),
  mode: z.enum(CALENDAR_MODES),
  /** Primer día del período, ya normalizado. */
  periodStart: z.string(),
  /** «Esta semana», «Semana anterior» o el rango (TT-47); en la vista día, «Hoy», «Ayer» o el día. */
  periodLabel: z.string(),
  previousStart: z.string(),
  nextStart: z.string(),
  /** El período que contiene hoy, para «Hoy». */
  todayStart: z.string(),
  /** Lo que abren «Día» y «Semana» (§1). */
  dayModeStart: z.string(),
  weekModeStart: z.string(),
  days: z.array(calendarDayView),
  /** Las cerradas propias que se superponen con el período, por inicio y después por id. */
  entries: z.array(timeEntryView),
  /** El timer que corre, esté o no a la vista: el cliente decide qué segmentos dibuja. */
  running: timeEntryView.nullable(),
  /** Suma de `closedSeconds` de los días: el total del período sin el timer (CAL-33). */
  closedSeconds: z.number().int().min(0),
});

export const timesheetDayView = z.object({
  /** "2026-09-28". */
  date: z.string(),
  /** El encabezado de la columna: «lun, 28/09», con año si no es el de hoy (TS-08). */
  label: z.string(),
  /** El día en el nombre de cada celda: «lunes 28/09» (TS-100). */
  fullLabel: z.string(),
  isToday: z.boolean(),
  /** Sábado o domingo: fondo distinto (TS-08). */
  isWeekend: z.boolean(),
  /** Anterior al piso de carga: sus celdas no se escriben (TS-12). */
  beforeFloor: z.boolean(),
  /** Exacto: lo que suman las celdas del día, sin el timer (TS-45, TS-49). */
  closedSeconds: z.number().int().min(0),
});

export const timesheetCellView = z.object({
  date: z.string(),
  /** Exacto: lo que suman las entradas cerradas de la celda (TS-24). */
  closedSeconds: z.number().int().min(0),
  /** Una de cero minutos cuenta: la celda dice `0:00` y no queda vacía (TS-118). */
  entryCount: z.number().int().min(1),
});

export const timesheetRowView = z.object({
  /** `null` es «Sin proyecto». Esté o no archivado (TS-21). */
  project: projectRefView.nullable(),
  task: taskRefView.nullable(),
  /** El cliente del proyecto, en gris (TS-13); `null` sin cliente o sin proyecto. */
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Solo las celdas con entradas, por día. */
  cells: z.array(timesheetCellView),
  /** Exacto: la suma de la fila en la semana (TS-44). */
  closedSeconds: z.number().int().min(0),
  /**
   * Las cerradas de la fila en la semana, por id: lo que cuenta el diálogo de
   * TS-53 y lo que borra «Quitar fila» (D13-6).
   */
  entryIds: z.array(z.uuid()).min(1),
});

export const timesheetState = z.object({
  /** Día de hoy en la zona de la persona: la marca del selector de fecha. */
  todayKey: z.string(),
  canTrack: z.boolean(),
  /** Primer día de la semana que se muestra, ya normalizado (TS-10). */
  weekStart: z.string(),
  /** «Esta semana», «Semana anterior» o el rango (TS-09, TT-47). */
  weekLabel: z.string(),
  previousStart: z.string(),
  nextStart: z.string(),
  /** La semana que contiene hoy: el destino de «Esta semana». */
  currentStart: z.string(),
  days: z.array(timesheetDayView).length(7),
  /** Las filas que salen de las entradas, en el orden de TS-15. */
  rows: z.array(timesheetRowView),
  /** Exacto: el total de la semana (TS-46). */
  closedSeconds: z.number().int().min(0),
  /** Dónde guarda el navegador las filas vacías: por workspace y persona. */
  storageKey: z.string(),
  /** Lo pide el tipo de `EntryDialog`: la planilla no llega a lo que lo usa. */
  serverNow: z.iso.datetime(),
  /** El piso de carga, como día: el primero que admite la fecha del editor. */
  minDayKey: z.string(),
  /**
   * Las cerradas de la persona con el inicio en la semana, en el orden de
   * `listTimesheetEntries` (`started_at`, `created_at`, `id`): las del menú,
   * la lista y el editor (TS-40 … TS-42). La celda de cada una es su
   * `dayDate` y su par, la misma regla que arma las celdas (TS-07).
   */
  entries: z.array(timeEntryView),
});

export type TimeEntryView = z.infer<typeof timeEntryView>;
export type DayGroupView = z.infer<typeof dayGroupView>;
export type WeekGroupView = z.infer<typeof weekGroupView>;
export type TrackerState = z.infer<typeof trackerState>;
export type CalendarDayView = z.infer<typeof calendarDayView>;
export type CalendarState = z.infer<typeof calendarState>;
export type TimesheetState = z.infer<typeof timesheetState>;
export type TimesheetRowView = z.infer<typeof timesheetRowView>;
export type TimesheetDayView = z.infer<typeof timesheetDayView>;

export type TimeEntryErrorCode =
  ActionErrorCode | "already_stopped" | "timer_running" | "rejected";

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
  /**
   * La entrada creada. En un reintento resuelto por el ADR 0007, la que creó el
   * primer intento, en el estado en que esté.
   */
  readonly created: TimeEntryView;
};

export type UpdateEntryTimesResult = { readonly entry: TimeEntryView };

export type UpdateRunningStartResult = { readonly running: TimeEntryView };

/** Continuar es un arranque: responde lo mismo que «Iniciar». */
export type ContinueEntryResult = StartTimerResult;

export type DuplicateEntryResult = { readonly created: TimeEntryView };

export type DiscardTimerResult = { readonly id: string };

export type UpdateEntryProjectResult = { readonly entry: TimeEntryView };

/** Las vistas de todas las entradas pedidas, en el orden pedido: cambien o no. */
export type BulkEditEntriesResult = { readonly entries: readonly TimeEntryView[] };

/** Los ids pedidos: los que se borraron y los que ya no estaban (ADR 0011). */
export type BulkDeleteEntriesResult = { readonly ids: readonly string[] };

/** La entrada como quedó, se haya escrito o no (ADR 0013). */
export type UpdateEntryResult = { readonly entry: TimeEntryView };

/** La entrada que el pedido creó o editó; `null` si la celda ya mostraba ese valor. */
export type SetTimesheetCellResult = { readonly entry: TimeEntryView | null };

/** Las entradas que se borraron; vacío si ya no quedaba ninguna de las pedidas (TS-92). */
export type RemoveTimesheetRowResult = { readonly ids: readonly string[] };

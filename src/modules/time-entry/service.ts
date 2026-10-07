import { billableFor, NEW_ENTRY_BILLABLE } from "@/lib/billable";
import { samePair, type ProjectPair } from "@/lib/project-pair";
import { normalizedIds, sameTagIds } from "@/lib/tag-ids";
import { sortedByName } from "@/lib/text";
import { DomainError, RejectedError, type Rejection } from "@/server/action";
import { db, type Transaction } from "@/server/db";
import { recordAudit, recordAudits } from "@/server/audit";
import { createOnce, type ConflictOutcome } from "@/server/create-once";
import { can, type Action, type Actor } from "@/server/permissions";
import {
  addDaysToKey,
  clockDifferenceMinutes,
  clockLabel,
  crossesMidnight,
  dayBounds,
  dayKey,
  dayKeyLabel,
  dayLabel,
  durationSeconds,
  earliestDayKey,
  extraDays,
  formatClock,
  formatDuration,
  instantFromLocal,
  isAfterYear9999,
  MINUTES_PER_DAY,
  minuteOfDayIn,
  nonexistentMinutes,
  parseDayKey,
  startOfDayKey,
  weekdayLabel,
  weekKeyLabel,
  weekStartKey,
  type TimeSettings,
  type WeekStart,
} from "@/server/time";
import { isPaletteKey } from "@/modules/project/palette";
import {
  projectMessages,
  type ProjectRef,
  type TrackableProject,
} from "@/modules/project/schema";
import { assertTaggable, assertTrackable } from "@/modules/project/service";
import { timeSettingsOf, type ProfileContext } from "@/modules/profile/service";

import { pairToCheck, tagsAfter, tagsToCheck } from "./assignment";
import {
  timeEntryRepository,
  type ClosedEntryFields,
  type ClosedFields,
  type EntryRefs,
  type EntryTarget,
  type EntryWithRefs,
  type RunningEntryFields,
  type TimeEntryRow,
} from "./repository";
import {
  TAGS_MAX,
  timeEntryMessages,
  TRACKER_WINDOW_DAYS,
  type BulkDeleteEntriesResult,
  type BulkDeleteEntriesValues,
  type BulkEditChanges,
  type BulkEditEntriesResult,
  type BulkEditEntriesValues,
  type CalendarDayView,
  type CalendarMode,
  type CalendarState,
  type ContinueEntryInput,
  type ContinueEntryResult,
  type CreateManualEntryResult,
  type CreateManualEntryValues,
  type DeleteEntryInput,
  type DeleteEntryResult,
  type DayGroupView,
  type DiscardTimerInput,
  type DiscardTimerResult,
  type DuplicateEntryInput,
  type DuplicateEntryResult,
  type StartTimerValues,
  type StartTimerResult,
  type StopTimerInput,
  type StopTimerResult,
  type TimeEntryErrorCode,
  type TimeEntryView,
  type TrackerState,
  type UpdateDescriptionInput,
  type UpdateDescriptionResult,
  type UpdateEntryProjectInput,
  type UpdateEntryProjectResult,
  type UpdateEntryTimesInput,
  type UpdateEntryTimesResult,
  type UpdateEntryResult,
  type UpdateEntryValues,
  type UpdateRunningStartInput,
  type UpdateRunningStartResult,
  type WeekGroupView,
} from "./schema";

/** Error de dominio del módulo. La action lo traduce a un resultado tipado. */
export class TimeEntryError extends DomainError<TimeEntryErrorCode> {
  constructor(code: TimeEntryErrorCode, message: string) {
    super(code, message);
    this.name = "TimeEntryError";
  }
}

const AUDIT_ENTITY = "time_entry";

/**
 * Lo que el módulo usa del contexto de la sesión: la zona, los formatos y el
 * primer día de la semana de la persona.
 */
export type TrackerWorkspace = TimeSettings;

/** Único lugar por el que la zona, los formatos y el primer día entran al módulo. */
export function trackerWorkspaceOf(context: ProfileContext): TrackerWorkspace {
  return timeSettingsOf(context);
}

/**
 * Primer día en que se pueden cargar horas, como clave de día en la zona de la
 * persona, la misma con que se convierte la hora tecleada. Es fijo: el día de
 * creación del workspace dejaba sin cargar los días anteriores al primer uso
 * (ADR 0005). La validación del service y el calendario de la barra lo toman de
 * acá, así que los dos dicen lo mismo.
 */
const ENTRY_FLOOR_DAY_KEY = "2000-01-01";

/** El día local y la hora de pared de un extremo: lo que la fila muestra de él. */
type WallLabel = { readonly day: string; readonly clock: string };

function labelOf(instant: Date, timeZone: string): WallLabel {
  return { day: dayKey(instant, timeZone), clock: formatClock(instant, timeZone) };
}

function sameLabel(instant: Date, label: WallLabel, timeZone: string): boolean {
  const own = labelOf(instant, timeZone);
  return own.day === label.day && own.clock === label.clock;
}

/**
 * Día local del fin que el trío `{ date, start, end }` describe: el siguiente
 * si el fin es menor que el inicio (TT-72), el mismo si no.
 */
function endDayOf(date: string, start: string, end: string): string {
  return crossesMidnight(start, end) ? addDaysToKey(date, 1) : date;
}

/**
 * TT-110: el trío de la fila vuelve a dar el mismo fin. Inicio y fin vuelven
 * siempre a su hora de pared, así que lo único que el trío puede perder es el
 * día del fin. Una entrada que corre no edita sus horarios (TT-111).
 */
function hasEditableTimes(row: TimeEntryRow, timeZone: string): boolean {
  if (row.endedAt === null) {
    return false;
  }
  const start = labelOf(row.startedAt, timeZone);
  const end = labelOf(row.endedAt, timeZone);
  return end.day === endDayOf(start.day, start.clock, end.clock);
}

/** La semana de la persona en que cae un instante: su primer día, como clave. */
function weekOf(instant: Date, workspace: TrackerWorkspace): string {
  return weekStartKey(dayKey(instant, workspace.timezone), workspace.weekStart);
}

/** El `check` de la base no deja guardar otra cosa; si pasa, no es la paleta. */
function projectRefOf(project: NonNullable<EntryRefs["project"]>): ProjectRef {
  if (!isPaletteKey(project.color)) {
    throw new Error(`El proyecto ${project.id} tiene un color fuera de la paleta.`);
  }
  return { id: project.id, name: project.name, color: project.color };
}

/** Los ids de las etiquetas de la fila, en el orden de la vista (`sortedByName`). */
function sortedTagIdsOf(row: EntryRefs): string[] {
  return sortedByName(row.tags).map((tag) => tag.id);
}

/** Recibe la fila con sus referencias: una lectura sin el join no compila (§5.2). */
function toView(row: EntryWithRefs, workspace: TrackerWorkspace): TimeEntryView {
  const timeZone = workspace.timezone;
  const endedAt = row.endedAt;
  const seconds = endedAt === null ? null : durationSeconds(row.startedAt, endedAt);
  const startClock = formatClock(row.startedAt, timeZone);
  const endClock = endedAt === null ? null : formatClock(endedAt, timeZone);
  return {
    id: row.id,
    description: row.description,
    startedAt: row.startedAt.toISOString(),
    endedAt: endedAt === null ? null : endedAt.toISOString(),
    dayDate: dayKey(row.startedAt, timeZone),
    weekStart: weekOf(row.startedAt, workspace),
    startLabel: clockLabel(startClock, workspace.formats.time),
    endLabel: endClock === null ? null : clockLabel(endClock, workspace.formats.time),
    startClock,
    endClock,
    extraDays: endedAt === null ? 0 : extraDays(row.startedAt, endedAt, timeZone),
    durationSeconds: seconds,
    durationLabel: seconds === null ? null : formatDuration(Math.floor(seconds / 60)),
    editableTimes: hasEditableTimes(row, timeZone),
    project: row.project === null ? null : projectRefOf(row.project),
    task: row.task === null ? null : { id: row.task.id, name: row.task.name },
    billable: row.billable,
    tags: sortedByName(row.tags),
  };
}

/** El recurso de una entrada que todavía no existe: su dueño va a ser el actor. */
export function ownTimeEntryResource(actor: Actor) {
  return {
    kind: "timeEntry",
    workspaceId: actor.workspaceId,
    userId: actor.userId,
  } as const;
}

/**
 * Lo que comparten las lecturas de una entrada existente: `not_found` si no
 * hay fila (TT-80), `forbidden` con el texto de TT-79 si `can()` la niega sobre
 * su dueño real. Un id de otro workspace nunca llega acá: el repository ya lo
 * dejó fuera.
 */
function authorizeEntry(
  actor: Actor,
  action: Action,
  row: EntryWithRefs | undefined,
): EntryWithRefs {
  if (row === undefined) {
    throw new TimeEntryError("not_found", timeEntryMessages.notFound);
  }
  if (
    !can(actor, action, {
      kind: "timeEntry",
      workspaceId: row.workspaceId,
      userId: row.userId,
    })
  ) {
    throw new TimeEntryError(
      "forbidden",
      row.userId === actor.userId
        ? timeEntryMessages.forbidden
        : timeEntryMessages.forbiddenOtherOwner,
    );
  }
  return row;
}

/** La entrada que escribe una mutación. Con bloqueo: se escribe lo que se leyó. */
async function readOwnEntry(
  tx: Transaction,
  actor: Actor,
  action: Action,
  id: string,
): Promise<EntryWithRefs> {
  return authorizeEntry(
    actor,
    action,
    await timeEntryRepository.findByIdForUpdate(tx, actor.workspaceId, id),
  );
}

/**
 * La entrada de la que parte un alta. Sin bloqueo: no se escribe y su dueño no
 * cambia, y con el bloqueo dos «Continuar» de la misma entrada se pondrían en
 * fila y el segundo cerraría con 0 s el timer que acaba de abrir el primero.
 */
async function readSourceEntry(
  tx: Transaction,
  actor: Actor,
  id: string,
): Promise<EntryWithRefs> {
  return authorizeEntry(
    actor,
    "timeEntry.own.create",
    await timeEntryRepository.findById(actor.workspaceId, id, tx),
  );
}

/** La fila, tal como se leyó y autorizó. Es lo único que identifica una escritura. */
function targetOf(row: TimeEntryRow): EntryTarget {
  return { workspaceId: row.workspaceId, userId: row.userId, id: row.id };
}

/** Cierra la entrada abierta dentro de la transacción y deja constancia. */
async function closeRunning(
  tx: Transaction,
  actor: Actor,
  row: TimeEntryRow,
): Promise<EntryWithRefs | undefined> {
  const stopped = await timeEntryRepository.stopById(tx, targetOf(row));
  if (stopped === undefined) {
    return undefined;
  }
  await recordAudit(tx, {
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    action: "timeEntry.stop",
    entity: AUDIT_ENTITY,
    entityId: stopped.id,
    previousValue: { endedAt: null },
    nextValue: { endedAt: stopped.endedAt },
  });
  return stopped;
}

/**
 * La vuelta del timer abierto del ADR 0003: ante el choque del índice responde
 * el timer que ganó y, si el ganador ya lo detuvo, pide otra vuelta.
 */
function runningConflictHook<Result>(
  actor: Actor,
  winner: (row: EntryWithRefs) => Result,
): (error: unknown) => Promise<ConflictOutcome<Result>> {
  return async (error) => {
    if (!timeEntryRepository.isRunningConflict(error)) {
      throw error;
    }
    const running = await timeEntryRepository.findRunning(
      actor.workspaceId,
      actor.userId,
    );
    return running === undefined
      ? { kind: "retry" }
      : { kind: "resolved", result: winner(running) };
  };
}

/**
 * El permiso de `timeEntry.own.create` y después `createOnce`, con la fila
 * propia por workspace y usuario y, si se pasa `winner`, la vuelta del timer
 * abierto del ADR 0003.
 */
async function createEntryOnce<Result>(
  actor: Actor,
  id: string,
  creation: {
    readonly attempt: () => Promise<Result>;
    readonly replayed: (row: EntryWithRefs) => Result;
    readonly winner?: (row: EntryWithRefs) => Result;
  },
): Promise<Result> {
  // Antes que la fila propia: sin esto, una membresía desactivada recibiría
  // éxito por mandar el id de una entrada suya que ya existe.
  if (!can(actor, "timeEntry.own.create", ownTimeEntryResource(actor))) {
    throw new TimeEntryError("forbidden", timeEntryMessages.forbidden);
  }
  const { winner } = creation;
  return createOnce<EntryWithRefs, Result>({
    id,
    findOwn: (ownId) =>
      timeEntryRepository.findOwnById(actor.workspaceId, actor.userId, ownId),
    attempt: creation.attempt,
    replayed: creation.replayed,
    idConstraint: timeEntryRepository.idConstraint,
    action: "timeEntry.own.create",
    onOtherConflict:
      winner === undefined ? undefined : runningConflictHook(actor, winner),
  });
}

/**
 * La red de seguridad de TT-81 en las escrituras que cierran un timer: con el
 * piso de `stopById` el `check` no salta, pero si salta no es un problema de red.
 */
async function translatingEndBeforeStart<Result>(
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (timeEntryRepository.isEndBeforeStart(error)) {
      throw new TimeEntryError("validation", timeEntryMessages.endBeforeStart);
    }
    throw error;
  }
}

/**
 * Las redes de la base para las referencias: el proyecto, la tarea o una
 * etiqueta que se borran entre `assertTrackable` o `assertTaggable` y la
 * escritura (en la fase 1 nada borra), y el `check` que Zod ya cubre.
 */
async function translatingReferenceConstraints<Result>(
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (timeEntryRepository.isMissingProject(error)) {
      throw new TimeEntryError("not_found", projectMessages.projectUnavailable);
    }
    if (timeEntryRepository.isMissingTask(error)) {
      throw new TimeEntryError("not_found", projectMessages.taskUnavailable);
    }
    if (timeEntryRepository.isMissingTag(error)) {
      throw new TimeEntryError("not_found", projectMessages.tagUnavailable);
    }
    if (timeEntryRepository.isTaskWithoutProject(error)) {
      throw new TimeEntryError("validation", timeEntryMessages.taskNeedsProject);
    }
    throw error;
  }
}

/** El par de una entrada nueva: nada que conservar. */
const NO_PROJECT: ProjectPair = { projectId: null, taskId: null };

/**
 * La regla del par en un alta (§4.3): todo par con proyecto lo decide
 * `project` (ADR 0010) con la transacción de la operación, así un rechazo
 * deshace todo lo que la operación hizo antes. Devuelve el proyecto validado,
 * o `null` con «Sin proyecto», en que `billableFor` conserva el facturable.
 */
async function assertNewEntryPair(
  tx: Transaction,
  actor: Actor,
  requested: ProjectPair,
): Promise<TrackableProject | null> {
  const target = pairToCheck(NO_PROJECT, requested);
  return target === null ? null : assertTrackable(tx, actor, target);
}

/** TT-14: el facturable pedido en un alta, o el por defecto del proyecto validado. */
function billableOfNewEntry(
  requested: boolean | undefined,
  project: TrackableProject | null,
): boolean {
  return requested ?? billableFor(NEW_ENTRY_BILLABLE, project);
}

function pairOf(row: ProjectPair): ProjectPair {
  return { projectId: row.projectId, taskId: row.taskId };
}

/** Los campos de una entrada nueva que no son instantes. */
type CopiedFields = ProjectPair & {
  readonly description: string;
  readonly billable: boolean;
  readonly tagIds: readonly string[];
};

/**
 * La única función que decide qué se copia de la original, para continuar y
 * para duplicar. El facturable es el de la original, aunque su proyecto haya
 * cambiado el por defecto, y las etiquetas, todas las suyas (TT-57, TT-58).
 */
function continuedFields(source: EntryWithRefs): CopiedFields {
  return {
    description: source.description,
    ...pairOf(source),
    billable: source.billable,
    tagIds: sortedTagIdsOf(source),
  };
}

type OpenedEntry = {
  readonly running: EntryWithRefs;
  readonly stopped: EntryWithRefs | null;
};

/**
 * Cierra el timer abierto, si hay, y abre la entrada nueva con el mismo
 * `now()` (ADR 0003). Un choque con otro arranque sale como error de la base:
 * lo resuelve `createEntryOnce`. Cada operación escribe su propio registro.
 */
async function closeAndOpen(
  tx: Transaction,
  actor: Actor,
  entry: { readonly id: string; readonly fields: CopiedFields },
): Promise<OpenedEntry> {
  const current = await timeEntryRepository.findRunning(
    actor.workspaceId,
    actor.userId,
    tx,
  );
  const stopped =
    current === undefined ? undefined : await closeRunning(tx, actor, current);
  const running = await timeEntryRepository.insertRunning(tx, {
    id: entry.id,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    ...entry.fields,
  });
  return { running, stopped: stopped ?? null };
}

/**
 * El arranque idempotente que comparten «Iniciar» y «Continuar»: `open` es la
 * transacción del alta, que cierra el timer abierto y escribe su registro. Un
 * reintento con el mismo id responde la fila que creó el primer intento, sin
 * escribir (ADR 0007); si otro arranque ganó la carrera, el timer del ganador
 * (ADR 0003).
 */
async function startEntryOnce(
  actor: Actor,
  workspace: TrackerWorkspace,
  id: string,
  open: (tx: Transaction) => Promise<OpenedEntry>,
): Promise<StartTimerResult> {
  const runningOnly = (row: EntryWithRefs): StartTimerResult => ({
    running: toView(row, workspace),
    stopped: null,
  });
  return translatingEndBeforeStart(() =>
    translatingReferenceConstraints(() =>
      createEntryOnce(actor, id, {
        attempt: async () => {
          const opened = await db.transaction(open);
          return {
            running: toView(opened.running, workspace),
            stopped: opened.stopped === null ? null : toView(opened.stopped, workspace),
          };
        },
        replayed: runningOnly,
        winner: runningOnly,
      }),
    ),
  );
}

/** Arranca un timer. Si ya había uno corriendo lo cierra en el mismo instante. */
export async function startTimer(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: StartTimerValues,
): Promise<StartTimerResult> {
  return startEntryOnce(actor, workspace, input.id, async (tx) => {
    const pair = pairOf(input);
    // Las reglas antes de escribir: un id ajeno o un timer abierto bloqueado
    // por otra conexión no cambian la respuesta.
    const project = await assertNewEntryPair(tx, actor, pair);
    await assertTaggable(tx, actor, input.tagIds);
    const opened = await closeAndOpen(tx, actor, {
      id: input.id,
      fields: {
        description: input.description,
        ...pair,
        billable: billableOfNewEntry(input.billable, project),
        tagIds: input.tagIds,
      },
    });
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.start",
      entity: AUDIT_ENTITY,
      entityId: opened.running.id,
      nextValue: {
        description: opened.running.description,
        projectId: opened.running.projectId,
        taskId: opened.running.taskId,
        billable: opened.running.billable,
        tagIds: sortedTagIdsOf(opened.running),
        startedAt: opened.running.startedAt,
      },
    });
    return opened;
  });
}

/**
 * Abre un timer nuevo con los campos de una entrada existente (TT-57). Es un
 * arranque: cierra el timer que corría en el mismo instante, y perder la
 * carrera contra otro arranque responde el timer del ganador.
 */
export async function continueEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: ContinueEntryInput,
): Promise<ContinueEntryResult> {
  return startEntryOnce(actor, workspace, input.id, async (tx) => {
    const source = await readSourceEntry(tx, actor, input.sourceId);
    const fields = continuedFields(source);
    // Las reglas antes de escribir: un id ajeno o un timer abierto bloqueado
    // por otra conexión no cambian la respuesta (§4.4, D-3).
    await assertNewEntryPair(tx, actor, fields);
    await assertTaggable(tx, actor, fields.tagIds);
    const opened = await closeAndOpen(tx, actor, { id: input.id, fields });
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.continue",
      entity: AUDIT_ENTITY,
      entityId: opened.running.id,
      nextValue: {
        sourceId: source.id,
        description: opened.running.description,
        projectId: opened.running.projectId,
        taskId: opened.running.taskId,
        billable: opened.running.billable,
        tagIds: sortedTagIdsOf(opened.running),
        startedAt: opened.running.startedAt,
      },
    });
    return opened;
  });
}

/**
 * TT-58: qué instantes recibe la copia. Hoy, los mismos de la original.
 * Pendiente de verificación en el workspace del equipo (P-14).
 *
 * Con esta regla la copia no necesita ningún control de rango. No puede quedar
 * debajo del piso de carga ni pasar el año 9999: son instantes que ya se
 * guardaron. Y no puede quedar fuera de la lista donde está la original: cae
 * en su mismo día, y agregarla no mueve el extremo inferior de la ventana,
 * porque empieza en el mismo instante que una fila que ya estaba. Si la
 * original se ve, la copia también; si la ventana la dejó afuera, se van las
 * dos.
 *
 * Las alternativas consideradas tampoco necesitan extender la lista ni el piso:
 * la contigua (`startedAt = source.endedAt`) cae después de la original, y la
 * de las mismas horas de pared hoy cae en hoy, que la lista siempre dibuja y
 * que nunca es anterior al piso de carga. La contigua suma el tope
 * de `isAfterYear9999`, y la de hoy, el rechazo de `nonexistentClock`
 * (ADR 0005) y el `now` y la zona como parámetros. Solo una regla que pusiera
 * la copia en un día anterior al de la original y anterior a hoy necesitaría
 * extender la lista hasta la semana de la entrada, como el alta manual.
 */
function duplicateTimes(source: ClosedEntryRow): { startedAt: Date; endedAt: Date } {
  return { startedAt: source.startedAt, endedAt: source.endedAt };
}

/**
 * El alta idempotente de una entrada cerrada que comparten duplicar y el alta
 * manual: `insert` es la transacción del alta, que aplica sus reglas antes de
 * escribir y deja su registro. Un reintento con el mismo id responde la fila
 * que creó el primer intento, sin validar ni escribir (ADR 0007). Una fila
 * cerrada no choca con el índice del timer, así que no hay ganador que
 * responder.
 */
async function closedEntryOnce(
  actor: Actor,
  workspace: TrackerWorkspace,
  id: string,
  insert: (tx: Transaction) => Promise<EntryWithRefs>,
): Promise<{ readonly created: TimeEntryView }> {
  const createdOf = (row: EntryWithRefs) => ({ created: toView(row, workspace) });
  return translatingReferenceConstraints(() =>
    createEntryOnce(actor, id, {
      attempt: async () => createdOf(await db.transaction(insert)),
      replayed: createdOf,
    }),
  );
}

/**
 * Agrega una entrada cerrada con los campos y las horas de otra (TT-58). Solo
 * crea: un reintento con el mismo id responde la copia del primer intento
 * (ADR 0007).
 */
export async function duplicateEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: DuplicateEntryInput,
): Promise<DuplicateEntryResult> {
  return closedEntryOnce(actor, workspace, input.id, async (tx) => {
    // La abierta solo llega en un pedido armado a mano: no es una fila.
    const source = requireClosed(await readSourceEntry(tx, actor, input.sourceId));
    const fields = continuedFields(source);
    await assertNewEntryPair(tx, actor, fields);
    await assertTaggable(tx, actor, fields.tagIds);
    const created = await timeEntryRepository.insertClosed(tx, {
      id: input.id,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      ...fields,
      ...duplicateTimes(source),
    });
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.duplicate",
      entity: AUDIT_ENTITY,
      entityId: created.id,
      nextValue: {
        sourceId: source.id,
        description: created.description,
        projectId: created.projectId,
        taskId: created.taskId,
        billable: created.billable,
        tagIds: sortedTagIdsOf(created),
        startedAt: created.startedAt,
        endedAt: created.endedAt,
      },
    });
    return created;
  });
}

export async function stopTimer(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: StopTimerInput,
): Promise<StopTimerResult> {
  const stopped = await translatingEndBeforeStart(() =>
    db.transaction(async (tx) => {
      const row = await readOwnEntry(tx, actor, "timeEntry.own.update", input.id);
      if (row.endedAt !== null) {
        throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
      }
      const closed = await closeRunning(tx, actor, row);
      if (closed === undefined) {
        throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
      }
      return closed;
    }),
  );
  return { stopped: toView(stopped, workspace) };
}

export async function updateDescription(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateDescriptionInput,
): Promise<UpdateDescriptionResult> {
  const updated = await db.transaction(async (tx) => {
    const row = await readOwnEntry(tx, actor, "timeEntry.own.update", input.id);
    const next = await timeEntryRepository.updateDescription(
      tx,
      targetOf(row),
      input.description,
    );
    if (next === undefined) {
      throw new TimeEntryError("not_found", timeEntryMessages.notFound);
    }
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.updateDescription",
      entity: AUDIT_ENTITY,
      entityId: next.id,
      previousValue: { description: row.description },
      nextValue: { description: next.description },
    });
    return next;
  });
  return { entry: toView(updated, workspace) };
}

/**
 * TT-10, TT-11, TT-27, TT-54. Fija el par sobre la entrada leída, corra o no,
 * con el facturable de `billableFor` (D-2). El pedido que deja el mismo par
 * responde la vista sin escribir.
 */
export async function updateEntryProject(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateEntryProjectInput,
): Promise<UpdateEntryProjectResult> {
  return translatingReferenceConstraints(() =>
    db.transaction(async (tx) => {
      const row = await readOwnEntry(tx, actor, "timeEntry.own.update", input.id);
      const plan = assignmentPlan(row, { project: pairOf(input) });
      const { pair } = plan;
      if (pair === undefined) {
        return { entry: toView(row, workspace) };
      }
      const project = await assertAssignments(tx, actor, [plan]);
      const { billable = row.billable } = assignmentFields(row, plan, project);
      const next = await timeEntryRepository.updateProject(tx, targetOf(row), {
        ...pair,
        billable,
      });
      if (next === undefined) {
        throw new TimeEntryError("not_found", timeEntryMessages.notFound);
      }
      const withBillable = (written: TimeEntryRow) =>
        billable === row.billable
          ? pairOf(written)
          : { ...pairOf(written), billable: written.billable };
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: "timeEntry.updateProject",
        entity: AUDIT_ENTITY,
        entityId: next.id,
        previousValue: withBillable(row),
        nextValue: withBillable(next),
      });
      return { entry: toView(next, workspace) };
    }),
  );
}

export async function deleteEntry(
  actor: Actor,
  input: DeleteEntryInput,
): Promise<DeleteEntryResult> {
  return db.transaction(async (tx) => {
    const row = await readOwnEntry(tx, actor, "timeEntry.own.delete", input.id);
    const removed = await timeEntryRepository.deleteById(tx, targetOf(row));
    if (removed === undefined) {
      throw new TimeEntryError("not_found", timeEntryMessages.notFound);
    }
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.delete",
      entity: AUDIT_ENTITY,
      entityId: removed.id,
      // El borrado es físico y la unión se va en cascada: esta es la única
      // copia que queda de la fila y de sus etiquetas (TT-61).
      previousValue: { ...removed, tagIds: sortedTagIdsOf(row) },
    });
    return { id: removed.id };
  });
}

/**
 * Borra el timer que corre sin guardarlo (TT-65). Lo que se pidió es que el
 * timer no esté: si la fila ya no existe, es éxito sin escribir. Un timer que
 * otra pestaña ya cerró no se borra, porque es un registro que alguien quiso
 * conservar y el borrado no se deshace (P-06).
 */
export async function discardTimer(
  actor: Actor,
  input: DiscardTimerInput,
): Promise<DiscardTimerResult> {
  // Antes de la fila: sin esto, una membresía desactivada recibiría éxito por
  // un id que no existe.
  if (!can(actor, "timeEntry.own.delete", ownTimeEntryResource(actor))) {
    throw new TimeEntryError("forbidden", timeEntryMessages.forbidden);
  }
  return db.transaction(async (tx) => {
    const found = await timeEntryRepository.findByIdForUpdate(
      tx,
      actor.workspaceId,
      input.id,
    );
    if (found === undefined) {
      return { id: input.id };
    }
    const row = authorizeEntry(actor, "timeEntry.own.delete", found);
    if (row.endedAt !== null) {
      throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
    }
    const removed = await timeEntryRepository.deleteRunningById(tx, targetOf(row));
    if (removed === undefined) {
      throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
    }
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.discard",
      entity: AUDIT_ENTITY,
      entityId: removed.id,
      // El borrado es físico y la unión se va en cascada: esta es la única
      // copia que queda de la fila y de sus etiquetas (TT-61).
      previousValue: { ...removed, tagIds: sortedTagIdsOf(row) },
    });
    return { id: removed.id };
  });
}

/**
 * Los dos instantes del alta manual, con las reglas de las horas tecleadas:
 * la hora que no existe, la duración cero, el año 10000 y el piso del
 * workspace. Dependen de la zona y del piso, que pueden cambiar entre dos
 * intentos: corren dentro de la transacción del alta, después de buscar la
 * fila propia (ADR 0007).
 */
function manualTimes(
  input: CreateManualEntryValues,
  workspace: TrackerWorkspace,
): { startedAt: Date; endedAt: Date } {
  const timeZone = workspace.timezone;
  const startedAt = instantFromLocal(input.date, input.start, timeZone);
  if (startedAt === null) {
    throw new TimeEntryError("validation", timeEntryMessages.nonexistentClock);
  }
  if (clockDifferenceMinutes(input.start, input.end) === 0) {
    throw new TimeEntryError("validation", timeEntryMessages.tooShort);
  }
  // El fin es la hora tecleada y no el inicio más la duración: con un cambio
  // de horario en el medio las dos cosas no coinciden.
  const endDay = endDayOf(input.date, input.start, input.end);
  // El día siguiente al 9999-12-31 no tiene clave de cuatro cifras: es la
  // fecha la que no sirve, no la hora.
  if (parseDayKey(endDay) === null) {
    throw new TimeEntryError("validation", timeEntryMessages.invalidDate);
  }
  const endedAt = instantFromLocal(endDay, input.end, timeZone);
  if (endedAt === null) {
    throw new TimeEntryError("validation", timeEntryMessages.nonexistentClock);
  }
  // Un día de cuatro cifras al oeste de Greenwich puede caer en el año 10000
  // UTC, que viaja a la base como "+010000-…" y la base no lo interpreta.
  if (isAfterYear9999(startedAt) || isAfterYear9999(endedAt)) {
    throw new TimeEntryError("validation", timeEntryMessages.invalidDate);
  }
  if (dayKey(startedAt, timeZone) < ENTRY_FLOOR_DAY_KEY) {
    throw new TimeEntryError("validation", timeEntryMessages.beforeFloor);
  }
  return { startedAt, endedAt };
}

/**
 * Agrega una entrada ya cerrada a partir de dos horas de pared. Es la única
 * escritura del módulo cuyos instantes no salen de `now()` de la base: nacen
 * de lo que la persona tecleó. Ver el ADR 0005. Un reintento con el mismo id
 * responde la entrada del primer intento sin escribir ni validar (ADR 0007).
 */
export async function createManualEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: CreateManualEntryValues,
): Promise<CreateManualEntryResult> {
  return closedEntryOnce(actor, workspace, input.id, async (tx) => {
    const times = manualTimes(input, workspace);
    const pair = pairOf(input);
    const project = await assertNewEntryPair(tx, actor, pair);
    await assertTaggable(tx, actor, input.tagIds);

    const created = await timeEntryRepository.insertClosed(tx, {
      id: input.id,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      description: input.description,
      ...pair,
      billable: billableOfNewEntry(input.billable, project),
      tagIds: input.tagIds,
      ...times,
    });
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.createManual",
      entity: AUDIT_ENTITY,
      entityId: created.id,
      nextValue: {
        description: created.description,
        projectId: created.projectId,
        taskId: created.taskId,
        billable: created.billable,
        tagIds: sortedTagIdsOf(created),
        startedAt: created.startedAt,
        endedAt: created.endedAt,
      },
    });
    return created;
  });
}

type ClosedEntryRow = TimeEntryRow & { readonly endedAt: Date };

function isClosed(row: TimeEntryRow): row is ClosedEntryRow {
  return row.endedAt !== null;
}

/** La fila, si está cerrada; la que corre se rechaza con `timer_running`: todavía no tiene fin. */
function requireClosed<Row extends TimeEntryRow>(row: Row): Row & ClosedEntryRow {
  if (!isClosed(row)) {
    throw new TimeEntryError("timer_running", timeEntryMessages.runningEntryTimes);
  }
  return row;
}

/**
 * Conservación del ADR 0006 sobre un extremo: el instante guardado si su
 * rótulo es el pedido; si no, la conversión de la hora de pared. `null` si esa
 * hora no existe (TT-112).
 */
function resolveExtreme(stored: Date, label: WallLabel, timeZone: string): Date | null {
  return sameLabel(stored, label, timeZone)
    ? stored
    : instantFromLocal(label.day, label.clock, timeZone);
}

/** El trío de la fila: día local del inicio y horas de pared canónicas, `HH:mm` de 24 h. */
type EntryTriple = {
  readonly date: string;
  readonly start: string;
  readonly end: string;
};

/**
 * El trío canónico de la fila: `dayKey` del inicio, y `formatClock` del inicio
 * y del fin en la zona de la persona. Es el mismo `dayDate`, `startClock` y
 * `endClock` de su vista, y nunca sale de `startLabel` ni de `endLabel`, que
 * son de presentación y pueden venir en 12 h.
 */
function tripleOf(row: ClosedEntryRow, timeZone: string): EntryTriple {
  return {
    date: dayKey(row.startedAt, timeZone),
    start: formatClock(row.startedAt, timeZone),
    end: formatClock(row.endedAt, timeZone),
  };
}

function sameTriple(left: EntryTriple, right: EntryTriple): boolean {
  return left.date === right.date && left.start === right.start && left.end === right.end;
}

function lastsAMinute(times: { startedAt: Date; endedAt: Date }): boolean {
  return durationSeconds(times.startedAt, times.endedAt) >= 60;
}

/**
 * Los instantes de un trío pedido sobre una entrada cerrada, con la regla del
 * ADR 0006: conservar lo que no cambió, descartarlo si el par queda corto y
 * validar la duración sobre instantes. Lanza `TimeEntryError` con el código de
 * cada rechazo.
 */
function resolveEntryTimes(
  row: ClosedEntryRow,
  input: EntryTriple,
  timeZone: string,
): { startedAt: Date; endedAt: Date } {
  const start: WallLabel = { day: input.date, clock: input.start };
  const end: WallLabel = {
    day: endDayOf(input.date, input.start, input.end),
    clock: input.end,
  };
  // El día siguiente al 9999-12-31 no tiene clave de cuatro cifras: es la
  // fecha la que no sirve, no la hora.
  if (parseDayKey(end.day) === null) {
    throw new TimeEntryError("validation", timeEntryMessages.invalidDate);
  }
  const startConverted = instantFromLocal(start.day, start.clock, timeZone);
  const endConverted = instantFromLocal(end.day, end.clock, timeZone);
  if (startConverted === null || endConverted === null) {
    throw new TimeEntryError("validation", timeEntryMessages.nonexistentClock);
  }
  const converted = { startedAt: startConverted, endedAt: endConverted };
  const conserved = {
    startedAt: sameLabel(row.startedAt, start, timeZone) ? row.startedAt : startConverted,
    endedAt: sameLabel(row.endedAt, end, timeZone) ? row.endedAt : endConverted,
  };
  // Un extremo conservado junto a uno convertido puede quedar fuera de orden
  // en la hora repetida, o a segundos del otro: el par convertido entero es
  // monótono.
  const times = lastsAMinute(conserved) ? conserved : converted;
  // Un día de cuatro cifras al oeste de Greenwich puede caer en el año 10000
  // UTC, que la base no interpreta. Solo lo alcanza un extremo convertido.
  if (isAfterYear9999(times.startedAt) || isAfterYear9999(times.endedAt)) {
    throw new TimeEntryError("validation", timeEntryMessages.invalidDate);
  }
  if (!lastsAMinute(times)) {
    throw new TimeEntryError("validation", timeEntryMessages.tooShort);
  }
  return times;
}

/**
 * La regla de horas de una fila (slice 3, ADR 0006): de la entrada cerrada y
 * el trío pedido, los instantes a escribir. La comparten la edición de una
 * fila y la masiva. Lanza `TimeEntryError` con `multiDayTimes`, `invalidDate`,
 * `nonexistentClock`, `tooShort` o `beforeFloor`.
 */
function entryTimesFor(
  row: ClosedEntryRow,
  triple: EntryTriple,
  workspace: TrackerWorkspace,
): { readonly startedAt: Date; readonly endedAt: Date } {
  const timeZone = workspace.timezone;
  // El trío no puede expresar esta entrada: guardarlo la truncaría.
  if (!hasEditableTimes(row, timeZone)) {
    throw new TimeEntryError("validation", timeEntryMessages.multiDayTimes);
  }
  const times = resolveEntryTimes(row, triple, timeZone);
  if (dayKey(times.startedAt, timeZone) < ENTRY_FLOOR_DAY_KEY) {
    throw new TimeEntryError("validation", timeEntryMessages.beforeFloor);
  }
  return times;
}

/**
 * Corrige el horario de una entrada cerrada desde el trío de la fila. Un
 * extremo cuyo día y hora no cambiaron conserva su instante (ADR 0006).
 */
export async function updateEntryTimes(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateEntryTimesInput,
): Promise<UpdateEntryTimesResult> {
  return db.transaction(async (tx) => {
    const row = requireClosed(
      await readOwnEntry(tx, actor, "timeEntry.own.update", input.id),
    );
    const times = entryTimesFor(row, input, workspace);

    const updated = await timeEntryRepository.updateClosedEntry(tx, targetOf(row), times);
    if (updated === undefined) {
      throw new TimeEntryError("timer_running", timeEntryMessages.runningEntryTimes);
    }
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.updateTimes",
      entity: AUDIT_ENTITY,
      entityId: updated.id,
      previousValue: { startedAt: row.startedAt, endedAt: row.endedAt },
      nextValue: { startedAt: updated.startedAt, endedAt: updated.endedAt },
    });

    return { entry: toView(updated, workspace) };
  });
}

/**
 * La regla del inicio del timer que corre (TT-28, TT-29, TT-112, ADR 0006
 * paso 1): conserva el instante si el rótulo no cambió, si no lo convierte.
 * Lanza `TimeEntryError` con `nonexistentClock`, `futureTime` o
 * `beforeFloor`.
 */
function runningStartFor(
  row: TimeEntryRow,
  requested: { readonly date: string; readonly start: string },
  workspace: TrackerWorkspace,
  now: Date,
): Date {
  const timeZone = workspace.timezone;
  // Conservar evita que reguardar el inicio sin cambios lo mueva al segundo
  // instante de la hora repetida (ADR 0006).
  const startedAt = resolveExtreme(
    row.startedAt,
    { day: requested.date, clock: requested.start },
    timeZone,
  );
  if (startedAt === null) {
    throw new TimeEntryError("validation", timeEntryMessages.nonexistentClock);
  }
  if (startedAt.getTime() > now.getTime()) {
    throw new TimeEntryError("validation", timeEntryMessages.futureTime);
  }
  if (dayKey(startedAt, timeZone) < ENTRY_FLOOR_DAY_KEY) {
    throw new TimeEntryError("validation", timeEntryMessages.beforeFloor);
  }
  return startedAt;
}

/**
 * Corrige desde cuándo corre el timer activo (TT-28). El día viaja con la hora:
 * un timer puede llevar días corriendo (TT-42).
 */
export async function updateRunningStart(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateRunningStartInput,
  now: Date = new Date(),
): Promise<UpdateRunningStartResult> {
  const updated = await db.transaction(async (tx) => {
    const row = await readOwnEntry(tx, actor, "timeEntry.own.update", input.id);
    if (row.endedAt !== null) {
      throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
    }
    const startedAt = runningStartFor(row, input, workspace, now);

    const next = await timeEntryRepository.updateRunningEntry(tx, targetOf(row), {
      startedAt,
    });
    if (next === undefined) {
      throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
    }
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.updateStart",
      entity: AUDIT_ENTITY,
      entityId: next.id,
      previousValue: { startedAt: row.startedAt },
      nextValue: { startedAt: next.startedAt },
    });
    return next;
  });
  return { running: toView(updated, workspace) };
}

type UpdateEntryChangeValues = UpdateEntryValues["changes"];

/**
 * Lo que `updateEntry` cambia de una entrada cerrada, sin el par: la
 * descripción y el trío con la regla de la masiva, que es la de
 * `updateEntryTimes`. El inicio de un timer sobre ella es CAL-41.
 */
function closedEntryEdit(
  row: ClosedEntryRow,
  changes: UpdateEntryChangeValues,
  workspace: TrackerWorkspace,
): ClosedFields {
  if (changes.runningStart !== undefined) {
    throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
  }
  return editedFields(
    row,
    { description: changes.description, ...changes.times },
    workspace,
  );
}

/**
 * Lo que `updateEntry` cambia del timer que corre, sin el par: la descripción
 * y el inicio con la regla de `updateRunningStart`. Un inicio con el mismo
 * rótulo no se evalúa (ADR 0013). El trío sobre él es TT-111.
 */
function runningEntryEdit(
  row: TimeEntryRow,
  changes: UpdateEntryChangeValues,
  workspace: TrackerWorkspace,
  now: Date,
): RunningEntryFields {
  if (changes.times !== undefined) {
    throw new TimeEntryError("timer_running", timeEntryMessages.runningEntryTimes);
  }
  const start = changes.runningStart;
  const startedAt =
    start === undefined ||
    sameLabel(row.startedAt, { day: start.date, clock: start.start }, workspace.timezone)
      ? null
      : runningStartFor(row, start, workspace, now);
  return {
    ...descriptionChange(row, changes.description),
    ...(startedAt === null ? {} : { startedAt }),
  };
}

/** Lo que un pedido pide a una fila en el par, el facturable y las etiquetas. */
type AssignmentRequest = {
  readonly project?: ProjectPair;
  readonly billable?: boolean;
  /** El conjunto entero que la fila debería tener. */
  readonly tagIds?: readonly string[];
};

/** Lo que cambia en una fila y lo que hay que validar para eso, sin consultar nada. */
type AssignmentPlan = {
  /** El par pedido, si difiere del de la fila (`samePair`). */
  readonly pair?: ProjectPair;
  /** `pairToCheck(fila, pedido)` cuando hay `pair`; `null` si no hay nada que validar. */
  readonly pairCheck: {
    readonly projectId: string;
    readonly taskId: string | null;
  } | null;
  readonly billable?: boolean;
  /** El conjunto pedido, si difiere del de la fila (`sameTagIds`). */
  readonly tagIds?: readonly string[];
  /** `tagsToCheck(fila, conjunto)`: las que la fila todavía no tiene. */
  readonly tagsCheck: readonly string[];
};

/**
 * Fase 1 de la regla del par, el facturable y las etiquetas (ADR 0017), pura:
 * qué cambia en la fila y qué hay que validar para eso. Lo que la fila ya
 * tiene no se valida (TT-104, PR-47). Lanza `validation` con `tooManyTags` si
 * el conjunto pasa de `TAGS_MAX` (D-4): depende de la fila, así que en la
 * masiva es un rechazo; en `updateEntry` Zod ya acota el conjunto.
 */
function assignmentPlan(row: EntryWithRefs, request: AssignmentRequest): AssignmentPlan {
  const current = pairOf(row);
  const pair =
    request.project === undefined || samePair(current, request.project)
      ? undefined
      : pairOf(request.project);
  const currentTags = sortedTagIdsOf(row);
  const tagIds =
    request.tagIds === undefined || sameTagIds(currentTags, request.tagIds)
      ? undefined
      : request.tagIds;
  if (tagIds !== undefined && tagIds.length > TAGS_MAX) {
    throw new TimeEntryError("validation", timeEntryMessages.tooManyTags);
  }
  return {
    ...(pair === undefined ? {} : { pair }),
    pairCheck: pair === undefined ? null : pairToCheck(current, pair),
    ...(request.billable === undefined ? {} : { billable: request.billable }),
    ...(tagIds === undefined ? {} : { tagIds }),
    tagsCheck: tagIds === undefined ? [] : tagsToCheck(currentTags, tagIds),
  };
}

/**
 * Fase 2: las validaciones de `project` (ADR 0010), una vez por pedido y para
 * el pedido entero, no plan por plan: primero el par —el `pairCheck` de
 * cualquier plan que lo pida, todos iguales porque `pairToCheck` devuelve el
 * pedido— y después la unión de los `tagsCheck`, que `assertTaggable` no
 * consulta si queda vacía. Es el orden de `updateEntry`. Devuelve el proyecto
 * validado, o `null` si ningún plan lo pidió.
 */
async function assertAssignments(
  tx: Transaction,
  actor: Actor,
  plans: readonly AssignmentPlan[],
): Promise<TrackableProject | null> {
  const pairCheck = plans.find((plan) => plan.pairCheck !== null)?.pairCheck ?? null;
  const project = pairCheck === null ? null : await assertTrackable(tx, actor, pairCheck);
  await assertTaggable(tx, actor, normalizedIds(plans.flatMap((plan) => plan.tagsCheck)));
  return project;
}

/**
 * Fase 3, pura: lo que se escribe. El facturable es el pedido o, sin él,
 * `billableFor` con el proyecto validado (D-2), y solo si difiere del de la
 * fila: uno igual no cuenta como cambio.
 */
function assignmentFields(
  row: TimeEntryRow,
  plan: AssignmentPlan,
  project: TrackableProject | null,
): Pick<ClosedEntryFields, "pair" | "billable" | "tagIds"> {
  const billable =
    plan.billable ?? billableFor(row, plan.pairCheck === null ? null : project);
  return {
    ...(plan.pair === undefined ? {} : { pair: plan.pair }),
    ...(billable === row.billable ? {} : { billable }),
    ...(plan.tagIds === undefined ? {} : { tagIds: plan.tagIds }),
  };
}

/** Las tres fases sobre la fila de `updateEntry`, que es un pedido de un solo plan. */
async function entryAssignment(
  tx: Transaction,
  actor: Actor,
  row: EntryWithRefs,
  changes: UpdateEntryChangeValues,
): Promise<Pick<ClosedEntryFields, "pair" | "billable" | "tagIds">> {
  const plan = assignmentPlan(row, {
    project: changes.project,
    billable: changes.billable,
    tagIds: changes.tags,
  });
  const project = await assertAssignments(tx, actor, [plan]);
  return assignmentFields(row, plan, project);
}

/**
 * La única escritura de `updateEntry` y su constancia. Sin campos, la fila tal
 * cual: ni escritura ni constancia, así el reintento llega a un punto fijo.
 */
async function writeEntryEdit<Fields extends RunningEntryFields>(
  tx: Transaction,
  actor: Actor,
  row: EntryWithRefs,
  fields: Fields,
  write: (fields: Fields) => Promise<EntryWithRefs | undefined>,
  lost: () => TimeEntryError,
): Promise<EntryWithRefs> {
  if (Object.keys(fields).length === 0) {
    return row;
  }
  const written = await write(fields);
  if (written === undefined) {
    throw lost();
  }
  await recordAudit(tx, {
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    action: "timeEntry.update",
    entity: AUDIT_ENTITY,
    entityId: written.id,
    previousValue: valuesOf(row, fields),
    nextValue: valuesOf(written, fields),
  });
  return written;
}

/**
 * El guardado del diálogo de una entrada (ADR 0013): los grupos de campos que
 * la persona tocó, todo o nada. Cada grupo pasa por la regla de su mutación de
 * un campo, en este orden: el estado de la fila, la descripción y el horario,
 * el par, el facturable y las etiquetas. Lo que no cambió no se escribe.
 */
export async function updateEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateEntryValues,
  now: Date = new Date(),
): Promise<UpdateEntryResult> {
  const { changes } = input;
  const entry = await translatingReferenceConstraints(() =>
    db.transaction(async (tx) => {
      const row = await readOwnEntry(tx, actor, "timeEntry.own.update", input.id);
      const target = targetOf(row);
      if (isClosed(row)) {
        const fields = closedEntryEdit(row, changes, workspace);
        const assignment = await entryAssignment(tx, actor, row, changes);
        return writeEntryEdit(
          tx,
          actor,
          row,
          { ...fields, ...assignment },
          (written) => timeEntryRepository.updateClosedEntry(tx, target, written),
          () => new TimeEntryError("timer_running", timeEntryMessages.runningEntryTimes),
        );
      }
      const fields = runningEntryEdit(row, changes, workspace, now);
      const assignment = await entryAssignment(tx, actor, row, changes);
      return writeEntryEdit(
        tx,
        actor,
        row,
        { ...fields, ...assignment },
        (written) => timeEntryRepository.updateRunningEntry(tx, target, written),
        () => new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped),
      );
    }),
  );
  return { entry: toView(entry, workspace) };
}

/**
 * Evalúa cada id pedido, en el orden pedido, sin escribir. Un `TimeEntryError`
 * es el rechazo de esa fila y cualquier otro error sale tal cual. Con algún
 * rechazo no se aplica nada: lanza `RejectedError` con todos (ADR 0011).
 */
function evaluateAll<Plan>(
  ids: readonly string[],
  evaluate: (id: string) => Plan | null,
  rejectedMessage: string,
): Plan[] {
  const plans: Plan[] = [];
  const rejections: Rejection<TimeEntryErrorCode>[] = [];
  for (const id of ids) {
    try {
      const plan = evaluate(id);
      if (plan !== null) {
        plans.push(plan);
      }
    } catch (error) {
      if (!(error instanceof TimeEntryError)) {
        throw error;
      }
      rejections.push({ id, code: error.code, message: error.message });
    }
  }
  if (rejections.length > 0) {
    throw new RejectedError(rejectedMessage, rejections);
  }
  return plans;
}

/** Las filas leídas de una operación en masa, por id. */
async function lockEntries(
  tx: Transaction,
  actor: Actor,
  ids: readonly string[],
): Promise<ReadonlyMap<string, EntryWithRefs>> {
  const rows = await timeEntryRepository.findManyByIdsForUpdate(
    tx,
    actor.workspaceId,
    ids,
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * El trío pedido: el de la fila con los campos que vienen reemplazados. `null`
 * si no viene ninguno, o si queda igual al de la fila: como el editor de la
 * fila, que no manda un trío sin cambios, así una entrada de más de un día no
 * se rechaza por pedirle la fecha que ya tiene.
 */
function requestedTriple(
  row: ClosedEntryRow,
  changes: BulkEditChanges,
  timeZone: string,
): EntryTriple | null {
  if (
    changes.date === undefined &&
    changes.start === undefined &&
    changes.end === undefined
  ) {
    return null;
  }
  const current = tripleOf(row, timeZone);
  const requested = {
    date: changes.date ?? current.date,
    start: changes.start ?? current.start,
    end: changes.end ?? current.end,
  };
  return sameTriple(requested, current) ? null : requested;
}

/** La descripción pedida, si viene y difiere de la de la fila. */
function descriptionChange(
  row: TimeEntryRow,
  description: string | undefined,
): { readonly description?: string } {
  return description === undefined || description === row.description
    ? {}
    : { description };
}

/** Los campos que cambian en una fila cerrada; los instantes, con la regla de `updateEntryTimes`. */
function editedFields(
  row: ClosedEntryRow,
  changes: BulkEditChanges,
  workspace: TrackerWorkspace,
): ClosedFields {
  const triple = requestedTriple(row, changes, workspace.timezone);
  const times = triple === null ? null : entryTimesFor(row, triple, workspace);
  return {
    ...descriptionChange(row, changes.description),
    ...(times === null || times.startedAt.getTime() === row.startedAt.getTime()
      ? {}
      : { startedAt: times.startedAt }),
    ...(times === null || times.endedAt.getTime() === row.endedAt.getTime()
      ? {}
      : { endedAt: times.endedAt }),
  };
}

/** La escritura cambia algo: sin campos, la fila no se escribe ni deja constancia. */
function hasFields(fields: ClosedEntryFields): boolean {
  return Object.keys(fields).length > 0;
}

/** Los valores de la fila en los campos que cambiaron, para la constancia. */
function valuesOf(row: EntryWithRefs, fields: ClosedEntryFields) {
  return {
    ...(fields.description === undefined ? {} : { description: row.description }),
    ...(fields.pair === undefined
      ? {}
      : { projectId: row.projectId, taskId: row.taskId }),
    ...(fields.billable === undefined ? {} : { billable: row.billable }),
    ...(fields.tagIds === undefined ? {} : { tagIds: sortedTagIdsOf(row) }),
    ...(fields.startedAt === undefined ? {} : { startedAt: row.startedAt }),
    ...(fields.endedAt === undefined ? {} : { endedAt: row.endedAt }),
  };
}

/**
 * El pedido de la masiva sobre una fila (§4.3 del contrato del 12): el par y el
 * facturable tal cual, y el conjunto que `tagsAfter` da sobre lo que la fila
 * tiene, leído bajo el bloqueo.
 */
function bulkAssignmentRequest(
  row: EntryWithRefs,
  changes: BulkEditChanges,
): AssignmentRequest {
  return {
    project: changes.project,
    billable: changes.billable,
    tagIds:
      changes.tags === undefined
        ? undefined
        : tagsAfter(sortedTagIdsOf(row), changes.tags),
  };
}

/**
 * TT-63: la descripción, la fecha, las horas, el par, el facturable y las
 * etiquetas de varias entradas cerradas, todo o nada (ADR 0011). Cada fila
 * pasa por la regla de `updateEntryTimes` y por las tres fases de
 * `updateEntry`; las referencias pedidas se validan una vez, después de las
 * filas (ADR 0017). Una fila que no cambia no se escribe ni deja constancia.
 */
export async function bulkEditEntries(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: BulkEditEntriesValues,
): Promise<BulkEditEntriesResult> {
  // Antes de leer: una membresía desactivada recibe `forbidden` para todo el
  // pedido, y no un rechazo por fila.
  if (!can(actor, "timeEntry.own.update", ownTimeEntryResource(actor))) {
    throw new TimeEntryError("forbidden", timeEntryMessages.forbidden);
  }
  const { changes } = input;
  return translatingReferenceConstraints(() =>
    db.transaction(async (tx) => {
      const found = await lockEntries(tx, actor, input.ids);
      const plans = evaluateAll(
        input.ids,
        (id) => {
          const row = requireClosed(
            authorizeEntry(actor, "timeEntry.own.update", found.get(id)),
          );
          return {
            row,
            fields: editedFields(row, changes, workspace),
            assignment: assignmentPlan(row, bulkAssignmentRequest(row, changes)),
          };
        },
        timeEntryMessages.bulkEditRejected,
      );
      const project = await assertAssignments(
        tx,
        actor,
        plans.map((plan) => plan.assignment),
      );
      const edits = plans.map(({ row, fields, assignment }) => ({
        row,
        fields: { ...fields, ...assignmentFields(row, assignment, project) },
      }));
      const changed = edits.filter(({ fields }) => hasFields(fields));
      const written = await timeEntryRepository.updateClosedEntries(
        tx,
        changed.map(({ row, fields }) => ({ target: targetOf(row), fields })),
      );
      if (written === undefined) {
        throw new Error("Una entrada no se escribió con su bloqueo tomado.");
      }
      const writtenById = new Map(written.map((entry) => [entry.id, entry]));
      const writtenOf = (row: EntryWithRefs) => {
        const entry = writtenById.get(row.id);
        if (entry === undefined) {
          throw new Error(`La entrada ${row.id} no volvió de su escritura.`);
        }
        return entry;
      };
      await recordAudits(
        tx,
        changed.map(({ row, fields }) => ({
          workspaceId: actor.workspaceId,
          actorId: actor.userId,
          action: "timeEntry.bulkEdit",
          entity: AUDIT_ENTITY,
          entityId: row.id,
          previousValue: valuesOf(row, fields),
          nextValue: valuesOf(writtenOf(row), fields),
        })),
      );
      return {
        entries: edits.map(({ row, fields }) =>
          toView(hasFields(fields) ? writtenOf(row) : row, workspace),
        ),
      };
    }),
  );
}

/**
 * TT-64: borra varias entradas cerradas, todo o nada (ADR 0011). Una que ya
 * no existe no es un rechazo: lo pedido ya se cumple, y así el reintento de un
 * borrado aplicado responde éxito.
 */
export async function bulkDeleteEntries(
  actor: Actor,
  input: BulkDeleteEntriesValues,
): Promise<BulkDeleteEntriesResult> {
  // Antes de leer: sin esto, una membresía desactivada recibiría éxito por
  // ids que no existen.
  if (!can(actor, "timeEntry.own.delete", ownTimeEntryResource(actor))) {
    throw new TimeEntryError("forbidden", timeEntryMessages.forbidden);
  }
  return db.transaction(async (tx) => {
    const found = await lockEntries(tx, actor, input.ids);
    const authorized = evaluateAll(
      input.ids,
      (id) => {
        const row = found.get(id);
        return row === undefined
          ? null
          : requireClosed(authorizeEntry(actor, "timeEntry.own.delete", row));
      },
      timeEntryMessages.bulkDeleteRejected,
    );
    const removed = await timeEntryRepository.deleteClosedByIds(
      tx,
      authorized.map(targetOf),
    );
    if (removed.length !== authorized.length) {
      throw new Error("El borrado masivo no coincide con las filas bloqueadas.");
    }
    await recordAudits(
      tx,
      removed.map((row) => ({
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: "timeEntry.bulkDelete",
        entity: AUDIT_ENTITY,
        entityId: row.id,
        // El borrado es físico y la unión se va en cascada: esta es la única
        // copia que queda de la fila y de sus etiquetas (TT-61).
        previousValue: { ...row, tagIds: sortedTagIdsOfLocked(found, row.id) },
      })),
    );
    return { ids: input.ids };
  });
}

/** Las etiquetas de una fila borrada en masa, leídas bajo bloqueo antes del borrado. */
function sortedTagIdsOfLocked(
  found: ReadonlyMap<string, EntryWithRefs>,
  id: string,
): string[] {
  const row = found.get(id);
  if (row === undefined) {
    throw new Error(`La entrada ${id} se borró sin haberse leído bajo bloqueo.`);
  }
  return sortedTagIdsOf(row);
}

type WindowFloors = {
  /** Primer día de la semana más vieja que se dibuja. */
  readonly windowFrom: string;
  /** El mismo piso sin el aporte del timer activo (P-15). */
  readonly reachFrom: string;
};

/**
 * Los pisos de la lista, en semanas enteras para que el total de la semana más
 * vieja sea el de verdad (TT-52). El día de partida es el menor entre 13 días
 * atrás, el de la última entrada cerrada que empezó antes de `now` y el `desde`
 * pedido, que solo extiende (ADR 0008); nunca antes del piso de carga. Una
 * entrada futura no cuenta, porque acercaría el piso y escondería las viejas.
 * El timer activo extiende solo `windowFrom`: la lista lo dibuja mientras
 * corre, y en cuanto se detiene, la ventana es `reachFrom`.
 */
function windowFloors(
  workspace: TrackerWorkspace,
  todayKey: string,
  latestPast: TimeEntryRow | undefined,
  running: TimeEntryRow | undefined,
  from: string | null,
): WindowFloors {
  const timeZone = workspace.timezone;
  const candidates: [string, ...string[]] = [
    addDaysToKey(todayKey, -(TRACKER_WINDOW_DAYS - 1)),
  ];
  if (latestPast !== undefined) {
    candidates.push(dayKey(latestPast.startedAt, timeZone));
  }
  if (from !== null) {
    candidates.push(from);
  }
  const earliest = earliestDayKey(...candidates);
  const reachDay = earliest < ENTRY_FLOOR_DAY_KEY ? ENTRY_FLOOR_DAY_KEY : earliest;
  const windowDay =
    running === undefined
      ? reachDay
      : earliestDayKey(reachDay, dayKey(running.startedAt, timeZone));
  return {
    windowFrom: weekStartKey(windowDay, workspace.weekStart),
    reachFrom: weekStartKey(reachDay, workspace.weekStart),
  };
}

/**
 * Instante hasta el que llega la lista. Se estira hasta el fin del día de la
 * entrada cerrada más nueva cuando esa entrada es futura: con `now` de tope,
 * una entrada posterior a hoy no se vería nunca. Es el fin del día y no el
 * instante porque la consulta usa `<` en la cota superior.
 */
function windowEnd(
  now: Date,
  timeZone: string,
  latestClosed: TimeEntryRow | undefined,
): Date {
  if (latestClosed === undefined) {
    return now;
  }
  const endOfDay = dayBounds(latestClosed.startedAt, timeZone).end;
  return endOfDay.getTime() > now.getTime() ? endOfDay : now;
}

function buildDays(
  rows: readonly EntryWithRefs[],
  running: EntryWithRefs | undefined,
  now: Date,
  workspace: TrackerWorkspace,
): DayGroupView[] {
  const timeZone = workspace.timezone;
  const runningDay = running === undefined ? null : dayKey(running.startedAt, timeZone);
  const byDate = new Map<string, { instant: Date; entries: TimeEntryView[] }>();

  if (running !== undefined && runningDay !== null) {
    // El grupo del timer activo existe siempre, aunque no tenga entradas
    // cerradas: es donde el cliente suma el transcurrido.
    byDate.set(runningDay, { instant: running.startedAt, entries: [] });
  }
  for (const row of rows) {
    const date = dayKey(row.startedAt, timeZone);
    const group = byDate.get(date) ?? { instant: row.startedAt, entries: [] };
    group.entries.push(toView(row, workspace));
    byDate.set(date, group);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([date, group]) => {
      const closedSeconds = group.entries.reduce(
        (total, entry) => total + (entry.durationSeconds ?? 0),
        0,
      );
      return {
        date,
        label: dayLabel(group.instant, now, timeZone, workspace.formats.date),
        isRunningDay: date === runningDay,
        closedSeconds,
        entries: group.entries,
      };
    });
}

/**
 * Los días, ya ordenados del más reciente al más viejo, agrupados por la semana
 * de la persona (TT-47, TT-48). Una semana sin días no aparece (TT-86); la del
 * timer activo siempre tiene el día del timer. Una entrada cuenta entera en la
 * semana del día en que empieza (TT-96).
 */
function buildWeeks(
  days: readonly DayGroupView[],
  running: TimeEntryRow | undefined,
  todayKey: string,
  workspace: TrackerWorkspace,
): WeekGroupView[] {
  const runningWeek = running === undefined ? null : weekOf(running.startedAt, workspace);
  const byStart = new Map<string, DayGroupView[]>();
  for (const day of days) {
    const start = weekStartKey(day.date, workspace.weekStart);
    const weekDays = byStart.get(start) ?? [];
    weekDays.push(day);
    byStart.set(start, weekDays);
  }

  return [...byStart.entries()].map(([start, weekDays]) => ({
    start,
    label: weekKeyLabel(start, todayKey, workspace.weekStart, workspace.formats.date),
    isRunningWeek: start === runningWeek,
    closedSeconds: weekDays.reduce((total, day) => total + day.closedSeconds, 0),
    days: weekDays,
  }));
}

/**
 * El `desde` de «Cargar más»: la semana de la entrada más reciente anterior a
 * la ventana (TT-52, TT-86), sin recorrer las semanas vacías del medio. `null`
 * si no hay ninguna; si es anterior a la semana del piso de carga, porque ese
 * `desde` se recortaría a la misma ventana; o si su semana no queda antes de
 * `windowFrom`, la red de seguridad contra un inicio de día mal ubicado: el
 * enlace no extendería nada.
 */
function loadMoreFromOf(
  older: TimeEntryRow | undefined,
  windowFrom: string,
  floorWeek: string,
  workspace: TrackerWorkspace,
): string | null {
  if (older === undefined) {
    return null;
  }
  if (dayKey(older.startedAt, workspace.timezone) < floorWeek) {
    return null;
  }
  const week = weekOf(older.startedAt, workspace);
  return week < windowFrom ? week : null;
}

/**
 * Estado completo del rastreador. `request.from` es el `desde` de la URL, ya
 * validado (ADR 0008). `now` existe para que los tests fijen el día: ninguna
 * escritura lo usa.
 */
export async function getTrackerState(
  actor: Actor,
  workspace: TrackerWorkspace,
  request: { readonly from: string | null },
  now: Date = new Date(),
): Promise<TrackerState> {
  const timeZone = workspace.timezone;
  const todayKey = dayKey(now, timeZone);
  const floorWeek = weekStartKey(ENTRY_FLOOR_DAY_KEY, workspace.weekStart);
  // Las lecturas salen del mismo snapshot. Con `read committed` cada
  // sentencia ve uno nuevo, y una mutación que commitea en el medio deja
  // estados que la sección 5 declara imposibles: `hasAnyEntry` en verdadero con
  // la lista vacía, o la misma entrada en `running` y en `weeks`.
  const { running, latestClosed, latestPast, closed, floors, older } =
    await db.transaction(
      async (tx) => {
        // Secuenciales a propósito: todas comparten la única conexión de la
        // transacción, así que lanzarlas juntas las encolaría igual y solo haría
        // parecer que viajan en paralelo.
        const current = await timeEntryRepository.findRunning(
          actor.workspaceId,
          actor.userId,
          tx,
        );
        // La más nueva de todas estira el extremo superior; la más reciente de
        // las pasadas, el inferior.
        const latest = await timeEntryRepository.findLatestClosed(
          actor.workspaceId,
          actor.userId,
          tx,
        );
        const past = await timeEntryRepository.findLatestClosedBefore(
          actor.workspaceId,
          actor.userId,
          now,
          tx,
        );
        const window = windowFloors(workspace, todayKey, past, current, request.from);
        const lower = startOfDayKey(window.windowFrom, timeZone);
        const entries = await timeEntryRepository.listClosedBetween(
          actor.workspaceId,
          actor.userId,
          lower,
          windowEnd(now, timeZone, latest),
          tx,
        );
        // La próxima semana con entradas, para «Cargar más» (TT-52, TT-86). Con
        // la ventana ya en la semana del piso, `loadMoreFromOf` daría `null` con
        // cualquier fila: la consulta se ahorra.
        const next =
          window.windowFrom > floorWeek
            ? await timeEntryRepository.findLatestClosedBefore(
                actor.workspaceId,
                actor.userId,
                lower,
                tx,
              )
            : undefined;
        return {
          running: current,
          latestClosed: latest,
          latestPast: past,
          closed: entries,
          floors: window,
          older: next,
        };
      },
      { isolationLevel: "repeatable read" },
    );

  return {
    serverNow: now.toISOString(),
    timeZone,
    todayKey,
    minDayKey: ENTRY_FLOOR_DAY_KEY,
    canTrack: can(actor, "timeEntry.own.create", ownTimeEntryResource(actor)),
    running: running === undefined ? null : toView(running, workspace),
    lastEntryId: latestPast === undefined ? null : latestPast.id,
    weeks: buildWeeks(
      buildDays(closed, running, now, workspace),
      running,
      todayKey,
      workspace,
    ),
    windowFrom: floors.windowFrom,
    reachFrom: floors.reachFrom,
    loadMoreFrom: loadMoreFromOf(older, floors.windowFrom, floorWeek, workspace),
    hasAnyEntry: running !== undefined || latestClosed !== undefined,
  };
}

export type CalendarRequest = {
  readonly mode: CalendarMode;
  /** El `semana` de la URL ya validado, o `null`. */
  readonly day: string | null;
};

/** Días de cada vista: lo que mueven las flechas (CAL-15). */
const PERIOD_LENGTH: Record<CalendarMode, number> = { week: 7, day: 1 };

type CalendarPeriod = {
  readonly mode: CalendarMode;
  readonly start: string;
  readonly days: readonly string[];
  /** El día siguiente al último: su inicio es la cota superior de la lectura. */
  readonly end: string;
};

/** El período de la vista que contiene ese día: su semana, o el día solo. */
function periodOf(
  anchor: string,
  mode: CalendarMode,
  weekStart: WeekStart,
): CalendarPeriod {
  const start = mode === "week" ? weekStartKey(anchor, weekStart) : anchor;
  const length = PERIOD_LENGTH[mode];
  return {
    mode,
    start,
    days: Array.from({ length }, (_, index) => addDaysToKey(start, index)),
    end: addDaysToKey(start, length),
  };
}

function isWholeDayMissing(day: string, timeZone: string): boolean {
  return nonexistentMinutes(day, timeZone).some(
    (range) => range.from === 0 && range.to === MINUTES_PER_DAY,
  );
}

/**
 * CAL-17: el período tiene anterior y siguiente con claves de cuatro cifras,
 * y ningún día suyo, ni el siguiente al último, falta entero en la zona: sin
 * eso `startOfDayKey` lanza por un parámetro de la URL. Con el siguiente
 * dentro del 9999, el inicio del día posterior al último tampoco pasa de ese
 * año en UTC: ninguna zona se aparta 24 h.
 */
function isNavigable(period: CalendarPeriod, timeZone: string): boolean {
  const length = PERIOD_LENGTH[period.mode];
  if (
    parseDayKey(addDaysToKey(period.start, -length)) === null ||
    parseDayKey(addDaysToKey(period.end, length - 1)) === null
  ) {
    return false;
  }
  return ![...period.days, period.end].some((day) => isWholeDayMissing(day, timeZone));
}

/**
 * El período que se muestra —el pedido, o el que contiene hoy si el pedido no
 * se puede navegar— y el que contiene hoy, el destino de «Hoy».
 */
function calendarPeriodsOf(
  request: CalendarRequest,
  todayKey: string,
  workspace: TrackerWorkspace,
): { readonly shown: CalendarPeriod; readonly current: CalendarPeriod } {
  const current = periodOf(todayKey, request.mode, workspace.weekStart);
  if (request.day === null) {
    return { shown: current, current };
  }
  const requested = periodOf(request.day, request.mode, workspace.weekStart);
  return {
    shown: isNavigable(requested, workspace.timezone) ? requested : current,
    current,
  };
}

/**
 * Cada día suma entera la entrada cerrada que empieza en él, aunque termine
 * en otro (CAL-32, P-02): el mismo corte que el rastreador.
 */
function calendarDays(
  period: CalendarPeriod,
  entries: readonly TimeEntryView[],
  todayKey: string,
  workspace: TrackerWorkspace,
): CalendarDayView[] {
  return period.days.map((date) => ({
    date,
    label: weekdayLabel(date, todayKey, workspace.formats.date),
    isToday: date === todayKey,
    beforeFloor: date < ENTRY_FLOOR_DAY_KEY,
    closedSeconds: entries
      .filter((entry) => entry.dayDate === date)
      .reduce((total, entry) => total + (entry.durationSeconds ?? 0), 0),
    missingMinutes: [...nonexistentMinutes(date, workspace.timezone)],
  }));
}

/**
 * Estado del calendario (CAL-02): las cerradas propias que se superponen con el
 * período y el timer aparte. `request.day` es el `semana` de la URL, ya
 * validado. `now` existe para que los tests fijen el día.
 */
export async function getCalendarState(
  actor: Actor,
  workspace: TrackerWorkspace,
  request: CalendarRequest,
  now: Date = new Date(),
): Promise<CalendarState> {
  const timeZone = workspace.timezone;
  const todayKey = dayKey(now, timeZone);
  const { shown: period, current } = calendarPeriodsOf(request, todayKey, workspace);
  const from = startOfDayKey(period.start, timeZone);
  const to = startOfDayKey(period.end, timeZone);
  // El mismo snapshot para las dos lecturas, como en `getTrackerState`: una
  // parada que commitea en el medio dejaría la entrada como timer y como
  // cerrada a la vez.
  const { running, closed } = await db.transaction(
    async (tx) => {
      const current = await timeEntryRepository.findRunning(
        actor.workspaceId,
        actor.userId,
        tx,
      );
      const entries = await timeEntryRepository.listClosedOverlapping(
        actor.workspaceId,
        actor.userId,
        from,
        to,
        tx,
      );
      return { running: current, closed: entries };
    },
    { isolationLevel: "repeatable read" },
  );

  const entries = closed.map((row) => toView(row, workspace));
  const days = calendarDays(period, entries, todayKey, workspace);
  return {
    serverNow: now.toISOString(),
    todayKey,
    minDayKey: ENTRY_FLOOR_DAY_KEY,
    nowMinute: minuteOfDayIn(now, timeZone),
    canTrack: can(actor, "timeEntry.own.create", ownTimeEntryResource(actor)),
    mode: period.mode,
    periodStart: period.start,
    periodLabel:
      period.mode === "week"
        ? weekKeyLabel(
            period.start,
            todayKey,
            workspace.weekStart,
            workspace.formats.date,
          )
        : dayKeyLabel(period.start, todayKey, workspace.formats.date),
    previousStart: addDaysToKey(period.start, -PERIOD_LENGTH[period.mode]),
    nextStart: period.end,
    todayStart: current.start,
    dayModeStart: period.days.includes(todayKey) ? todayKey : period.start,
    weekModeStart: weekStartKey(period.start, workspace.weekStart),
    days,
    entries,
    running: running === undefined ? null : toView(running, workspace),
    closedSeconds: days.reduce((total, day) => total + day.closedSeconds, 0),
  };
}

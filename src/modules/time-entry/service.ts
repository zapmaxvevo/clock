import { db, type Transaction } from "@/server/db";
import { recordAudit } from "@/server/audit";
import { createOnce, type ConflictOutcome } from "@/server/create-once";
import { can, type Action, type Actor } from "@/server/permissions";
import {
  addDaysToKey,
  clockDifferenceMinutes,
  crossesMidnight,
  dayBounds,
  dayKey,
  dayLabel,
  durationSeconds,
  extraDays,
  formatClock,
  formatDuration,
  instantFromLocal,
  isAfterYear9999,
  parseDayKey,
  startOfDayBefore,
  startOfLocalDay,
} from "@/server/time";

import { timeEntryRepository, type EntryTarget, type TimeEntryRow } from "./repository";
import {
  timeEntryMessages,
  TRACKER_WINDOW_DAYS,
  type CreateManualEntryResult,
  type CreateManualEntryValues,
  type DeleteEntryInput,
  type DeleteEntryResult,
  type DayGroupView,
  type StartTimerValues,
  type StartTimerResult,
  type StopTimerInput,
  type StopTimerResult,
  type TimeEntryErrorCode,
  type TimeEntryView,
  type TrackerState,
  type UpdateDescriptionInput,
  type UpdateDescriptionResult,
} from "./schema";

/** Error de dominio del módulo. La action lo traduce a un resultado tipado. */
export class TimeEntryError extends Error {
  constructor(
    readonly code: TimeEntryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TimeEntryError";
  }
}

const AUDIT_ENTITY = "time_entry";

/** Lo que el módulo usa del workspace de la sesión: la zona y el piso de carga. */
export type TrackerWorkspace = {
  readonly timezone: string;
  readonly createdAt: Date;
};

/**
 * Primer día en que se pueden cargar horas: el día local de creación del
 * workspace. La validación del service y el calendario de la barra lo toman de
 * acá, así que los dos dicen lo mismo.
 */
function workspaceFloorDayKey(workspace: TrackerWorkspace): string {
  return dayKey(workspace.createdAt, workspace.timezone);
}

function toView(row: TimeEntryRow, timeZone: string): TimeEntryView {
  const endedAt = row.endedAt;
  const seconds = endedAt === null ? null : durationSeconds(row.startedAt, endedAt);
  return {
    id: row.id,
    description: row.description,
    startedAt: row.startedAt.toISOString(),
    endedAt: endedAt === null ? null : endedAt.toISOString(),
    dayDate: dayKey(row.startedAt, timeZone),
    startLabel: formatClock(row.startedAt, timeZone),
    endLabel: endedAt === null ? null : formatClock(endedAt, timeZone),
    extraDays: endedAt === null ? 0 : extraDays(row.startedAt, endedAt, timeZone),
    durationSeconds: seconds,
    durationLabel: seconds === null ? null : formatDuration(Math.floor(seconds / 60)),
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
 * Lee la entrada y decide el acceso sobre su dueño real. Un id de otro
 * workspace nunca llega acá: el repository ya lo dejó fuera.
 */
async function readOwnEntry(
  tx: Transaction,
  actor: Actor,
  action: Action,
  id: string,
): Promise<TimeEntryRow> {
  const row = await timeEntryRepository.findByIdForUpdate(tx, actor.workspaceId, id);
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

/** La fila, tal como se leyó y autorizó. Es lo único que identifica una escritura. */
function targetOf(row: TimeEntryRow): EntryTarget {
  return { workspaceId: row.workspaceId, userId: row.userId, id: row.id };
}

/** Cierra la entrada abierta dentro de la transacción y deja constancia. */
async function closeRunning(
  tx: Transaction,
  actor: Actor,
  row: TimeEntryRow,
): Promise<TimeEntryRow | undefined> {
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
  winner: (row: TimeEntryRow) => Result,
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
    readonly replayed: (row: TimeEntryRow) => Result;
    readonly winner?: (row: TimeEntryRow) => Result;
  },
): Promise<Result> {
  // Antes que la fila propia: sin esto, una membresía desactivada recibiría
  // éxito por mandar el id de una entrada suya que ya existe.
  if (!can(actor, "timeEntry.own.create", ownTimeEntryResource(actor))) {
    throw new TimeEntryError("forbidden", timeEntryMessages.forbidden);
  }
  const { winner } = creation;
  return createOnce<TimeEntryRow, Result>({
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

type StartAttempt = {
  readonly running: TimeEntryRow;
  readonly stopped: TimeEntryRow | null;
};

/**
 * Cierra el timer anterior y abre el nuevo con el mismo `now()`. Un choque con
 * otro arranque sale como error de la base: lo resuelve `createEntryOnce`.
 */
async function attemptStart(
  actor: Actor,
  id: string,
  description: string,
): Promise<StartAttempt> {
  return db.transaction(async (tx) => {
    const current = await timeEntryRepository.findRunning(
      actor.workspaceId,
      actor.userId,
      tx,
    );
    const stopped =
      current === undefined ? undefined : await closeRunning(tx, actor, current);
    const running = await timeEntryRepository.insertRunning(tx, {
      id,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      description,
    });
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.start",
      entity: AUDIT_ENTITY,
      entityId: running.id,
      nextValue: { description: running.description, startedAt: running.startedAt },
    });
    return { running, stopped: stopped ?? null };
  });
}

/**
 * Arranca un timer. Si ya había uno corriendo lo cierra en el mismo instante;
 * si otro arranque ganó la carrera, devuelve el timer del ganador (ADR 0003).
 * Un reintento con el mismo id responde la fila que creó el primer intento, sin
 * escribir (ADR 0007).
 */
export async function startTimer(
  actor: Actor,
  timeZone: string,
  input: StartTimerValues,
): Promise<StartTimerResult> {
  const runningOnly = (row: TimeEntryRow): StartTimerResult => ({
    running: toView(row, timeZone),
    stopped: null,
  });
  return createEntryOnce(actor, input.id, {
    attempt: async () => {
      const started = await attemptStart(actor, input.id, input.description);
      return {
        running: toView(started.running, timeZone),
        stopped: started.stopped === null ? null : toView(started.stopped, timeZone),
      };
    },
    replayed: runningOnly,
    winner: runningOnly,
  });
}

export async function stopTimer(
  actor: Actor,
  timeZone: string,
  input: StopTimerInput,
): Promise<StopTimerResult> {
  try {
    const stopped = await db.transaction(async (tx) => {
      const row = await readOwnEntry(tx, actor, "timeEntry.own.update", input.id);
      if (row.endedAt !== null) {
        throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
      }
      const closed = await closeRunning(tx, actor, row);
      if (closed === undefined) {
        throw new TimeEntryError("already_stopped", timeEntryMessages.alreadyStopped);
      }
      return closed;
    });
    return { stopped: toView(stopped, timeZone) };
  } catch (error) {
    if (timeEntryRepository.isEndBeforeStart(error)) {
      throw new TimeEntryError("validation", timeEntryMessages.endBeforeStart);
    }
    throw error;
  }
}

export async function updateDescription(
  actor: Actor,
  timeZone: string,
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
  return { entry: toView(updated, timeZone) };
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
      // El borrado es físico: esta es la única copia que queda de la fila.
      previousValue: removed,
    });
    return { id: removed.id };
  });
}

/**
 * Agrega una entrada ya cerrada a partir de dos horas de pared. Es la única
 * escritura del módulo cuyos instantes no salen de `now()` de la base: nacen
 * de lo que la persona tecleó. Ver el ADR 0005.
 */
export async function createManualEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: CreateManualEntryValues,
  now: Date = new Date(),
): Promise<CreateManualEntryResult> {
  const timeZone = workspace.timezone;

  return db.transaction(async (tx) => {
    if (!can(actor, "timeEntry.own.create", ownTimeEntryResource(actor))) {
      throw new TimeEntryError("forbidden", timeEntryMessages.forbidden);
    }
    // La interfaz ya lo impide; esto cubre a la pestaña desactualizada.
    const running = await timeEntryRepository.findRunning(
      actor.workspaceId,
      actor.userId,
      tx,
    );
    if (running !== undefined) {
      throw new TimeEntryError("timer_running", timeEntryMessages.timerRunning);
    }

    const startedAt = instantFromLocal(input.date, input.start, timeZone);
    if (startedAt === null) {
      throw new TimeEntryError("validation", timeEntryMessages.nonexistentClock);
    }
    if (clockDifferenceMinutes(input.start, input.end) === 0) {
      throw new TimeEntryError("validation", timeEntryMessages.tooShort);
    }
    // El fin es la hora tecleada y no el inicio más la duración: con un cambio
    // de horario en el medio las dos cosas no coinciden.
    const endDay = crossesMidnight(input.start, input.end)
      ? addDaysToKey(input.date, 1)
      : input.date;
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
    if (dayKey(startedAt, timeZone) < workspaceFloorDayKey(workspace)) {
      throw new TimeEntryError("validation", timeEntryMessages.beforeWorkspace);
    }

    const created = await timeEntryRepository.insertClosed(tx, {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      description: input.description,
      startedAt,
      endedAt,
    });
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: "timeEntry.createManual",
      entity: AUDIT_ENTITY,
      entityId: created.id,
      nextValue: {
        description: created.description,
        startedAt: created.startedAt,
        endedAt: created.endedAt,
      },
    });

    // Con la fila ya insertada: la más reciente puede ser esta misma. Solo se
    // compara contra el extremo inferior, porque el superior se estira hasta
    // el día de la entrada más nueva y la recién creada nunca lo supera. El
    // inferior se calcula igual que en `getTrackerState`.
    const latestPast = await timeEntryRepository.findLatestClosedBefore(
      actor.workspaceId,
      actor.userId,
      now,
      tx,
    );
    const from = windowStart(now, timeZone, latestPast, undefined);
    return {
      created: toView(created, timeZone),
      outsideWindow: created.startedAt.getTime() < from.getTime(),
    };
  });
}

/**
 * Instante desde el que arranca la lista: el menor entre el inicio de la
 * ventana, el día de la última entrada cerrada que empezó antes de `now` y el
 * día del timer activo. El segundo es el que evita que la lista quede vacía
 * habiendo entradas viejas; una entrada futura no puede ocupar su lugar,
 * porque acercaría el extremo y escondería las viejas.
 */
function windowStart(
  now: Date,
  timeZone: string,
  latestPast: TimeEntryRow | undefined,
  running: TimeEntryRow | undefined,
): Date {
  const candidates = [startOfDayBefore(now, TRACKER_WINDOW_DAYS - 1, timeZone)];
  if (latestPast !== undefined) {
    candidates.push(startOfLocalDay(latestPast.startedAt, timeZone));
  }
  if (running !== undefined) {
    candidates.push(startOfLocalDay(running.startedAt, timeZone));
  }
  return new Date(Math.min(...candidates.map((date) => date.getTime())));
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
  rows: readonly TimeEntryRow[],
  running: TimeEntryRow | undefined,
  now: Date,
  timeZone: string,
): DayGroupView[] {
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
    group.entries.push(toView(row, timeZone));
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
        label: dayLabel(group.instant, now, timeZone),
        isRunningDay: date === runningDay,
        closedSeconds,
        entries: group.entries,
      };
    });
}

/**
 * Estado completo del rastreador. `now` existe para que los tests fijen el
 * día: ninguna escritura lo usa.
 */
export async function getTrackerState(
  actor: Actor,
  workspace: TrackerWorkspace,
  now: Date = new Date(),
): Promise<TrackerState> {
  const timeZone = workspace.timezone;
  // Las lecturas salen del mismo snapshot. Con `read committed` cada
  // sentencia ve uno nuevo, y una mutación que commitea en el medio deja
  // estados que la sección 5 declara imposibles: `hasAnyEntry` en verdadero con
  // la lista vacía, o la misma entrada en `running` y en `days`.
  const { running, latestClosed, closed } = await db.transaction(
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
      const latestPast = await timeEntryRepository.findLatestClosedBefore(
        actor.workspaceId,
        actor.userId,
        now,
        tx,
      );
      const entries = await timeEntryRepository.listClosedBetween(
        actor.workspaceId,
        actor.userId,
        windowStart(now, timeZone, latestPast, current),
        windowEnd(now, timeZone, latest),
        tx,
      );
      return { running: current, latestClosed: latest, closed: entries };
    },
    { isolationLevel: "repeatable read" },
  );

  return {
    serverNow: now.toISOString(),
    timeZone,
    todayKey: dayKey(now, timeZone),
    minDayKey: workspaceFloorDayKey(workspace),
    canTrack: can(actor, "timeEntry.own.create", ownTimeEntryResource(actor)),
    running: running === undefined ? null : toView(running, timeZone),
    days: buildDays(closed, running, now, timeZone),
    hasAnyEntry: running !== undefined || latestClosed !== undefined,
  };
}

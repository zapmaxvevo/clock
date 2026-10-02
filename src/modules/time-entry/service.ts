import { db, type Transaction } from "@/server/db";
import { recordAudit } from "@/server/audit";
import { can, type Action, type Actor } from "@/server/permissions";
import {
  dayKey,
  dayLabel,
  durationSeconds,
  extraDays,
  formatClock,
  formatDuration,
  startOfDayBefore,
} from "@/server/time";

import { timeEntryRepository, type TimeEntryRow } from "./repository";
import {
  timeEntryMessages,
  TRACKER_WINDOW_DAYS,
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

/** Cierra la entrada abierta dentro de la transacción y deja constancia. */
async function closeRunning(
  tx: Transaction,
  actor: Actor,
  row: TimeEntryRow,
): Promise<TimeEntryRow | undefined> {
  const stopped = await timeEntryRepository.stopById(tx, actor.workspaceId, row.id);
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

type StartAttempt = {
  readonly running: TimeEntryRow;
  readonly stopped: TimeEntryRow | null;
};

/**
 * Cierra el timer anterior y abre el nuevo con el mismo `now()`. Devuelve
 * `null` cuando otro arranque simultáneo ganó la carrera del índice único.
 */
async function attemptStart(
  actor: Actor,
  description: string,
): Promise<StartAttempt | null> {
  try {
    return await db.transaction(async (tx) => {
      const current = await timeEntryRepository.findRunning(
        actor.workspaceId,
        actor.userId,
        tx,
      );
      const stopped =
        current === undefined ? undefined : await closeRunning(tx, actor, current);
      const running = await timeEntryRepository.insertRunning(tx, {
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
  } catch (error) {
    if (timeEntryRepository.isRunningConflict(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Arranca un timer. Si ya había uno corriendo lo cierra en el mismo instante;
 * si otro arranque ganó la carrera, devuelve el timer del ganador. Ver ADR 0003.
 */
export async function startTimer(
  actor: Actor,
  timeZone: string,
  input: StartTimerValues,
): Promise<StartTimerResult> {
  // Dos vueltas: el reintento cubre que el ganador detenga su timer entre el
  // choque y la relectura. Más vueltas no acercan a un resultado.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = await attemptStart(actor, input.description);
    if (started !== null) {
      return {
        running: toView(started.running, timeZone),
        stopped: started.stopped === null ? null : toView(started.stopped, timeZone),
      };
    }
    const winner = await timeEntryRepository.findRunning(actor.workspaceId, actor.userId);
    if (winner !== undefined) {
      return { running: toView(winner, timeZone), stopped: null };
    }
  }
  throw new TimeEntryError("unexpected", timeEntryMessages.unexpected);
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
      actor.workspaceId,
      row.id,
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
    const removed = await timeEntryRepository.deleteById(tx, actor.workspaceId, row.id);
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
 * Instante desde el que arranca la lista: el menor entre el inicio de la
 * ventana, el día de la última entrada cerrada y el día del timer activo. El
 * segundo es el que evita que la lista quede vacía habiendo entradas viejas.
 */
function windowStart(
  now: Date,
  timeZone: string,
  latestClosed: TimeEntryRow | undefined,
  running: TimeEntryRow | undefined,
): Date {
  const candidates = [startOfDayBefore(now, TRACKER_WINDOW_DAYS - 1, timeZone)];
  if (latestClosed !== undefined) {
    candidates.push(startOfDayBefore(latestClosed.startedAt, 0, timeZone));
  }
  if (running !== undefined) {
    candidates.push(startOfDayBefore(running.startedAt, 0, timeZone));
  }
  return new Date(Math.min(...candidates.map((date) => date.getTime())));
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
        // Una sola conversión a minutos, sobre la suma exacta en segundos.
        closedTotalLabel: formatDuration(Math.floor(closedSeconds / 60)),
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
  timeZone: string,
  now: Date = new Date(),
): Promise<TrackerState> {
  // Las dos primeras no dependen entre sí; la ventana sí depende de las dos.
  const [running, latestClosed] = await Promise.all([
    timeEntryRepository.findRunning(actor.workspaceId, actor.userId),
    timeEntryRepository.findLatestClosed(actor.workspaceId, actor.userId),
  ]);
  const from = windowStart(now, timeZone, latestClosed, running);
  const closed = await timeEntryRepository.listClosedBetween(
    actor.workspaceId,
    actor.userId,
    from,
    now,
  );
  // Si el timer se detuvo entre las dos lecturas, la entrada aparecería en las
  // dos listas; la barra manda y la lista se pone al día en la revalidación.
  const listed = closed.filter((row) => row.id !== running?.id);

  return {
    serverNow: now.toISOString(),
    timeZone,
    canTrack: can(actor, "timeEntry.own.create", ownTimeEntryResource(actor)),
    running: running === undefined ? null : toView(running, timeZone),
    days: buildDays(listed, running, now, timeZone),
    hasAnyEntry: running !== undefined || latestClosed !== undefined,
  };
}

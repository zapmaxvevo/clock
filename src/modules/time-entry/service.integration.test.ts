import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError, RejectedError } from "@/server/action";
import { db, type Transaction } from "@/server/db";
import {
  client,
  membership,
  project,
  projectMember,
  timeEntry,
  workspace as workspaceTable,
} from "@/server/db/schema";
import { constraintOf, UNIQUE_VIOLATION } from "@/server/db/constraint-error";
import { ForbiddenError, type Actor } from "@/server/permissions";
import {
  addDaysToKey,
  dayKey,
  formatClock,
  instantFromLocal,
  shiftClock,
  type WeekStart,
} from "@/server/time";
import {
  queueBehindBarrier,
  raceThroughBarrier,
  waitForBlockedBackends,
  warmPool,
} from "@/test/concurrency";
import {
  buenosAires,
  defaultFormats,
  seedClient,
  seedMember,
  seedPreferences,
  seedProject,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { allTimeEntries, auditFor, timeEntriesOf, timeEntryById } from "@/test/queries";

import { projectMessages } from "@/modules/project/schema";
import {
  profileOf,
  timeSettingsOf,
  updatePreference,
  type ProfileContext,
} from "@/modules/profile/service";
import { workspaceRepository } from "@/modules/workspace/repository";

import { timeEntryRepository } from "./repository";
import {
  timeEntryMessages,
  type BulkEditChanges,
  type CalendarState,
  type ContinueEntryResult,
  type DayGroupView,
  type StartTimerResult,
  type TrackerState,
} from "./schema";
import {
  bulkDeleteEntries,
  bulkEditEntries,
  continueEntry,
  createManualEntry,
  deleteEntry,
  discardTimer,
  duplicateEntry,
  getCalendarState,
  getTrackerState,
  startTimer,
  stopTimer,
  TimeEntryError,
  trackerWorkspaceOf,
  updateDescription,
  updateEntry,
  updateEntryProject,
  updateEntryTimes,
  updateRunningStart,
  type TrackerWorkspace,
} from "./service";

const madrid = "Europe/Madrid";

/** Lectores en paralelo con los que se tensan las carreras de lectura. */
const READERS = 8;

let workspaceId: string;
let actor: Actor;

function actorFor(userId: string, overrides: Partial<Actor> = {}): Actor {
  return { userId, workspaceId, role: "member", status: "active", ...overrides };
}

/** El workspace tal como lo recibe el service: la zona, el piso de carga y el primer día de la semana. */
function workspaceOf(
  timezone: string,
  createdAt = "2020-01-01T00:00:00Z",
  weekStart: WeekStart = 1,
): TrackerWorkspace {
  return { timezone, createdAt: new Date(createdAt), weekStart, formats: defaultFormats };
}

/** Los días de la lista, sin las semanas que los agrupan. */
function daysOf(state: TrackerState): DayGroupView[] {
  return state.weeks.flatMap((week) => week.days);
}

/** Una entrada abierta del actor, sembrada como timer previo de un arranque. */
function seedRunning(description = "previo") {
  return seedTimeEntry({
    workspaceId,
    userId: actor.userId,
    description,
    startedAt: "2026-10-02T11:00:00Z",
  });
}

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  actor = actorFor(seeded.ownerId, { role: "owner" });
});

describe("startTimer", () => {
  it("abre una entrada con el instante de la base y sin fin", async () => {
    const before = new Date();
    const result = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "  revisión  ",
    });
    const after = new Date();

    expect(result.running.endedAt).toBeNull();
    expect(result.running.durationSeconds).toBeNull();
    expect(result.running.durationLabel).toBeNull();
    expect(result.running.extraDays).toBe(0);
    expect(result.stopped).toBeNull();
    // El instante lo pone la base, no el proceso: cae dentro de la ventana del
    // llamado, con holgura para el desfase entre el reloj del proceso y el de
    // Postgres. Sin la cota de arriba, un `started_at` del año 2300 pasaría.
    const startedAt = new Date(result.running.startedAt).getTime();
    expect(startedAt).toBeGreaterThanOrEqual(before.getTime() - 60_000);
    expect(startedAt).toBeLessThanOrEqual(after.getTime() + 60_000);

    const rows = await allTimeEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].endedAt).toBeNull();
    expect(rows[0].description).toBe("  revisión  ");
  });

  it("cierra el timer anterior en el mismo instante en que abre el nuevo", async () => {
    const first = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "uno",
    });
    const second = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "dos",
    });

    expect(second.stopped?.id).toBe(first.running.id);
    expect(second.stopped?.endedAt).toBe(second.running.startedAt);

    const rows = await allTimeEntries();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.endedAt === null)).toHaveLength(1);
  });

  it("escribe un registro de auditoría por cada entrada que toca", async () => {
    const first = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "uno",
    });
    const second = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "dos",
    });

    const closed = await auditFor("time_entry", first.running.id);
    expect(closed.map((row) => row.action)).toEqual([
      "timeEntry.start",
      "timeEntry.stop",
    ]);
    expect(closed[1].previousValue).toBe(JSON.stringify({ endedAt: null }));

    const opened = await auditFor("time_entry", second.running.id);
    expect(opened.map((row) => row.action)).toEqual(["timeEntry.start"]);
    expect(opened[0].actorId).toBe(actor.userId);
  });

  it("deja un solo timer activo con varios arranques simultáneos", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        startTimer(actor, workspaceOf(buenosAires), {
          projectId: null,
          taskId: null,
          id: randomUUID(),
          description: `pestaña ${index}`,
        }),
      ),
    );

    const running = (await allTimeEntries()).filter((row) => row.endedAt === null);
    expect(running).toHaveLength(1);
    for (const result of results) {
      expect(result.running.endedAt).toBeNull();
    }
    // El que perdió la carrera devuelve el timer del ganador, no un error.
    expect(results.some((result) => result.running.id === running[0].id)).toBe(true);
  });

  it("no deja dos timers corriendo a la vez, ni escribiendo directo en la base", async () => {
    await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "uno",
    });

    const second = seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: new Date().toISOString(),
    });
    await expect(second).rejects.toThrow();
    await expect(second.catch((error: unknown) => error)).resolves.toSatisfy(
      (error: unknown) => timeEntryRepository.isRunningConflict(error),
    );
  });

  it("no choca con el timer de otra persona del mismo workspace", async () => {
    const otherId = await seedMember(workspaceId, "member");
    await startTimer(actorFor(otherId), workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "de otro",
    });

    const mine = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "mío",
    });

    expect(mine.stopped).toBeNull();
    expect((await allTimeEntries()).filter((row) => row.endedAt === null)).toHaveLength(
      2,
    );
  });

  it("no abre nada cuando la membresía no está activa", async () => {
    for (const status of ["inactive", "invited"] as const) {
      await expect(
        startTimer({ ...actor, status }, workspaceOf(buenosAires), {
          projectId: null,
          taskId: null,
          id: randomUUID(),
          description: "no va",
        }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
    }
    expect(await allTimeEntries()).toHaveLength(0);
  });
});

describe("startTimer con el id que eligió el cliente (ADR 0007)", () => {
  it("el reintento en secuencia responde la misma fila y no escribe nada", async () => {
    const previous = await seedRunning();
    const id = randomUUID();
    const first = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id,
      description: "tarea",
    });
    expect(first.running.id).toBe(id);
    expect(first.stopped?.id).toBe(previous.id);
    const rows = await allTimeEntries();
    const audit = await auditFor("time_entry");

    const retry = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id,
      description: "tarea",
    });

    expect(retry).toEqual({ running: first.running, stopped: null });
    expect(await allTimeEntries()).toEqual(rows);
    expect(await auditFor("time_entry")).toEqual(audit);
  });

  it("un reintento cuyo timer ya se detuvo responde la entrada cerrada y no escribe", async () => {
    const id = randomUUID();
    await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id,
      description: "tarea",
    });
    const { stopped } = await stopTimer(actor, workspaceOf(buenosAires), { id });
    const rows = await allTimeEntries();
    const audit = await auditFor("time_entry");

    const retry = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id,
      description: "tarea",
    });

    expect(retry.running.id).toBe(id);
    expect(retry.running.endedAt).not.toBeNull();
    expect(retry.running).toEqual(stopped);
    expect(retry.stopped).toBeNull();
    expect(await allTimeEntries()).toEqual(rows);
    expect(await auditFor("time_entry")).toEqual(audit);
  });

  /** Lo que tiene que quedar de dos arranques del mismo pedido sobre un timer previo. */
  async function expectAppliedOnce(id: string, previousId: string) {
    const rows = await timeEntriesOf(workspaceId, actor.userId);
    expect(rows.map((row) => [row.id, row.endedAt === null])).toEqual([
      [previousId, false],
      [id, true],
    ]);
    const audit = await auditFor("time_entry");
    expect(audit.filter((row) => row.action === "timeEntry.start")).toHaveLength(1);
    expect(audit.filter((row) => row.action === "timeEntry.stop")).toHaveLength(1);
    expect(audit.map((row) => [row.action, row.entityId]).sort()).toEqual(
      [
        ["timeEntry.start", id],
        ["timeEntry.stop", previousId],
      ].sort(),
    );
  }

  it("el reintento en paralelo deja una sola fila y un solo cierre", async () => {
    const previous = await seedRunning();
    const id = randomUUID();
    await warmPool(2);

    const results = await Promise.all([
      startTimer(actor, workspaceOf(buenosAires), {
        projectId: null,
        taskId: null,
        id,
        description: "tarea",
      }),
      startTimer(actor, workspaceOf(buenosAires), {
        projectId: null,
        taskId: null,
        id,
        description: "tarea",
      }),
    ]);

    expect(results.map((result) => result.running.id)).toEqual([id, id]);
    await expectAppliedOnce(id, previous.id);
  });

  it("el reintento en paralelo, obligado a cruzarse, también", async () => {
    const previous = await seedRunning();
    const id = randomUUID();

    const results = await raceThroughBarrier(
      (tx) => timeEntryRepository.findByIdForUpdate(tx, workspaceId, previous.id),
      [
        () =>
          startTimer(actor, workspaceOf(buenosAires), {
            projectId: null,
            taskId: null,
            id,
            description: "tarea",
          }),
        () =>
          startTimer(actor, workspaceOf(buenosAires), {
            projectId: null,
            taskId: null,
            id,
            description: "tarea",
          }),
      ],
    );

    expect(results.map((result) => result.running.id)).toEqual([id, id]);
    expect(results.filter((result) => result.stopped?.id === previous.id)).toHaveLength(
      1,
    );
    await expectAppliedOnce(id, previous.id);
  });

  describe("TT-37: dos ids distintos que se cruzan", () => {
    const ids = [randomUUID(), randomUUID()] as const;
    const startBoth = () =>
      ids.map(
        (id) => () =>
          startTimer(actor, workspaceOf(buenosAires), {
            projectId: null,
            taskId: null,
            id,
            description: id,
          }),
      );

    /** El que creó y el que responde al ganador, con el mismo timer. */
    function creatorAndWinner(results: readonly StartTimerResult[]) {
      const [first, second] = results;
      expect(first.running.id).toBe(second.running.id);
      const creator = ids.findIndex((id) => id === first.running.id);
      expect(creator).not.toBe(-1);
      return { created: results[creator], answered: results[1 - creator] };
    }

    it("con timer previo, la única cerrada es la previa", async () => {
      const previous = await seedRunning();

      const results = await raceThroughBarrier(
        (tx) => timeEntryRepository.findByIdForUpdate(tx, workspaceId, previous.id),
        startBoth(),
      );

      const { created, answered } = creatorAndWinner(results);
      expect(created.stopped?.id).toBe(previous.id);
      expect(answered.stopped).toBeNull();
      const rows = await timeEntriesOf(workspaceId, actor.userId);
      expect(rows.map((row) => [row.id, row.endedAt === null])).toEqual([
        [previous.id, false],
        [created.running.id, true],
      ]);
    });

    it("sin timer previo, no hay ninguna cerrada", async () => {
      const results = await raceThroughBarrier(
        (tx) =>
          timeEntryRepository.insertRunning(tx, {
            projectId: null,
            taskId: null,
            billable: false,
            id: randomUUID(),
            workspaceId,
            userId: actor.userId,
            description: "barrera",
          }),
        startBoth(),
      );

      const { created, answered } = creatorAndWinner(results);
      expect(created.stopped).toBeNull();
      expect(answered.stopped).toBeNull();
      const rows = await timeEntriesOf(workspaceId, actor.userId);
      expect(rows.map((row) => [row.id, row.endedAt === null])).toEqual([
        [created.running.id, true],
      ]);
    });
  });

  describe("el id de una fila ajena", () => {
    /** Dónde vive la entrada ajena: lo único que la separa del actor. */
    const foreignOwners = {
      "otra persona del workspace": async () => ({
        workspaceId,
        userId: await seedMember(workspaceId, "member"),
      }),
      "otra persona de otro workspace": async () => {
        const other = await seedWorkspace(buenosAires);
        return { workspaceId: other.workspaceId, userId: other.ownerId };
      },
      // Mismo usuario: lo único que la deja afuera es el filtro por workspace.
      "la misma persona en otro workspace": async () => {
        const other = await seedWorkspace(buenosAires);
        await db.insert(membership).values({
          workspaceId: other.workspaceId,
          userId: actor.userId,
          role: "member",
        });
        return { workspaceId: other.workspaceId, userId: actor.userId };
      },
    };

    it.each(Object.entries(foreignOwners))(
      "de %s responde forbidden, no escribe y deja abierto el timer propio",
      async (_, ownerOf) => {
        const mine = await startTimer(actor, workspaceOf(buenosAires), {
          projectId: null,
          taskId: null,
          id: randomUUID(),
          description: "mío",
        });
        const foreign = await seedTimeEntry({
          ...(await ownerOf()),
          startedAt: "2026-10-02T09:00:00Z",
          endedAt: "2026-10-02T10:00:00Z",
        });
        const rows = await allTimeEntries();
        const audit = await auditFor("time_entry");

        const error = await startTimer(actor, workspaceOf(buenosAires), {
          projectId: null,
          taskId: null,
          id: foreign.id,
          description: "ajeno",
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error).toMatchObject({ code: "forbidden" });
        expect(await allTimeEntries()).toEqual(rows);
        expect(await auditFor("time_entry")).toEqual(audit);
        const running = await timeEntryRepository.findRunning(workspaceId, actor.userId);
        expect(running?.id).toBe(mine.running.id);
      },
    );
  });
});

describe("las restricciones que reconoce el repository", () => {
  it("el id de una fila que ya existe choca con la clave primaria", async () => {
    const existing = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T09:00:00Z",
      endedAt: "2026-10-02T10:00:00Z",
    });

    const error = await db
      .transaction((tx) =>
        timeEntryRepository.insertRunning(tx, {
          projectId: null,
          taskId: null,
          billable: false,
          id: existing.id,
          workspaceId,
          userId: actor.userId,
          description: "",
        }),
      )
      .catch((caught: unknown) => caught);

    expect(constraintOf(error, UNIQUE_VIOLATION)).toBe(timeEntryRepository.idConstraint);
    expect(timeEntryRepository.isRunningConflict(error)).toBe(false);
  });

  it("un segundo timer abierto choca con el índice del timer activo", async () => {
    await seedRunning("primero");

    const error = await seedRunning("segundo").catch((caught: unknown) => caught);

    expect(timeEntryRepository.isRunningConflict(error)).toBe(true);
    expect(constraintOf(error, UNIQUE_VIOLATION)).not.toBe(
      timeEntryRepository.idConstraint,
    );
  });
});

describe("stopTimer", () => {
  it("cierra la entrada y devuelve su duración", async () => {
    const started = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "tarea",
    });
    const result = await stopTimer(actor, workspaceOf(buenosAires), {
      id: started.running.id,
    });

    expect(result.stopped.endedAt).not.toBeNull();
    expect(result.stopped.durationSeconds).toBeGreaterThanOrEqual(0);
    // Detener en el mismo minuto deja la entrada guardada y la muestra en 0:00.
    expect(result.stopped.durationLabel).toBe("0:00");

    const rows = await allTimeEntries();
    expect(rows[0].endedAt).not.toBeNull();
  });

  it("rechaza detener una entrada que ya estaba cerrada", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await expect(
      stopTimer(actor, workspaceOf(buenosAires), { id: row.id }),
    ).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    const rows = await allTimeEntries();
    expect(rows[0].endedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("responde que no existe cuando el id no está", async () => {
    await expect(
      stopTimer(actor, workspaceOf(buenosAires), {
        id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b",
      }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
  });

  it("responde que no existe cuando el id es de otro workspace", async () => {
    const other = await seedWorkspace();
    const row = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-01T11:00:00Z",
    });

    await expect(
      stopTimer(actor, workspaceOf(buenosAires), { id: row.id }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rechaza la entrada de otra persona del workspace sin tocarla", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T11:00:00Z",
    });

    await expect(
      stopTimer(actor, workspaceOf(buenosAires), { id: row.id }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect((await allTimeEntries())[0].endedAt).toBeNull();
  });

  it("rechaza con el mensaje neutro cuando la membresía no está activa", async () => {
    const started = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "tarea",
    });
    const inactive = { ...actor, status: "inactive" } as const;

    await expect(
      stopTimer(inactive, workspaceOf(buenosAires), { id: started.running.id }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbidden,
    });
  });
});

describe("TT-101: la parada de un timer cuyo inicio quedó después del now() de la base", () => {
  /** Un timer abierto con el inicio una hora por delante del reloj de la base. */
  function seedFutureRunning() {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: new Date(Date.now() + 3_600_000),
    });
  }

  it("stopTimer lo cierra sin error, con el fin igual al inicio", async () => {
    const row = await seedFutureRunning();

    const result = await stopTimer(actor, workspaceOf(buenosAires), { id: row.id });

    expect(result.stopped.endedAt).toBe(row.startedAt.toISOString());
    expect(result.stopped.durationSeconds).toBe(0);
    const after = await timeEntryById(row.id);
    expect(after?.endedAt?.toISOString()).toBe(row.startedAt.toISOString());
  });

  it("el cierre que hace startTimer también, y el nuevo queda abierto", async () => {
    const row = await seedFutureRunning();

    const result = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "siguiente",
    });

    expect(result.stopped?.id).toBe(row.id);
    expect(result.stopped?.endedAt).toBe(row.startedAt.toISOString());
    expect(result.stopped?.durationSeconds).toBe(0);
    const rows = await timeEntriesOf(workspaceId, actor.userId);
    expect(rows.filter((entry) => entry.endedAt === null)).toHaveLength(1);
    expect((await timeEntryById(row.id))?.endedAt?.toISOString()).toBe(
      row.startedAt.toISOString(),
    );
  });
});

describe("límites que valen aunque se escriba sin pasar por el service", () => {
  it("no acepta una fila con fin anterior al inicio escrita directo", async () => {
    await expect(
      seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-01T12:00:00Z",
        endedAt: "2026-10-01T11:00:00Z",
      }),
    ).rejects.toThrow();
  });

  it("acepta una entrada de duración cero", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T12:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    expect(row.endedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("no acepta una descripción de más de 3000 caracteres", async () => {
    await expect(
      seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-01T12:00:00Z",
        description: "a".repeat(3001),
      }),
    ).rejects.toThrow();
  });
});

describe("updateDescription", () => {
  it("guarda la descripción sobre la entrada abierta sin detenerla", async () => {
    const started = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "",
    });

    const result = await updateDescription(actor, workspaceOf(buenosAires), {
      id: started.running.id,
      description: "revisión de PR",
    });

    expect(result.entry.description).toBe("revisión de PR");
    expect(result.entry.endedAt).toBeNull();
    const audit = await auditFor("time_entry", started.running.id);
    expect(audit.at(-1)?.action).toBe("timeEntry.updateDescription");
    expect(audit.at(-1)?.previousValue).toBe(JSON.stringify({ description: "" }));
  });

  it("guarda la descripción sobre una entrada cerrada", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "vieja",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    const result = await updateDescription(actor, workspaceOf(buenosAires), {
      id: row.id,
      description: "nueva",
    });

    expect(result.entry.description).toBe("nueva");
    expect(result.entry.durationLabel).toBe("1:00");
  });

  it("rechaza la entrada de otra persona y no la cambia", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      description: "ajena",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await expect(
      updateDescription(actor, workspaceOf(buenosAires), {
        id: row.id,
        description: "mía",
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect((await allTimeEntries())[0].description).toBe("ajena");
  });
});

describe("deleteEntry", () => {
  it("borra la fila y deja su contenido en el audit log", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "para borrar",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    const result = await deleteEntry(actor, { id: row.id });

    expect(result.id).toBe(row.id);
    expect(await allTimeEntries()).toHaveLength(0);
    const audit = await auditFor("time_entry", row.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("timeEntry.delete");
    expect(audit[0].nextValue).toBeNull();
    expect(JSON.parse(audit[0].previousValue ?? "null")).toMatchObject({
      id: row.id,
      description: "para borrar",
    });
  });

  it("borra también la entrada abierta", async () => {
    const started = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "abierta",
    });

    await deleteEntry(actor, { id: started.running.id });

    expect(await allTimeEntries()).toHaveLength(0);
  });

  it("rechaza la entrada de otra persona y no la borra", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T11:00:00Z",
    });

    await expect(deleteEntry(actor, { id: row.id })).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect(await allTimeEntries()).toHaveLength(1);
  });

  it("responde que no existe cuando el id no está", async () => {
    await expect(
      deleteEntry(actor, { id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("getTrackerState", () => {
  // Las 12:00 del 2 de octubre de 2026 en Buenos Aires.
  const now = new Date("2026-10-02T15:00:00Z");

  it("deja el estado vacío cuando no hay nada cargado", async () => {
    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.hasAnyEntry).toBe(false);
    expect(daysOf(state)).toEqual([]);
    expect(state.running).toBeNull();
    expect(state.canTrack).toBe(true);
    expect(state.serverNow).toBe(now.toISOString());
  });

  it("resuelve el día de hoy en la zona de la persona", async () => {
    // Las 23:00 del 2 de octubre en Buenos Aires: en UTC ya es el 3.
    const lateNight = new Date("2026-10-03T02:00:00Z");

    const local = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      lateNight,
    );
    const remote = await getTrackerState(
      actor,
      workspaceOf(madrid),
      { from: null },
      lateNight,
    );

    expect(local.todayKey).toBe("2026-10-02");
    expect(remote.todayKey).toBe("2026-10-03");
  });

  it("da como piso el día local de creación, el mismo que acepta la validación", async () => {
    // Las 23:00 del 1 de setiembre en Buenos Aires, que en UTC ya son del 2.
    const reciente = workspaceOf(buenosAires, "2026-09-02T02:00:00Z");

    const state = await getTrackerState(actor, reciente, { from: null }, now);
    expect(state.minDayKey).toBe("2026-09-01");

    const values = { description: "", start: "08:00", end: "09:00" };
    const floor = await createManualEntry(actor, reciente, {
      projectId: null,
      taskId: null,
      ...values,
      date: state.minDayKey,
    });
    expect(floor.created.dayDate).toBe(state.minDayKey);
    await expect(
      createManualEntry(actor, reciente, {
        projectId: null,
        taskId: null,
        ...values,
        date: addDaysToKey(state.minDayKey, -1),
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.beforeWorkspace,
    });
  });

  it("muestra solo las entradas propias", async () => {
    const otherId = await seedMember(workspaceId, "member");
    await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "mía",
      startedAt: "2026-10-02T13:00:00Z",
      endedAt: "2026-10-02T14:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state)).toHaveLength(1);
    expect(daysOf(state)[0].entries.map((entry) => entry.description)).toEqual(["mía"]);
  });

  it("agrupa por día local y ordena de lo más reciente a lo más viejo", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "ayer tarde",
      startedAt: "2026-10-02T01:00:00Z", // 22:00 del 1 de octubre en Buenos Aires
      endedAt: "2026-10-02T02:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "temprano",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "recién",
      startedAt: "2026-10-02T13:00:00Z",
      endedAt: "2026-10-02T14:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-10-02", "2026-10-01"]);
    expect(daysOf(state).map((day) => day.label)).toEqual(["Hoy", "Ayer"]);
    expect(daysOf(state)[0].entries.map((entry) => entry.description)).toEqual([
      "recién",
      "temprano",
    ]);
    expect(daysOf(state)[0].entries[0].startLabel).toBe("10:00");
  });

  it("pone la entrada que arranca a la medianoche exacta en el día que empieza", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T03:00:00Z", // 00:00 del 2 de octubre en Buenos Aires
      endedAt: "2026-10-02T04:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-10-02"]);
    expect(daysOf(state)[0].entries[0].startLabel).toBe("00:00");
  });

  it("suma el total del día en segundos exactos aunque cada fila trunque a 0:00", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T11:00:40Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T12:00:00Z",
      endedAt: "2026-10-02T12:00:40Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state)[0].entries.map((entry) => entry.durationLabel)).toEqual([
      "0:00",
      "0:00",
    ]);
    expect(daysOf(state)[0].closedSeconds).toBe(80);
  });

  it("deja la entrada que cruza la medianoche en su día de inicio con el superíndice", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T11:00:00Z", // 08:00 del 1 de octubre
      endedAt: "2026-10-02T05:00:00Z", // 02:00 del 2 de octubre
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state)).toHaveLength(1);
    expect(daysOf(state)[0].date).toBe("2026-10-01");
    expect(daysOf(state)[0].closedSeconds).toBe(18 * 3600);
    const [entry] = daysOf(state)[0].entries;
    expect(entry.startLabel).toBe("08:00");
    expect(entry.endLabel).toBe("02:00");
    expect(entry.extraDays).toBe(1);
  });

  it("recalcula los grupos al cambiar la zona horaria de la persona", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T01:00:00Z", // 22:00 del 1 en Buenos Aires, 03:00 del 2 en Madrid
      endedAt: "2026-10-02T02:00:00Z",
    });

    const local = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    const remote = await getTrackerState(actor, workspaceOf(madrid), { from: null }, now);

    expect(daysOf(local)[0].date).toBe("2026-10-01");
    expect(daysOf(local)[0].entries[0].startLabel).toBe("22:00");
    expect(daysOf(remote)[0].date).toBe("2026-10-02");
    expect(daysOf(remote)[0].entries[0].startLabel).toBe("03:00");
    expect(await allTimeEntries()).toHaveLength(1);
  });

  it("deja el timer activo fuera de la lista pero crea su grupo vacío", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "corriendo",
      startedAt: "2026-09-30T11:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.running?.description).toBe("corriendo");
    expect(state.running?.endedAt).toBeNull();
    expect(state.running?.durationSeconds).toBeNull();
    expect(state.hasAnyEntry).toBe(true);
    const runningDay = daysOf(state).find((day) => day.isRunningDay);
    expect(runningDay?.date).toBe("2026-09-30");
    expect(runningDay?.entries).toEqual([]);
    expect(runningDay?.closedSeconds).toBe(0);
    expect(daysOf(state).flatMap((day) => day.entries)).toEqual([]);
  });

  it("no dibuja los días sin entradas", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-29T11:00:00Z",
      endedAt: "2026-09-29T12:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-10-02", "2026-09-29"]);
  });

  it("TT-52: corta en catorce días redondeados a la semana entera", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "de hoy",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    // Catorce días atrás es el sábado 19/09; su semana empieza el lunes 14/09.
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "del borde",
      startedAt: "2026-09-14T03:00:00Z",
      endedAt: "2026-09-14T04:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "fuera de la ventana",
      startedAt: "2026-09-14T02:59:00Z",
      endedAt: "2026-09-14T04:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-10-02", "2026-09-14"]);
    expect(state.windowFrom).toBe("2026-09-14");
    expect(state.reachFrom).toBe("2026-09-14");
    expect(state.loadMoreFrom).toBe("2026-09-07");
  });

  it("extiende la ventana hasta el último día con entradas", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "de hace meses",
      startedAt: "2026-07-15T11:00:00Z",
      endedAt: "2026-07-15T12:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.hasAnyEntry).toBe(true);
    expect(daysOf(state)).toHaveLength(1);
    expect(daysOf(state)[0].date).toBe("2026-07-15");
    expect(daysOf(state)[0].label).toBe("mié, 15/07");
  });

  it("extiende la ventana hasta el día en que arrancó el timer activo", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "de hace días",
      startedAt: "2026-08-20T11:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "cerrada vieja",
      startedAt: "2026-08-21T11:00:00Z",
      endedAt: "2026-08-21T12:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-08-21", "2026-08-20"]);
    expect(daysOf(state).find((day) => day.isRunningDay)?.date).toBe("2026-08-20");
  });

  it("deja detener un timer que lleva días corriendo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-30T11:00:00Z",
    });

    const result = await stopTimer(actor, workspaceOf(buenosAires), { id: row.id });

    expect(result.stopped.durationSeconds).toBeGreaterThan(24 * 3600);
    expect(result.stopped.extraDays).toBeGreaterThan(0);
  });

  it("deja la pantalla en solo lectura con la membresía desactivada", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });

    const state = await getTrackerState(
      { ...actor, status: "inactive" },
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.canTrack).toBe(false);
    expect(daysOf(state)).toHaveLength(1);
  });

  it("nunca da hasAnyEntry en verdadero con la lista vacía", async () => {
    // `hasAnyEntry` y la lista salen de consultas distintas: con cada una en su
    // propio snapshot, un borrado que commitea en el medio dejaba la pantalla
    // sin lista y sin el bloque de «todavía no cargaste horas».
    await warmPool(READERS + 1);

    for (let round = 0; round < 200; round += 1) {
      const row = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-02T11:00:00Z",
        endedAt: "2026-10-02T12:00:00Z",
      });

      const states = await Promise.all([
        ...Array.from({ length: READERS }, () =>
          getTrackerState(actor, workspaceOf(buenosAires), { from: null }, now),
        ),
        deleteEntry(actor, { id: row.id }).then(() => null),
      ]);

      for (const state of states) {
        if (state !== null) {
          expect(state.hasAnyEntry).toBe(daysOf(state).length > 0);
        }
      }
    }
  });
});

describe("el error que llega a quien llama", () => {
  it("lleva el código del dominio y no un string suelto", async () => {
    const error = await deleteEntry(actor, {
      id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TimeEntryError);
  });
});

describe("createManualEntry", () => {
  /** Las 12:00 del 2 de octubre de 2026 en Buenos Aires. */
  const now = new Date("2026-10-02T15:00:00Z");
  const workspace = workspaceOf(buenosAires);

  it("crea una entrada cerrada con las horas de pared que se teclearon", async () => {
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "  reunión  ",
      date: "2026-10-02",
      start: "08:00",
      end: "10:30",
    });

    expect(result.created.startedAt).toBe("2026-10-02T11:00:00.000Z");
    expect(result.created.endedAt).toBe("2026-10-02T13:30:00.000Z");
    expect(result.created.startLabel).toBe("08:00");
    expect(result.created.endLabel).toBe("10:30");
    expect(result.created.durationLabel).toBe("2:30");
    expect(result.created.dayDate).toBe("2026-10-02");
    expect(result.created.extraDays).toBe(0);

    const rows = await allTimeEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].endedAt).not.toBeNull();
    expect(rows[0].description).toBe("  reunión  ");
  });

  it("aparece en el grupo de su día y mueve ese total, que puede no ser hoy", async () => {
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-09-28",
      start: "09:00",
      end: "11:00",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    const day = daysOf(state).find((group) => group.date === "2026-09-28");
    expect(day?.closedSeconds).toBe(2 * 3600);
    expect(day?.entries).toHaveLength(1);
  });

  it("cruza la medianoche cuando el fin es menor que el inicio", async () => {
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-09-30",
      start: "23:00",
      end: "02:00",
    });

    expect(result.created.durationSeconds).toBe(3 * 3600);
    expect(result.created.durationLabel).toBe("3:00");
    expect(result.created.dayDate).toBe("2026-09-30");
    expect(result.created.extraDays).toBe(1);
    expect(result.created.startedAt).toBe("2026-10-01T02:00:00.000Z");
    expect(result.created.endedAt).toBe("2026-10-01T05:00:00.000Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    const day = daysOf(state).find((group) => group.date === "2026-09-30");
    expect(day?.closedSeconds).toBe(3 * 3600);
  });

  it("con un timer corriendo agrega la entrada y el timer sigue abierto (P-01)", async () => {
    const started = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "corriendo",
    });

    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "a mano",
      date: "2026-10-02",
      start: "08:00",
      end: "09:00",
    });

    expect(result.created).toMatchObject({
      description: "a mano",
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: "2026-10-02T12:00:00.000Z",
    });
    expect(await allTimeEntries()).toHaveLength(2);
    expect((await timeEntryById(started.running.id))?.endedAt).toBeNull();
  });

  it("rechaza una entrada de duración cero", async () => {
    await expect(
      createManualEntry(actor, workspace, {
        projectId: null,
        taskId: null,
        description: "",
        date: "2026-10-02",
        start: "08:00",
        end: "08:00",
      }),
    ).rejects.toMatchObject({ code: "validation", message: timeEntryMessages.tooShort });
    expect(await allTimeEntries()).toHaveLength(0);
  });

  it("acepta la entrada de un minuto, que es el mínimo", async () => {
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-10-02",
      start: "08:00",
      end: "08:01",
    });
    expect(result.created.durationSeconds).toBe(60);
  });

  it("rechaza una fecha anterior a la creación del workspace", async () => {
    const reciente = workspaceOf(buenosAires, "2026-09-01T12:00:00Z");

    await expect(
      createManualEntry(actor, reciente, {
        projectId: null,
        taskId: null,
        description: "",
        date: "2026-08-31",
        start: "08:00",
        end: "09:00",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.beforeWorkspace,
    });
    expect(await allTimeEntries()).toHaveLength(0);
  });

  it("acepta el mismo día en que se creó el workspace", async () => {
    const reciente = workspaceOf(buenosAires, "2026-09-01T12:00:00Z");

    const result = await createManualEntry(actor, reciente, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-09-01",
      start: "08:00",
      end: "09:00",
    });
    expect(result.created.dayDate).toBe("2026-09-01");
  });

  it("permite dos entradas superpuestas y las dos suman al total", async () => {
    const values = {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-10-02",
      start: "08:00",
      end: "10:00",
    };
    await createManualEntry(actor, workspace, values);
    await createManualEntry(actor, workspace, {
      ...values,
      start: "09:00",
      end: "11:00",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    const day = daysOf(state).find((group) => group.date === "2026-10-02");
    expect(day?.entries).toHaveLength(2);
    expect(day?.closedSeconds).toBe(4 * 3600);
  });

  it("P-15: la entrada debajo de la ventana trae su semana, y con ella de `desde` se ve en su día", async () => {
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-07-15",
      start: "08:00",
      end: "09:00",
    });
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-10-01",
      start: "08:00",
      end: "09:00",
    });

    const old = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-07-16",
      start: "08:00",
      end: "09:00",
    });
    expect(old.created.weekStart).toBe("2026-07-13");

    const state = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(state).map((group) => group.date)).toEqual(["2026-10-01"]);
    expect(old.created.weekStart < state.reachFrom).toBe(true);

    const reached = await getTrackerState(actor, workspace, { from: "2026-07-13" }, now);
    expect(daysOf(reached).map((group) => group.date)).toEqual([
      "2026-10-01",
      "2026-07-16",
      "2026-07-15",
    ]);
    expect(reached.reachFrom).toBe("2026-07-13");
  });

  it("acepta una fecha futura y la muestra en su semana, rotulada con el rango (TT-47)", async () => {
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "la semana que viene",
      date: "2026-10-10",
      start: "08:00",
      end: "09:00",
    });

    expect(result.created.dayDate).toBe("2026-10-10");
    expect(result.created.weekStart).toBe("2026-10-05");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    // Se ordenan de lo más reciente a lo más viejo, así que queda por encima de hoy.
    expect(daysOf(state)[0].date).toBe("2026-10-10");
    expect(daysOf(state)[0].label).toBe("sáb, 10/10");
    expect(daysOf(state)[0].entries).toHaveLength(1);
    expect(state.weeks[0].start).toBe("2026-10-05");
    expect(state.weeks[0].label).toBe("05/10 – 11/10");
  });

  it("muestra una entrada futura que ya estaba en la base", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-20T11:00:00Z",
      endedAt: "2026-10-20T12:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    expect(daysOf(state)[0].date).toBe("2026-10-20");
    expect(state.hasAnyEntry).toBe(true);
  });

  it("no esconde la entrada vieja que se veía al agregar una futura", async () => {
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-09-04",
      start: "08:00",
      end: "09:00",
    });
    const before = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    expect(daysOf(before).map((group) => group.date)).toEqual(["2026-09-04"]);

    const future = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-10-05",
      start: "08:00",
      end: "09:00",
    });
    expect(future.created.weekStart).toBe("2026-10-05");

    const after = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    expect(daysOf(after).map((group) => group.date)).toEqual([
      "2026-10-05",
      "2026-09-04",
    ]);

    // Con la futura en la base, una pasada de la misma semana que la vieja se
    // ve, porque la ventana es de semanas enteras; una de la semana anterior
    // queda afuera, y su semana es anterior a `reachFrom`.
    const sameWeek = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-09-03",
      start: "08:00",
      end: "09:00",
    });
    const previousWeek = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-08-28",
      start: "08:00",
      end: "09:00",
    });
    const last = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    expect(daysOf(last).map((group) => group.date)).toEqual([
      "2026-10-05",
      "2026-09-04",
      "2026-09-03",
    ]);
    expect(last.reachFrom).toBe("2026-08-31");
    expect(sameWeek.created.weekStart).toBe(last.reachFrom);
    expect(previousWeek.created.weekStart).toBe("2026-08-24");
  });

  it("mide el piso contra la última entrada pasada aunque haya una futura", async () => {
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-10-10",
      start: "08:00",
      end: "09:00",
    });

    const older = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-09-04",
      start: "08:00",
      end: "09:00",
    });

    // La lista estira su extremo inferior hasta la entrada pasada más reciente,
    // que es esta misma. Medida contra la futura, quedaría fuera de los catorce
    // días.
    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    expect(daysOf(state).map((group) => group.date)).toEqual([
      "2026-10-10",
      "2026-09-04",
    ]);
    expect(state.reachFrom).toBe(older.created.weekStart);
  });

  it("rechaza como fecha inválida el día siguiente que no tiene clave", async () => {
    await expect(
      createManualEntry(actor, workspace, {
        projectId: null,
        taskId: null,
        description: "",
        date: "9999-12-31",
        start: "23:00",
        end: "01:00",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.invalidDate,
    });
    expect(await allTimeEntries()).toHaveLength(0);
  });

  it("no dibuja los días vacíos que quedan entre hoy y la entrada futura", async () => {
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-11-02",
      start: "08:00",
      end: "09:00",
    });
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-10-02",
      start: "08:00",
      end: "09:00",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    expect(daysOf(state).map((group) => group.date)).toEqual([
      "2026-11-02",
      "2026-10-02",
    ]);
  });
});

describe("createManualEntry con cambio de horario", () => {
  const workspace = workspaceOf(madrid);

  it("guarda la hora de pared ambigua con el segundo instante", async () => {
    // El 25/10/2026 Madrid pasa de +02:00 a +01:00: las 02:30 ocurren dos veces.
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-10-25",
      start: "02:30",
      end: "04:00",
    });

    expect(result.created.startedAt).toBe("2026-10-25T01:30:00.000Z");
    expect(result.created.startLabel).toBe("02:30");
    expect(result.created.endLabel).toBe("04:00");
    // Desde el segundo instante de las 02:30 hasta las 04:00 (03:00 UTC) hay
    // una hora y media; desde el primero (00:30 UTC) habría dos y media.
    expect(result.created.durationSeconds).toBe(90 * 60);
  });

  it("rechaza la hora de pared que no existe, en el inicio y en el fin", async () => {
    // El 29/03/2026 Madrid salta de las 02:00 a las 03:00.
    for (const values of [
      { start: "02:30", end: "04:00" },
      { start: "01:30", end: "02:30" },
    ]) {
      await expect(
        createManualEntry(actor, workspace, {
          projectId: null,
          taskId: null,
          description: "",
          date: "2026-03-29",
          ...values,
        }),
      ).rejects.toMatchObject({
        code: "validation",
        message: timeEntryMessages.nonexistentClock,
      });
    }
    expect(await allTimeEntries()).toHaveLength(0);
  });

  it("mide la duración real en el día que pierde una hora", async () => {
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-03-29",
      start: "01:30",
      end: "03:30",
    });

    // De 01:30 a 03:30 de pared, pero el reloj saltó: una hora real.
    expect(result.created.durationSeconds).toBe(3600);
    expect(result.created.durationLabel).toBe("1:00");
    expect(result.created.startLabel).toBe("01:30");
    expect(result.created.endLabel).toBe("03:30");
  });

  it("nunca deja una fila con el fin anterior al inicio", async () => {
    const attempts = [
      { date: "2026-03-29", start: "02:00", end: "03:00" },
      { date: "2026-03-29", start: "02:30", end: "02:45" },
      { date: "2026-03-29", start: "01:30", end: "03:30" },
      { date: "2026-10-25", start: "02:30", end: "04:00" },
    ];
    for (const values of attempts) {
      await createManualEntry(actor, workspace, {
        projectId: null,
        taskId: null,
        description: "",
        ...values,
      }).catch(() => null);
    }

    const rows = await allTimeEntries();
    // Las dos primeras tocan la hora que no existe y se rechazan; las otras dos
    // se guardan. Lo que ninguna puede dejar es un fin anterior al inicio.
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.endedAt).not.toBeNull();
      expect(row.endedAt?.getTime() ?? 0).toBeGreaterThan(row.startedAt.getTime());
    }
  });
});

/** Toma el bloqueo de la fila, como lo hace `readOwnEntry`. */
function lockRow(id: string) {
  return (tx: Transaction) =>
    tx.execute(sql`select id from time_entry where id = ${id} for update`);
}

/** Una entrada cerrada del actor, con los dos instantes tal como se escriben. */
function seedClosed(startedAt: string, endedAt: string, userId?: string) {
  return seedTimeEntry({
    workspaceId,
    userId: userId ?? actor.userId,
    startedAt,
    endedAt,
  });
}

/** Los dos instantes de la fila en ISO, o `undefined` si ya no está. */
async function instantsOf(id: string) {
  const row = await timeEntryById(id);
  return row === undefined
    ? undefined
    : {
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
      };
}

async function auditActionsOf(id: string) {
  return (await auditFor("time_entry", id)).map((row) => row.action);
}

describe("updateEntryTimes", () => {
  /** Las 12:00 del 2 de octubre de 2026 en Buenos Aires. */
  const now = new Date("2026-10-02T15:00:00Z");
  const workspace = workspaceOf(buenosAires);

  it("guarda el trío nuevo y devuelve la vista con las horas de pared pedidas", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-10-01",
      start: "09:15",
      end: "11:45",
    });

    expect(result).toEqual({ entry: expect.any(Object) });
    expect(result.entry).toMatchObject({
      id: row.id,
      startedAt: "2026-10-01T12:15:00.000Z",
      endedAt: "2026-10-01T14:45:00.000Z",
      dayDate: "2026-10-01",
      weekStart: "2026-09-28",
      startLabel: "09:15",
      endLabel: "11:45",
      durationSeconds: 150 * 60,
      durationLabel: "2:30",
      extraDays: 0,
      editableTimes: true,
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-01T12:15:00.000Z",
      endedAt: "2026-10-01T14:45:00.000Z",
    });
  });

  it("TT-56, TT-45: cambiar la fecha la mueve de grupo y recalcula los dos totales", async () => {
    const moved = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");
    await seedClosed("2026-10-01T14:00:00Z", "2026-10-01T16:00:00Z");
    await seedClosed("2026-09-30T15:00:00Z", "2026-09-30T16:00:00Z");

    const before = await getTrackerState(actor, workspace, { from: null }, now);
    const totalOf = (state: typeof before, date: string) =>
      daysOf(state).find((group) => group.date === date)?.closedSeconds;
    expect(totalOf(before, "2026-10-01")).toBe(3 * 3600);
    expect(totalOf(before, "2026-09-30")).toBe(3600);

    const result = await updateEntryTimes(actor, workspace, {
      id: moved.id,
      date: "2026-09-30",
      start: "08:00",
      end: "09:00",
    });

    expect(result.entry.dayDate).toBe("2026-09-30");
    const after = await getTrackerState(actor, workspace, { from: null }, now);
    expect(totalOf(after, "2026-10-01")).toBe(2 * 3600);
    expect(totalOf(after, "2026-09-30")).toBe(2 * 3600);
    const group = daysOf(after).find((day) => day.date === "2026-09-30");
    expect(group?.entries.map((entry) => entry.id)).toContain(moved.id);
  });

  it("TT-72, TT-51: un fin menor que el inicio cruza la medianoche", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-10-01",
      start: "23:00",
      end: "02:00",
    });

    expect(result.entry).toMatchObject({
      startedAt: "2026-10-02T02:00:00.000Z",
      endedAt: "2026-10-02T05:00:00.000Z",
      dayDate: "2026-10-01",
      durationSeconds: 3 * 3600,
      extraDays: 1,
      editableTimes: true,
    });
  });

  it("TT-73: dos horas iguales fuera de la hora repetida se rechazan sin tocar la fila", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    for (const values of [
      { start: "10:00", end: "10:00" },
      // El inicio conservado y el fin igual a él: el descarte recalcula los dos
      // y siguen siendo iguales.
      { start: "08:00", end: "08:00" },
    ]) {
      await expect(
        updateEntryTimes(actor, workspace, { id: row.id, date: "2026-10-01", ...values }),
      ).rejects.toMatchObject({
        code: "validation",
        message: timeEntryMessages.tooShort,
      });
    }

    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(await auditActionsOf(row.id)).toEqual([]);
  });

  it("TT-73: un minuto de distancia entre las dos horas es el mínimo y se acepta", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-10-01",
      start: "10:00",
      end: "10:01",
    });

    expect(result.entry.durationSeconds).toBe(60);
  });

  it("TT-82: una edición que deja dos entradas superpuestas se guarda y las dos suman", async () => {
    await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T13:00:00Z");
    const row = await seedClosed("2026-10-01T17:00:00Z", "2026-10-01T18:00:00Z");

    await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-10-01",
      start: "09:00",
      end: "11:00",
    });

    const state = await getTrackerState(actor, workspace, { from: null }, now);
    const day = daysOf(state).find((group) => group.date === "2026-10-01");
    expect(day?.entries).toHaveLength(2);
    expect(day?.closedSeconds).toBe(4 * 3600);
  });

  it("rechaza un día anterior a la creación del workspace y acepta el mismo día", async () => {
    const reciente = workspaceOf(buenosAires, "2026-09-01T12:00:00Z");
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    await expect(
      updateEntryTimes(actor, reciente, {
        id: row.id,
        date: "2026-08-31",
        start: "08:00",
        end: "09:00",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.beforeWorkspace,
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:00:00.000Z",
    });

    const result = await updateEntryTimes(actor, reciente, {
      id: row.id,
      date: "2026-09-01",
      start: "08:00",
      end: "09:00",
    });
    expect(result.entry.dayDate).toBe("2026-09-01");
  });

  it("acepta mover una entrada cerrada al futuro: no hay cota superior (P-10)", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-12-24",
      start: "08:00",
      end: "09:00",
    });

    expect(result.entry.dayDate).toBe("2026-12-24");
    expect(result.entry.weekStart).toBe("2026-12-21");
  });
});

describe("updateEntryTimes: la semana de la entrada (P-15)", () => {
  const now = new Date("2026-10-02T15:00:00Z");
  const workspace = workspaceOf(buenosAires);
  const toAugust = { date: "2026-08-01", start: "08:00", end: "09:00" };

  it("sin timer, la movida debajo de la ventana trae una semana anterior a reachFrom", async () => {
    await seedClosed("2026-10-02T11:00:00Z", "2026-10-02T12:00:00Z");
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, { id: row.id, ...toAugust });

    expect(result.entry.weekStart).toBe("2026-07-27");
    const state = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(state).map((group) => group.date)).toEqual(["2026-10-02"]);
    expect(state.reachFrom).toBe("2026-09-14");
    const reached = await getTrackerState(
      actor,
      workspace,
      { from: result.entry.weekStart },
      now,
    );
    expect(daysOf(reached).map((group) => group.date)).toEqual([
      "2026-10-02",
      "2026-08-01",
    ]);
  });

  it("con un timer que arrancó antes, la movida se ve por el timer y su semana sigue antes de reachFrom", async () => {
    await seedClosed("2026-10-02T11:00:00Z", "2026-10-02T12:00:00Z");
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-07-31T12:00:00Z",
    });

    const result = await updateEntryTimes(actor, workspace, { id: row.id, ...toAugust });

    const state = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(state).map((group) => group.date)).toContain("2026-08-01");
    expect(state.windowFrom).toBe("2026-07-27");
    expect(state.reachFrom).toBe("2026-09-14");
    expect(result.entry.weekStart < state.reachFrom).toBe(true);
  });

  it("con una futura presente, la movida, sola entre las pasadas, es el piso", async () => {
    await seedClosed("2026-10-20T11:00:00Z", "2026-10-20T12:00:00Z");
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, { id: row.id, ...toAugust });

    const state = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(state).map((group) => group.date)).toEqual([
      "2026-10-20",
      "2026-08-01",
    ]);
    expect(state.reachFrom).toBe(result.entry.weekStart);
  });

  it("la movida que era la más reciente de las pasadas y deja de serlo cae antes de reachFrom", async () => {
    await seedClosed("2026-09-01T11:00:00Z", "2026-09-01T12:00:00Z");
    const row = await seedClosed("2026-09-10T11:00:00Z", "2026-09-10T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-08-15",
      start: "08:00",
      end: "09:00",
    });

    expect(result.entry.weekStart).toBe("2026-08-10");
    const state = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(state).map((group) => group.date)).toEqual(["2026-09-01"]);
    expect(state.reachFrom).toBe("2026-08-31");
  });

  it("la movida que sigue siendo la más reciente de las pasadas es el piso, con su semana entera", async () => {
    await seedClosed("2026-09-01T11:00:00Z", "2026-09-01T12:00:00Z");
    const row = await seedClosed("2026-09-10T11:00:00Z", "2026-09-10T12:00:00Z");

    const result = await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-09-05",
      start: "08:00",
      end: "09:00",
    });

    const state = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(state).map((group) => group.date)).toEqual([
      "2026-09-05",
      "2026-09-01",
    ]);
    expect(state.reachFrom).toBe(result.entry.weekStart);
  });
});

describe("updateEntryTimes con cambio de horario (Europe/Madrid)", () => {
  const workspace = workspaceOf(madrid);

  it("TT-97: las horas de pared que se editaron y la duración real, 240 y 120 minutos", async () => {
    const autumn = await seedClosed("2026-10-20T08:00:00Z", "2026-10-20T09:00:00Z");
    const spring = await seedClosed("2026-03-20T08:00:00Z", "2026-03-20T09:00:00Z");

    // 25/10: de 01:00 en +02:00 a 04:00 en +01:00.
    const fall = await updateEntryTimes(actor, workspace, {
      id: autumn.id,
      date: "2026-10-25",
      start: "01:00",
      end: "04:00",
    });
    expect(fall.entry).toMatchObject({
      startedAt: "2026-10-24T23:00:00.000Z",
      endedAt: "2026-10-25T03:00:00.000Z",
      startLabel: "01:00",
      endLabel: "04:00",
      dayDate: "2026-10-25",
      durationSeconds: 240 * 60,
    });

    // 29/03: de 01:00 en +01:00 a 04:00 en +02:00.
    const rise = await updateEntryTimes(actor, workspace, {
      id: spring.id,
      date: "2026-03-29",
      start: "01:00",
      end: "04:00",
    });
    expect(rise.entry).toMatchObject({
      startedAt: "2026-03-29T00:00:00.000Z",
      endedAt: "2026-03-29T02:00:00.000Z",
      startLabel: "01:00",
      endLabel: "04:00",
      durationSeconds: 120 * 60,
    });
  });

  it("TT-112: rechaza la hora que no existe en el inicio y en el fin, sin tocar la fila", async () => {
    const row = await seedClosed("2026-03-20T08:00:00Z", "2026-03-20T09:00:00Z");

    for (const values of [
      { start: "02:30", end: "04:00" },
      { start: "01:30", end: "02:30" },
    ]) {
      await expect(
        updateEntryTimes(actor, workspace, { id: row.id, date: "2026-03-29", ...values }),
      ).rejects.toMatchObject({
        code: "validation",
        message: timeEntryMessages.nonexistentClock,
      });
    }
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-03-20T08:00:00.000Z",
      endedAt: "2026-03-20T09:00:00.000Z",
    });
  });

  it("TT-81: ningún trío alrededor de los dos cambios deja el fin antes del inicio", async () => {
    // Las horas de 01:00 a 04:00 cada veinte minutos, contra dos entradas
    // sembradas en la primera ocurrencia de la hora repetida y una alrededor de
    // la hora que no existe.
    const clocks = Array.from({ length: 10 }, (_, index) =>
      shiftClock("01:00", index * 20),
    );
    const seeds = [
      {
        date: "2026-10-25",
        startedAt: "2026-10-24T23:50:00Z",
        endedAt: "2026-10-25T00:50:00Z",
      },
      {
        date: "2026-10-25",
        startedAt: "2026-10-25T00:30:00Z",
        endedAt: "2026-10-25T02:15:00Z",
      },
      {
        date: "2026-03-29",
        startedAt: "2026-03-29T00:10:00Z",
        endedAt: "2026-03-29T01:20:00Z",
      },
    ];
    let accepted = 0;
    for (const seed of seeds) {
      for (const start of clocks) {
        for (const end of clocks) {
          const row = await seedClosed(seed.startedAt, seed.endedAt);
          try {
            await updateEntryTimes(actor, workspace, {
              id: row.id,
              date: seed.date,
              start,
              end,
            });
            accepted += 1;
          } catch (error) {
            // Solo rechazos de dominio: un `check` violado saldría como otro error.
            const code = error instanceof TimeEntryError ? error.code : String(error);
            expect([start, end, code]).toEqual([start, end, "validation"]);
          }
          const after = await timeEntryById(row.id);
          const duration =
            (after?.endedAt?.getTime() ?? 0) - (after?.startedAt.getTime() ?? 0);
          expect([start, end, duration >= 0]).toEqual([start, end, true]);
          await deleteEntry(actor, { id: row.id });
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
    // Trescientas ediciones contra la base: el tope general de 20 s queda justo.
  }, 60_000);

  it("TT-81: instantFromLocal es estrictamente creciente en los seis días de los dos cambios", () => {
    const days = [
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ];
    for (const day of days) {
      const instants = Array.from({ length: 24 * 60 }, (_, minute) =>
        instantFromLocal(day, shiftClock("00:00", minute), madrid),
      ).filter((instant) => instant !== null);
      // Solo el 29/03 pierde una hora: de 02:00 a 02:59 no existe.
      expect([day, instants.length]).toEqual([
        day,
        day === "2026-03-29" ? 24 * 60 - 60 : 24 * 60,
      ]);
      for (let index = 1; index < instants.length; index += 1) {
        expect([day, index, instants[index] > instants[index - 1]]).toEqual([
          day,
          index,
          true,
        ]);
      }
      const nextMidnight = instantFromLocal(addDaysToKey(day, 1), "00:00", madrid);
      const lastMinute = instants.at(-1);
      expect([
        day,
        nextMidnight !== null && lastMinute !== undefined && nextMidnight > lastMinute,
      ]).toEqual([day, true]);
    }
  });
});

describe("ADR 0006: conservación y descarte", () => {
  it("descarta lo conservado en la hora repetida cuando el par queda fuera de orden", async () => {
    // 01:50 a 02:50 con el fin en la primera ocurrencia.
    const row = await seedClosed("2026-10-24T23:50:00Z", "2026-10-25T00:50:00Z");

    const result = await updateEntryTimes(actor, workspaceOf(madrid), {
      id: row.id,
      date: "2026-10-25",
      start: "02:10",
      end: "02:50",
    });

    expect(result.entry.startedAt).toBe("2026-10-25T01:10:00.000Z");
    expect(result.entry.endedAt).toBe("2026-10-25T01:50:00.000Z");
    expect(result.entry.durationSeconds).toBe(40 * 60);
  });

  it("conserva el inicio en la primera ocurrencia al cambiar el fin", async () => {
    // 02:30 en la primera ocurrencia a 03:15.
    const row = await seedClosed("2026-10-25T00:30:00Z", "2026-10-25T02:15:00Z");

    const result = await updateEntryTimes(actor, workspaceOf(madrid), {
      id: row.id,
      date: "2026-10-25",
      start: "02:30",
      end: "02:45",
    });

    expect(result.entry.startedAt).toBe("2026-10-25T00:30:00.000Z");
    expect(result.entry.endedAt).toBe("2026-10-25T01:45:00.000Z");
    expect(result.entry.durationSeconds).toBe(75 * 60);
  });

  it("acepta dos horas iguales que duran 60 minutos reales en la hora repetida", async () => {
    const row = await seedClosed("2026-10-25T00:30:00Z", "2026-10-25T02:15:00Z");

    const result = await updateEntryTimes(actor, workspaceOf(madrid), {
      id: row.id,
      date: "2026-10-25",
      start: "02:30",
      end: "02:30",
    });

    expect(result.entry.startedAt).toBe("2026-10-25T00:30:00.000Z");
    expect(result.entry.endedAt).toBe("2026-10-25T01:30:00.000Z");
    expect(result.entry.durationSeconds).toBe(60 * 60);
  });

  it("conserva los segundos del extremo que no cambió", async () => {
    // 10:00:40 a 10:30:15 en Buenos Aires.
    const row = await seedClosed("2026-10-01T13:00:40Z", "2026-10-01T13:30:15Z");

    const result = await updateEntryTimes(actor, workspaceOf(buenosAires), {
      id: row.id,
      date: "2026-10-01",
      start: "10:00",
      end: "11:00",
    });

    expect(result.entry.startedAt).toBe("2026-10-01T13:00:40.000Z");
    expect(result.entry.endedAt).toBe("2026-10-01T14:00:00.000Z");
  });

  it("recalcula los dos cuando el conservado dejaría el par en segundos", async () => {
    const row = await seedClosed("2026-10-01T13:00:40Z", "2026-10-01T13:30:15Z");

    const result = await updateEntryTimes(actor, workspaceOf(buenosAires), {
      id: row.id,
      date: "2026-10-01",
      start: "10:00",
      end: "10:01",
    });

    expect(result.entry.startedAt).toBe("2026-10-01T13:00:00.000Z");
    expect(result.entry.endedAt).toBe("2026-10-01T13:01:00.000Z");
  });

  describe("el timer en la primera ocurrencia", () => {
    /** Las 02:40 de la primera pasada. */
    const firstPass = new Date("2026-10-25T00:40:00Z");

    it("reguardar el inicio sin cambios lo conserva y no cae en futureTime", async () => {
      const row = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-25T00:20:00Z",
      });

      const result = await updateRunningStart(
        actor,
        workspaceOf(madrid),
        { id: row.id, date: "2026-10-25", start: "02:20" },
        firstPass,
      );

      expect(result.running.startedAt).toBe("2026-10-25T00:20:00.000Z");
      expect(result.running.endedAt).toBeNull();
    });

    it("un inicio cambiado va al segundo instante, que todavía no pasó", async () => {
      const row = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-25T00:20:00Z",
      });

      await expect(
        updateRunningStart(
          actor,
          workspaceOf(madrid),
          { id: row.id, date: "2026-10-25", start: "02:10" },
          firstPass,
        ),
      ).rejects.toMatchObject({
        code: "validation",
        message: timeEntryMessages.futureTime,
      });
      expect(await instantsOf(row.id)).toEqual({
        startedAt: "2026-10-25T00:20:00.000Z",
        endedAt: null,
      });
      expect(await auditActionsOf(row.id)).toEqual([]);
    });
  });
});

describe("updateEntryTimes: fechas en el borde del calendario", () => {
  it.each([
    ["el día de fin sin clave", { start: "23:00", end: "01:00" }],
    ["el fin en el año 10000 UTC", { start: "20:00", end: "22:00" }],
  ])("rechaza %s con invalidDate y sin tocar la fila", async (_, values) => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    await expect(
      updateEntryTimes(actor, workspaceOf(buenosAires), {
        id: row.id,
        date: "9999-12-31",
        ...values,
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.invalidDate,
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:00:00.000Z",
    });
  });
});

describe("updateRunningStart", () => {
  /** Las 12:00 del 2 de octubre de 2026 en Buenos Aires. */
  const now = new Date("2026-10-02T15:00:00Z");
  const workspace = workspaceOf(buenosAires);

  /** El timer activo del actor, arrancado a las 08:00 de hoy. */
  function seedTimer() {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
  }

  it("TT-28: mueve el inicio y la entrada sigue corriendo", async () => {
    const row = await seedTimer();

    const result = await updateRunningStart(
      actor,
      workspace,
      { id: row.id, date: "2026-10-02", start: "07:30" },
      now,
    );

    expect(result.running).toMatchObject({
      id: row.id,
      startedAt: "2026-10-02T10:30:00.000Z",
      endedAt: null,
      startLabel: "07:30",
      editableTimes: false,
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-02T10:30:00.000Z",
      endedAt: null,
    });
  });

  it("TT-29, TT-75: un inicio posterior a now se rechaza y el timer queda como estaba", async () => {
    const row = await seedTimer();

    await expect(
      updateRunningStart(
        actor,
        workspace,
        { id: row.id, date: "2026-10-02", start: "12:01" },
        now,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.futureTime,
    });
    await expect(
      updateRunningStart(
        actor,
        workspace,
        { id: row.id, date: "2026-10-03", start: "08:00" },
        now,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.futureTime,
    });

    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: null,
    });
    expect(await auditActionsOf(row.id)).toEqual([]);
  });

  it("acepta el inicio exactamente en now", async () => {
    const row = await seedTimer();

    const result = await updateRunningStart(
      actor,
      workspace,
      { id: row.id, date: "2026-10-02", start: "12:00" },
      now,
    );

    expect(result.running.startedAt).toBe(now.toISOString());
  });

  it("TT-112: rechaza una hora de inicio que no existe", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-03-29T03:00:00Z",
    });

    await expect(
      updateRunningStart(
        actor,
        workspaceOf(madrid),
        { id: row.id, date: "2026-03-29", start: "02:30" },
        new Date("2026-03-29T10:00:00Z"),
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.nonexistentClock,
    });
    expect((await instantsOf(row.id))?.startedAt).toBe("2026-03-29T03:00:00.000Z");
  });

  it("rechaza un día anterior a la creación del workspace y acepta el mismo día", async () => {
    const reciente = workspaceOf(buenosAires, "2026-09-01T12:00:00Z");
    const row = await seedTimer();

    await expect(
      updateRunningStart(
        actor,
        reciente,
        { id: row.id, date: "2026-08-31", start: "23:59" },
        now,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.beforeWorkspace,
    });
    expect((await instantsOf(row.id))?.startedAt).toBe("2026-10-02T11:00:00.000Z");

    const result = await updateRunningStart(
      actor,
      reciente,
      { id: row.id, date: "2026-09-01", start: "00:00" },
      now,
    );
    expect(result.running.dayDate).toBe("2026-09-01");
  });

  it("TT-28, TT-46: mover el inicio a un día anterior cambia el día del timer activo", async () => {
    await seedClosed("2026-10-02T12:00:00Z", "2026-10-02T13:00:00Z");
    await seedClosed("2026-10-01T12:00:00Z", "2026-10-01T13:00:00Z");
    const row = await seedTimer();

    const before = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(before).find((group) => group.isRunningDay)?.date).toBe("2026-10-02");

    await updateRunningStart(
      actor,
      workspace,
      { id: row.id, date: "2026-10-01", start: "20:00" },
      now,
    );

    const after = await getTrackerState(actor, workspace, { from: null }, now);
    const flags = daysOf(after).map((group) => [group.date, group.isRunningDay]);
    expect(flags).toEqual([
      ["2026-10-02", false],
      ["2026-10-01", true],
    ]);
    expect(after.running?.dayDate).toBe("2026-10-01");
  });
});

describe("desenlaces con una pestaña desactualizada (§4.3)", () => {
  const now = new Date("2026-10-02T15:00:00Z");
  const workspace = workspaceOf(buenosAires);
  const trio = { date: "2026-10-01", start: "09:00", end: "10:00" };

  it("updateEntryTimes sobre una entrada borrada responde not_found sin escribir", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");
    await deleteEntry(actor, { id: row.id });

    await expect(
      updateEntryTimes(actor, workspace, { id: row.id, ...trio }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    expect(await allTimeEntries()).toEqual([]);
    expect(await auditActionsOf(row.id)).toEqual(["timeEntry.delete"]);
  });

  it("TT-111: updateEntryTimes sobre la entrada que corre responde timer_running sin escribir", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(
      updateEntryTimes(actor, workspace, { id: row.id, ...trio }),
    ).rejects.toMatchObject({
      code: "timer_running",
      message: timeEntryMessages.runningEntryTimes,
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: null,
    });
    expect(await auditActionsOf(row.id)).toEqual([]);
  });

  it("TT-111: la entrada que corre gana sobre un trío que por sí solo sería inválido", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(
      updateEntryTimes(actor, workspace, {
        id: row.id,
        date: "2026-10-01",
        start: "10:00",
        end: "10:00",
      }),
    ).rejects.toMatchObject({
      code: "timer_running",
      message: timeEntryMessages.runningEntryTimes,
    });
    expect((await instantsOf(row.id))?.endedAt).toBeNull();
  });

  it("el timer detenido gana sobre un inicio que por sí solo sería futuro", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    await stopTimer(actor, workspaceOf(buenosAires), { id: row.id });

    await expect(
      updateRunningStart(
        actor,
        workspace,
        { id: row.id, date: "2026-10-03", start: "08:00" },
        now,
      ),
    ).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    expect((await instantsOf(row.id))?.startedAt).toBe("2026-10-02T11:00:00.000Z");
  });

  it("updateRunningStart sobre un timer ya detenido responde already_stopped sin escribir", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const stopped = await stopTimer(actor, workspaceOf(buenosAires), { id: row.id });

    await expect(
      updateRunningStart(
        actor,
        workspace,
        { id: row.id, date: "2026-10-02", start: "07:00" },
        now,
      ),
    ).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: stopped.stopped.endedAt,
    });
    expect(await auditActionsOf(row.id)).toEqual(["timeEntry.stop"]);
  });

  it("updateRunningStart sobre una entrada borrada responde not_found sin escribir", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    await deleteEntry(actor, { id: row.id });

    await expect(
      updateRunningStart(
        actor,
        workspace,
        { id: row.id, date: "2026-10-02", start: "07:00" },
        now,
      ),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    expect(await allTimeEntries()).toEqual([]);
  });

  it("TT-79: las dos sobre la entrada de otra persona responden forbidden sin escribir", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const closed = await seedClosed(
      "2026-10-01T11:00:00Z",
      "2026-10-01T12:00:00Z",
      otherId,
    );
    const running = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(
      updateEntryTimes(actor, workspace, { id: closed.id, ...trio }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    await expect(
      updateRunningStart(
        actor,
        workspace,
        { id: running.id, date: "2026-10-02", start: "07:00" },
        now,
      ),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });

    expect(await instantsOf(closed.id)).toEqual({
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:00:00.000Z",
    });
    expect((await instantsOf(running.id))?.startedAt).toBe("2026-10-02T11:00:00.000Z");
    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("TT-80: un id que no existe responde not_found por las dos", async () => {
    const id = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";

    await expect(
      updateEntryTimes(actor, workspace, { id, ...trio }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    await expect(
      updateRunningStart(
        actor,
        workspace,
        { id, date: "2026-10-02", start: "07:00" },
        now,
      ),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
  });

  it("la parada que esperaba el bloqueo de updateRunningStart se escribe con el inicio nuevo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: new Date(Date.now() - 3_600_000),
    });
    // Un inicio posterior al now() con que va a arrancar la parada. El `now` de
    // la aplicación va por delante, como un reloj adelantado respecto del de la
    // base: es lo que deja pasar `futureTime`.
    const moved = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 60_000) * 60_000);
    const appNow = new Date(moved.getTime() + 3_600_000);

    const [started, stopped] = await queueBehindBarrier(lockRow(row.id), [
      () =>
        updateRunningStart(
          actor,
          workspace,
          {
            id: row.id,
            date: dayKey(moved, buenosAires),
            start: formatClock(moved, buenosAires),
          },
          appNow,
        ),
      () => stopTimer(actor, workspaceOf(buenosAires), { id: row.id }),
    ]);

    expect(started.status).toBe("fulfilled");
    expect(stopped).toMatchObject({
      status: "fulfilled",
      value: {
        stopped: { startedAt: moved.toISOString(), endedAt: moved.toISOString() },
      },
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: moved.toISOString(),
      endedAt: moved.toISOString(),
    });
    expect(await auditActionsOf(row.id)).toEqual([
      "timeEntry.updateStart",
      "timeEntry.stop",
    ]);
  });

  it("el arranque que esperaba el bloqueo de updateRunningStart cierra con el inicio nuevo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: new Date(Date.now() - 3_600_000),
    });
    const moved = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 60_000) * 60_000);
    const appNow = new Date(moved.getTime() + 3_600_000);
    const nextId = randomUUID();

    const [started, restarted] = await queueBehindBarrier(lockRow(row.id), [
      () =>
        updateRunningStart(
          actor,
          workspace,
          {
            id: row.id,
            date: dayKey(moved, buenosAires),
            start: formatClock(moved, buenosAires),
          },
          appNow,
        ),
      () =>
        startTimer(actor, workspaceOf(buenosAires), {
          projectId: null,
          taskId: null,
          id: nextId,
          description: "siguiente",
        }),
    ]);

    expect(started.status).toBe("fulfilled");
    expect(restarted).toMatchObject({
      status: "fulfilled",
      value: {
        running: { id: nextId, endedAt: null },
        stopped: { id: row.id, endedAt: moved.toISOString() },
      },
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: moved.toISOString(),
      endedAt: moved.toISOString(),
    });
    const open = (await timeEntriesOf(workspaceId, actor.userId)).filter(
      (entry) => entry.endedAt === null,
    );
    expect(open.map((entry) => entry.id)).toEqual([nextId]);
  });
});

describe("TT-89: aplicar dos veces el mismo pedido deja el mismo estado (§4.4)", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it.each([
    [
      "con un extremo conservado con segundos",
      buenosAires,
      { startedAt: "2026-10-01T13:00:40Z", endedAt: "2026-10-01T13:30:15Z" },
      { date: "2026-10-01", start: "10:00", end: "11:00" },
    ],
    [
      "con el descarte en la hora repetida",
      madrid,
      { startedAt: "2026-10-24T23:50:00Z", endedAt: "2026-10-25T00:50:00Z" },
      { date: "2026-10-25", start: "02:10", end: "02:50" },
    ],
    [
      "con la fecha cambiada",
      buenosAires,
      { startedAt: "2026-10-01T13:00:40Z", endedAt: "2026-10-01T13:30:15Z" },
      { date: "2026-09-28", start: "10:00", end: "10:30" },
    ],
  ])("updateEntryTimes %s", async (_, timezone, seed, trio) => {
    const row = await seedClosed(seed.startedAt, seed.endedAt);

    const first = await updateEntryTimes(actor, workspaceOf(timezone), {
      id: row.id,
      ...trio,
    });
    const once = await instantsOf(row.id);
    const second = await updateEntryTimes(actor, workspaceOf(timezone), {
      id: row.id,
      ...trio,
    });

    expect(second.entry).toEqual(first.entry);
    expect(await instantsOf(row.id)).toEqual(once);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(1);
  });

  it("updateRunningStart", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:40Z",
    });
    const input = { id: row.id, date: "2026-10-02", start: "07:30" };

    const first = await updateRunningStart(actor, workspaceOf(buenosAires), input, now);
    const second = await updateRunningStart(actor, workspaceOf(buenosAires), input, now);

    expect(second.running).toEqual(first.running);
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-02T10:30:00.000Z",
      endedAt: null,
    });
  });
});

describe("TT-110: editableTimes", () => {
  it("es el round-trip del trío al minuto, no un umbral de duración", async () => {
    const now = new Date("2026-10-10T15:00:00Z");
    const cases = [
      // [descripción, inicio, fin, editable]
      ["25 h", "2026-10-01T13:00:00Z", "2026-10-02T14:00:00Z", false],
      ["24 h justas", "2026-10-02T13:00:00Z", "2026-10-03T13:00:00Z", false],
      ["48 h", "2026-10-03T13:00:00Z", "2026-10-05T13:00:00Z", false],
      ["23 h 59 min 40 s", "2026-10-05T13:00:50Z", "2026-10-06T13:00:30Z", false],
      [
        "23 h 30 que cruza la medianoche",
        "2026-10-06T13:00:00Z",
        "2026-10-07T12:30:00Z",
        true,
      ],
      ["30 s en el mismo minuto", "2026-10-07T20:00:10Z", "2026-10-07T20:00:40Z", true],
      [
        "30 s que cambian de minuto",
        "2026-10-08T20:00:50Z",
        "2026-10-08T20:01:20Z",
        true,
      ],
      ["23 h 59 min de reloj", "2026-10-08T13:00:00Z", "2026-10-09T12:59:00Z", true],
    ] as const;
    const ids = new Map<string, string>();
    for (const [name, startedAt, endedAt] of cases) {
      ids.set(name, (await seedClosed(startedAt, endedAt)).id);
    }

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    const views = new Map(
      daysOf(state)
        .flatMap((group) => group.entries)
        .map((entry) => [entry.id, entry]),
    );
    for (const [name, , , editable] of cases) {
      expect([name, views.get(ids.get(name) ?? "")?.editableTimes]).toEqual([
        name,
        editable,
      ]);
    }
  });

  it("es falso en la entrada que corre (TT-111)", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      new Date("2026-10-02T11:30:00Z"),
    );

    expect(state.running?.editableTimes).toBe(false);
  });

  it("cruzando un cambio de horario, mide la distancia de reloj y no la duración", async () => {
    // Cada caso se lee con un `now` del día siguiente a su fin, para que caiga
    // en la ventana.
    const cases = [
      // 23 h 30 de reloj que cruzan el atraso: 24 h 30 reales, editable.
      ["23 h 30 de reloj, atraso", "2026-10-24T08:00:00Z", "2026-10-25T08:30:00Z", true],
      // 24 h 30 de reloj que cruzan el adelanto: 23 h 30 reales, solo lectura.
      [
        "24 h 30 de reloj, adelanto",
        "2026-03-28T09:00:00Z",
        "2026-03-29T08:30:00Z",
        false,
      ],
      // 02:40 en la primera pasada a 02:20 en la segunda: el trío lo leería
      // como una entrada que termina al día siguiente.
      [
        "distancia negativa en la hora repetida",
        "2026-10-25T00:40:00Z",
        "2026-10-25T01:20:00Z",
        false,
      ],
    ] as const;
    for (const [name, startedAt, endedAt, editable] of cases) {
      const row = await seedClosed(startedAt, endedAt);
      const now = new Date(new Date(endedAt).getTime() + 24 * 3_600_000);

      const state = await getTrackerState(
        actor,
        workspaceOf(madrid),
        { from: null },
        now,
      );

      const view = daysOf(state)
        .flatMap((group) => group.entries)
        .find((entry) => entry.id === row.id);
      expect([name, view?.editableTimes]).toEqual([name, editable]);
    }
  });

  it("lo que updateEntryTimes escribe siempre vuelve editable", async () => {
    const row = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");

    const result = await updateEntryTimes(actor, workspaceOf(buenosAires), {
      id: row.id,
      date: "2026-10-01",
      start: "22:00",
      end: "21:59",
    });

    expect(result.entry.durationSeconds).toBe((24 * 60 - 1) * 60);
    expect(result.entry.editableTimes).toBe(true);
  });

  it("updateEntryTimes rechaza la entrada que el trío no puede expresar, sin truncarla", async () => {
    // 50 h: el trío de su vista es 10:00 – 12:00 del 1/10, y guardarlo la
    // dejaría en dos horas.
    const row = await seedClosed("2026-10-01T13:00:00Z", "2026-10-03T15:00:00Z");

    await expect(
      updateEntryTimes(actor, workspaceOf(buenosAires), {
        id: row.id,
        date: "2026-10-01",
        start: "10:00",
        end: "12:00",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.multiDayTimes,
    });
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-01T13:00:00.000Z",
      endedAt: "2026-10-03T15:00:00.000Z",
    });
    expect(await auditActionsOf(row.id)).toEqual([]);
  });
});

describe("las guardas de las dos escrituras nuevas del repository", () => {
  // Inalcanzables a través del service, que ya leyó la fila con FOR UPDATE y
  // comprobó lo mismo: por eso se llama al repository directo.
  it("updateClosedEntry no escribe sobre una entrada abierta", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const target = { workspaceId, userId: actor.userId, id: row.id };
    const times = {
      startedAt: new Date("2026-10-01T11:00:00Z"),
      endedAt: new Date("2026-10-01T12:00:00Z"),
    };

    const written = await db.transaction((tx) =>
      timeEntryRepository.updateClosedEntry(tx, target, times),
    );

    expect(written).toBeUndefined();
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: null,
    });
    const closed = await seedClosed("2026-10-03T11:00:00Z", "2026-10-03T12:00:00Z");
    const own = await db.transaction((tx) =>
      timeEntryRepository.updateClosedEntry(tx, { ...target, id: closed.id }, times),
    );
    expect(own?.startedAt.toISOString()).toBe("2026-10-01T11:00:00.000Z");
  });

  it("updateRunningEntry no escribe sobre una entrada cerrada", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");
    const target = { workspaceId, userId: actor.userId, id: row.id };
    const startedAt = new Date("2026-10-01T10:00:00Z");

    const written = await db.transaction((tx) =>
      timeEntryRepository.updateRunningEntry(tx, target, { startedAt }),
    );

    expect(written).toBeUndefined();
    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:00:00.000Z",
    });
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const own = await db.transaction((tx) =>
      timeEntryRepository.updateRunningEntry(
        tx,
        { ...target, id: running.id },
        { startedAt },
      ),
    );
    expect(own?.startedAt.toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });

  it("el check sigue rechazando un fin anterior al inicio escrito directo (TT-81)", async () => {
    const row = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");

    const failure = await db
      .transaction((tx) =>
        timeEntryRepository.updateClosedEntry(
          tx,
          { workspaceId, userId: actor.userId, id: row.id },
          {
            startedAt: new Date("2026-10-01T12:00:00Z"),
            endedAt: new Date("2026-10-01T11:00:00Z"),
          },
        ),
      )
      .catch((error: unknown) => error);

    expect(timeEntryRepository.isEndBeforeStart(failure)).toBe(true);
  });
});

/** Las filas del actor como pares `[id, abierta]`, de la más vieja a la más nueva. */
async function ownRowsOpenness() {
  return (await timeEntriesOf(workspaceId, actor.userId)).map((row) => [
    row.id,
    row.endedAt === null,
  ]);
}

/** Una entrada cerrada del actor, la original de continuar y duplicar. */
function seedSource(description = "diseño") {
  return seedTimeEntry({
    workspaceId,
    userId: actor.userId,
    description,
    startedAt: "2026-10-01T11:00:07.250Z",
    endedAt: "2026-10-01T12:34:56.500Z",
  });
}

describe("continueEntry (TT-57)", () => {
  it("abre una entrada nueva con la descripción de la original y no la toca", async () => {
    const source = await seedSource();
    const id = randomUUID();

    const result = await continueEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: source.id,
    });

    expect(result.stopped).toBeNull();
    expect(result.running).toMatchObject({
      id,
      description: "diseño",
      endedAt: null,
      durationSeconds: null,
    });
    expect(await timeEntryById(source.id)).toEqual(source);
    expect(await ownRowsOpenness()).toEqual([
      [source.id, false],
      [id, true],
    ]);
  });

  it("TT-36: cierra el timer que corría en el mismo instante en que abre el nuevo", async () => {
    const source = await seedSource();
    const previous = await seedRunning();

    const result = await continueEntry(actor, workspaceOf(buenosAires), {
      id: randomUUID(),
      sourceId: source.id,
    });

    expect(result.stopped?.id).toBe(previous.id);
    expect(result.stopped?.endedAt).toBe(result.running.startedAt);
    const closed = await timeEntryById(previous.id);
    expect(closed?.endedAt?.toISOString()).toBe(result.running.startedAt);
    expect(
      (await timeEntriesOf(workspaceId, actor.userId)).filter(
        (row) => row.endedAt === null,
      ),
    ).toHaveLength(1);
  });

  it("TT-101: un timer con el inicio por delante del now() cierra en su inicio", async () => {
    const source = await seedSource();
    const ahead = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: new Date(Date.now() + 3_600_000),
    });

    const result = await continueEntry(actor, workspaceOf(buenosAires), {
      id: randomUUID(),
      sourceId: source.id,
    });

    expect(result.stopped?.id).toBe(ahead.id);
    expect(result.stopped?.endedAt).toBe(ahead.startedAt.toISOString());
    expect(result.stopped?.durationSeconds).toBe(0);
    expect(new Date(result.running.startedAt).getTime()).toBeLessThan(
      ahead.startedAt.getTime(),
    );
  });

  it("continuar el timer abierto lo cierra y abre otro igual", async () => {
    const previous = await seedRunning("en curso");
    const id = randomUUID();

    const result = await continueEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: previous.id,
    });

    expect(result.stopped?.id).toBe(previous.id);
    expect(result.running).toMatchObject({ id, description: "en curso", endedAt: null });
    expect(await ownRowsOpenness()).toEqual([
      [previous.id, false],
      [id, true],
    ]);
  });

  it("TT-80: una original que no existe responde not_found y deja el timer abierto", async () => {
    const previous = await seedRunning();
    const rows = await allTimeEntries();

    await expect(
      continueEntry(actor, workspaceOf(buenosAires), {
        id: randomUUID(),
        sourceId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });

    expect(await allTimeEntries()).toEqual(rows);
    expect((await timeEntryById(previous.id))?.endedAt).toBeNull();
  });

  it("TT-79: la original de otra persona responde forbidden con su texto y no escribe", async () => {
    const previous = await seedRunning();
    const otherId = await seedMember(workspaceId, "member");
    const foreign = await seedSource();
    await db
      .update(timeEntry)
      .set({ userId: otherId })
      .where(eq(timeEntry.id, foreign.id));
    const rows = await allTimeEntries();
    const audit = await auditFor("time_entry");

    await expect(
      continueEntry(actor, workspaceOf(buenosAires), {
        id: randomUUID(),
        sourceId: foreign.id,
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });

    expect(await allTimeEntries()).toEqual(rows);
    expect(await auditFor("time_entry")).toEqual(audit);
    expect((await timeEntryById(previous.id))?.endedAt).toBeNull();
  });

  it("la original de otro workspace no se distingue de una que no existe", async () => {
    const other = await seedWorkspace(buenosAires);
    const foreign = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await expect(
      continueEntry(actor, workspaceOf(buenosAires), {
        id: randomUUID(),
        sourceId: foreign.id,
      }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([]);
  });
});

describe("continueEntry con el id que eligió el cliente (ADR 0007)", () => {
  it("el reintento en secuencia responde la misma fila y no escribe nada", async () => {
    const source = await seedSource();
    const previous = await seedRunning();
    const id = randomUUID();
    const first = await continueEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: source.id,
    });
    expect(first.stopped?.id).toBe(previous.id);
    const rows = await allTimeEntries();
    const audit = await auditFor("time_entry");

    const retry = await continueEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: source.id,
    });

    expect(retry).toEqual({ running: first.running, stopped: null });
    expect(await allTimeEntries()).toEqual(rows);
    expect(await auditFor("time_entry")).toEqual(audit);
  });

  it("un reintento cuya continuación ya se detuvo la responde cerrada y no escribe", async () => {
    const source = await seedSource();
    const id = randomUUID();
    await continueEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id });
    const { stopped } = await stopTimer(actor, workspaceOf(buenosAires), { id });
    const rows = await allTimeEntries();
    const audit = await auditFor("time_entry");

    const retry = await continueEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: source.id,
    });

    expect(retry).toEqual({ running: stopped, stopped: null });
    expect(await allTimeEntries()).toEqual(rows);
    expect(await auditFor("time_entry")).toEqual(audit);
  });

  /** Lo que tiene que quedar de dos continuaciones del mismo pedido sobre un timer previo. */
  async function expectContinuedOnce(id: string, sourceId: string, previousId: string) {
    expect(await ownRowsOpenness()).toEqual([
      [sourceId, false],
      [previousId, false],
      [id, true],
    ]);
    const audit = await auditFor("time_entry");
    expect(audit.map((row) => [row.action, row.entityId]).sort()).toEqual(
      [
        ["timeEntry.continue", id],
        ["timeEntry.stop", previousId],
      ].sort(),
    );
  }

  it("el reintento en paralelo deja una sola fila y un solo cierre", async () => {
    const source = await seedSource();
    const previous = await seedRunning();
    const id = randomUUID();
    await warmPool(2);

    const results = await Promise.all([
      continueEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id }),
      continueEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id }),
    ]);

    expect(results.map((result) => result.running.id)).toEqual([id, id]);
    await expectContinuedOnce(id, source.id, previous.id);
  });

  it("el reintento en paralelo, obligado a cruzarse, también", async () => {
    const source = await seedSource();
    const previous = await seedRunning();
    const id = randomUUID();

    const results = await raceThroughBarrier(
      (tx) => timeEntryRepository.findByIdForUpdate(tx, workspaceId, previous.id),
      [
        () => continueEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id }),
        () => continueEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id }),
      ],
    );

    expect(results.map((result) => result.running.id)).toEqual([id, id]);
    expect(results.filter((result) => result.stopped?.id === previous.id)).toHaveLength(
      1,
    );
    await expectContinuedOnce(id, source.id, previous.id);
  });

  describe("TT-37: carreras de continuar con ids distintos que se cruzan", () => {
    /** El que creó y el que responde al ganador, con el mismo timer. */
    function creatorAndWinner(
      ids: readonly string[],
      results: readonly ContinueEntryResult[],
    ) {
      const [first, second] = results;
      expect(first.running.id).toBe(second.running.id);
      const creator = ids.findIndex((id) => id === first.running.id);
      expect(creator).not.toBe(-1);
      return { created: results[creator], answered: results[1 - creator] };
    }

    /** Un solo timer, la previa como única cerrada nueva y ninguna de 0 s. */
    async function expectOneTimer(
      sourceId: string,
      previousId: string,
      runningId: string,
    ) {
      expect(await ownRowsOpenness()).toEqual([
        [sourceId, false],
        [previousId, false],
        [runningId, true],
      ]);
      for (const row of await timeEntriesOf(workspaceId, actor.userId)) {
        if (row.endedAt !== null) {
          expect(row.endedAt.getTime()).toBeGreaterThan(row.startedAt.getTime());
        }
      }
    }

    it("continuar y arrancar a la vez dejan un solo timer", async () => {
      const source = await seedSource();
      const previous = await seedRunning();
      const ids = [randomUUID(), randomUUID()];

      const results = await raceThroughBarrier(
        (tx) => timeEntryRepository.findByIdForUpdate(tx, workspaceId, previous.id),
        [
          () =>
            continueEntry(actor, workspaceOf(buenosAires), {
              id: ids[0],
              sourceId: source.id,
            }),
          () =>
            startTimer(actor, workspaceOf(buenosAires), {
              projectId: null,
              taskId: null,
              id: ids[1],
              description: "nuevo",
            }),
        ],
      );

      const { created, answered } = creatorAndWinner(ids, results);
      expect(created.stopped?.id).toBe(previous.id);
      expect(answered.stopped).toBeNull();
      await expectOneTimer(source.id, previous.id, created.running.id);
    });

    it("dos «Continuar» de la misma entrada no dejan una entrada de 0 s", async () => {
      const source = await seedSource();
      const previous = await seedRunning();
      const ids = [randomUUID(), randomUUID()];

      const results = await raceThroughBarrier(
        (tx) => timeEntryRepository.findByIdForUpdate(tx, workspaceId, previous.id),
        ids.map(
          (id) => () =>
            continueEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id }),
        ),
      );

      const { created, answered } = creatorAndWinner(ids, results);
      expect(created.stopped?.id).toBe(previous.id);
      expect(answered.stopped).toBeNull();
      expect(created.running.description).toBe("diseño");
      await expectOneTimer(source.id, previous.id, created.running.id);
    });
  });
});

/** Dónde vive la entrada ajena cuyo id se reusa: lo único que la separa del actor. */
const foreignOwners = {
  "otra persona del workspace": async () => ({
    workspaceId,
    userId: await seedMember(workspaceId, "member"),
  }),
  "otra persona de otro workspace": async () => {
    const other = await seedWorkspace(buenosAires);
    return { workspaceId: other.workspaceId, userId: other.ownerId };
  },
  // Mismo usuario: lo único que la deja afuera es el filtro por workspace.
  "la misma persona en otro workspace": async () => {
    const other = await seedWorkspace(buenosAires);
    await db.insert(membership).values({
      workspaceId: other.workspaceId,
      userId: actor.userId,
      role: "member",
    });
    return { workspaceId: other.workspaceId, userId: actor.userId };
  },
};

describe("continueEntry y duplicateEntry con el id de una fila ajena (ADR 0007)", () => {
  const creations = {
    continueEntry: (id: string, sourceId: string) =>
      continueEntry(actor, workspaceOf(buenosAires), { id, sourceId }),
    duplicateEntry: (id: string, sourceId: string) =>
      duplicateEntry(actor, workspaceOf(buenosAires), { id, sourceId }),
  };

  describe.each(Object.entries(creations))("%s", (_, create) => {
    it.each(Object.entries(foreignOwners))(
      "con el id de %s responde forbidden, no escribe y deja abierto el timer propio",
      async (__, ownerOf) => {
        const source = await seedSource();
        const mine = await seedRunning("mío");
        const foreign = await seedTimeEntry({
          ...(await ownerOf()),
          startedAt: "2026-10-02T09:00:00Z",
          endedAt: "2026-10-02T10:00:00Z",
        });
        const rows = await allTimeEntries();
        const audit = await auditFor("time_entry");

        const error = await create(foreign.id, source.id).catch(
          (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error).toMatchObject({ code: "forbidden" });
        expect(await allTimeEntries()).toEqual(rows);
        expect(await auditFor("time_entry")).toEqual(audit);
        expect((await timeEntryById(mine.id))?.endedAt).toBeNull();
      },
    );

    it.each(["inactive", "invited"] as const)(
      "con la membresía %s responde forbidden aunque el id sea de una entrada propia",
      async (status) => {
        const source = await seedSource();
        const own = await seedClosed("2026-10-02T09:00:00Z", "2026-10-02T10:00:00Z");
        const rows = await allTimeEntries();
        actor = { ...actor, status };

        await expect(create(own.id, source.id)).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
        expect(await allTimeEntries()).toEqual(rows);
      },
    );
  });
});

describe("duplicateEntry (TT-58)", () => {
  it("P-14: la copia tiene exactamente los instantes de la original", async () => {
    const source = await seedSource();

    const { created } = await duplicateEntry(actor, workspaceOf(buenosAires), {
      id: randomUUID(),
      sourceId: source.id,
    });

    expect(created.startedAt).toBe("2026-10-01T11:00:07.250Z");
    expect(created.endedAt).toBe("2026-10-01T12:34:56.500Z");
    expect(await instantsOf(created.id)).toEqual({
      startedAt: "2026-10-01T11:00:07.250Z",
      endedAt: "2026-10-01T12:34:56.500Z",
    });
  });

  it("agrega una fila con la descripción de la original y deja la original intacta", async () => {
    const source = await seedSource();
    const id = randomUUID();

    const { created } = await duplicateEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: source.id,
    });

    expect(created).toMatchObject({ id, description: "diseño", dayDate: "2026-10-01" });
    expect(await timeEntryById(source.id)).toEqual(source);
    const rows = await timeEntriesOf(workspaceId, actor.userId);
    expect(rows.map((row) => [row.id, row.description]).sort()).toEqual(
      [
        [source.id, "diseño"],
        [id, "diseño"],
      ].sort(),
    );
  });

  it("el reintento con el mismo id responde la copia y no crea otra", async () => {
    const source = await seedSource();
    const id = randomUUID();
    const first = await duplicateEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: source.id,
    });
    const rows = await allTimeEntries();
    const audit = await auditFor("time_entry");

    const retry = await duplicateEntry(actor, workspaceOf(buenosAires), {
      id,
      sourceId: source.id,
    });

    expect(retry).toEqual(first);
    expect(await allTimeEntries()).toEqual(rows);
    expect(await auditFor("time_entry")).toEqual(audit);
  });

  it("el reintento en paralelo deja una sola copia", async () => {
    const source = await seedSource();
    const id = randomUUID();
    await warmPool(2);

    const results = await Promise.all([
      duplicateEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id }),
      duplicateEntry(actor, workspaceOf(buenosAires), { id, sourceId: source.id }),
    ]);

    expect(results.map((result) => result.created.id)).toEqual([id, id]);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(2);
    expect(
      (await auditFor("time_entry")).filter(
        (row) => row.action === "timeEntry.duplicate",
      ),
    ).toHaveLength(1);
  });

  it("dos pedidos con ids distintos son dos copias", async () => {
    const source = await seedSource();

    await duplicateEntry(actor, workspaceOf(buenosAires), {
      id: randomUUID(),
      sourceId: source.id,
    });
    await duplicateEntry(actor, workspaceOf(buenosAires), {
      id: randomUUID(),
      sourceId: source.id,
    });

    expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(3);
  });

  it("con un timer corriendo crea la copia y no lo toca", async () => {
    const source = await seedSource();
    const running = await seedRunning();

    await duplicateEntry(actor, workspaceOf(buenosAires), {
      id: randomUUID(),
      sourceId: source.id,
    });

    expect(await timeEntryById(running.id)).toEqual(running);
  });

  it("la entrada que corre responde timer_running con su texto y no escribe", async () => {
    const running = await seedRunning();
    const rows = await allTimeEntries();
    const audit = await auditFor("time_entry");

    await expect(
      duplicateEntry(actor, workspaceOf(buenosAires), {
        id: randomUUID(),
        sourceId: running.id,
      }),
    ).rejects.toMatchObject({
      code: "timer_running",
      message: timeEntryMessages.runningEntryTimes,
    });
    expect(await allTimeEntries()).toEqual(rows);
    expect(await auditFor("time_entry")).toEqual(audit);
  });

  it("TT-79, TT-80: la original ajena y la que no existe, con su texto", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const foreign = await seedClosed(
      "2026-10-01T11:00:00Z",
      "2026-10-01T12:00:00Z",
      otherId,
    );
    const rows = await allTimeEntries();

    await expect(
      duplicateEntry(actor, workspaceOf(buenosAires), {
        id: randomUUID(),
        sourceId: foreign.id,
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    await expect(
      duplicateEntry(actor, workspaceOf(buenosAires), {
        id: randomUUID(),
        sourceId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    expect(await allTimeEntries()).toEqual(rows);
  });
});

describe("discardTimer (TT-65)", () => {
  it("borra el timer que corre", async () => {
    const running = await seedRunning();

    const result = await discardTimer(actor, { id: running.id });

    expect(result).toEqual({ id: running.id });
    expect(await timeEntryById(running.id)).toBeUndefined();
  });

  it("un timer que otra pestaña detuvo responde already_stopped y la entrada se queda", async () => {
    const running = await seedRunning();
    await stopTimer(actor, workspaceOf(buenosAires), { id: running.id });
    const rows = await allTimeEntries();

    await expect(discardTimer(actor, { id: running.id })).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    expect(await allTimeEntries()).toEqual(rows);
  });

  it("uno que otra pestaña cerró al arrancar o continuar, igual, y el nuevo sigue", async () => {
    const source = await seedSource();
    const running = await seedRunning();
    const started = await startTimer(actor, workspaceOf(buenosAires), {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "otro",
    });
    const continued = await continueEntry(actor, workspaceOf(buenosAires), {
      id: randomUUID(),
      sourceId: source.id,
    });
    const rows = await allTimeEntries();

    for (const closed of [running.id, started.running.id]) {
      await expect(discardTimer(actor, { id: closed })).rejects.toMatchObject({
        code: "already_stopped",
        message: timeEntryMessages.alreadyStopped,
      });
    }
    expect(await allTimeEntries()).toEqual(rows);
    expect((await timeEntryById(continued.running.id))?.endedAt).toBeNull();
  });

  it("uno que otra pestaña borró es éxito sin escribir nada", async () => {
    const running = await seedRunning();
    await deleteEntry(actor, { id: running.id });
    const audit = await auditFor("time_entry");

    const result = await discardTimer(actor, { id: running.id });

    expect(result).toEqual({ id: running.id });
    expect(await auditFor("time_entry")).toEqual(audit);
  });

  it("el reintento de un descarte aplicado es éxito", async () => {
    const running = await seedRunning();
    await discardTimer(actor, { id: running.id });

    await expect(discardTimer(actor, { id: running.id })).resolves.toEqual({
      id: running.id,
    });
  });

  it("detenido mientras el descarte esperaba la fila, responde already_stopped", async () => {
    const running = await seedRunning();

    const [stopped, discarded] = await queueBehindBarrier(lockRow(running.id), [
      () => stopTimer(actor, workspaceOf(buenosAires), { id: running.id }),
      () => discardTimer(actor, { id: running.id }),
    ]);

    expect(stopped.status).toBe("fulfilled");
    expect(discarded).toMatchObject({
      status: "rejected",
      reason: { code: "already_stopped" },
    });
    expect((await timeEntryById(running.id))?.endedAt).not.toBeNull();
  });

  it("borrado mientras el descarte esperaba la fila, es éxito sin aviso", async () => {
    const running = await seedRunning();

    const [deleted, discarded] = await queueBehindBarrier(lockRow(running.id), [
      () => deleteEntry(actor, { id: running.id }),
      () => discardTimer(actor, { id: running.id }),
    ]);

    expect(deleted.status).toBe("fulfilled");
    expect(discarded).toEqual({ status: "fulfilled", value: { id: running.id } });
    expect(await timeEntryById(running.id)).toBeUndefined();
    expect(await auditActionsOf(running.id)).toEqual(["timeEntry.delete"]);
  });

  it("con el inicio movido mientras esperaba la fila, lo descarta igual", async () => {
    const running = await seedRunning();

    const [moved, discarded] = await queueBehindBarrier(lockRow(running.id), [
      () =>
        updateRunningStart(
          actor,
          workspaceOf(buenosAires),
          { id: running.id, date: "2026-10-02", start: "07:00" },
          new Date("2026-10-02T15:00:00Z"),
        ),
      () => discardTimer(actor, { id: running.id }),
    ]);

    expect(moved.status).toBe("fulfilled");
    expect(discarded).toEqual({ status: "fulfilled", value: { id: running.id } });
    expect(await timeEntryById(running.id)).toBeUndefined();
  });

  it("TT-79: el timer de otra persona responde forbidden con su texto y se queda", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const foreign = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(discardTimer(actor, { id: foreign.id })).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect(await timeEntryById(foreign.id)).toEqual(foreign);
  });

  it("el timer de otro workspace no se borra ni se distingue de uno que no existe", async () => {
    const other = await seedWorkspace(buenosAires);
    const foreign = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(discardTimer(actor, { id: foreign.id })).resolves.toEqual({
      id: foreign.id,
    });
    expect(await timeEntryById(foreign.id)).toEqual(foreign);
  });

  it.each(["inactive", "invited"] as const)(
    "con la membresía %s responde forbidden, también con un id que no existe",
    async (status) => {
      const running = await seedRunning();
      const inactive = { ...actor, status };

      for (const id of [running.id, "11111111-1111-4111-8111-111111111111"]) {
        await expect(discardTimer(inactive, { id })).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
      }
      expect(await timeEntryById(running.id)).toEqual(running);
    },
  );
});

describe("getTrackerState: lastEntryId", () => {
  /** Las 12:00 del 2 de octubre de 2026 en Buenos Aires. */
  const now = new Date("2026-10-02T15:00:00Z");

  it("es null sin entradas cerradas", async () => {
    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );
    expect(state.lastEntryId).toBeNull();
  });

  it("es la cerrada más reciente que ya empezó, no una futura ni el timer activo", async () => {
    await seedClosed("2026-09-30T11:00:00Z", "2026-09-30T12:00:00Z");
    const latest = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");
    await seedClosed("2026-10-03T11:00:00Z", "2026-10-03T12:00:00Z");
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T14:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.lastEntryId).toBe(latest.id);
  });

  it("es null si la única cerrada es futura", async () => {
    await seedClosed("2026-10-03T11:00:00Z", "2026-10-03T12:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.lastEntryId).toBeNull();
  });

  it("con dos que empiezan en el mismo instante, es la que la lista dibuja primero", async () => {
    const ids = [
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
      "00000000-0000-4000-8000-000000000001",
    ];
    for (const id of ids) {
      await db.insert(timeEntry).values({
        id,
        workspaceId,
        userId: actor.userId,
        startedAt: new Date("2026-10-01T11:00:00Z"),
        endedAt: new Date("2026-10-01T12:00:00Z"),
      });
    }

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(daysOf(state)[0].entries.map((entry) => entry.id)).toEqual([ids[1], ids[0]]);
    expect(state.lastEntryId).toBe(ids[1]);
  });
});

describe("la guarda de deleteRunningById", () => {
  // Inalcanzable a través del service, que ya leyó la fila con FOR UPDATE y
  // comprobó lo mismo: por eso se llama al repository directo.
  it("no borra una entrada cerrada", async () => {
    const closed = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");
    const target = { workspaceId, userId: actor.userId, id: closed.id };

    const removed = await db.transaction((tx) =>
      timeEntryRepository.deleteRunningById(tx, target),
    );

    expect(removed).toBeUndefined();
    expect(await timeEntryById(closed.id)).toEqual(closed);
    const running = await seedRunning();
    const own = await db.transaction((tx) =>
      timeEntryRepository.deleteRunningById(tx, { ...target, id: running.id }),
    );
    expect(own?.id).toBe(running.id);
    expect(await timeEntryById(running.id)).toBeUndefined();
  });
});

/** Una entrada cerrada de una persona del workspace del test. */
function seedClosedOf(userId: string, startedAt: string, endedAt: string) {
  return seedTimeEntry({ workspaceId, userId, startedAt, endedAt });
}

/** Lleva la creación del workspace del test a 2020, para que el piso no estorbe. */
async function backdateWorkspace() {
  await db
    .update(workspaceTable)
    .set({ createdAt: new Date("2020-01-01T00:00:00Z") })
    .where(eq(workspaceTable.id, workspaceId));
}

/** Fija el primer día de la semana de una persona del workspace del test. */
async function setWeekStart(userId: string, weekStart: number) {
  await db
    .update(membership)
    .set({ weekStart })
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)));
}

/** El contexto de la sesión de esa persona, con sus preferencias, como lo arma `currentSession`. */
async function profileContextFor(userId: string): Promise<ProfileContext> {
  const row = await workspaceRepository.findFirstWorkspace();
  const member = await workspaceRepository.findMembership(workspaceId, userId);
  if (row === undefined || member === undefined) {
    throw new Error("Falta el workspace o la membresía sembrados.");
  }
  return {
    workspace: row,
    membership: member,
    actor: actorFor(userId),
    preferences: (await profileOf(userId)).preferences,
  };
}

/** El workspace del rastreador como lo arma la sesión de esa persona. */
async function trackerWorkspaceFor(userId: string) {
  return trackerWorkspaceOf(await profileContextFor(userId));
}

/** Las semanas de la lista con sus días, para comparar de un vistazo. */
function weekDays(state: TrackerState) {
  return state.weeks.map((week) => ({
    start: week.start,
    days: week.days.map((day) => day.date),
  }));
}

describe("getTrackerState: la lista en semanas (TT-47, TT-48, TT-52)", () => {
  /** Las 12:00 del viernes 2 de octubre de 2026 en Buenos Aires. */
  const now = new Date("2026-10-02T15:00:00Z");

  it.each([
    {
      weekStart: 0,
      floor: "2026-09-13",
      weeks: [
        { start: "2026-09-27", days: ["2026-10-01"] },
        { start: "2026-09-13", days: ["2026-09-17", "2026-09-13"] },
      ],
      loadMoreFrom: "2026-08-30",
    },
    {
      weekStart: 6,
      floor: "2026-09-12",
      weeks: [
        { start: "2026-09-26", days: ["2026-10-01"] },
        { start: "2026-09-12", days: ["2026-09-17", "2026-09-13"] },
      ],
      loadMoreFrom: "2026-09-05",
    },
  ])(
    "con weekStart $weekStart de la membresía, la ventana y «Cargar más» cortan en ese día",
    async ({ weekStart, floor, weeks, loadMoreFrom }) => {
      // Jueves 1/10: trece días atrás es el viernes 18/09.
      const thursday = new Date("2026-10-01T15:00:00Z");
      await backdateWorkspace();
      await setWeekStart(actor.userId, weekStart);
      await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
      await seedClosedOf(actor.userId, "2026-09-13T13:00:00Z", "2026-09-13T15:00:00Z");
      await seedClosedOf(actor.userId, "2026-09-17T13:00:00Z", "2026-09-17T14:00:00Z");
      const older = await seedClosedOf(
        actor.userId,
        "2026-09-05T13:00:00Z",
        "2026-09-05T14:00:00Z",
      );
      const workspace = await trackerWorkspaceFor(actor.userId);

      const state = await getTrackerState(actor, workspace, { from: null }, thursday);

      expect(state.windowFrom).toBe(floor);
      expect(state.reachFrom).toBe(floor);
      expect(weekDays(state)).toEqual(weeks);
      expect(state.weeks[1].closedSeconds).toBe(3 * 3600);
      expect(state.loadMoreFrom).toBe(loadMoreFrom);

      const loaded = await getTrackerState(
        actor,
        workspace,
        { from: loadMoreFrom },
        thursday,
      );
      expect(
        daysOf(loaded).flatMap((day) => day.entries.map((entry) => entry.id)),
      ).toContain(older.id);
      expect(loaded.weeks.at(-1)?.start).toBe(loadMoreFrom);
    },
  );

  it("TT-48: con lunes, el domingo cierra la semana; con domingo, la abre", async () => {
    await seedClosedOf(actor.userId, "2026-09-27T13:00:00Z", "2026-09-27T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-28T13:00:00Z", "2026-09-28T14:00:00Z");

    const monday = await getTrackerState(
      actor,
      workspaceOf(buenosAires, undefined, 1),
      { from: null },
      now,
    );
    const sunday = await getTrackerState(
      actor,
      workspaceOf(buenosAires, undefined, 0),
      { from: null },
      now,
    );

    expect(weekDays(monday)).toEqual([
      { start: "2026-09-28", days: ["2026-09-28"] },
      { start: "2026-09-21", days: ["2026-09-27"] },
    ]);
    expect(weekDays(sunday)).toEqual([
      { start: "2026-09-27", days: ["2026-09-28", "2026-09-27"] },
    ]);
    expect(monday.weeks.map((week) => week.label)).toEqual([
      "Esta semana",
      "Semana anterior",
    ]);
    expect(sunday.weeks.map((week) => week.label)).toEqual(["Esta semana"]);
  });

  it("PF-01: dos personas del mismo workspace ven la misma fecha en semanas distintas", async () => {
    const otherId = await seedMember(workspaceId, "member");
    await backdateWorkspace();
    await setWeekStart(otherId, 0);
    await seedClosedOf(actor.userId, "2026-09-27T13:00:00Z", "2026-09-27T14:00:00Z");
    await seedClosedOf(otherId, "2026-09-27T13:00:00Z", "2026-09-27T14:00:00Z");

    const own = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );
    const other = await getTrackerState(
      actorFor(otherId),
      await trackerWorkspaceFor(otherId),
      { from: null },
      now,
    );

    expect(own.weeks.map((week) => week.start)).toEqual(["2026-09-21"]);
    expect(other.weeks.map((week) => week.start)).toEqual(["2026-09-27"]);
    expect(own.weeks[0].days[0].entries[0].weekStart).toBe("2026-09-21");
    expect(other.weeks[0].days[0].entries[0].weekStart).toBe("2026-09-27");
  });

  it("TT-47: de la más nueva a la más vieja, con su rótulo", async () => {
    await seedClosedOf(actor.userId, "2026-09-15T13:00:00Z", "2026-09-15T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-22T13:00:00Z", "2026-09-22T14:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.weeks.map((week) => [week.start, week.label])).toEqual([
      ["2026-09-28", "Esta semana"],
      ["2026-09-21", "Semana anterior"],
      ["2026-09-14", "14/09 – 20/09"],
    ]);
  });

  it("TT-47: el total de la semana es la suma exacta de sus días, en segundos", async () => {
    await seedClosedOf(actor.userId, "2026-09-28T13:00:00Z", "2026-09-28T14:00:01Z");
    await seedClosedOf(actor.userId, "2026-09-30T13:00:00Z", "2026-09-30T13:30:00Z");
    await seedClosedOf(actor.userId, "2026-09-30T15:00:00Z", "2026-09-30T15:00:59Z");
    await seedClosedOf(actor.userId, "2026-09-25T13:00:00Z", "2026-09-25T13:10:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.weeks.map((week) => week.closedSeconds)).toEqual([
      3601 + 1800 + 59,
      600,
    ]);
    expect(state.weeks[0].days.map((day) => day.closedSeconds)).toEqual([1859, 3601]);
  });

  it("TT-46: la semana del timer activo está marcada y existe aunque no tenga cerradas", async () => {
    await seedClosedOf(actor.userId, "2026-09-25T13:00:00Z", "2026-09-25T14:00:00Z");
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T13:00:00Z",
    });

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(
      state.weeks.map((week) => [week.start, week.isRunningWeek, week.closedSeconds]),
    ).toEqual([
      ["2026-09-28", true, 0],
      ["2026-09-21", false, 3600],
    ]);
  });

  it("TT-96: la entrada que cruza al lunes cuenta entera en la semana de su inicio", async () => {
    // Domingo 27/09 de 23:00 a lunes 28/09 a la 01:00 en Buenos Aires.
    await seedClosedOf(actor.userId, "2026-09-28T02:00:00Z", "2026-09-28T04:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-29T13:00:00Z", "2026-09-29T14:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      now,
    );

    expect(state.weeks.map((week) => [week.start, week.closedSeconds])).toEqual([
      ["2026-09-28", 3600],
      ["2026-09-21", 7200],
    ]);
  });

  it("TT-97: la semana del cambio de horario de Madrid suma las duraciones reales y corta en sus medianoches", async () => {
    const madridNow = new Date("2026-11-02T12:00:00Z");
    // Lunes 19/10 a las 00:00 en +02:00: el primer instante de la semana más vieja.
    await seedClosedOf(actor.userId, "2026-10-18T22:00:00Z", "2026-10-18T23:00:00Z");
    // Domingo 25/10 de 01:00 (+02:00) a 04:00 (+01:00): cuatro horas reales.
    await seedClosedOf(actor.userId, "2026-10-24T23:00:00Z", "2026-10-25T03:00:00Z");
    // Domingo 25/10 a las 23:59 en +01:00, todavía en esa semana.
    await seedClosedOf(actor.userId, "2026-10-25T22:59:00Z", "2026-10-25T23:00:00Z");
    // Lunes 26/10 a las 00:00 en +01:00, ya en la siguiente.
    await seedClosedOf(actor.userId, "2026-10-25T23:00:00Z", "2026-10-25T23:30:00Z");
    // Domingo 18/10 a las 23:59 en +02:00: fuera de la ventana.
    await seedClosedOf(actor.userId, "2026-10-18T21:59:00Z", "2026-10-18T22:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(madrid),
      { from: null },
      madridNow,
    );

    expect(state.windowFrom).toBe("2026-10-19");
    expect(state.weeks.map((week) => [week.start, week.closedSeconds])).toEqual([
      ["2026-10-26", 1800],
      ["2026-10-19", 3600 + 4 * 3600 + 60],
    ]);
    expect(state.loadMoreFrom).toBe("2026-10-12");
  });

  it("con hoy domingo, los catorce días con hoy empiezan el lunes de hace dos semanas", async () => {
    // Domingo 4/10: trece días atrás es el lunes 21/09; el domingo 20/09 ya es el día quince.
    const sunday = new Date("2026-10-04T15:00:00Z");
    await seedClosedOf(actor.userId, "2026-10-04T13:00:00Z", "2026-10-04T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-21T13:00:00Z", "2026-09-21T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-20T13:00:00Z", "2026-09-20T14:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      sunday,
    );

    expect(state.windowFrom).toBe("2026-09-21");
    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-10-04", "2026-09-21"]);
    expect(state.loadMoreFrom).toBe("2026-09-14");
  });

  it("la semana más vieja está entera aunque el piso por omisión caiga a mitad de semana", async () => {
    // Jueves 1/10: trece días atrás es el viernes 18/09, de la semana del lunes 14/09.
    const thursday = new Date("2026-10-01T15:00:00Z");
    await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-14T13:00:00Z", "2026-09-14T15:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-17T13:00:00Z", "2026-09-17T14:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: null },
      thursday,
    );

    expect(weekDays(state)).toEqual([
      { start: "2026-09-28", days: ["2026-10-01"] },
      { start: "2026-09-14", days: ["2026-09-17", "2026-09-14"] },
    ]);
    expect(state.weeks[1].closedSeconds).toBe(3 * 3600);
  });

  it("TT-52, TT-86: «Cargar más» salta a la próxima semana con entradas y se apaga sin nada atrás", async () => {
    await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-08-12T13:00:00Z", "2026-08-12T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-07-01T13:00:00Z", "2026-07-01T14:00:00Z");
    const workspace = workspaceOf(buenosAires);

    const first = await getTrackerState(actor, workspace, { from: null }, now);
    expect(first.loadMoreFrom).toBe("2026-08-10");

    const second = await getTrackerState(actor, workspace, { from: "2026-08-10" }, now);
    expect(weekDays(second)).toEqual([
      { start: "2026-09-28", days: ["2026-10-01"] },
      { start: "2026-08-10", days: ["2026-08-12"] },
    ]);
    expect(second.loadMoreFrom).toBe("2026-06-29");

    const third = await getTrackerState(actor, workspace, { from: "2026-06-29" }, now);
    expect(third.weeks.map((week) => week.start)).toEqual([
      "2026-09-28",
      "2026-08-10",
      "2026-06-29",
    ]);
    expect(third.loadMoreFrom).toBeNull();
  });

  it("desde a mitad de semana trae la semana entera", async () => {
    await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: "2026-08-14" },
      now,
    );

    expect(state.windowFrom).toBe("2026-08-10");
    expect(daysOf(state).map((day) => day.date)).toContain("2026-08-10");
  });

  it("un desde posterior al piso por omisión no achica la ventana", async () => {
    await seedClosedOf(actor.userId, "2026-09-15T13:00:00Z", "2026-09-15T14:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: "2026-09-30" },
      now,
    );

    expect(state.reachFrom).toBe("2026-09-14");
    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-09-15"]);
  });

  it("un desde anterior a la creación del workspace se recorta a su semana", async () => {
    // Creado el jueves 20/08: su semana empieza el lunes 17/08.
    const reciente = workspaceOf(buenosAires, "2026-08-20T15:00:00Z");
    await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    await seedClosedOf(actor.userId, "2026-08-21T13:00:00Z", "2026-08-21T14:00:00Z");

    const state = await getTrackerState(actor, reciente, { from: "2026-01-05" }, now);

    expect(state.windowFrom).toBe("2026-08-17");
    expect(state.reachFrom).toBe("2026-08-17");
    expect(state.loadMoreFrom).toBeNull();
    expect(daysOf(state).map((day) => day.date)).toEqual(["2026-10-01", "2026-08-21"]);
  });

  it("«Cargar más» no ofrece volver a una entrada anterior a la creación del workspace", async () => {
    const reciente = workspaceOf(buenosAires, "2026-08-20T15:00:00Z");
    await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    // Escrita directo contra la tabla: la aplicación no la deja crear.
    await seedClosedOf(actor.userId, "2026-08-04T13:00:00Z", "2026-08-04T14:00:00Z");

    const state = await getTrackerState(actor, reciente, { from: null }, now);

    expect(state.windowFrom).toBe("2026-09-14");
    expect(state.loadMoreFrom).toBeNull();
  });

  it.each([
    { weekStart: 1, day: "2026-08-17" },
    { weekStart: 0, day: "2026-08-16" },
  ] as const)(
    "«Cargar más» sí ofrece una entrada de la semana de creación anterior al día de creación, con weekStart $weekStart",
    async ({ weekStart, day }) => {
      // Creado el jueves 20/08; el primer día de su semana es anterior y la ventana lo alcanza.
      const reciente = workspaceOf(buenosAires, "2026-08-20T15:00:00Z", weekStart);
      await seedClosedOf(actor.userId, "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
      const early = await seedClosedOf(
        actor.userId,
        `${day}T13:00:00Z`,
        `${day}T14:00:00Z`,
      );

      const state = await getTrackerState(actor, reciente, { from: null }, now);
      expect(state.loadMoreFrom).toBe(day);

      const loaded = await getTrackerState(actor, reciente, { from: day }, now);
      expect(
        daysOf(loaded).flatMap((group) => group.entries.map((entry) => entry.id)),
      ).toContain(early.id);
      expect(loaded.loadMoreFrom).toBeNull();
    },
  );

  it("«Cargar más» no ofrece la semana que la ventana ya dibuja aunque el inicio del día esté corrido", async () => {
    // Salta, 20/10/1991: el día no tiene 00:00 y `startOfLocalDay` ubica su
    // inicio una hora tarde (falla conocida del contrato, §8). Una entrada en
    // esa hora es de ese día pero empieza antes del instante inferior.
    const salta = workspaceOf("America/Argentina/Salta", "1991-01-01T12:00:00Z", 0);
    await seedClosedOf(actor.userId, "1991-10-20T04:30:00Z", "1991-10-20T05:30:00Z");

    const state = await getTrackerState(
      actor,
      salta,
      { from: null },
      new Date("1991-11-15T15:00:00Z"),
    );

    expect(state.windowFrom).toBe("1991-10-20");
    expect(state.loadMoreFrom).toBeNull();
  });

  it("lastEntryId sigue siendo la cerrada más reciente con la ventana extendida por desde", async () => {
    await seedClosedOf(actor.userId, "2026-08-12T13:00:00Z", "2026-08-12T14:00:00Z");
    const latest = await seedClosedOf(
      actor.userId,
      "2026-10-01T13:00:00Z",
      "2026-10-01T14:00:00Z",
    );
    await seedClosedOf(actor.userId, "2026-10-20T13:00:00Z", "2026-10-20T14:00:00Z");

    const state = await getTrackerState(
      actor,
      workspaceOf(buenosAires),
      { from: "2026-08-10" },
      now,
    );

    expect(state.lastEntryId).toBe(latest.id);
    expect(
      daysOf(state).flatMap((day) => day.entries.map((entry) => entry.id)),
    ).toContain(latest.id);
  });

  it("P-15: con el timer cinco semanas atrás, windowFrom lo incluye, reachFrom no, y al detenerlo trae su semana", async () => {
    await seedClosedOf(actor.userId, "2026-10-02T12:00:00Z", "2026-10-02T13:00:00Z");
    // Miércoles 26/08, de la semana del lunes 24/08.
    const timer = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-08-26T13:00:00Z",
    });
    const workspace = workspaceOf(buenosAires);

    const running = await getTrackerState(actor, workspace, { from: null }, now);
    expect(running.windowFrom).toBe("2026-08-24");
    expect(running.reachFrom).toBe("2026-09-14");
    expect(running.weeks.at(-1)).toMatchObject({
      start: "2026-08-24",
      isRunningWeek: true,
    });

    const { stopped } = await stopTimer(actor, workspace, { id: timer.id });
    expect(stopped.weekStart).toBe("2026-08-24");

    const after = await getTrackerState(actor, workspace, { from: null }, now);
    expect(daysOf(after).map((day) => day.date)).toEqual(["2026-10-02"]);
    const reached = await getTrackerState(
      actor,
      workspace,
      { from: stopped.weekStart },
      now,
    );
    expect(daysOf(reached).find((day) => day.date === "2026-08-26")?.entries[0].id).toBe(
      timer.id,
    );
  });
});

describe("weekStart en las vistas del service (criterio 13)", () => {
  it.each([
    [1, "2026-09-21"],
    [0, "2026-09-27"],
  ] as const)(
    "con %i, el cerrado de un arranque trae la semana de su inicio",
    async (weekStart, expected) => {
      // Domingo 27/09 a las 10:00 en Buenos Aires.
      await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-09-27T13:00:00Z",
      });

      const result = await startTimer(
        actor,
        workspaceOf(buenosAires, undefined, weekStart),
        { projectId: null, taskId: null, id: randomUUID(), description: "" },
      );

      expect(result.stopped?.dayDate).toBe("2026-09-27");
      expect(result.stopped?.weekStart).toBe(expected);
    },
  );

  it.each([
    [1, "2026-09-21"],
    [0, "2026-09-27"],
  ] as const)(
    "con %i, la lista y el timer activo traen la semana de su día",
    async (weekStart, expected) => {
      await seedClosedOf(actor.userId, "2026-09-27T12:00:00Z", "2026-09-27T13:00:00Z");
      await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-09-27T14:00:00Z",
      });

      const state = await getTrackerState(
        actor,
        workspaceOf(buenosAires, undefined, weekStart),
        { from: null },
        new Date("2026-10-02T15:00:00Z"),
      );

      expect(state.running?.weekStart).toBe(expected);
      expect(
        daysOf(state).flatMap((day) => day.entries.map((entry) => entry.weekStart)),
      ).toEqual([expected]);
    },
  );
});

// Slice 10: el proyecto y la tarea de una entrada.

type Pair = { readonly projectId: string | null; readonly taskId: string | null };

const NO_PAIR: Pair = { projectId: null, taskId: null };

/** Una entrada del actor con un par, cerrada salvo que se pida abierta. */
function seedEntryWith(
  pair: Pair,
  options: { running?: boolean; description?: string } = {},
) {
  return seedTimeEntry({
    workspaceId,
    userId: actor.userId,
    description: options.description ?? "con proyecto",
    startedAt: options.running === true ? "2026-10-02T11:00:00Z" : "2026-10-01T11:00:00Z",
    endedAt: options.running === true ? null : "2026-10-01T12:00:00Z",
    ...pair,
  });
}

async function pairOfRow(id: string): Promise<Pair | undefined> {
  const row = await timeEntryById(id);
  return row === undefined ? undefined : { projectId: row.projectId, taskId: row.taskId };
}

/** Un proyecto público activo con una tarea, en el que el actor puede cargar horas. */
async function seedTrackable(name = "Web") {
  const web = await seedProject({ workspaceId, name, color: "green" });
  const design = await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });
  return { web, design };
}

/**
 * Los tres estados del criterio 7: una entrada que ya tiene un proyecto que
 * no se puede asignar como nuevo. El actor es owner y no es miembro del
 * privado: el rol no alcanza (PR-17).
 */
async function seedUnavailablePairs() {
  const archived = await seedProject({
    workspaceId,
    name: "Archivado",
    color: "red",
    archived: true,
  });
  const vault = await seedProject({
    workspaceId,
    name: "Bóveda",
    color: "violet",
    isPublic: false,
  });
  const web = await seedProject({ workspaceId, name: "Web", color: "green" });
  return {
    archivado: {
      projectId: archived.id,
      taskId: (await seedTask({ workspaceId, projectId: archived.id })).id,
      otherTaskId: (await seedTask({ workspaceId, projectId: archived.id })).id,
      message: projectMessages.projectUnavailable,
    },
    "privado sin acceso": {
      projectId: vault.id,
      taskId: (await seedTask({ workspaceId, projectId: vault.id })).id,
      otherTaskId: (await seedTask({ workspaceId, projectId: vault.id })).id,
      message: projectMessages.projectUnavailable,
    },
    "tarea hecha": {
      projectId: web.id,
      taskId: (await seedTask({ workspaceId, projectId: web.id, status: "done" })).id,
      otherTaskId: (await seedTask({ workspaceId, projectId: web.id, status: "done" }))
        .id,
      message: projectMessages.taskUnavailable,
    },
  };
}

describe("las altas con proyecto (criterio 4: TT-06, TT-22, TT-25)", () => {
  const ws = workspaceOf(buenosAires);

  it("startTimer guarda el par pedido y la vista lo trae", async () => {
    const { web, design } = await seedTrackable();
    const result = await startTimer(actor, ws, {
      id: randomUUID(),
      description: "",
      projectId: web.id,
      taskId: design.id,
    });
    expect(await pairOfRow(result.running.id)).toEqual({
      projectId: web.id,
      taskId: design.id,
    });
    expect(result.running.project).toEqual({ id: web.id, name: "Web", color: "green" });
    expect(result.running.task).toEqual({ id: design.id, name: "Diseño" });
  });

  it("createManualEntry guarda el par pedido, también el proyecto sin tarea", async () => {
    const { web, design } = await seedTrackable();
    const withTask = await createManualEntry(actor, ws, {
      description: "",
      date: "2026-10-01",
      start: "08:00",
      end: "09:00",
      projectId: web.id,
      taskId: design.id,
    });
    const withoutTask = await createManualEntry(actor, ws, {
      description: "",
      date: "2026-10-01",
      start: "10:00",
      end: "11:00",
      projectId: web.id,
      taskId: null,
    });
    expect(await pairOfRow(withTask.created.id)).toEqual({
      projectId: web.id,
      taskId: design.id,
    });
    expect(withTask.created.task).toEqual({ id: design.id, name: "Diseño" });
    expect(await pairOfRow(withoutTask.created.id)).toEqual({
      projectId: web.id,
      taskId: null,
    });
    expect(withoutTask.created.project).toEqual({
      id: web.id,
      name: "Web",
      color: "green",
    });
    expect(withoutTask.created.task).toBeNull();
  });

  it("la entrada sin proyecto sigue siendo válida (TT-93)", async () => {
    const result = await startTimer(actor, ws, {
      id: randomUUID(),
      description: "",
      projectId: null,
      taskId: null,
    });
    expect(result.running.project).toBeNull();
    expect(result.running.task).toBeNull();
  });

  /** Los pares que ninguna alta acepta, con el mensaje que responde cada uno. */
  async function rejectedPairs() {
    const unavailable = await seedUnavailablePairs();
    const other = await seedWorkspace();
    const foreign = await seedProject({ workspaceId: other.workspaceId });
    const { web } = await seedTrackable("Activo");
    const app = await seedProject({ workspaceId, name: "Otro" });
    const elsewhere = await seedTask({ workspaceId, projectId: app.id });
    const tt77 = projectMessages.projectUnavailable;
    const pr74 = projectMessages.taskUnavailable;
    return [
      ["archivado", { projectId: unavailable.archivado.projectId, taskId: null }, tt77],
      [
        "privado sin acceso",
        { projectId: unavailable["privado sin acceso"].projectId, taskId: null },
        tt77,
      ],
      ["inexistente", { projectId: randomUUID(), taskId: null }, tt77],
      ["de otro workspace", { projectId: foreign.id, taskId: null }, tt77],
      [
        "con una tarea hecha",
        {
          projectId: unavailable["tarea hecha"].projectId,
          taskId: unavailable["tarea hecha"].taskId,
        },
        pr74,
      ],
      ["con una tarea inexistente", { projectId: web.id, taskId: randomUUID() }, pr74],
      [
        "con una tarea de otro proyecto",
        { projectId: web.id, taskId: elsewhere.id },
        pr74,
      ],
    ] as const;
  }

  it("startTimer rechaza cada par no disponible sin escribir y sin cerrar el timer que corría", async () => {
    const previous = await seedRunning();
    for (const [label, pair, message] of await rejectedPairs()) {
      const id = randomUUID();
      await expect(
        startTimer(actor, ws, { id, description: "", ...pair }),
        label,
      ).rejects.toMatchObject({ code: "not_found", message });
      expect(await timeEntryById(id), label).toBeUndefined();
      expect((await timeEntryById(previous.id))?.endedAt, label).toBeNull();
    }
    expect(await allTimeEntries()).toHaveLength(1);
    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("createManualEntry rechaza cada par no disponible sin escribir", async () => {
    for (const [label, pair, message] of await rejectedPairs()) {
      await expect(
        createManualEntry(actor, ws, {
          description: "",
          date: "2026-10-01",
          start: "08:00",
          end: "09:00",
          ...pair,
        }),
        label,
      ).rejects.toMatchObject({ code: "not_found", message });
    }
    expect(await allTimeEntries()).toHaveLength(0);
    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("valida el par después de las horas: una hora imposible responde por la hora", async () => {
    await expect(
      createManualEntry(actor, ws, {
        description: "",
        date: "2026-10-01",
        start: "08:00",
        end: "08:00",
        projectId: randomUUID(),
        taskId: null,
      }),
    ).rejects.toMatchObject({ code: "validation", message: timeEntryMessages.tooShort });
  });

  it("el reintento de una alta con proyecto responde la vista con su proyecto, sin volver a validar", async () => {
    const { web, design } = await seedTrackable();
    const values = {
      id: randomUUID(),
      description: "",
      projectId: web.id,
      taskId: design.id,
    };
    const first = await startTimer(actor, ws, values);
    await db
      .update(project)
      .set({ archivedAt: new Date() })
      .where(eq(project.id, web.id));
    const retry = await startTimer(actor, ws, values);
    expect(retry.running).toEqual(first.running);
    expect(retry.running.project?.id).toBe(web.id);
    expect(await allTimeEntries()).toHaveLength(1);
  });
});

describe("updateEntryProject (criterio 6: TT-10, TT-11, TT-27, TT-54)", () => {
  const ws = workspaceOf(buenosAires);

  it("cambia el par de una entrada cerrada y responde la vista", async () => {
    const { web, design } = await seedTrackable();
    const entry = await seedEntryWith({ projectId: null, taskId: null });
    const result = await updateEntryProject(actor, ws, {
      id: entry.id,
      projectId: web.id,
      taskId: design.id,
    });
    expect(await pairOfRow(entry.id)).toEqual({ projectId: web.id, taskId: design.id });
    expect(result.entry.project).toEqual({ id: web.id, name: "Web", color: "green" });
    expect(result.entry.task).toEqual({ id: design.id, name: "Diseño" });
    expect(result.entry.endedAt).toBe(entry.endedAt?.toISOString());
  });

  it("cambia el par de la entrada que corre sin detenerla (TT-27)", async () => {
    const { web } = await seedTrackable();
    const running = await seedEntryWith(
      { projectId: null, taskId: null },
      { running: true },
    );
    const result = await updateEntryProject(actor, ws, {
      id: running.id,
      projectId: web.id,
      taskId: null,
    });
    expect(result.entry.endedAt).toBeNull();
    expect(result.entry.project?.id).toBe(web.id);
    expect(await timeEntryById(running.id)).toMatchObject({
      projectId: web.id,
      endedAt: null,
      startedAt: running.startedAt,
    });
  });

  it("funciona sobre una entrada con horarios de solo lectura (TT-110)", async () => {
    const { web } = await seedTrackable();
    const long = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-28T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    const result = await updateEntryProject(actor, ws, {
      id: long.id,
      projectId: web.id,
      taskId: null,
    });
    expect(result.entry.editableTimes).toBe(false);
    expect(result.entry.project?.id).toBe(web.id);
  });

  it("«Sin proyecto» deja los dos nulos", async () => {
    const { web, design } = await seedTrackable();
    const entry = await seedEntryWith({ projectId: web.id, taskId: design.id });
    const result = await updateEntryProject(actor, ws, {
      id: entry.id,
      projectId: null,
      taskId: null,
    });
    expect(await pairOfRow(entry.id)).toEqual({ projectId: null, taskId: null });
    expect(result.entry.project).toBeNull();
    expect(result.entry.task).toBeNull();
  });

  it("el mismo par responde la vista sin escribir y sin registro, también con otras mayúsculas", async () => {
    const { web, design } = await seedTrackable();
    const entry = await seedEntryWith({ projectId: web.id, taskId: design.id });
    for (const pair of [
      { projectId: web.id, taskId: design.id },
      { projectId: web.id.toUpperCase(), taskId: design.id.toUpperCase() },
    ]) {
      const result = await updateEntryProject(actor, ws, { id: entry.id, ...pair });
      expect(result.entry.project?.id).toBe(web.id);
      expect(result.entry.task?.id).toBe(design.id);
    }
    expect((await timeEntryById(entry.id))?.updatedAt).toEqual(entry.updatedAt);
    expect(await auditFor("time_entry", entry.id)).toEqual([]);
  });

  it("una entrada ajena responde TT-79 con el texto que la nombra, sin tocarla", async () => {
    const { web } = await seedTrackable();
    const otherId = await seedMember(workspaceId, "member");
    const foreign = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    await expect(
      updateEntryProject(actor, ws, { id: foreign.id, projectId: web.id, taskId: null }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect(await pairOfRow(foreign.id)).toEqual({ projectId: null, taskId: null });
  });

  it("una entrada inexistente o de otro workspace responde TT-80", async () => {
    const { web } = await seedTrackable();
    const other = await seedWorkspace();
    const foreign = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    for (const id of [randomUUID(), foreign.id]) {
      await expect(
        updateEntryProject(actor, ws, { id, projectId: web.id, taskId: null }),
      ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    }
    expect(await pairOfRow(foreign.id)).toEqual({ projectId: null, taskId: null });
  });

  it("una membresía inactiva recibe forbidden aunque la entrada sea suya", async () => {
    const { web } = await seedTrackable();
    const entry = await seedEntryWith({ projectId: null, taskId: null });
    await expect(
      updateEntryProject({ ...actor, status: "inactive" }, ws, {
        id: entry.id,
        projectId: web.id,
        taskId: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden", message: timeEntryMessages.forbidden });
    expect(await pairOfRow(entry.id)).toEqual({ projectId: null, taskId: null });
  });

  it("rechaza un proyecto nuevo no disponible sin cambiar nada", async () => {
    const unavailable = await seedUnavailablePairs();
    const entry = await seedEntryWith({ projectId: null, taskId: null });
    await expect(
      updateEntryProject(actor, ws, {
        id: entry.id,
        projectId: unavailable.archivado.projectId,
        taskId: null,
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
    expect(await pairOfRow(entry.id)).toEqual({ projectId: null, taskId: null });
    expect(await auditFor("time_entry", entry.id)).toEqual([]);
  });
});

describe("la regla del par sobre una entrada que ya tiene proyecto (criterio 7: TT-104, PR-63, PR-65, PR-71, PR-106)", () => {
  const ws = workspaceOf(buenosAires);

  it("detenerla, editar la descripción, los horarios y el inicio funciona y conserva el par", async () => {
    for (const [label, state] of Object.entries(await seedUnavailablePairs())) {
      const pair = { projectId: state.projectId, taskId: state.taskId };
      const running = await seedEntryWith(pair, { running: true });
      const started = await updateRunningStart(
        actor,
        ws,
        { id: running.id, date: "2026-10-02", start: "07:30" },
        new Date("2026-10-02T15:00:00Z"),
      );
      expect(started.running.project?.id, label).toBe(state.projectId);
      const stopped = await stopTimer(actor, ws, { id: running.id });
      expect(stopped.stopped.task?.id, label).toBe(state.taskId);
      const described = await updateDescription(actor, ws, {
        id: running.id,
        description: "otra",
      });
      expect(described.entry.project?.id, label).toBe(state.projectId);
      expect(await pairOfRow(running.id), label).toEqual(pair);

      const closed = await seedEntryWith(pair);
      const timed = await updateEntryTimes(actor, ws, {
        id: closed.id,
        date: "2026-10-01",
        start: "07:00",
        end: "08:00",
      });
      expect(timed.entry.task?.id, label).toBe(state.taskId);
      expect(await pairOfRow(closed.id), label).toEqual(pair);
    }
  });

  it("borrarla funciona", async () => {
    for (const state of Object.values(await seedUnavailablePairs())) {
      const entry = await seedEntryWith({
        projectId: state.projectId,
        taskId: state.taskId,
      });
      await deleteEntry(actor, { id: entry.id });
      expect(await timeEntryById(entry.id)).toBeUndefined();
    }
  });

  it("volver a pedir el mismo par responde la vista sin escribir", async () => {
    for (const [label, state] of Object.entries(await seedUnavailablePairs())) {
      const pair = { projectId: state.projectId, taskId: state.taskId };
      const entry = await seedEntryWith(pair);
      const result = await updateEntryProject(actor, ws, { id: entry.id, ...pair });
      expect(result.entry.project?.id, label).toBe(state.projectId);
      expect((await timeEntryById(entry.id))?.updatedAt, label).toEqual(entry.updatedAt);
    }
  });

  it("quitarle la tarea, o el proyecto, funciona", async () => {
    for (const [label, state] of Object.entries(await seedUnavailablePairs())) {
      const pair = { projectId: state.projectId, taskId: state.taskId };
      const withoutTask = await seedEntryWith(pair);
      const result = await updateEntryProject(actor, ws, {
        id: withoutTask.id,
        projectId: state.projectId,
        taskId: null,
      });
      expect(result.entry.project?.id, label).toBe(state.projectId);
      expect(result.entry.task, label).toBeNull();
      expect(await pairOfRow(withoutTask.id), label).toEqual({
        projectId: state.projectId,
        taskId: null,
      });

      const withoutProject = await seedEntryWith(pair);
      await updateEntryProject(actor, ws, {
        id: withoutProject.id,
        projectId: null,
        taskId: null,
      });
      expect(await pairOfRow(withoutProject.id), label).toEqual({
        projectId: null,
        taskId: null,
      });
    }
  });

  it("cambiarle la tarea responde TT-77 o PR-74 y no cambia nada", async () => {
    for (const [label, state] of Object.entries(await seedUnavailablePairs())) {
      const pair = { projectId: state.projectId, taskId: state.taskId };
      const entry = await seedEntryWith(pair);
      await expect(
        updateEntryProject(actor, ws, {
          id: entry.id,
          projectId: state.projectId,
          taskId: state.otherTaskId,
        }),
        label,
      ).rejects.toMatchObject({ code: "not_found", message: state.message });
      expect(await pairOfRow(entry.id), label).toEqual(pair);
      expect((await timeEntryById(entry.id))?.updatedAt, label).toEqual(entry.updatedAt);
    }
  });

  it("sumarle una tarea a la entrada con el proyecto y sin tarea también se valida", async () => {
    for (const [label, state] of Object.entries(await seedUnavailablePairs())) {
      const pair = { projectId: state.projectId, taskId: null };
      const entry = await seedEntryWith(pair);
      await expect(
        updateEntryProject(actor, ws, {
          id: entry.id,
          projectId: state.projectId,
          taskId: state.taskId,
        }),
        label,
      ).rejects.toMatchObject({ code: "not_found", message: state.message });
      expect(await pairOfRow(entry.id), label).toEqual(pair);
    }
  });
});

describe("continuar y duplicar con proyecto (criterio 8: TT-57, TT-58)", () => {
  const ws = workspaceOf(buenosAires);

  it("continuar copia el proyecto y la tarea de la original", async () => {
    const { web, design } = await seedTrackable();
    const source = await seedEntryWith({ projectId: web.id, taskId: design.id });
    const result = await continueEntry(actor, ws, {
      id: randomUUID(),
      sourceId: source.id,
    });
    expect(await pairOfRow(result.running.id)).toEqual({
      projectId: web.id,
      taskId: design.id,
    });
    expect(result.running.project).toEqual({ id: web.id, name: "Web", color: "green" });
    expect(result.running.task).toEqual({ id: design.id, name: "Diseño" });
  });

  it("duplicar copia el proyecto y la tarea de la original", async () => {
    const { web, design } = await seedTrackable();
    const source = await seedEntryWith({ projectId: web.id, taskId: design.id });
    const result = await duplicateEntry(actor, ws, {
      id: randomUUID(),
      sourceId: source.id,
    });
    expect(await pairOfRow(result.created.id)).toEqual({
      projectId: web.id,
      taskId: design.id,
    });
    expect(result.created.task).toEqual({ id: design.id, name: "Diseño" });
  });

  it("continuar desde una original no disponible no escribe nada y no cierra el timer que corría", async () => {
    const previous = await seedRunning();
    for (const [label, state] of Object.entries(await seedUnavailablePairs())) {
      const source = await seedEntryWith({
        projectId: state.projectId,
        taskId: state.taskId,
      });
      const id = randomUUID();
      await expect(
        continueEntry(actor, ws, { id, sourceId: source.id }),
        label,
      ).rejects.toMatchObject({ code: "not_found", message: state.message });
      expect(await timeEntryById(id), label).toBeUndefined();
      expect((await timeEntryById(previous.id))?.endedAt, label).toBeNull();
    }
    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("duplicar desde una original no disponible no escribe nada", async () => {
    for (const [label, state] of Object.entries(await seedUnavailablePairs())) {
      const source = await seedEntryWith({
        projectId: state.projectId,
        taskId: state.taskId,
      });
      const id = randomUUID();
      await expect(
        duplicateEntry(actor, ws, { id, sourceId: source.id }),
        label,
      ).rejects.toMatchObject({ code: "not_found", message: state.message });
      expect(await timeEntryById(id), label).toBeUndefined();
    }
    expect(await allTimeEntries()).toHaveLength(3);
    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("una original con el proyecto disponible y sin tarea se continúa sin tarea", async () => {
    const { web } = await seedTrackable();
    const source = await seedEntryWith({ projectId: web.id, taskId: null });
    const result = await continueEntry(actor, ws, {
      id: randomUUID(),
      sourceId: source.id,
    });
    expect(result.running.project?.id).toBe(web.id);
    expect(result.running.task).toBeNull();
  });
});

/**
 * Corre `work` mientras otra transacción sostiene `for update` sobre la fila
 * `id`. Responde con lo que termine `work`, su error incluido, o con
 * `"blocked"` si se trabó esperando el bloqueo. Al final suelta el bloqueo y
 * espera a `work`, que no queda corriendo en el test siguiente.
 */
async function outcomeWhileLocked(id: string, work: () => Promise<unknown>) {
  let holding = () => {};
  const held = new Promise<void>((resolve) => {
    holding = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await lockRow(id)(tx);
    holding();
    await released;
  });
  await Promise.race([held, holder]);
  const running = work().then(
    () => "resolved",
    (error: unknown) => error,
  );
  const waiting = new AbortController();
  try {
    return await Promise.race([
      running,
      waitForBlockedBackends({ count: 1, signal: waiting.signal }).then(() => "blocked"),
    ]);
  } finally {
    waiting.abort();
    release();
    await holder;
    await running;
  }
}

describe("las altas validan el par antes de escribir (§4.4)", () => {
  const ws = workspaceOf(buenosAires);
  const tt77 = { code: "not_found", message: projectMessages.projectUnavailable };

  /** Las tres altas con un proyecto archivado: la de «Iniciar» lo pide, las otras lo copian. */
  async function archivedCreations() {
    const archived = await seedProject({ workspaceId, archived: true });
    const source = await seedEntryWith({ projectId: archived.id, taskId: null });
    return {
      startTimer: (id: string) =>
        startTimer(actor, ws, {
          id,
          description: "",
          projectId: archived.id,
          taskId: null,
        }),
      continueEntry: (id: string) =>
        continueEntry(actor, ws, { id, sourceId: source.id }),
      duplicateEntry: (id: string) =>
        duplicateEntry(actor, ws, { id, sourceId: source.id }),
    };
  }

  it.each(["startTimer", "continueEntry", "duplicateEntry"] as const)(
    "%s con el id de una entrada de otro miembro responde TT-77, no forbidden, y no escribe",
    async (name) => {
      const create = (await archivedCreations())[name];
      const previous = await seedRunning();
      const foreign = await seedTimeEntry({
        workspaceId,
        userId: await seedMember(workspaceId, "member"),
        startedAt: "2026-10-02T09:00:00Z",
        endedAt: "2026-10-02T10:00:00Z",
      });
      const rows = await allTimeEntries();

      await expect(create(foreign.id)).rejects.toMatchObject(tt77);
      expect(await allTimeEntries()).toEqual(rows);
      expect(await auditFor("time_entry")).toEqual([]);
      expect((await timeEntryById(previous.id))?.endedAt).toBeNull();
    },
  );

  it.each(["startTimer", "continueEntry"] as const)(
    "%s responde TT-77 sin esperar el bloqueo del timer abierto",
    async (name) => {
      const create = (await archivedCreations())[name];
      const previous = await seedRunning();
      const rows = await allTimeEntries();

      const outcome = await outcomeWhileLocked(previous.id, () => create(randomUUID()));

      expect(outcome).toMatchObject(tt77);
      expect(await allTimeEntries()).toEqual(rows);
      expect((await timeEntryById(previous.id))?.endedAt).toBeNull();
    },
  );
});

describe("la vista con su proyecto (criterio 9: TT-49, TT-50, PR-71, PR-101 … PR-103)", () => {
  const ws = workspaceOf(buenosAires);
  const now = new Date("2026-10-02T15:00:00Z");

  it("getTrackerState trae project y task en el timer y en cada entrada de la lista", async () => {
    const { web, design } = await seedTrackable();
    const running = await seedEntryWith(
      { projectId: web.id, taskId: design.id },
      { running: true },
    );
    const closed = await seedEntryWith({ projectId: web.id, taskId: design.id });
    const bare = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-30T11:00:00Z",
      endedAt: "2026-09-30T12:00:00Z",
    });

    const state = await getTrackerState(actor, ws, { from: null }, now);
    expect(state.running?.id).toBe(running.id);
    expect(state.running?.project).toEqual({ id: web.id, name: "Web", color: "green" });
    expect(state.running?.task).toEqual({ id: design.id, name: "Diseño" });
    const entries = daysOf(state).flatMap((day) => day.entries);
    expect(entries.find((entry) => entry.id === closed.id)).toMatchObject({
      project: { id: web.id, name: "Web", color: "green" },
      task: { id: design.id, name: "Diseño" },
    });
    expect(entries.find((entry) => entry.id === bare.id)).toMatchObject({
      project: null,
      task: null,
    });
  });

  it("el `stopped` de un arranque trae el par", async () => {
    const { web, design } = await seedTrackable();
    const previous = await seedEntryWith(
      { projectId: web.id, taskId: design.id },
      { running: true },
    );
    const started = await startTimer(actor, ws, {
      id: randomUUID(),
      description: "",
      projectId: null,
      taskId: null,
    });
    expect(started.stopped?.id).toBe(previous.id);
    expect(started.stopped?.project?.id).toBe(web.id);
    expect(started.stopped?.task?.id).toBe(design.id);
  });

  it("con el nombre o el color cambiados por SQL trae los nuevos; con el cliente cambiado, nada cambia", async () => {
    const { web, design } = await seedTrackable();
    const entry = await seedEntryWith({ projectId: web.id, taskId: design.id });
    const before = await updateDescription(actor, ws, { id: entry.id, description: "a" });

    const acme = await seedClient({ workspaceId });
    await db.update(project).set({ clientId: acme.id }).where(eq(project.id, web.id));
    const moved = await updateDescription(actor, ws, { id: entry.id, description: "a" });
    expect(moved.entry.project).toEqual(before.entry.project);
    expect(moved.entry.task).toEqual(before.entry.task);

    await db
      .update(project)
      .set({ name: "Sitio", color: "amber" })
      .where(eq(project.id, web.id));
    await db.update(client).set({ name: "Otro" }).where(eq(client.id, acme.id));
    const state = await getTrackerState(actor, ws, { from: null }, now);
    const listed = daysOf(state)
      .flatMap((day) => day.entries)
      .find((view) => view.id === entry.id);
    expect(listed?.project).toEqual({ id: web.id, name: "Sitio", color: "amber" });
  });

  it("una entrada con un privado del que la persona dejó de ser miembro lo muestra con su nombre y color", async () => {
    const vault = await seedProject({
      workspaceId,
      name: "Bóveda",
      color: "violet",
      isPublic: false,
      members: [{ userId: actor.userId }],
    });
    const created = await createManualEntry(actor, ws, {
      description: "",
      date: "2026-10-01",
      start: "08:00",
      end: "09:00",
      projectId: vault.id,
      taskId: null,
    });
    expect(created.created.project).toEqual({
      id: vault.id,
      name: "Bóveda",
      color: "violet",
    });

    await db.delete(projectMember).where(eq(projectMember.projectId, vault.id));
    const state = await getTrackerState(actor, ws, { from: null }, now);
    const listed = daysOf(state)
      .flatMap((day) => day.entries)
      .find((view) => view.id === created.created.id);
    expect(listed?.project).toEqual({ id: vault.id, name: "Bóveda", color: "violet" });
  });

  it("un color fuera de la paleta no sale en la vista: se lanza", async () => {
    const { web } = await seedTrackable();
    const entry = await seedEntryWith({ projectId: web.id, taskId: null });
    const constraint = await db.execute(sql`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'project'::regclass and conname = 'project_color_palette'
    `);
    const { definition } = constraint.rows[0] as { definition: string };
    await db.execute(sql`alter table project drop constraint project_color_palette`);
    try {
      await db.update(project).set({ color: "#ff0000" }).where(eq(project.id, web.id));
      await expect(
        updateDescription(actor, ws, { id: entry.id, description: "b" }),
      ).rejects.toThrow(/fuera de la paleta/);
    } finally {
      await db.update(project).set({ color: "green" }).where(eq(project.id, web.id));
      await db.execute(
        sql.raw(`alter table project add constraint project_color_palette ${definition}`),
      );
    }
  });
});

describe("la zona y los formatos de la persona (slice 7)", () => {
  const tokyo = "Asia/Tokyo";
  /** Las 12:00 del viernes 2 de octubre de 2026 en Buenos Aires. */
  const now = new Date("2026-10-02T15:00:00Z");

  /** Lo que cada fila muestra: los rótulos de semana, de día y de hora. */
  function labelsOf(state: TrackerState) {
    return state.weeks.map((week) => ({
      week: week.label,
      days: week.days.map((day) => ({
        day: day.label,
        entries: day.entries.map((entry) => [entry.startLabel, entry.endLabel]),
      })),
    }));
  }

  /** Dos entradas cerradas: ayer y una de una semana vieja de la ventana. */
  async function seedTwoWeeks(userId: string) {
    await seedClosedOf(userId, "2026-10-01T16:05:00Z", "2026-10-01T17:30:00Z");
    await seedClosedOf(userId, "2026-09-21T12:00:00Z", "2026-09-21T13:00:00Z");
  }

  it("trackerWorkspaceOf es timeSettingsOf más la creación del workspace (criterio 19)", async () => {
    await backdateWorkspace();
    await setWeekStart(actor.userId, 0);
    await seedPreferences(actor.userId, {
      timezone: tokyo,
      timeFormat: "12h",
      dateFormat: "MM/dd/yyyy",
    });
    const context = await profileContextFor(actor.userId);

    expect(trackerWorkspaceOf(context)).toEqual({
      ...timeSettingsOf(context),
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    expect(timeSettingsOf(context)).toEqual({
      timezone: tokyo,
      weekStart: 0,
      formats: { time: "12h", date: "MM/dd/yyyy" },
    });
  });

  it("sin fila, getTrackerState da los mismos rótulos que antes del slice con el workspace en Buenos Aires (criterio 3)", async () => {
    await backdateWorkspace();
    await seedTwoWeeks(actor.userId);

    const state = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );

    expect(labelsOf(state)).toEqual([
      { week: "Esta semana", days: [{ day: "Ayer", entries: [["13:05", "14:30"]] }] },
      {
        week: "Semana anterior",
        days: [{ day: "lun, 21/09", entries: [["09:00", "10:00"]] }],
      },
    ]);
  });

  it("con 12 h y otro formato de fecha, los rótulos cambian y las horas canónicas no (criterio 4)", async () => {
    await backdateWorkspace();
    await seedTwoWeeks(actor.userId);
    await seedClosedOf(actor.userId, "2026-09-14T03:00:00Z", "2026-09-14T15:59:00Z");
    await seedPreferences(actor.userId, { timeFormat: "12h", dateFormat: "yyyy-MM-dd" });

    const state = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );

    expect(labelsOf(state)).toEqual([
      {
        week: "Esta semana",
        days: [{ day: "Ayer", entries: [["1:05 PM", "2:30 PM"]] }],
      },
      {
        week: "Semana anterior",
        days: [{ day: "lun, 09-21", entries: [["9:00 AM", "10:00 AM"]] }],
      },
      {
        week: "09-14 – 09-20",
        days: [{ day: "lun, 09-14", entries: [["12:00 AM", "12:59 PM"]] }],
      },
    ]);
    const entries = daysOf(state).flatMap((day) => day.entries);
    expect(entries.map((entry) => [entry.startClock, entry.endClock])).toEqual([
      ["13:05", "14:30"],
      ["09:00", "10:00"],
      ["00:00", "12:59"],
    ]);
  });

  it("el timer corriendo trae su hora canónica y su rótulo en 12 h", async () => {
    await backdateWorkspace();
    await seedPreferences(actor.userId, { timeFormat: "12h" });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T16:05:00Z",
    });

    const state = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      new Date("2026-10-02T17:00:00Z"),
    );

    expect(state.running).toMatchObject({
      startLabel: "1:05 PM",
      startClock: "13:05",
      endLabel: null,
      endClock: null,
    });
  });

  it("dos personas en zonas distintas ven la misma hora de inicio en su zona y su día (criterio 7, PF-04)", async () => {
    await backdateWorkspace();
    const other = await seedMember(workspaceId, "member");
    await seedPreferences(other, { timezone: tokyo });
    // Las 00:00 del jueves 1 en Buenos Aires son las 12:00 del 1 en Tokio, y las
    // 22:00 del 1 en Buenos Aires son las 10:00 del 2 en Tokio.
    for (const userId of [actor.userId, other]) {
      await seedClosedOf(userId, "2026-10-01T03:00:00Z", "2026-10-01T03:01:00Z");
      await seedClosedOf(userId, "2026-10-02T01:00:00Z", "2026-10-02T01:30:00Z");
    }

    const inBuenosAires = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );
    const inTokyo = await getTrackerState(
      actorFor(other),
      await trackerWorkspaceFor(other),
      { from: null },
      now,
    );

    const viewOf = (state: TrackerState) =>
      daysOf(state).map((day) => ({
        date: day.date,
        entries: day.entries.map((entry) => entry.startLabel),
      }));
    expect(viewOf(inBuenosAires)).toEqual([
      { date: "2026-10-01", entries: ["22:00", "00:00"] },
    ]);
    expect(viewOf(inTokyo)).toEqual([
      { date: "2026-10-02", entries: ["10:00"] },
      { date: "2026-10-01", entries: ["12:00"] },
    ]);
    expect(inBuenosAires.todayKey).toBe("2026-10-02");
    expect(inTokyo.todayKey).toBe("2026-10-03");
  });

  it("el piso es el día de creación del workspace en la zona de la persona (criterio 7)", async () => {
    // Las 21:00 del 1 de setiembre en Buenos Aires son las 09:00 del 2 en Tokio.
    await db
      .update(workspaceTable)
      .set({ createdAt: new Date("2026-09-02T00:00:00Z") })
      .where(eq(workspaceTable.id, workspaceId));
    const other = await seedMember(workspaceId, "member");
    await seedPreferences(other, { timezone: tokyo });
    const values = {
      projectId: null,
      taskId: null,
      description: "",
      date: "2026-09-01",
      start: "08:00",
      end: "09:00",
    };

    const local = await trackerWorkspaceFor(actor.userId);
    const remote = await trackerWorkspaceFor(other);
    expect((await getTrackerState(actor, local, { from: null }, now)).minDayKey).toBe(
      "2026-09-01",
    );
    expect(
      (await getTrackerState(actorFor(other), remote, { from: null }, now)).minDayKey,
    ).toBe("2026-09-02");

    await expect(createManualEntry(actor, local, values)).resolves.toBeDefined();
    await expect(
      createManualEntry(actorFor(other), remote, values),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.beforeWorkspace,
    });
  });

  it("cambiar workspace.timezone no cambia ninguna vista (criterio 7, PF-05)", async () => {
    await backdateWorkspace();
    await seedTwoWeeks(actor.userId);
    const before = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );

    await db
      .update(workspaceTable)
      .set({ timezone: tokyo })
      .where(eq(workspaceTable.id, workspaceId));
    const after = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );

    expect(after).toEqual(before);
  });

  it("cambiar la zona con un timer corriendo no toca su inicio y lo pasa al día de la zona nueva (criterio 8, PF-39)", async () => {
    await backdateWorkspace();
    // Las 22:00 del 1 en Buenos Aires: las 10:00 del 2 en Tokio.
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T01:00:00Z",
    });

    const before = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );
    await updatePreference(actor, { key: "timezone", value: tokyo });
    const after = await getTrackerState(
      actor,
      await trackerWorkspaceFor(actor.userId),
      { from: null },
      now,
    );

    expect(before.running).toMatchObject({
      startedAt: "2026-10-02T01:00:00.000Z",
      dayDate: "2026-10-01",
      startClock: "22:00",
    });
    expect(after.running).toMatchObject({
      startedAt: "2026-10-02T01:00:00.000Z",
      dayDate: "2026-10-02",
      startClock: "10:00",
    });
    expect(await timeEntryById(running.id)).toEqual(running);
  });
});

/** El `RejectedError` de una operación en masa; si termina bien o lanza otra cosa, falla. */
async function rejectionOf(work: Promise<unknown>): Promise<RejectedError> {
  try {
    await work;
  } catch (error) {
    if (error instanceof RejectedError) {
      return error;
    }
    throw error;
  }
  throw new Error("La operación en masa no se rechazó.");
}

/** Lo que dejó la fila sembrada: sus instantes, su descripción y su `updatedAt`. */
async function snapshotOf(id: string) {
  const row = await timeEntryById(id);
  return row === undefined
    ? undefined
    : {
        description: row.description,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
}

describe("bulkEditEntries: la descripción (criterio 6, TT-63)", () => {
  const workspace = workspaceOf(buenosAires);

  it("cambia en todas las pedidas y responde las vistas en el orden pedido, no en el del id", async () => {
    const rows = [
      await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z"),
      await seedClosed("2026-09-30T11:00:00Z", "2026-09-30T12:00:00Z"),
      await seedClosed("2026-09-29T11:00:00Z", "2026-09-29T12:00:00Z"),
    ];
    const ids = rows.map((row) => row.id).sort((left, right) => (left < right ? 1 : -1));

    const result = await bulkEditEntries(actor, workspace, {
      ids,
      changes: { description: "nueva" },
    });

    expect(result.entries.map((entry) => entry.id)).toEqual(ids);
    expect(result.entries.map((entry) => entry.description)).toEqual([
      "nueva",
      "nueva",
      "nueva",
    ]);
    for (const row of rows) {
      expect(await timeEntryById(row.id)).toMatchObject({
        description: "nueva",
        startedAt: row.startedAt,
        endedAt: row.endedAt,
      });
    }
  });

  it("una entrada que ya la tenía no se escribe", async () => {
    const same = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "nueva",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    const other = await seedClosed("2026-09-30T11:00:00Z", "2026-09-30T12:00:00Z");

    const result = await bulkEditEntries(actor, workspace, {
      ids: [same.id, other.id],
      changes: { description: "nueva" },
    });

    expect(result.entries.map((entry) => entry.description)).toEqual(["nueva", "nueva"]);
    expect((await timeEntryById(same.id))?.updatedAt).toEqual(same.updatedAt);
    expect((await timeEntryById(other.id))?.updatedAt).not.toEqual(other.updatedAt);
  });

  it("la descripción vacía reemplaza: el servidor la acepta", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "algo",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await bulkEditEntries(actor, workspace, {
      ids: [row.id],
      changes: { description: "" },
    });

    expect((await timeEntryById(row.id))?.description).toBe("");
  });

  it("la vista de una entrada con proyecto y tarea los conserva, escrita o no", async () => {
    const web = await seedProject({ workspaceId, name: "Web", color: "pink" });
    const design = await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });
    const withPair = (description: string, startedAt: string, endedAt: string) =>
      seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        description,
        startedAt,
        endedAt,
        projectId: web.id,
        taskId: design.id,
      });
    const written = await withPair(
      "vieja",
      "2026-10-01T11:00:00Z",
      "2026-10-01T12:00:00Z",
    );
    const untouched = await withPair(
      "nueva",
      "2026-09-30T11:00:00Z",
      "2026-09-30T12:00:00Z",
    );

    const result = await bulkEditEntries(actor, workspace, {
      ids: [written.id, untouched.id],
      changes: { description: "nueva" },
    });

    for (const entry of result.entries) {
      expect(entry.project).toEqual({ id: web.id, name: "Web", color: "pink" });
      expect(entry.task).toEqual({ id: design.id, name: "Diseño" });
    }
    expect(await timeEntryById(written.id)).toMatchObject({
      projectId: web.id,
      taskId: design.id,
    });
  });
});

/** Un caso del criterio 7: la fila sembrada, lo que se pide, y el rechazo esperado si lo hay. */
type SameRuleCase = {
  readonly label: string;
  readonly zone: string;
  readonly createdAt?: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly changes: BulkEditChanges;
  readonly rejects?: string;
};

const sameRuleCases: readonly SameRuleCase[] = [
  {
    label: "el inicio en Buenos Aires",
    zone: buenosAires,
    startedAt: "2026-10-01T13:00:00Z",
    endedAt: "2026-10-01T14:00:00Z",
    changes: { start: "09:15" },
  },
  {
    label: "la fecha sola",
    zone: buenosAires,
    startedAt: "2026-10-01T13:00:00Z",
    endedAt: "2026-10-01T14:00:00Z",
    changes: { date: "2026-09-15" },
  },
  {
    label: "el fin que cruza la medianoche (TT-72)",
    zone: buenosAires,
    startedAt: "2026-10-01T23:00:00Z",
    endedAt: "2026-10-02T00:00:00Z",
    changes: { end: "01:30" },
  },
  {
    label: "la entrada que ya cruzaba la medianoche, con otro inicio",
    zone: buenosAires,
    startedAt: "2026-10-02T02:00:00Z",
    endedAt: "2026-10-02T04:00:00Z",
    changes: { start: "22:30" },
  },
  {
    label: "la hora repetida: descarta lo conservado que queda fuera de orden",
    zone: madrid,
    startedAt: "2026-10-24T23:50:00Z",
    endedAt: "2026-10-25T00:50:00Z",
    changes: { start: "02:10" },
  },
  {
    label: "la hora repetida: conserva el inicio en la primera ocurrencia",
    zone: madrid,
    startedAt: "2026-10-25T00:30:00Z",
    endedAt: "2026-10-25T02:15:00Z",
    changes: { end: "02:45" },
  },
  {
    label: "la hora repetida: dos horas iguales que duran 60 minutos reales",
    zone: madrid,
    startedAt: "2026-10-25T00:30:00Z",
    endedAt: "2026-10-25T02:15:00Z",
    changes: { end: "02:30" },
  },
  {
    label: "la hora que no existe en el inicio (TT-112)",
    zone: madrid,
    startedAt: "2026-03-20T08:00:00Z",
    endedAt: "2026-03-20T09:00:00Z",
    changes: { date: "2026-03-29", start: "02:30" },
    rejects: timeEntryMessages.nonexistentClock,
  },
  {
    label: "la hora que no existe en el fin (TT-112)",
    zone: madrid,
    startedAt: "2026-03-20T08:00:00Z",
    endedAt: "2026-03-20T09:00:00Z",
    changes: { date: "2026-03-29", start: "01:30", end: "02:30" },
    rejects: timeEntryMessages.nonexistentClock,
  },
  {
    label: "los segundos del extremo que no cambia (ADR 0006)",
    zone: buenosAires,
    startedAt: "2026-10-01T13:00:40Z",
    endedAt: "2026-10-01T13:30:15Z",
    changes: { end: "11:00" },
  },
  {
    label: "el conservado que dejaría el par en segundos (ADR 0006)",
    zone: buenosAires,
    startedAt: "2026-10-01T13:00:40Z",
    endedAt: "2026-10-01T13:30:15Z",
    changes: { end: "10:01" },
  },
  {
    label: "el par de menos de un minuto (TT-73)",
    zone: buenosAires,
    startedAt: "2026-10-01T13:00:00Z",
    endedAt: "2026-10-01T14:00:00Z",
    changes: { end: "10:00" },
    rejects: timeEntryMessages.tooShort,
  },
  {
    label: "antes de la creación del workspace",
    zone: buenosAires,
    createdAt: "2026-06-01T12:00:00Z",
    startedAt: "2026-10-01T13:00:00Z",
    endedAt: "2026-10-01T14:00:00Z",
    changes: { date: "2026-05-31" },
    rejects: timeEntryMessages.beforeWorkspace,
  },
  {
    label: "el día siguiente al 9999-12-31",
    zone: buenosAires,
    startedAt: "9999-12-31T13:00:00Z",
    endedAt: "9999-12-31T14:00:00Z",
    changes: { end: "09:00" },
    rejects: timeEntryMessages.invalidDate,
  },
  {
    label: "la entrada de más de un día (TT-110)",
    zone: buenosAires,
    startedAt: "2026-10-01T13:00:00Z",
    endedAt: "2026-10-03T14:00:00Z",
    changes: { start: "09:00" },
    rejects: timeEntryMessages.multiDayTimes,
  },
];

describe("bulkEditEntries: hora y fecha son la fila repetida (criterio 7)", () => {
  /** El desenlace de una edición: los instantes que quedaron, o el código y el texto del rechazo. */
  async function outcomeOf(id: string, work: () => Promise<unknown>) {
    try {
      await work();
      return await instantsOf(id);
    } catch (error) {
      if (error instanceof RejectedError) {
        expect(error.rejections.map((rejection) => rejection.id)).toEqual([id]);
        const [rejection] = error.rejections;
        return { code: rejection.code, message: rejection.message };
      }
      if (error instanceof TimeEntryError) {
        return { code: error.code, message: error.message };
      }
      throw error;
    }
  }

  it.each(sameRuleCases)("$label", async (example) => {
    const workspace = workspaceOf(example.zone, example.createdAt);
    const bulkRow = await seedClosed(example.startedAt, example.endedAt);
    const singleRow = await seedClosed(example.startedAt, example.endedAt);
    const startedAt = new Date(example.startedAt);
    const own = {
      date: dayKey(startedAt, example.zone),
      start: formatClock(startedAt, example.zone),
      end: formatClock(new Date(example.endedAt), example.zone),
    };
    const combined = { ...own, ...example.changes };
    // Con un trío igual al de la fila la masiva no evalúa y la de una fila sí.
    expect(combined).not.toEqual(own);

    const bulk = await outcomeOf(bulkRow.id, () =>
      bulkEditEntries(actor, workspace, { ids: [bulkRow.id], changes: example.changes }),
    );
    const single = await outcomeOf(singleRow.id, () =>
      updateEntryTimes(actor, workspace, { id: singleRow.id, ...combined }),
    );

    expect(bulk).toEqual(single);
    if (example.rejects === undefined) {
      expect(bulk).not.toEqual({
        startedAt: startedAt.toISOString(),
        endedAt: new Date(example.endedAt).toISOString(),
      });
    } else {
      expect(bulk).toEqual({ code: "validation", message: example.rejects });
      expect(await instantsOf(bulkRow.id)).toEqual({
        startedAt: startedAt.toISOString(),
        endedAt: new Date(example.endedAt).toISOString(),
      });
    }
  });
});

describe("bulkEditEntries: un campo ausente no cambia (criterio 8)", () => {
  const workspace = workspaceOf(buenosAires);

  it("cambiar solo el inicio deja el fin de cada entrada como estaba", async () => {
    // 09:00 a 10:00 y 14:00 a 16:00 en Buenos Aires.
    const early = await seedClosed("2026-10-01T12:00:00Z", "2026-10-01T13:00:00Z");
    const late = await seedClosed("2026-09-30T17:00:00Z", "2026-09-30T19:00:00Z");

    const result = await bulkEditEntries(actor, workspace, {
      ids: [early.id, late.id],
      changes: { start: "08:30" },
    });

    expect(result.entries.map((entry) => [entry.startedAt, entry.endedAt])).toEqual([
      ["2026-10-01T11:30:00.000Z", "2026-10-01T13:00:00.000Z"],
      ["2026-09-30T11:30:00.000Z", "2026-09-30T19:00:00.000Z"],
    ]);
    expect(await instantsOf(late.id)).toEqual({
      startedAt: "2026-09-30T11:30:00.000Z",
      endedAt: "2026-09-30T19:00:00.000Z",
    });
  });

  it("TT-72: si el fin queda antes del inicio nuevo, termina al día siguiente", async () => {
    // 10:00 a 11:00; el inicio pasa a las 11:30.
    const row = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");

    const result = await bulkEditEntries(actor, workspace, {
      ids: [row.id],
      changes: { start: "11:30" },
    });

    expect(result.entries[0]).toMatchObject({
      startedAt: "2026-10-01T14:30:00.000Z",
      endedAt: "2026-10-02T14:00:00.000Z",
      extraDays: 1,
    });
  });

  it("con la persona en 12 h, el trío de la fila sale de la hora canónica y no del rótulo", async () => {
    const twelveHours: TrackerWorkspace = {
      ...workspace,
      formats: { ...defaultFormats, time: "12h" },
    };
    // 10:00 a 11:00 en Buenos Aires: «10:00 AM» y «11:00 AM» en sus rótulos.
    const row = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");

    const result = await bulkEditEntries(actor, twelveHours, {
      ids: [row.id],
      changes: { start: "09:00" },
    });

    expect(result.entries[0]).toMatchObject({
      startedAt: "2026-10-01T12:00:00.000Z",
      endedAt: "2026-10-01T14:00:00.000Z",
      startLabel: "9:00 AM",
      endLabel: "11:00 AM",
    });
  });

  it("cambiar solo la descripción no toca los instantes, ni los segundos", async () => {
    const row = await seedClosed("2026-10-01T13:00:40Z", "2026-10-01T13:30:15Z");

    await bulkEditEntries(actor, workspace, {
      ids: [row.id],
      changes: { description: "x" },
    });

    expect(await instantsOf(row.id)).toEqual({
      startedAt: "2026-10-01T13:00:40.000Z",
      endedAt: "2026-10-01T13:30:15.000Z",
    });
  });
});

describe("bulkEditEntries: una fila cuyo trío no cambia no se reescribe (criterio 9)", () => {
  const workspace = workspaceOf(buenosAires);

  it("la entrada de más de un día con su propia fecha no es un rechazo y no cambia", async () => {
    const multiDay = await seedClosed("2026-10-01T13:00:00Z", "2026-10-03T14:00:00Z");
    const moved = await seedClosed("2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z");

    const result = await bulkEditEntries(actor, workspace, {
      ids: [multiDay.id, moved.id],
      changes: { date: "2026-10-01" },
    });

    expect(result.entries[0]).toMatchObject({
      id: multiDay.id,
      startedAt: "2026-10-01T13:00:00.000Z",
      endedAt: "2026-10-03T14:00:00.000Z",
      editableTimes: false,
    });
    expect((await timeEntryById(multiDay.id))?.updatedAt).toEqual(multiDay.updatedAt);
    expect(result.entries[1]).toMatchObject({ id: moved.id, dayDate: "2026-10-01" });
  });

  it("el trío pedido igual al de la fila no se reescribe aunque traiga los tres campos", async () => {
    // 10:00:40 a 10:30:15: reescribirlo perdería los segundos.
    const row = await seedClosed("2026-10-01T13:00:40Z", "2026-10-01T13:30:15Z");

    await bulkEditEntries(actor, workspace, {
      ids: [row.id],
      changes: { date: "2026-10-01", start: "10:00", end: "10:30" },
    });

    expect(await snapshotOf(row.id)).toEqual({
      description: "",
      startedAt: "2026-10-01T13:00:40.000Z",
      endedAt: "2026-10-01T13:30:15.000Z",
      updatedAt: row.updatedAt.toISOString(),
    });
  });
});

describe("bulkEditEntries: todo o nada (criterio 10, ADR 0011)", () => {
  it("cada causa de §4.5, mezclada con filas válidas: nada escrito y la lista entera en el orden pedido", async () => {
    const workspace = workspaceOf(madrid);
    const otherId = await seedMember(workspaceId, "member");
    // En Madrid; el inicio pedido es 02:30.
    const validA = await seedClosed("2026-10-01T08:00:00Z", "2026-10-01T09:00:00Z");
    const validB = await seedClosed("2026-09-30T08:00:00Z", "2026-09-30T09:00:00Z");
    const foreign = await seedClosed(
      "2026-10-01T08:00:00Z",
      "2026-10-01T09:00:00Z",
      otherId,
    );
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T08:00:00Z",
    });
    // 10:00 del 1 a 11:00 del 3.
    const multiDay = await seedClosed("2026-10-01T08:00:00Z", "2026-10-03T09:00:00Z");
    // 00:10 a 00:20 del 29/03: las 02:30 de ese día no existen.
    const nonexistent = await seedClosed("2026-03-28T23:10:00Z", "2026-03-28T23:20:00Z");
    // 01:00 a 02:30: con el inicio a las 02:30 dura cero.
    const short = await seedClosed("2026-10-01T23:00:00Z", "2026-10-02T00:30:00Z");
    // 01:00 a 02:00 del 9999-12-31: el fin pasa al día siguiente, que no existe.
    const lastDay = await seedClosed("9999-12-31T00:00:00Z", "9999-12-31T01:00:00Z");
    // 10:00 a 11:00 del 30/12/2019, antes de la creación del workspace.
    const tooEarly = await seedClosed("2019-12-30T09:00:00Z", "2019-12-30T10:00:00Z");
    const missing = randomUUID();
    const seeded = [
      validA,
      validB,
      foreign,
      running,
      multiDay,
      nonexistent,
      short,
      lastDay,
      tooEarly,
    ];
    const before = await Promise.all(seeded.map((row) => snapshotOf(row.id)));

    const error = await rejectionOf(
      bulkEditEntries(actor, workspace, {
        ids: [
          validA.id,
          missing,
          foreign.id,
          running.id,
          multiDay.id,
          validB.id,
          nonexistent.id,
          short.id,
          lastDay.id,
          tooEarly.id,
        ],
        changes: { description: "nueva", start: "02:30" },
      }),
    );

    expect(error.code).toBe("rejected");
    expect(error.message).toBe(timeEntryMessages.bulkEditRejected);
    expect(error.rejections).toEqual([
      { id: missing, code: "not_found", message: timeEntryMessages.notFound },
      {
        id: foreign.id,
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      },
      {
        id: running.id,
        code: "timer_running",
        message: timeEntryMessages.runningEntryTimes,
      },
      { id: multiDay.id, code: "validation", message: timeEntryMessages.multiDayTimes },
      {
        id: nonexistent.id,
        code: "validation",
        message: timeEntryMessages.nonexistentClock,
      },
      { id: short.id, code: "validation", message: timeEntryMessages.tooShort },
      { id: lastDay.id, code: "validation", message: timeEntryMessages.invalidDate },
      { id: tooEarly.id, code: "validation", message: timeEntryMessages.beforeWorkspace },
    ]);
    expect(await Promise.all(seeded.map((row) => snapshotOf(row.id)))).toEqual(before);
  });

  it("con una sola fila rechazada no cambia ninguna de las otras", async () => {
    const workspace = workspaceOf(buenosAires);
    const rows = [
      await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z"),
      await seedClosed("2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z"),
    ];
    const multiDay = await seedClosed("2026-10-01T13:00:00Z", "2026-10-03T14:00:00Z");
    const before = await Promise.all(rows.map((row) => snapshotOf(row.id)));

    const error = await rejectionOf(
      bulkEditEntries(actor, workspace, {
        ids: [rows[0].id, multiDay.id, rows[1].id],
        changes: { start: "08:00" },
      }),
    );

    expect(error.rejections).toEqual([
      { id: multiDay.id, code: "validation", message: timeEntryMessages.multiDayTimes },
    ]);
    expect(await Promise.all(rows.map((row) => snapshotOf(row.id)))).toEqual(before);
  });

  it("la ajena que corre y la ajena de más de un día se rechazan como ajenas: ni su estado ni su horario se filtran", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const foreignRunning = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    // 10:00 del 1 a 11:00 del 3, en Buenos Aires.
    const foreignMultiDay = await seedClosed(
      "2026-10-01T13:00:00Z",
      "2026-10-03T14:00:00Z",
      otherId,
    );
    const seeded = [foreignRunning, foreignMultiDay];
    const before = await Promise.all(seeded.map((row) => snapshotOf(row.id)));

    const error = await rejectionOf(
      bulkEditEntries(actor, workspaceOf(buenosAires), {
        ids: [foreignRunning.id, foreignMultiDay.id],
        changes: { start: "08:00" },
      }),
    );

    expect(error.rejections).toEqual(
      seeded.map((row) => ({
        id: row.id,
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      })),
    );
    expect(await Promise.all(seeded.map((row) => snapshotOf(row.id)))).toEqual(before);
  });

  it("la entrada que corre es un rechazo también si el cambio es solo la descripción (TT-111)", async () => {
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "corriendo",
      startedAt: "2026-10-02T11:00:00Z",
    });

    const error = await rejectionOf(
      bulkEditEntries(actor, workspaceOf(buenosAires), {
        ids: [running.id],
        changes: { description: "otra" },
      }),
    );

    expect(error.rejections).toEqual([
      {
        id: running.id,
        code: "timer_running",
        message: timeEntryMessages.runningEntryTimes,
      },
    ]);
    expect((await timeEntryById(running.id))?.description).toBe("corriendo");
  });

  it("la entrada de otro workspace es una que no existe", async () => {
    const other = await seedWorkspace(buenosAires);
    const foreign = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      description: "allá",
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });

    const error = await rejectionOf(
      bulkEditEntries(actor, workspaceOf(buenosAires), {
        ids: [foreign.id],
        changes: { description: "acá" },
      }),
    );

    expect(error.rejections).toEqual([
      { id: foreign.id, code: "not_found", message: timeEntryMessages.notFound },
    ]);
    expect((await timeEntryById(foreign.id))?.description).toBe("allá");
  });
});

describe("bulkDeleteEntries (criterio 11, TT-64)", () => {
  it("borra todas las pedidas y responde los ids pedidos", async () => {
    const rows = [
      await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z"),
      await seedClosed("2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z"),
      await seedClosed("2026-09-29T13:00:00Z", "2026-09-29T14:00:00Z"),
    ];
    const kept = await seedClosed("2026-09-28T13:00:00Z", "2026-09-28T14:00:00Z");
    const ids = rows.map((row) => row.id);

    const result = await bulkDeleteEntries(actor, { ids });

    expect(result).toEqual({ ids });
    for (const row of rows) {
      expect(await timeEntryById(row.id)).toBeUndefined();
    }
    expect(await timeEntryById(kept.id)).toBeDefined();
  });

  it("una que ya no existe no es un rechazo: se borran las otras", async () => {
    const row = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const missing = randomUUID();

    const result = await bulkDeleteEntries(actor, { ids: [missing, row.id] });

    expect(result).toEqual({ ids: [missing, row.id] });
    expect(await timeEntryById(row.id)).toBeUndefined();
  });

  it("la ajena y la que corre rechazan el pedido, en el orden pedido, y no se borra ninguna", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const own = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const foreign = await seedClosed(
      "2026-10-01T13:00:00Z",
      "2026-10-01T14:00:00Z",
      otherId,
    );
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const error = await rejectionOf(
      bulkDeleteEntries(actor, { ids: [running.id, own.id, randomUUID(), foreign.id] }),
    );

    expect(error.code).toBe("rejected");
    expect(error.message).toBe(timeEntryMessages.bulkDeleteRejected);
    expect(error.rejections).toEqual([
      {
        id: running.id,
        code: "timer_running",
        message: timeEntryMessages.runningEntryTimes,
      },
      {
        id: foreign.id,
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      },
    ]);
    for (const row of [own, foreign, running]) {
      expect(await timeEntryById(row.id)).toBeDefined();
    }
  });

  it("la ajena que corre se rechaza como ajena: su estado no se filtra", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const foreignRunning = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const error = await rejectionOf(
      bulkDeleteEntries(actor, { ids: [foreignRunning.id] }),
    );

    expect(error.rejections).toEqual([
      {
        id: foreignRunning.id,
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      },
    ]);
    expect(await timeEntryById(foreignRunning.id)).toBeDefined();
  });

  it("no borra la entrada de otro workspace, que para este no existe", async () => {
    const other = await seedWorkspace(buenosAires);
    const foreign = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });

    expect(await bulkDeleteEntries(actor, { ids: [foreign.id] })).toEqual({
      ids: [foreign.id],
    });
    expect(await timeEntryById(foreign.id)).toBeDefined();
  });
});

describe("reintentar una operación en masa aplicada (criterio 14, TT-89)", () => {
  it("la edición repetida no escribe y responde las mismas vistas", async () => {
    const workspace = workspaceOf(buenosAires);
    const rows = [
      await seedClosed("2026-10-01T13:00:40Z", "2026-10-01T14:00:00Z"),
      await seedClosed("2026-09-30T13:00:00Z", "2026-09-30T14:00:15Z"),
    ];
    const request = {
      ids: rows.map((row) => row.id),
      changes: { description: "nueva", date: "2026-09-29", start: "09:00" },
    };

    const first = await bulkEditEntries(actor, workspace, request);
    const applied = await Promise.all(rows.map((row) => snapshotOf(row.id)));
    const second = await bulkEditEntries(actor, workspace, request);

    expect(second).toEqual(first);
    expect(await Promise.all(rows.map((row) => snapshotOf(row.id)))).toEqual(applied);
  });

  it("el borrado repetido responde éxito", async () => {
    const row = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");

    await bulkDeleteEntries(actor, { ids: [row.id] });

    expect(await bulkDeleteEntries(actor, { ids: [row.id] })).toEqual({ ids: [row.id] });
  });
});

describe("las operaciones en masa en la base, cruzadas", () => {
  it("criterio 15: el borrado de una fila encolado antes de la edición masiva la deja en not_found, sin cambiar las otras", async () => {
    const workspace = workspaceOf(buenosAires);
    const shared = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const other = await seedClosed("2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z");
    const before = await snapshotOf(other.id);

    const [removed, edited] = await queueBehindBarrier(lockRow(shared.id), [
      () => deleteEntry(actor, { id: shared.id }),
      () =>
        bulkEditEntries(actor, workspace, {
          ids: [other.id, shared.id],
          changes: { description: "nueva" },
        }),
    ]);

    expect(removed.status).toBe("fulfilled");
    expect(edited.status).toBe("rejected");
    if (edited.status !== "rejected") return;
    expect(edited.reason).toBeInstanceOf(RejectedError);
    expect(edited.reason).toMatchObject({
      rejections: [
        { id: shared.id, code: "not_found", message: timeEntryMessages.notFound },
      ],
    });
    expect(await snapshotOf(other.id)).toEqual(before);
  });

  it("criterio 21: dos ediciones masivas sobre los mismos ids, en orden opuesto, responden las dos", async () => {
    const workspace = workspaceOf(buenosAires);
    const seeded = [
      await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z"),
      await seedClosed("2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z"),
      await seedClosed("2026-09-29T13:00:00Z", "2026-09-29T14:00:00Z"),
    ];
    const [a, b, c] = seeded.map((row) => row.id).sort();
    await warmPool(3);
    const finished: string[] = [];
    const edit = (ids: string[], description: string) => async () => {
      const result = await bulkEditEntries(actor, workspace, {
        ids,
        changes: { description },
      });
      finished.push(description);
      return result;
    };

    const results = await raceThroughBarrier(lockRow(b), [
      edit([a, b, c], "uno"),
      edit([c, b, a], "dos"),
    ]);

    expect(results.map((result) => result.entries.map((entry) => entry.id))).toEqual([
      [a, b, c],
      [c, b, a],
    ]);
    expect(finished).toHaveLength(2);
    const last = finished[1];
    for (const id of [a, b, c]) {
      expect((await timeEntryById(id))?.description).toBe(last);
    }
  });
});

describe("las guardas de las escrituras de las operaciones en masa", () => {
  it("updateClosedFields no escribe una entrada abierta ni la de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const foreign = await seedClosed(
      "2026-10-01T13:00:00Z",
      "2026-10-01T14:00:00Z",
      otherId,
    );

    const results = await db.transaction(async (tx) => [
      await timeEntryRepository.updateClosedFields(
        tx,
        { workspaceId, userId: actor.userId, id: running.id },
        { description: "x" },
      ),
      await timeEntryRepository.updateClosedFields(
        tx,
        { workspaceId, userId: actor.userId, id: foreign.id },
        { description: "x" },
      ),
    ]);

    expect(results).toEqual([undefined, undefined]);
    expect((await timeEntryById(running.id))?.description).toBe("");
    expect((await timeEntryById(foreign.id))?.description).toBe("");
  });

  it("deleteClosedByIds sin destinos no borra nada", async () => {
    const row = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");

    const removed = await db.transaction((tx) =>
      timeEntryRepository.deleteClosedByIds(tx, []),
    );

    expect(removed).toEqual([]);
    expect(await timeEntryById(row.id)).toBeDefined();
  });

  it("deleteClosedByIds no borra una entrada abierta, ni la de otra persona, ni la de otro workspace", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const other = await seedWorkspace(buenosAires);
    const own = await seedClosed("2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const foreign = await seedClosed(
      "2026-10-01T13:00:00Z",
      "2026-10-01T14:00:00Z",
      otherId,
    );
    const elsewhere = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });

    const removed = await db.transaction((tx) =>
      timeEntryRepository.deleteClosedByIds(
        tx,
        [own, running, foreign, elsewhere].map((row) => ({
          workspaceId,
          userId: actor.userId,
          id: row.id,
        })),
      ),
    );

    expect(removed.map((row) => row.id)).toEqual([own.id]);
    for (const row of [running, foreign, elsewhere]) {
      expect(await timeEntryById(row.id)).toBeDefined();
    }
  });

  it("findManyByIdsForUpdate trae las filas pedidas del workspace en el orden del id", async () => {
    const other = await seedWorkspace(buenosAires);
    // Insertadas de mayor a menor id: el orden físico es el inverso del pedido.
    const ids = Array.from({ length: 4 }, () => randomUUID()).sort((left, right) =>
      left < right ? 1 : -1,
    );
    for (const id of ids) {
      await db.insert(timeEntry).values({
        id,
        workspaceId,
        userId: actor.userId,
        startedAt: new Date("2026-10-01T13:00:00Z"),
        endedAt: new Date("2026-10-01T14:00:00Z"),
      });
    }
    const elsewhere = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });

    const found = await db.transaction((tx) =>
      timeEntryRepository.findManyByIdsForUpdate(tx, workspaceId, [...ids, elsewhere.id]),
    );

    expect(found.map((row) => row.id)).toEqual([...ids].reverse());
  });
});

/** El período de la vista, sin los datos de cada día. */
function periodOf(state: CalendarState) {
  return {
    mode: state.mode,
    periodStart: state.periodStart,
    periodLabel: state.periodLabel,
    previousStart: state.previousStart,
    nextStart: state.nextStart,
    todayStart: state.todayStart,
    dayModeStart: state.dayModeStart,
    weekModeStart: state.weekModeStart,
    days: state.days.map((day) => day.date),
  };
}

describe("getCalendarState: el período (criterios 2 y 3, CAL-15 a CAL-18)", () => {
  /** Las 12:00 del viernes 2 de octubre de 2026 en Buenos Aires. */
  const now = new Date("2026-10-02T15:00:00Z");

  function read(
    mode: "week" | "day",
    day: string | null,
    workspace = workspaceOf(buenosAires),
  ) {
    return getCalendarState(actor, workspace, { mode, day }, now);
  }

  it("sin día, la semana que contiene hoy desde el primer día de la persona", async () => {
    expect(periodOf(await read("week", null))).toEqual({
      mode: "week",
      periodStart: "2026-09-28",
      periodLabel: "Esta semana",
      previousStart: "2026-09-21",
      nextStart: "2026-10-05",
      todayStart: "2026-09-28",
      dayModeStart: "2026-10-02",
      weekModeStart: "2026-09-28",
      days: [
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
        "2026-10-04",
      ],
    });
  });

  it("un día de mitad de semana da la semana que lo contiene, y «Día» abre su primer día", async () => {
    expect(periodOf(await read("week", "2026-09-23"))).toMatchObject({
      periodStart: "2026-09-21",
      periodLabel: "Semana anterior",
      previousStart: "2026-09-14",
      nextStart: "2026-09-28",
      todayStart: "2026-09-28",
      dayModeStart: "2026-09-21",
      weekModeStart: "2026-09-21",
    });
    expect((await read("week", "2026-09-10")).periodLabel).toBe("07/09 – 13/09");
  });

  it("corta la semana en el domingo si la persona lo eligió (TT-48)", async () => {
    const state = await read(
      "week",
      "2026-10-01",
      workspaceOf(buenosAires, undefined, 0),
    );

    expect(state.periodStart).toBe("2026-09-27");
    expect(state.days.map((day) => day.date).at(-1)).toBe("2026-10-03");
    expect(state.todayStart).toBe("2026-09-27");
  });

  it("la vista día es un día, con «Hoy», «Ayer» o el día y las flechas de a uno", async () => {
    expect(periodOf(await read("day", null))).toEqual({
      mode: "day",
      periodStart: "2026-10-02",
      periodLabel: "Hoy",
      previousStart: "2026-10-01",
      nextStart: "2026-10-03",
      todayStart: "2026-10-02",
      dayModeStart: "2026-10-02",
      weekModeStart: "2026-09-28",
      days: ["2026-10-02"],
    });
    expect((await read("day", "2026-10-01")).periodLabel).toBe("Ayer");
    expect(periodOf(await read("day", "2026-09-23"))).toMatchObject({
      periodLabel: "mié, 23/09",
      todayStart: "2026-10-02",
      dayModeStart: "2026-09-23",
      weekModeStart: "2026-09-21",
    });
  });

  it("un período sin anterior o sin siguiente de cuatro cifras da el actual (CAL-17)", async () => {
    for (const mode of ["week", "day"] as const) {
      const current = periodOf(await read(mode, null));
      expect(periodOf(await read(mode, "9999-12-31"))).toEqual(current);
      expect(periodOf(await read(mode, "0100-01-01"))).toEqual(current);
    }
  });

  it("el borde se mide por un período: el día anterior al último y el posterior al primero se navegan", async () => {
    expect((await read("day", "9999-12-30")).periodStart).toBe("9999-12-30");
    expect((await read("day", "0100-01-02")).periodStart).toBe("0100-01-02");
    // El 9999-12-31 es viernes: la semana siguiente a la del lunes 20 ya no
    // tiene clave. Del otro lado, la anterior a la del lunes 0100-01-04 tampoco.
    expect((await read("week", "9999-12-13")).periodStart).toBe("9999-12-13");
    expect((await read("week", "9999-12-20")).periodStart).toBe("2026-09-28");
    expect((await read("week", "0100-01-11")).periodStart).toBe("0100-01-11");
    expect((await read("week", "0100-01-04")).periodStart).toBe("2026-09-28");
  });

  it("un período con un día que falta entero en la zona da el actual: Apia, 2011-12-30", async () => {
    const apia = workspaceOf("Pacific/Apia");
    const current = periodOf(await read("week", null, apia));

    expect(periodOf(await read("week", "2011-12-30", apia))).toEqual(current);
    // En la vista día también lo es el día anterior: su fin es el 30.
    expect(periodOf(await read("day", "2011-12-29", apia))).toEqual(
      periodOf(await read("day", null, apia)),
    );
    expect((await read("day", "2011-12-31", apia)).periodStart).toBe("2011-12-31");
  });
});

describe("getCalendarState: la lectura (criterio 4, CAL-02, CAL-28)", () => {
  const now = new Date("2026-10-02T15:00:00Z");
  /** La semana anterior en Buenos Aires: del 21/09 a las 03:00 UTC al 28/09 a las 03:00 UTC. */
  const previousWeek = { mode: "week", day: "2026-09-21" } as const;

  function seedOwn(description: string, startedAt: string, endedAt: string) {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description,
      startedAt,
      endedAt,
    });
  }

  it("trae las cerradas propias que se superponen con el período, y el timer aparte", async () => {
    const otherId = await seedMember(workspaceId, "member");
    await seedClosedOf(otherId, "2026-09-23T12:00:00Z", "2026-09-23T13:00:00Z");
    await seedOwn("empieza antes", "2026-09-21T02:00:00Z", "2026-09-21T04:00:00Z");
    await seedOwn("termina después", "2026-09-28T01:00:00Z", "2026-09-28T05:00:00Z");
    await seedOwn(
      "termina en el principio",
      "2026-09-21T02:00:00Z",
      "2026-09-21T03:00:00Z",
    );
    await seedOwn("empieza en el final", "2026-09-28T03:00:00Z", "2026-09-28T04:00:00Z");
    await seedOwn("cero en el principio", "2026-09-21T03:00:00Z", "2026-09-21T03:00:00Z");
    await seedOwn("adentro", "2026-09-23T12:00:00Z", "2026-09-23T13:00:00Z");
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "timer",
      // Justo en el principio: la rama de la duración cero no lo trae.
      startedAt: "2026-09-21T03:00:00Z",
    });

    const state = await getCalendarState(
      actor,
      workspaceOf(buenosAires),
      previousWeek,
      now,
    );

    expect(state.entries.map((entry) => entry.description)).toEqual([
      "empieza antes",
      "cero en el principio",
      "adentro",
      "termina después",
    ]);
    expect(state.running?.id).toBe(running.id);
  });

  it("el timer viaja aunque no toque el período", async () => {
    const running = await seedRunning();

    const state = await getCalendarState(
      actor,
      workspaceOf(buenosAires),
      { mode: "week", day: "2026-09-07" },
      now,
    );

    expect(state.running?.id).toBe(running.id);
    expect(state.entries).toEqual([]);
  });

  it("no trae las de otro workspace", async () => {
    const other = await seedWorkspace(buenosAires);
    await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-23T12:00:00Z",
      endedAt: "2026-09-23T13:00:00Z",
    });

    const state = await getCalendarState(
      actor,
      workspaceOf(buenosAires),
      previousWeek,
      now,
    );

    expect(state.entries).toEqual([]);
  });

  it("ordena por inicio y después por id (CAL-76)", async () => {
    const earlier = await seedOwn(
      "antes",
      "2026-09-22T11:00:00Z",
      "2026-09-22T11:30:00Z",
    );
    // Seis del mismo inicio: con ids al azar, un orden que no sea por id no
    // coincide con el ordenado más que por casualidad.
    const tied = [];
    for (let index = 0; index < 6; index += 1) {
      tied.push(
        await seedOwn(`${index}`, "2026-09-22T12:00:00Z", "2026-09-22T13:00:00Z"),
      );
    }

    const state = await getCalendarState(
      actor,
      workspaceOf(buenosAires),
      previousWeek,
      now,
    );

    expect(state.entries.map((entry) => entry.id)).toEqual([
      earlier.id,
      ...tied.map((row) => row.id).sort(),
    ]);
  });

  it("nunca da la misma entrada como timer y como cerrada", async () => {
    // El timer y las cerradas salen de consultas distintas. La parada se mete
    // entre las dos, en otra conexión: con cada consulta en su propio snapshot,
    // la segunda ve cerrada la entrada que la primera vio corriendo.
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const workspace = workspaceOf(buenosAires);
    const week = { mode: "week", day: null } as const;
    const listClosed = timeEntryRepository.listClosedOverlapping;
    const stopInBetween = vi
      .spyOn(timeEntryRepository, "listClosedOverlapping")
      .mockImplementation(async (...args) => {
        await stopTimer(actor, workspace, { id: running.id });
        return listClosed(...args);
      });

    try {
      const state = await getCalendarState(actor, workspace, week);

      expect(stopInBetween).toHaveBeenCalledOnce();
      expect(state.running?.id).toBe(running.id);
      expect(state.entries.map((entry) => entry.id)).not.toContain(running.id);
    } finally {
      stopInBetween.mockRestore();
    }
    const after = await getCalendarState(actor, workspace, week);
    expect(after.running).toBeNull();
    expect(after.entries.map((entry) => entry.id)).toContain(running.id);
  });

  it("cada entrada viene con su proyecto y su tarea", async () => {
    const seeded = await seedProject({ workspaceId, color: "green" });
    const seededTask = await seedTask({ workspaceId, projectId: seeded.id });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-23T12:00:00Z",
      endedAt: "2026-09-23T13:00:00Z",
      projectId: seeded.id,
      taskId: seededTask.id,
    });

    const state = await getCalendarState(
      actor,
      workspaceOf(buenosAires),
      previousWeek,
      now,
    );

    expect(state.entries.map((entry) => [entry.project, entry.task])).toEqual([
      [
        { id: seeded.id, name: seeded.name, color: "green" },
        { id: seededTask.id, name: seededTask.name },
      ],
    ]);
  });
});

describe("getCalendarState: los totales (criterio 5, CAL-31 a CAL-33, P-02)", () => {
  const now = new Date("2026-10-02T15:00:00Z");

  it("cada día suma entera la cerrada que empieza en él, y el período da lo mismo que el rastreador", async () => {
    // Jueves 24/09, de 22:00 a 02:00 en Buenos Aires.
    await seedClosedOf(actor.userId, "2026-09-25T01:00:00Z", "2026-09-25T05:00:00Z");
    // Martes 22/09, dos de una hora.
    await seedClosedOf(actor.userId, "2026-09-22T12:00:00Z", "2026-09-22T13:00:00Z");
    await seedClosedOf(actor.userId, "2026-09-22T12:00:00Z", "2026-09-22T13:00:00Z");
    // Domingo 20/09 de 23:00 a 01:00: se ve el lunes y suma en la semana anterior.
    await seedClosedOf(actor.userId, "2026-09-21T02:00:00Z", "2026-09-21T04:00:00Z");
    // El timer no suma en el total cerrado.
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-24T12:00:00Z",
    });
    const workspace = workspaceOf(buenosAires);

    const calendar = await getCalendarState(
      actor,
      workspace,
      { mode: "week", day: "2026-09-21" },
      now,
    );
    const tracker = await getTrackerState(actor, workspace, { from: "2026-09-14" }, now);

    expect(
      Object.fromEntries(calendar.days.map((day) => [day.date, day.closedSeconds])),
    ).toEqual({
      "2026-09-21": 0,
      "2026-09-22": 7200,
      "2026-09-23": 0,
      "2026-09-24": 14400,
      "2026-09-25": 0,
      "2026-09-26": 0,
      "2026-09-27": 0,
    });
    expect(calendar.entries).toHaveLength(4);
    expect(calendar.closedSeconds).toBe(21600);
    expect(tracker.weeks.find((week) => week.start === "2026-09-21")?.closedSeconds).toBe(
      calendar.closedSeconds,
    );
  });
});

describe("getCalendarState: zona, formatos y días (criterios 7, 10, 11 y 15)", () => {
  const now = new Date("2026-10-02T15:00:00Z");

  it("rotula cada columna con el formato de fecha de la persona, nunca «Hoy» ni «Ayer» (CAL-09)", async () => {
    const week = { mode: "week", day: null } as const;
    const plain = await getCalendarState(actor, workspaceOf(buenosAires), week, now);
    const american = await getCalendarState(
      actor,
      { ...workspaceOf(buenosAires), formats: { time: "12h", date: "MM/dd/yyyy" } },
      week,
      now,
    );

    expect(plain.days.map((day) => [day.label, day.isToday])).toEqual([
      ["lun, 28/09", false],
      ["mar, 29/09", false],
      ["mié, 30/09", false],
      ["jue, 01/10", false],
      ["vie, 02/10", true],
      ["sáb, 03/10", false],
      ["dom, 04/10", false],
    ]);
    expect(american.days.map((day) => day.label).slice(3, 5)).toEqual([
      "jue, 10/01",
      "vie, 10/02",
    ]);
  });

  it("lleva el año en las columnas de otro año", async () => {
    const state = await getCalendarState(
      actor,
      workspaceOf(buenosAires),
      { mode: "week", day: "2025-12-31" },
      now,
    );

    expect(state.days.map((day) => day.label).slice(2, 4)).toEqual([
      "mié, 31/12/2025",
      "jue, 01/01",
    ]);
  });

  it("con otra zona, la misma entrada cae en otra columna y a otra hora, y la línea de ahora se mueve", async () => {
    // El jueves 01/10 a las 20:30 en Buenos Aires: el viernes 02/10 a la 01:30 en Madrid.
    await seedClosedOf(actor.userId, "2026-10-01T23:30:00Z", "2026-10-02T00:30:00Z");
    const week = { mode: "week", day: null } as const;

    const local = await getCalendarState(actor, workspaceOf(buenosAires), week, now);
    const remote = await getCalendarState(actor, workspaceOf(madrid), week, now);

    expect(local.entries.map((entry) => [entry.dayDate, entry.startClock])).toEqual([
      ["2026-10-01", "20:30"],
    ]);
    expect(remote.entries.map((entry) => [entry.dayDate, entry.startClock])).toEqual([
      ["2026-10-02", "01:30"],
    ]);
    expect(local.days.find((day) => day.date === "2026-10-01")?.closedSeconds).toBe(3600);
    expect(remote.days.find((day) => day.date === "2026-10-02")?.closedSeconds).toBe(
      3600,
    );
    expect([local.nowMinute, remote.nowMinute]).toEqual([12 * 60, 17 * 60]);
  });

  it("da los minutos que faltan del día del adelanto de Madrid y ninguno en los demás (CAL-30)", async () => {
    const state = await getCalendarState(
      actor,
      workspaceOf(madrid),
      { mode: "week", day: "2026-03-29" },
      now,
    );

    expect(state.periodStart).toBe("2026-03-23");
    expect(state.days.map((day) => [day.date, day.missingMinutes])).toEqual([
      ["2026-03-23", []],
      ["2026-03-24", []],
      ["2026-03-25", []],
      ["2026-03-26", []],
      ["2026-03-27", []],
      ["2026-03-28", []],
      ["2026-03-29", [{ from: 120, to: 180 }]],
    ]);
  });

  it("atenúa los días anteriores al piso del workspace (CAL-48, CAL-85)", async () => {
    // El 30/09 a las 12:00 en Buenos Aires.
    const recent = workspaceOf(buenosAires, "2026-09-30T15:00:00Z");

    const current = await getCalendarState(
      actor,
      recent,
      { mode: "week", day: null },
      now,
    );
    const previous = await getCalendarState(
      actor,
      recent,
      { mode: "week", day: "2026-09-21" },
      now,
    );

    expect(current.days.map((day) => [day.date, day.beforeWorkspace])).toEqual([
      ["2026-09-28", true],
      ["2026-09-29", true],
      ["2026-09-30", false],
      ["2026-10-01", false],
      ["2026-10-02", false],
      ["2026-10-03", false],
      ["2026-10-04", false],
    ]);
    expect(previous.days.every((day) => day.beforeWorkspace)).toBe(true);
  });

  it("con la membresía desactivada, canTrack en falso y la grilla con sus entradas (TT-92)", async () => {
    await seedClosedOf(actor.userId, "2026-10-01T12:00:00Z", "2026-10-01T13:00:00Z");
    const week = { mode: "week", day: null } as const;

    const active = await getCalendarState(actor, workspaceOf(buenosAires), week, now);
    const inactive = await getCalendarState(
      { ...actor, status: "inactive" },
      workspaceOf(buenosAires),
      week,
      now,
    );

    expect(active.canTrack).toBe(true);
    expect(inactive.canTrack).toBe(false);
    expect(inactive.entries).toHaveLength(1);
    expect(inactive.serverNow).toBe(now.toISOString());
    expect(inactive.todayKey).toBe("2026-10-02");
  });
});

/** La fila entera que puede tocar `updateEntry`, con su par. */
async function editableSnapshotOf(id: string) {
  const snapshot = await snapshotOf(id);
  return snapshot === undefined ? undefined : { ...snapshot, pair: await pairOfRow(id) };
}

/** El desenlace de una edición de una fila: los instantes que quedaron, o el código y el texto del rechazo. */
async function editOutcomeOf(id: string, work: () => Promise<unknown>) {
  try {
    await work();
    return await instantsOf(id);
  } catch (error) {
    // El par lo rechaza `project` con su propio error de dominio.
    if (error instanceof DomainError) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
}

/** Un timer de esa persona del workspace del test. */
function seedRunningOf(userId: string, startedAt: string, description = "corriendo") {
  return seedTimeEntry({ workspaceId, userId, description, startedAt });
}

describe("updateEntry: el trío es el de updateEntryTimes (criterio 3, ADR 0013)", () => {
  it.each(sameRuleCases)("$label", async (example) => {
    const workspace = workspaceOf(example.zone, example.createdAt);
    const dialogRow = await seedClosed(example.startedAt, example.endedAt);
    const singleRow = await seedClosed(example.startedAt, example.endedAt);
    const startedAt = new Date(example.startedAt);
    const own = {
      date: dayKey(startedAt, example.zone),
      start: formatClock(startedAt, example.zone),
      end: formatClock(new Date(example.endedAt), example.zone),
    };
    const times = { ...own, ...example.changes };
    // Con un trío igual al de la fila `updateEntry` no evalúa y la de una fila sí.
    expect(times).not.toEqual(own);

    const dialog = await editOutcomeOf(dialogRow.id, () =>
      updateEntry(actor, workspace, { id: dialogRow.id, changes: { times } }),
    );
    const single = await editOutcomeOf(singleRow.id, () =>
      updateEntryTimes(actor, workspace, { id: singleRow.id, ...times }),
    );

    expect(dialog).toEqual(single);
    if (example.rejects === undefined) {
      expect(dialog).not.toEqual({
        startedAt: startedAt.toISOString(),
        endedAt: new Date(example.endedAt).toISOString(),
      });
    } else {
      expect(dialog).toEqual({ code: "validation", message: example.rejects });
    }
  });
});

type RunningRuleCase = {
  readonly label: string;
  readonly zone: string;
  readonly createdAt?: string;
  readonly startedAt: string;
  readonly now: string;
  readonly runningStart: { readonly date: string; readonly start: string };
  readonly rejects?: string;
};

const runningRuleCases: readonly RunningRuleCase[] = [
  {
    label: "otra hora del mismo día",
    zone: buenosAires,
    startedAt: "2026-10-02T11:00:00Z",
    now: "2026-10-02T15:00:00Z",
    runningStart: { date: "2026-10-02", start: "07:00" },
  },
  {
    label: "otro día (TT-42)",
    zone: buenosAires,
    startedAt: "2026-10-02T11:00:00Z",
    now: "2026-10-02T15:00:00Z",
    runningStart: { date: "2026-09-30", start: "22:00" },
  },
  {
    label: "un inicio guardado con segundos",
    zone: buenosAires,
    startedAt: "2026-10-02T11:00:40Z",
    now: "2026-10-02T15:00:00Z",
    runningStart: { date: "2026-10-02", start: "08:30" },
  },
  {
    label: "un inicio en el futuro (TT-29, TT-75)",
    zone: buenosAires,
    startedAt: "2026-10-02T11:00:00Z",
    now: "2026-10-02T15:00:00Z",
    runningStart: { date: "2026-10-02", start: "12:30" },
    rejects: timeEntryMessages.futureTime,
  },
  {
    label: "la hora que no existe (TT-112)",
    zone: madrid,
    startedAt: "2026-03-29T05:00:00Z",
    now: "2026-03-29T10:00:00Z",
    runningStart: { date: "2026-03-29", start: "02:30" },
    rejects: timeEntryMessages.nonexistentClock,
  },
  {
    label: "la hora repetida, con el segundo instante (ADR 0005)",
    zone: madrid,
    startedAt: "2026-10-25T03:00:00Z",
    now: "2026-10-25T10:00:00Z",
    runningStart: { date: "2026-10-25", start: "02:30" },
  },
  {
    label: "antes de la creación del workspace",
    zone: buenosAires,
    createdAt: "2026-09-01T12:00:00Z",
    startedAt: "2026-10-02T11:00:00Z",
    now: "2026-10-02T15:00:00Z",
    runningStart: { date: "2026-08-31", start: "08:00" },
    rejects: timeEntryMessages.beforeWorkspace,
  },
];

describe("updateEntry: el inicio del timer es el de updateRunningStart (criterio 4, ADR 0013)", () => {
  it.each(runningRuleCases)("$label", async (example) => {
    const workspace = workspaceOf(example.zone, example.createdAt);
    const now = new Date(example.now);
    // Cada persona tiene un solo timer: la copia es de otra.
    const other = actorFor(await seedMember(workspaceId, "member"));
    const dialogRow = await seedRunningOf(actor.userId, example.startedAt);
    const singleRow = await seedRunningOf(other.userId, example.startedAt);
    const stored = new Date(example.startedAt);
    // Con el mismo rótulo `updateEntry` no evalúa y la de una fila sí.
    expect(example.runningStart).not.toEqual({
      date: dayKey(stored, example.zone),
      start: formatClock(stored, example.zone),
    });

    const dialog = await editOutcomeOf(dialogRow.id, () =>
      updateEntry(
        actor,
        workspace,
        { id: dialogRow.id, changes: { runningStart: example.runningStart } },
        now,
      ),
    );
    const single = await editOutcomeOf(singleRow.id, () =>
      updateRunningStart(
        other,
        workspace,
        { id: singleRow.id, ...example.runningStart },
        now,
      ),
    );

    expect(dialog).toEqual(single);
    if (example.rejects === undefined) {
      expect(dialog).not.toEqual({ startedAt: stored.toISOString(), endedAt: null });
    } else {
      expect(dialog).toEqual({ code: "validation", message: example.rejects });
    }
  });

  it("un inicio con el mismo rótulo no se evalúa: el que quedó después de now no se rechaza", async () => {
    // TT-101: el inicio de un timer puede quedar después del now() de la aplicación.
    const running = await seedRunningOf(actor.userId, "2026-10-02T18:00:00Z");
    const now = new Date("2026-10-02T15:00:00Z");

    const result = await updateEntry(
      actor,
      workspaceOf(buenosAires),
      {
        id: running.id,
        changes: {
          description: "nueva",
          runningStart: { date: "2026-10-02", start: "15:00" },
        },
      },
      now,
    );

    expect(result.entry).toMatchObject({
      description: "nueva",
      startedAt: "2026-10-02T18:00:00.000Z",
      endedAt: null,
    });
  });

  it("guarda la descripción y el inicio juntos, sin detener el timer (CAL-40)", async () => {
    const running = await seedRunningOf(actor.userId, "2026-10-02T11:00:00Z");

    const result = await updateEntry(
      actor,
      workspaceOf(buenosAires),
      {
        id: running.id,
        changes: {
          description: "otra",
          runningStart: { date: "2026-10-02", start: "07:15" },
        },
      },
      new Date("2026-10-02T15:00:00Z"),
    );

    expect(result.entry).toMatchObject({
      description: "otra",
      startedAt: "2026-10-02T10:15:00.000Z",
      endedAt: null,
    });
    expect(await auditFor("time_entry", running.id)).toHaveLength(1);
  });
});

describe("updateEntry: el par (criterio 5, TT-77, ADR 0010)", () => {
  const ws = workspaceOf(buenosAires);

  it("con un par no disponible responde lo de updateEntryProject y no escribe nada", async () => {
    const foreign = await seedWorkspace(buenosAires);
    const foreignProject = await seedProject({ workspaceId: foreign.workspaceId });
    const { web } = await seedTrackable("Público");
    const elsewhere = await seedProject({ workspaceId, name: "Otro", color: "blue" });
    const pairs = [
      ...Object.values(await seedUnavailablePairs()),
      {
        // Un proyecto de otro workspace (S-n1).
        projectId: foreignProject.id,
        taskId: null,
        message: projectMessages.projectUnavailable,
      },
      {
        // Una tarea de otro proyecto (S-n1).
        projectId: web.id,
        taskId: (await seedTask({ workspaceId, projectId: elsewhere.id })).id,
        message: projectMessages.taskUnavailable,
      },
    ];
    for (const pair of pairs) {
      const dialogRow = await seedEntryWith(NO_PAIR, { description: "antes" });
      const singleRow = await seedEntryWith(NO_PAIR, { description: "antes" });
      const before = await editableSnapshotOf(dialogRow.id);
      const requested = { projectId: pair.projectId, taskId: pair.taskId };

      const dialog = await editOutcomeOf(dialogRow.id, () =>
        updateEntry(actor, ws, {
          id: dialogRow.id,
          changes: { description: "después", project: requested },
        }),
      );
      const single = await editOutcomeOf(singleRow.id, () =>
        updateEntryProject(actor, ws, { id: singleRow.id, ...requested }),
      );

      expect(dialog).toEqual(single);
      expect(dialog).toEqual({ code: "not_found", message: pair.message });
      expect(await editableSnapshotOf(dialogRow.id)).toEqual(before);
      expect(await auditFor("time_entry", dialogRow.id)).toEqual([]);
    }
  });

  it("con el mismo par no consulta a project: la que tiene un par que ya no se asigna guarda su descripción", async () => {
    const pairs = await seedUnavailablePairs();
    for (const pair of Object.values(pairs)) {
      const entry = await seedEntryWith(
        { projectId: pair.projectId, taskId: pair.taskId },
        { description: "antes" },
      );

      const result = await updateEntry(actor, ws, {
        id: entry.id,
        changes: {
          description: "después",
          // Con otras mayúsculas también es el mismo.
          project: {
            projectId: pair.projectId.toUpperCase(),
            taskId: pair.taskId.toUpperCase(),
          },
        },
      });

      expect(result.entry.description).toBe("después");
      expect(await pairOfRow(entry.id)).toEqual({
        projectId: pair.projectId,
        taskId: pair.taskId,
      });
      const audits = await auditFor("time_entry", entry.id);
      expect(audits).toHaveLength(1);
      // Sin el par: el mismo par no se escribe.
      expect(JSON.parse(audits[0].nextValue ?? "null")).toEqual({
        description: "después",
      });
    }
  });

  it("cambia el par de la cerrada y de la que corre, entero, y responde las referencias nuevas", async () => {
    const { web, design } = await seedTrackable();
    const other = await seedProject({ workspaceId, name: "Otro", color: "blue" });
    const closed = await seedEntryWith({ projectId: web.id, taskId: design.id });
    const running = await seedEntryWith(NO_PAIR, { running: true });

    const fromClosed = await updateEntry(actor, ws, {
      id: closed.id,
      changes: { project: { projectId: other.id, taskId: null } },
    });
    const fromRunning = await updateEntry(actor, ws, {
      id: running.id,
      changes: { project: { projectId: web.id, taskId: design.id } },
    });

    expect(await pairOfRow(closed.id)).toEqual({ projectId: other.id, taskId: null });
    expect(fromClosed.entry.project).toEqual({
      id: other.id,
      name: "Otro",
      color: "blue",
    });
    expect(fromClosed.entry.task).toBeNull();
    expect(await pairOfRow(running.id)).toEqual({ projectId: web.id, taskId: design.id });
    expect(fromRunning.entry.project?.id).toBe(web.id);
    expect(fromRunning.entry.task).toEqual({ id: design.id, name: "Diseño" });
    expect(fromRunning.entry.endedAt).toBeNull();
  });
});

describe("updateEntry: todo o nada (criterio 6, ADR 0013)", () => {
  const ws = workspaceOf(buenosAires);
  /** 08:00 a 09:00 del 1/10 en Buenos Aires. */
  const own = { date: "2026-10-01", start: "08:00", end: "09:00" } as const;

  it("descripción, par y trío válidos quedan escritos con una sola constancia", async () => {
    const { web } = await seedTrackable();
    const entry = await seedEntryWith(NO_PAIR, { description: "antes" });

    const result = await updateEntry(actor, ws, {
      id: entry.id,
      changes: {
        description: "después",
        project: { projectId: web.id, taskId: null },
        times: { ...own, end: "09:30" },
      },
    });

    expect(result.entry).toMatchObject({
      description: "después",
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:30:00.000Z",
      project: { id: web.id },
    });
    expect(await editableSnapshotOf(entry.id)).toMatchObject({
      description: "después",
      endedAt: "2026-10-01T12:30:00.000Z",
      pair: { projectId: web.id, taskId: null },
    });
    expect((await auditFor("time_entry", entry.id)).map((row) => row.action)).toEqual([
      "timeEntry.update",
    ]);
  });

  it("con un trío rechazado no escribe la descripción ni el par", async () => {
    const { web } = await seedTrackable();
    const entry = await seedEntryWith(NO_PAIR, { description: "antes" });
    const before = await editableSnapshotOf(entry.id);

    await expect(
      updateEntry(actor, ws, {
        id: entry.id,
        changes: {
          description: "después",
          project: { projectId: web.id, taskId: null },
          times: { ...own, end: "08:00" },
        },
      }),
    ).rejects.toMatchObject({ code: "validation", message: timeEntryMessages.tooShort });

    expect(await editableSnapshotOf(entry.id)).toEqual(before);
    expect(await auditFor("time_entry", entry.id)).toEqual([]);
  });

  it("con un par rechazado no escribe la descripción ni el trío", async () => {
    const { archivado } = await seedUnavailablePairs();
    const entry = await seedEntryWith(NO_PAIR, { description: "antes" });
    const before = await editableSnapshotOf(entry.id);

    await expect(
      updateEntry(actor, ws, {
        id: entry.id,
        changes: {
          description: "después",
          project: { projectId: archivado.projectId, taskId: null },
          times: { ...own, end: "09:30" },
        },
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });

    expect(await editableSnapshotOf(entry.id)).toEqual(before);
    expect(await auditFor("time_entry", entry.id)).toEqual([]);
  });

  it("con un horario inválido y un proyecto no disponible responde el del horario", async () => {
    const { archivado } = await seedUnavailablePairs();
    const project = { projectId: archivado.projectId, taskId: null };
    const closed = await seedEntryWith(NO_PAIR);
    const running = await seedEntryWith(NO_PAIR, { running: true });

    await expect(
      updateEntry(actor, ws, {
        id: closed.id,
        changes: { project, times: { ...own, end: "08:00" } },
      }),
    ).rejects.toMatchObject({ code: "validation", message: timeEntryMessages.tooShort });
    await expect(
      updateEntry(
        actor,
        ws,
        {
          id: running.id,
          changes: { project, runningStart: { date: "2026-10-02", start: "13:00" } },
        },
        new Date("2026-10-02T15:00:00Z"),
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.futureTime,
    });
  });
});

describe("updateEntry: el estado de la fila (criterio 7)", () => {
  const ws = workspaceOf(buenosAires);

  it("un trío sobre la entrada que corre responde timer_running y no escribe la descripción (TT-111)", async () => {
    const running = await seedRunningOf(actor.userId, "2026-10-02T11:00:00Z");
    const before = await editableSnapshotOf(running.id);

    await expect(
      updateEntry(actor, ws, {
        id: running.id,
        changes: {
          description: "otra",
          times: { date: "2026-10-02", start: "07:00", end: "08:00" },
        },
      }),
    ).rejects.toMatchObject({
      code: "timer_running",
      message: timeEntryMessages.runningEntryTimes,
    });
    expect(await editableSnapshotOf(running.id)).toEqual(before);
  });

  it("un inicio de timer sobre una cerrada responde already_stopped y no escribe la descripción (CAL-41)", async () => {
    const closed = await seedClosed("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z");
    const before = await editableSnapshotOf(closed.id);

    await expect(
      updateEntry(actor, ws, {
        id: closed.id,
        changes: {
          description: "otra",
          runningStart: { date: "2026-10-01", start: "07:00" },
        },
      }),
    ).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    expect(await editableSnapshotOf(closed.id)).toEqual(before);
  });

  it("la ajena que corre y la ajena de más de un día se rechazan como ajenas antes que por su estado o su horario", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const foreignRunning = await seedRunningOf(otherId, "2026-10-02T11:00:00Z");
    // 10:00 del 1 a 11:00 del 3, en Buenos Aires.
    const foreignMultiDay = await seedClosed(
      "2026-10-01T13:00:00Z",
      "2026-10-03T14:00:00Z",
      otherId,
    );
    const times = { date: "2026-10-01", start: "08:00", end: "09:00" };

    for (const row of [foreignRunning, foreignMultiDay]) {
      const before = await editableSnapshotOf(row.id);
      await expect(
        updateEntry(actor, ws, { id: row.id, changes: { times } }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });
      expect(await editableSnapshotOf(row.id)).toEqual(before);
    }
    await expect(
      updateEntry(actor, ws, {
        id: foreignMultiDay.id,
        changes: { runningStart: { date: "2026-10-01", start: "08:00" } },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
  });

  it("la que no existe responde not_found (TT-80)", async () => {
    await expect(
      updateEntry(actor, ws, { id: randomUUID(), changes: { description: "x" } }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
  });
});

describe("updateEntry: la entrada de más de un día (criterio 8, TT-110)", () => {
  it("guarda su descripción con su mismo trío, sin rechazarla ni reescribir los instantes", async () => {
    // 10:00 del 1 a 11:00 del 3, en Buenos Aires.
    const long = await seedClosed("2026-10-01T13:00:00Z", "2026-10-03T14:00:00Z");

    const result = await updateEntry(actor, workspaceOf(buenosAires), {
      id: long.id,
      changes: {
        description: "larga",
        times: { date: "2026-10-01", start: "10:00", end: "11:00" },
      },
    });

    expect(result.entry.description).toBe("larga");
    expect(result.entry.editableTimes).toBe(false);
    expect(await instantsOf(long.id)).toEqual({
      startedAt: "2026-10-01T13:00:00.000Z",
      endedAt: "2026-10-03T14:00:00.000Z",
    });
    expect(await auditFor("time_entry", long.id)).toHaveLength(1);
  });
});

describe("updateEntry: punto fijo (criterio 9, TT-89)", () => {
  const ws = workspaceOf(buenosAires);

  it("repetir un guardado aplicado no escribe, no registra y responde la misma vista", async () => {
    const { web } = await seedTrackable();
    const entry = await seedEntryWith(NO_PAIR, { description: "antes" });
    const input = {
      id: entry.id,
      changes: {
        description: "después",
        project: { projectId: web.id, taskId: null },
        times: { date: "2026-10-01", start: "08:15", end: "09:00" },
      },
    };

    const first = await updateEntry(actor, ws, input);
    const written = await editableSnapshotOf(entry.id);
    const second = await updateEntry(actor, ws, input);

    expect(second).toEqual(first);
    expect(await editableSnapshotOf(entry.id)).toEqual(written);
    expect(await auditFor("time_entry", entry.id)).toHaveLength(1);
  });

  it("sin cambios reales no escribe ni registra, también en el timer", async () => {
    const closed = await seedEntryWith(NO_PAIR, { description: "igual" });
    const running = await seedRunningOf(actor.userId, "2026-10-02T11:00:00Z", "igual");
    const before = await Promise.all(
      [closed, running].map((row) => editableSnapshotOf(row.id)),
    );

    const fromClosed = await updateEntry(actor, ws, {
      id: closed.id,
      changes: {
        description: "igual",
        project: NO_PAIR,
        times: { date: "2026-10-01", start: "08:00", end: "09:00" },
      },
    });
    const fromRunning = await updateEntry(
      actor,
      ws,
      {
        id: running.id,
        changes: {
          description: "igual",
          project: NO_PAIR,
          runningStart: { date: "2026-10-02", start: "08:00" },
        },
      },
      new Date("2026-10-02T15:00:00Z"),
    );

    expect(fromClosed.entry.description).toBe("igual");
    expect(fromRunning.entry.endedAt).toBeNull();
    expect(
      await Promise.all([closed, running].map((row) => editableSnapshotOf(row.id))),
    ).toEqual(before);
    expect(await auditFor("time_entry")).toEqual([]);
  });
});

describe("updateEntry: el timer detenido en otra pestaña (criterio 16, CAL-41)", () => {
  it("la descripción y el par se aplican a la entrada ya cerrada; el inicio responde already_stopped", async () => {
    const ws = workspaceOf(buenosAires);
    const { web } = await seedTrackable();
    const started = await startTimer(actor, ws, {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "corriendo",
    });
    await stopTimer(actor, ws, { id: started.running.id });

    const result = await updateEntry(actor, ws, {
      id: started.running.id,
      changes: { description: "cerrada", project: { projectId: web.id, taskId: null } },
    });

    expect(result.entry.description).toBe("cerrada");
    expect(result.entry.project?.id).toBe(web.id);
    expect(result.entry.endedAt).not.toBeNull();
    const startedAt = new Date(started.running.startedAt);
    await expect(
      updateEntry(actor, ws, {
        id: started.running.id,
        changes: {
          runningStart: {
            date: dayKey(startedAt, buenosAires),
            start: shiftClock(formatClock(startedAt, buenosAires), -60),
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
  });
});

describe("getCalendarState: minDayKey (§5.1 del 8c)", () => {
  it("es el día de creación del workspace en la zona de la persona", async () => {
    // Las 23:00 del 1 de setiembre en Buenos Aires, que en UTC ya son del 2.
    const state = await getCalendarState(
      actor,
      workspaceOf(buenosAires, "2026-09-02T02:00:00Z"),
      { mode: "week", day: null },
      new Date("2026-10-02T15:00:00Z"),
    );

    expect(state.minDayKey).toBe("2026-09-01");
  });
});

/** Un proyecto público activo con una tarea y el facturable por defecto pedido (PR-21). */
async function seedBillableProject(billableByDefault: boolean, name = "Facturable") {
  const billed = await seedProject({ workspaceId, name, billableByDefault });
  const design = await seedTask({ workspaceId, projectId: billed.id, name: "Diseño" });
  return { billed, design };
}

/** Una entrada cerrada del actor con el par y el facturable pedidos. */
function seedBillableEntry(
  values: { projectId: string | null; taskId?: string | null; billable: boolean },
  options: { running?: boolean } = {},
) {
  return seedTimeEntry({
    workspaceId,
    userId: actor.userId,
    startedAt: options.running === true ? "2026-10-02T11:00:00Z" : "2026-10-01T11:00:00Z",
    endedAt: options.running === true ? null : "2026-10-01T12:00:00Z",
    taskId: null,
    ...values,
  });
}

async function billableOfRow(id: string): Promise<boolean | undefined> {
  return (await timeEntryById(id))?.billable;
}

describe("las altas con facturable (criterio 4 del 11a: TT-14, PR-21)", () => {
  const ws = workspaceOf(buenosAires);

  /** Los cuatro pedidos de cada alta, con el facturable que tienen que dejar. */
  async function cases() {
    const yes = await seedBillableProject(true, "Sí");
    const no = await seedBillableProject(false, "No");
    return [
      [
        "presente, en contra del por defecto",
        { projectId: yes.billed.id, billable: false },
        false,
      ],
      [
        "presente, en contra del por defecto",
        { projectId: no.billed.id, billable: true },
        true,
      ],
      ["presente, sin proyecto", { projectId: null, billable: true }, true],
      ["ausente, el por defecto", { projectId: yes.billed.id }, true],
      [
        "ausente, el por defecto con tarea",
        { projectId: yes.billed.id, taskId: yes.design.id },
        true,
      ],
      ["ausente, el por defecto en falso", { projectId: no.billed.id }, false],
      ["ausente y sin proyecto", { projectId: null }, false],
    ] as const;
  }

  it("startTimer escribe el pedido y, sin él, el por defecto del proyecto", async () => {
    for (const [label, request, expected] of await cases()) {
      const result = await startTimer(actor, ws, {
        id: randomUUID(),
        description: label,
        taskId: null,
        ...request,
      });
      expect([label, result.running.billable]).toEqual([label, expected]);
      expect([label, await billableOfRow(result.running.id)]).toEqual([label, expected]);
    }
  });

  it("createManualEntry escribe el pedido y, sin él, el por defecto del proyecto", async () => {
    let hour = 0;
    for (const [label, request, expected] of await cases()) {
      const start = `${String(hour).padStart(2, "0")}:00`;
      hour += 1;
      const result = await createManualEntry(actor, ws, {
        description: label,
        date: "2026-10-01",
        start,
        end: `${String(hour).padStart(2, "0")}:00`,
        taskId: null,
        ...request,
      });
      expect([label, result.created.billable]).toEqual([label, expected]);
      expect([label, await billableOfRow(result.created.id)]).toEqual([label, expected]);
    }
  });

  it("el reintento del arranque responde la fila del primer intento sin recalcular", async () => {
    const yes = await seedBillableProject(true);
    const id = randomUUID();
    const input = { id, description: "", projectId: yes.billed.id, taskId: null };
    await startTimer(actor, ws, { ...input, billable: false });
    const replay = await startTimer(actor, ws, input);
    expect(replay.running.billable).toBe(false);
    expect(await billableOfRow(id)).toBe(false);
  });
});

describe("continuar y duplicar copian el facturable (criterio 5 del 11a: TT-57, TT-58)", () => {
  const ws = workspaceOf(buenosAires);

  it("copian el de la original aunque difiera del por defecto de su proyecto", async () => {
    const yes = await seedBillableProject(true, "Sí");
    const no = await seedBillableProject(false, "No");
    const againstYes = await seedBillableEntry({
      projectId: yes.billed.id,
      billable: false,
    });
    const againstNo = await seedBillableEntry({
      projectId: no.billed.id,
      billable: true,
    });

    for (const [source, expected] of [
      [againstYes, false],
      [againstNo, true],
    ] as const) {
      const duplicated = await duplicateEntry(actor, ws, {
        id: randomUUID(),
        sourceId: source.id,
      });
      const continued = await continueEntry(actor, ws, {
        id: randomUUID(),
        sourceId: source.id,
      });
      expect(duplicated.created.billable).toBe(expected);
      expect(continued.running.billable).toBe(expected);
      expect(await billableOfRow(duplicated.created.id)).toBe(expected);
      expect(await billableOfRow(continued.running.id)).toBe(expected);
    }
  });

  it("copian el facturable de una original sin proyecto", async () => {
    const source = await seedBillableEntry({ projectId: null, billable: true });
    const continued = await continueEntry(actor, ws, {
      id: randomUUID(),
      sourceId: source.id,
    });
    expect(continued.running.billable).toBe(true);
  });
});

describe("updateEntryProject y el facturable (criterio 6 del 11a: D-2)", () => {
  const ws = workspaceOf(buenosAires);

  it("a otro proyecto, su por defecto, en los dos sentidos y también en el timer", async () => {
    const yes = await seedBillableProject(true, "Sí");
    const no = await seedBillableProject(false, "No");
    const toYes = await seedBillableEntry({ projectId: null, billable: false });
    const toNo = await seedBillableEntry({ projectId: yes.billed.id, billable: true });
    const running = await seedBillableEntry(
      { projectId: no.billed.id, billable: false },
      { running: true },
    );

    const first = await updateEntryProject(actor, ws, {
      id: toYes.id,
      projectId: yes.billed.id,
      taskId: yes.design.id,
    });
    const second = await updateEntryProject(actor, ws, {
      id: toNo.id,
      projectId: no.billed.id,
      taskId: null,
    });
    const third = await updateEntryProject(actor, ws, {
      id: running.id,
      projectId: yes.billed.id,
      taskId: null,
    });

    expect(first.entry.billable).toBe(true);
    expect(second.entry.billable).toBe(false);
    expect(third.entry.billable).toBe(true);
    expect(third.entry.endedAt).toBeNull();
    expect(await billableOfRow(toYes.id)).toBe(true);
    expect(await billableOfRow(toNo.id)).toBe(false);
    expect(await billableOfRow(running.id)).toBe(true);
  });

  it("al mismo proyecto con otra tarea, o sin ella, y a «Sin proyecto», conserva el facturable", async () => {
    const yes = await seedBillableProject(true);
    const other = await seedTask({ workspaceId, projectId: yes.billed.id, name: "Otra" });
    const cases = [
      ["otra tarea", { projectId: yes.billed.id, taskId: other.id }],
      ["sin la tarea", { projectId: yes.billed.id, taskId: null }],
      ["sin proyecto", { projectId: null, taskId: null }],
    ] as const;
    for (const [label, pair] of cases) {
      const entry = await seedBillableEntry({
        projectId: yes.billed.id,
        taskId: yes.design.id,
        billable: false,
      });
      const result = await updateEntryProject(actor, ws, { id: entry.id, ...pair });
      expect([label, result.entry.billable]).toEqual([label, false]);
      expect([label, await pairOfRow(entry.id)]).toEqual([label, pair]);
      expect([label, await billableOfRow(entry.id)]).toEqual([label, false]);
    }
  });

  it("con el mismo par no escribe, aunque el facturable difiera del por defecto", async () => {
    const yes = await seedBillableProject(true);
    const entry = await seedBillableEntry({ projectId: yes.billed.id, billable: false });
    const result = await updateEntryProject(actor, ws, {
      id: entry.id,
      projectId: yes.billed.id.toUpperCase(),
      taskId: null,
    });
    expect(result.entry.billable).toBe(false);
    expect((await timeEntryById(entry.id))?.updatedAt).toEqual(entry.updatedAt);
  });

  it("un proyecto no disponible se rechaza y no toca el facturable", async () => {
    const archived = await seedProject({
      workspaceId,
      archived: true,
      billableByDefault: true,
    });
    const entry = await seedBillableEntry({ projectId: null, billable: false });
    await expect(
      updateEntryProject(actor, ws, {
        id: entry.id,
        projectId: archived.id,
        taskId: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await billableOfRow(entry.id)).toBe(false);
  });
});

describe("updateEntry y el facturable (criterio 7 del 11a, ADR 0013)", () => {
  const ws = workspaceOf(buenosAires);
  const now = new Date("2026-10-02T15:00:00Z");

  it("{ billable } solo cambia una cerrada y la que corre, sin detenerla (TT-27)", async () => {
    const closed = await seedBillableEntry({ projectId: null, billable: false });
    const running = await seedBillableEntry(
      { projectId: null, billable: true },
      { running: true },
    );

    const one = await updateEntry(actor, ws, {
      id: closed.id,
      changes: { billable: true },
    });
    const two = await updateEntry(
      actor,
      ws,
      { id: running.id, changes: { billable: false } },
      now,
    );

    expect(one.entry.billable).toBe(true);
    expect(two.entry.billable).toBe(false);
    expect(two.entry.endedAt).toBeNull();
    expect(await billableOfRow(closed.id)).toBe(true);
    expect(await timeEntryById(running.id)).toMatchObject({
      billable: false,
      endedAt: null,
      startedAt: running.startedAt,
    });
  });

  it("{ project, billable } escribe el pedido aunque contradiga el por defecto", async () => {
    const yes = await seedBillableProject(true, "Sí");
    const no = await seedBillableProject(false, "No");
    const toYes = await seedBillableEntry({ projectId: null, billable: false });
    const toNo = await seedBillableEntry({ projectId: null, billable: false });

    const first = await updateEntry(actor, ws, {
      id: toYes.id,
      changes: { project: { projectId: yes.billed.id, taskId: null }, billable: false },
    });
    const second = await updateEntry(actor, ws, {
      id: toNo.id,
      changes: { project: { projectId: no.billed.id, taskId: null }, billable: true },
    });

    expect(first.entry.billable).toBe(false);
    expect(second.entry.billable).toBe(true);
    expect(await billableOfRow(toYes.id)).toBe(false);
    expect(await billableOfRow(toNo.id)).toBe(true);
    expect(await pairOfRow(toYes.id)).toEqual({ projectId: yes.billed.id, taskId: null });
  });

  it("{ project } solo aplica el por defecto del proyecto nuevo, también en el timer", async () => {
    const yes = await seedBillableProject(true);
    const closed = await seedBillableEntry({ projectId: null, billable: false });
    const running = await seedBillableEntry(
      { projectId: null, billable: false },
      { running: true },
    );

    const one = await updateEntry(actor, ws, {
      id: closed.id,
      changes: { project: { projectId: yes.billed.id, taskId: yes.design.id } },
    });
    const two = await updateEntry(
      actor,
      ws,
      {
        id: running.id,
        changes: { project: { projectId: yes.billed.id, taskId: null } },
      },
      now,
    );

    expect(one.entry.billable).toBe(true);
    expect(two.entry.billable).toBe(true);
    expect(await billableOfRow(closed.id)).toBe(true);
    expect(await billableOfRow(running.id)).toBe(true);
  });

  it("{ project } con el mismo proyecto o «Sin proyecto» conserva el facturable", async () => {
    const yes = await seedBillableProject(true);
    const sameProject = await seedBillableEntry({
      projectId: yes.billed.id,
      taskId: null,
      billable: false,
    });
    const toNone = await seedBillableEntry({ projectId: yes.billed.id, billable: true });

    await updateEntry(actor, ws, {
      id: sameProject.id,
      changes: { project: { projectId: yes.billed.id, taskId: yes.design.id } },
    });
    await updateEntry(actor, ws, {
      id: toNone.id,
      changes: { project: { projectId: null, taskId: null } },
    });

    expect(await billableOfRow(sameProject.id)).toBe(false);
    expect(await billableOfRow(toNone.id)).toBe(true);
  });

  it("{ billable } igual al de la fila no escribe", async () => {
    const yes = await seedBillableProject(true);
    const entry = await seedBillableEntry({ projectId: yes.billed.id, billable: true });
    const result = await updateEntry(actor, ws, {
      id: entry.id,
      changes: { billable: true, project: { projectId: yes.billed.id, taskId: null } },
    });
    expect(result.entry.billable).toBe(true);
    expect((await timeEntryById(entry.id))?.updatedAt).toEqual(entry.updatedAt);
  });

  it("el par rechazado o el horario rechazado no escriben el facturable (todo o nada)", async () => {
    const archived = await seedProject({ workspaceId, archived: true });
    const entry = await seedBillableEntry({ projectId: null, billable: false });

    await expect(
      updateEntry(actor, ws, {
        id: entry.id,
        changes: { project: { projectId: archived.id, taskId: null }, billable: true },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      updateEntry(actor, ws, {
        id: entry.id,
        changes: {
          times: { date: "2026-10-01", start: "08:00", end: "08:00" },
          billable: true,
        },
      }),
    ).rejects.toMatchObject({ code: "validation" });

    expect(await billableOfRow(entry.id)).toBe(false);
    expect((await timeEntryById(entry.id))?.updatedAt).toEqual(entry.updatedAt);
  });
});

describe("la vista trae el facturable (criterio 8 del 11a: TT-14, TT-38, TT-39)", () => {
  const ws = workspaceOf(buenosAires);
  const now = new Date("2026-10-02T15:00:00Z");

  it("en el timer y en cada entrada de la lista y del calendario", async () => {
    const running = await seedBillableEntry(
      { projectId: null, billable: true },
      { running: true },
    );
    const billed = await seedBillableEntry({ projectId: null, billable: true });
    const plain = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });

    const tracker = await getTrackerState(actor, ws, { from: null }, now);
    const calendar = await getCalendarState(actor, ws, { mode: "week", day: null }, now);

    expect(tracker.running).toMatchObject({ id: running.id, billable: true });
    expect(calendar.running).toMatchObject({ id: running.id, billable: true });
    for (const entries of [
      daysOf(tracker).flatMap((day) => day.entries),
      calendar.entries,
    ]) {
      expect(entries.find((entry) => entry.id === billed.id)?.billable).toBe(true);
      expect(entries.find((entry) => entry.id === plain.id)?.billable).toBe(false);
    }
  });

  it("en el `stopped` de un arranque y de una parada, y en el `entry` de las ediciones", async () => {
    const previous = await seedBillableEntry(
      { projectId: null, billable: true },
      { running: true },
    );
    const started = await startTimer(actor, ws, {
      id: randomUUID(),
      description: "",
      projectId: null,
      taskId: null,
    });
    expect(started.stopped).toMatchObject({ id: previous.id, billable: true });
    expect(started.running.billable).toBe(false);

    await updateEntry(
      actor,
      ws,
      { id: started.running.id, changes: { billable: true } },
      now,
    );
    const stopped = await stopTimer(actor, ws, { id: started.running.id });
    expect(stopped.stopped.billable).toBe(true);

    const closed = await seedBillableEntry({ projectId: null, billable: true });
    const described = await updateDescription(actor, ws, {
      id: closed.id,
      description: "otra",
    });
    const timed = await updateEntryTimes(actor, ws, {
      id: closed.id,
      date: "2026-10-01",
      start: "08:00",
      end: "09:00",
    });
    const bulk = await bulkEditEntries(actor, ws, {
      ids: [closed.id],
      changes: { description: "masiva" },
    });
    expect(described.entry.billable).toBe(true);
    expect(timed.entry.billable).toBe(true);
    expect(bulk.entries.map((entry) => entry.billable)).toEqual([true]);
  });
});

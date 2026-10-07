import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import {
  buenosAires,
  defaultFormats,
  seedMember,
  seedProject,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { auditFor, timeEntriesOf, timeEntryById } from "@/test/queries";

import { timeEntryMessages } from "./schema";
import {
  bulkDeleteEntries,
  bulkEditEntries,
  continueEntry,
  createManualEntry,
  deleteEntry,
  discardTimer,
  duplicateEntry,
  startTimer,
  stopTimer,
  updateDescription,
  updateEntry,
  updateEntryProject,
  updateEntryTimes,
  updateRunningStart,
  type TrackerWorkspace,
} from "./service";

let workspaceId: string;
let actor: Actor;

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  actor = {
    userId: seeded.ownerId,
    workspaceId: seeded.workspaceId,
    role: "owner",
    status: "active",
  };
});

/** El workspace tal como lo recibe el service. El piso no estorba a estos casos. */
const workspace: TrackerWorkspace = {
  timezone: buenosAires,
  createdAt: new Date("2020-01-01T00:00:00Z"),
  weekStart: 1,
  formats: defaultFormats,
};

function parsed(value: string | null): unknown {
  return value === null ? null : (JSON.parse(value) as unknown);
}

describe("audit log de las mutaciones", () => {
  it("el arranque deja un registro con la descripción y el inicio", async () => {
    const result = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "revisión",
    });

    const rows = await auditFor("time_entry");
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.start");
    expect(rows[0].entity).toBe("time_entry");
    expect(rows[0].entityId).toBe(result.running.id);
    expect(rows[0].workspaceId).toBe(workspaceId);
    expect(rows[0].actorId).toBe(actor.userId);
    expect(rows[0].previousValue).toBeNull();
    expect(parsed(rows[0].nextValue)).toEqual({
      description: "revisión",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: result.running.startedAt,
    });
  });

  it("el arranque que cierra el timer anterior deja un registro por entrada", async () => {
    const first = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "uno",
    });
    const second = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "dos",
    });

    const rows = await auditFor("time_entry");
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => `${row.action}:${row.entityId}`))).toEqual(
      new Set([
        `timeEntry.start:${first.running.id}`,
        `timeEntry.stop:${first.running.id}`,
        `timeEntry.start:${second.running.id}`,
      ]),
    );

    const stop = rows.find((row) => row.action === "timeEntry.stop");
    expect(parsed(stop?.previousValue ?? null)).toEqual({ endedAt: null });
    // El corte de TT-35: la vieja cierra en el mismo instante en que abre la nueva.
    expect(parsed(stop?.nextValue ?? null)).toEqual({
      endedAt: second.running.startedAt,
    });

    const start = rows.find(
      (row) => row.action === "timeEntry.start" && row.entityId === second.running.id,
    );
    expect(parsed(start?.nextValue ?? null)).toEqual({
      description: "dos",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: second.running.startedAt,
    });
  });

  it("el reintento de un arranque ya aplicado no deja registro", async () => {
    const id = randomUUID();
    await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id,
      description: "uno",
    });
    const before = await auditFor("time_entry");

    await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id,
      description: "uno",
    });

    expect(await auditFor("time_entry")).toEqual(before);
    expect((await auditFor("time_entry", id)).map((row) => row.action)).toEqual([
      "timeEntry.start",
    ]);
  });

  it("detener deja el registro con el fin que escribió la base", async () => {
    const started = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "tarea",
    });

    const result = await stopTimer(actor, workspace, { id: started.running.id });

    const stored = await timeEntryById(started.running.id);
    const rows = await auditFor("time_entry", started.running.id);
    const stop = rows.find((row) => row.action === "timeEntry.stop");
    expect(rows).toHaveLength(2);
    expect(stop?.workspaceId).toBe(workspaceId);
    expect(stop?.actorId).toBe(actor.userId);
    expect(parsed(stop?.previousValue ?? null)).toEqual({ endedAt: null });
    expect(parsed(stop?.nextValue ?? null)).toEqual({
      endedAt: stored?.endedAt?.toISOString(),
    });
    expect(result.stopped.endedAt).toBe(stored?.endedAt?.toISOString());
  });

  it("editar la descripción deja el valor anterior y el nuevo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "antes",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await updateDescription(actor, workspace, { id: row.id, description: "después" });

    const rows = await auditFor("time_entry", row.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.updateDescription");
    expect(parsed(rows[0].previousValue)).toEqual({ description: "antes" });
    expect(parsed(rows[0].nextValue)).toEqual({ description: "después" });
  });

  it("el borrado deja la fila entera como valor previo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "para borrar",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await deleteEntry(actor, { id: row.id });

    const rows = await auditFor("time_entry", row.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.delete");
    expect(rows[0].nextValue).toBeNull();
    // Es la única copia que queda: el borrado es físico.
    expect(parsed(rows[0].previousValue)).toEqual({
      id: row.id,
      workspaceId,
      userId: actor.userId,
      description: "para borrar",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:00:00.000Z",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  });

  it("el borrado de una entrada abierta guarda su fin nulo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T11:00:00Z",
    });

    await deleteEntry(actor, { id: row.id });

    const rows = await auditFor("time_entry", row.id);
    expect(parsed(rows[0].previousValue)).toMatchObject({ endedAt: null });
  });
});

describe("mutaciones rechazadas", () => {
  it("la entrada de otra persona no deja registro", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T11:00:00Z",
    });

    await expect(
      updateDescription(actor, workspace, { id: row.id, description: "mía" }),
    ).rejects.toThrow();
    await expect(deleteEntry(actor, { id: row.id })).rejects.toThrow();
    await expect(stopTimer(actor, workspace, { id: row.id })).rejects.toThrow();

    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("el id inexistente no deja registro", async () => {
    await expect(
      deleteEntry(actor, { id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b" }),
    ).rejects.toThrow();

    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("detener una entrada ya cerrada no agrega un segundo registro", async () => {
    const started = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "tarea",
    });
    await stopTimer(actor, workspace, { id: started.running.id });

    await expect(
      stopTimer(actor, workspace, { id: started.running.id }),
    ).rejects.toMatchObject({ code: "already_stopped" });

    const rows = await auditFor("time_entry", started.running.id);
    expect(rows.filter((row) => row.action === "timeEntry.stop")).toHaveLength(1);
  });

  it("la edición de horas rechazada no deja registro", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    const timer = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(
      updateEntryTimes(actor, workspace, {
        id: row.id,
        date: "2026-10-01",
        start: "09:00",
        end: "09:00",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      updateRunningStart(actor, workspace, {
        id: row.id,
        date: "2026-10-01",
        start: "07:00",
      }),
    ).rejects.toMatchObject({ code: "already_stopped" });
    await expect(
      updateEntryTimes(actor, workspace, {
        id: timer.id,
        date: "2026-10-01",
        start: "09:00",
        end: "10:00",
      }),
    ).rejects.toMatchObject({ code: "timer_running" });

    expect(await auditFor("time_entry")).toEqual([]);
  });
});

describe("audit log de la parada con el inicio por delante del now() de la base", () => {
  it("registra el fin que de verdad quedó escrito, igual al inicio", async () => {
    const future = new Date(Date.now() + 3_600_000);
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: future,
    });

    await stopTimer(actor, workspace, { id: row.id });

    const rows = await auditFor("time_entry", row.id);
    expect(rows.map((entry) => entry.action)).toEqual(["timeEntry.stop"]);
    expect(parsed(rows[0].previousValue)).toEqual({ endedAt: null });
    expect(parsed(rows[0].nextValue)).toEqual({ endedAt: future.toISOString() });
    expect((await timeEntryById(row.id))?.endedAt?.toISOString()).toBe(
      future.toISOString(),
    );
  });
});

describe("audit log de la edición de horas", () => {
  it("updateEntryTimes deja timeEntry.updateTimes con los dos instantes de antes y de después", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T13:00:40Z",
      endedAt: "2026-10-01T13:30:15Z",
    });

    await updateEntryTimes(actor, workspace, {
      id: row.id,
      date: "2026-10-01",
      start: "10:00",
      end: "11:00",
    });

    const rows = await auditFor("time_entry", row.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.updateTimes");
    expect(rows[0].workspaceId).toBe(workspaceId);
    expect(rows[0].actorId).toBe(actor.userId);
    expect(parsed(rows[0].previousValue)).toEqual({
      startedAt: "2026-10-01T13:00:40.000Z",
      endedAt: "2026-10-01T13:30:15.000Z",
    });
    // El inicio conservado conserva también sus segundos en el registro.
    expect(parsed(rows[0].nextValue)).toEqual({
      startedAt: "2026-10-01T13:00:40.000Z",
      endedAt: "2026-10-01T14:00:00.000Z",
    });
  });

  it("updateRunningStart deja timeEntry.updateStart con el inicio de antes y de después", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await updateRunningStart(actor, workspace, {
      id: row.id,
      date: "2026-10-02",
      start: "07:30",
    });

    const rows = await auditFor("time_entry", row.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.updateStart");
    expect(rows[0].workspaceId).toBe(workspaceId);
    expect(rows[0].actorId).toBe(actor.userId);
    expect(parsed(rows[0].previousValue)).toEqual({
      startedAt: "2026-10-02T11:00:00.000Z",
    });
    expect(parsed(rows[0].nextValue)).toEqual({ startedAt: "2026-10-02T10:30:00.000Z" });
  });

  it("el reintento deja dos registros con el mismo valor nuevo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    const input = { id: row.id, date: "2026-10-01", start: "09:00", end: "10:00" };

    await updateEntryTimes(actor, workspace, input);
    await updateEntryTimes(actor, workspace, input);

    const rows = await auditFor("time_entry", row.id);
    expect(rows.map((entry) => entry.action)).toEqual([
      "timeEntry.updateTimes",
      "timeEntry.updateTimes",
    ]);
    expect(parsed(rows[1].previousValue)).toEqual(parsed(rows[0].nextValue));
    expect(parsed(rows[1].nextValue)).toEqual(parsed(rows[0].nextValue));
  });
});

describe("audit log de la entrada manual", () => {
  it("deja un registro propio con la descripción y los dos instantes", async () => {
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      description: "reunión",
      date: "2026-10-02",
      start: "08:00",
      end: "10:30",
    });

    const rows = await auditFor("time_entry");
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.createManual");
    expect(rows[0].entity).toBe("time_entry");
    expect(rows[0].entityId).toBe(result.created.id);
    expect(rows[0].workspaceId).toBe(workspaceId);
    expect(rows[0].actorId).toBe(actor.userId);
    expect(rows[0].previousValue).toBeNull();
    expect(parsed(rows[0].nextValue)).toEqual({
      description: "reunión",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: "2026-10-02T13:30:00.000Z",
    });
  });

  it("no escribe nada cuando la entrada se rechaza", async () => {
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      description: "",
      date: "2026-10-02",
      start: "08:00",
      end: "08:00",
    }).catch(() => null);

    expect(await auditFor("time_entry")).toHaveLength(0);
  });

  it("guarda los mismos instantes que la fila cuando la entrada cruza la medianoche", async () => {
    const result = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      description: "turno noche",
      date: "2026-10-02",
      start: "23:00",
      end: "02:00",
    });

    const row = await timeEntryById(result.created.id);
    const rows = await auditFor("time_entry", result.created.id);
    expect(rows).toHaveLength(1);
    // El fin es del día siguiente (TT-72), y el registro no lo deriva: es el
    // instante que quedó escrito.
    expect(row?.endedAt?.toISOString()).toBe("2026-10-03T05:00:00.000Z");
    expect(parsed(rows[0].nextValue)).toEqual({
      description: "turno noche",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: row?.startedAt.toISOString(),
      endedAt: row?.endedAt?.toISOString(),
    });
  });

  it("la creación negada por la membresía no deja registro ni fila", async () => {
    const sinPermiso: Actor = { ...actor, status: "inactive" };

    await expect(
      createManualEntry(sinPermiso, workspace, {
        projectId: null,
        taskId: null,
        tagIds: [],
        description: "no va",
        date: "2026-10-02",
        start: "08:00",
        end: "09:00",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    expect(await auditFor("time_entry")).toEqual([]);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([]);
  });

  it("la creación con un timer corriendo deja el registro del arranque y el de la entrada (P-01)", async () => {
    const started = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "corriendo",
    });

    const manual = await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      description: "a mano",
      date: "2026-10-02",
      start: "08:00",
      end: "09:00",
    });

    const rows = await auditFor("time_entry");
    expect(rows.map((row) => [row.action, row.entityId])).toEqual([
      ["timeEntry.start", started.running.id],
      ["timeEntry.createManual", manual.created.id],
    ]);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(2);
  });

  it("la creación negada por el piso del workspace no deja registro ni fila", async () => {
    const reciente: TrackerWorkspace = {
      timezone: buenosAires,
      createdAt: new Date("2026-09-01T12:00:00Z"),
      weekStart: 1,
      formats: defaultFormats,
    };

    await expect(
      createManualEntry(actor, reciente, {
        projectId: null,
        taskId: null,
        tagIds: [],
        description: "histórico",
        date: "2026-08-31",
        start: "08:00",
        end: "09:00",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.beforeWorkspace,
    });

    expect(await auditFor("time_entry")).toEqual([]);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([]);
  });

  it("la creación negada por la hora que no existe no deja registro ni fila", async () => {
    // El 29/03/2026 Madrid salta de las 02:00 a las 03:00.
    const madrid: TrackerWorkspace = {
      timezone: "Europe/Madrid",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      weekStart: 1,
      formats: defaultFormats,
    };

    await expect(
      createManualEntry(actor, madrid, {
        projectId: null,
        taskId: null,
        tagIds: [],
        description: "la hora que no fue",
        date: "2026-03-29",
        start: "02:30",
        end: "04:00",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.nonexistentClock,
    });

    expect(await auditFor("time_entry")).toEqual([]);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([]);
  });

  it("ningún otro camino del módulo escribe timeEntry.createManual", async () => {
    const started = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "con timer",
    });
    await updateDescription(actor, workspace, {
      id: started.running.id,
      description: "editada",
    });
    await stopTimer(actor, workspace, { id: started.running.id });
    await deleteEntry(actor, { id: started.running.id });

    const actions = (await auditFor("time_entry")).map((row) => row.action);
    expect(new Set(actions)).toEqual(
      new Set([
        "timeEntry.start",
        "timeEntry.updateDescription",
        "timeEntry.stop",
        "timeEntry.delete",
      ]),
    );
  });

  it("el registro se guarda en el workspace de la sesión y no en el otro de la persona", async () => {
    const other = await seedWorkspace(buenosAires);
    await db
      .insert(membership)
      .values({ workspaceId: other.workspaceId, userId: actor.userId, role: "member" });
    const elsewhere: Actor = {
      ...actor,
      workspaceId: other.workspaceId,
      role: "member",
    };

    const result = await createManualEntry(elsewhere, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      description: "en el otro",
      date: "2026-10-02",
      start: "08:00",
      end: "09:00",
    });

    const rows = await auditFor("time_entry");
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(result.created.id);
    expect(rows[0].workspaceId).toBe(other.workspaceId);
    expect(rows[0].actorId).toBe(actor.userId);
  });

  it("distingue la entrada cargada a mano de la que produjo un timer", async () => {
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      description: "a mano",
      date: "2026-10-02",
      start: "08:00",
      end: "09:00",
    });
    const started = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "con timer",
    });
    await stopTimer(actor, workspace, { id: started.running.id });

    const actions = (await auditFor("time_entry")).map((row) => row.action);
    expect(actions.filter((action) => action === "timeEntry.createManual")).toHaveLength(
      1,
    );
    expect(actions).toContain("timeEntry.start");
    expect(actions).toContain("timeEntry.stop");
  });
});

describe("audit log de continuar, duplicar y descartar", () => {
  /** Una entrada cerrada del actor, la original de continuar y duplicar. */
  function seedSource() {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "diseño",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
  }

  it("continuar deja timeEntry.continue con la original, y el stop del timer que cerró", async () => {
    const source = await seedSource();
    const previous = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const result = await continueEntry(actor, workspace, {
      id: randomUUID(),
      sourceId: source.id,
    });

    const opened = await auditFor("time_entry", result.running.id);
    expect(opened).toHaveLength(1);
    expect(opened[0].action).toBe("timeEntry.continue");
    expect(opened[0].workspaceId).toBe(workspaceId);
    expect(opened[0].actorId).toBe(actor.userId);
    expect(opened[0].previousValue).toBeNull();
    expect(parsed(opened[0].nextValue)).toEqual({
      sourceId: source.id,
      description: "diseño",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: result.running.startedAt,
    });
    const closed = await auditFor("time_entry", previous.id);
    expect(closed.map((row) => row.action)).toEqual(["timeEntry.stop"]);
    expect(parsed(closed[0].nextValue)).toEqual({ endedAt: result.running.startedAt });
    expect(await auditFor("time_entry", source.id)).toEqual([]);
  });

  it("duplicar deja timeEntry.duplicate con la original y los dos instantes", async () => {
    const source = await seedSource();

    const { created } = await duplicateEntry(actor, workspace, {
      id: randomUUID(),
      sourceId: source.id,
    });

    const rows = await auditFor("time_entry");
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.duplicate");
    expect(rows[0].entityId).toBe(created.id);
    expect(rows[0].actorId).toBe(actor.userId);
    expect(rows[0].previousValue).toBeNull();
    expect(parsed(rows[0].nextValue)).toEqual({
      sourceId: source.id,
      description: "diseño",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: "2026-10-01T11:00:00.000Z",
      endedAt: "2026-10-01T12:00:00.000Z",
    });
  });

  it("descartar deja timeEntry.discard con la fila entera como valor previo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "para descartar",
      startedAt: "2026-10-02T11:00:00Z",
    });

    await discardTimer(actor, { id: row.id });

    const rows = await auditFor("time_entry", row.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("timeEntry.discard");
    expect(rows[0].nextValue).toBeNull();
    // Es la única copia que queda: el borrado es físico.
    expect(parsed(rows[0].previousValue)).toEqual({
      id: row.id,
      workspaceId,
      userId: actor.userId,
      description: "para descartar",
      projectId: null,
      taskId: null,
      billable: false,
      tagIds: [],
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  });

  it("duplicar y descartar repetidos sobre un pedido ya aplicado no dejan registro", async () => {
    const source = await seedSource();
    const continued = randomUUID();
    const duplicated = randomUUID();
    await continueEntry(actor, workspace, { id: continued, sourceId: source.id });
    await duplicateEntry(actor, workspace, { id: duplicated, sourceId: source.id });
    await discardTimer(actor, { id: continued });
    const before = await auditFor("time_entry");

    await duplicateEntry(actor, workspace, { id: duplicated, sourceId: source.id });
    await discardTimer(actor, { id: continued });

    expect(await auditFor("time_entry")).toEqual(before);
  });

  it("continuar resuelto por la fila propia no deja registro", async () => {
    const source = await seedSource();
    const id = randomUUID();
    await continueEntry(actor, workspace, { id, sourceId: source.id });
    const before = await auditFor("time_entry");

    await continueEntry(actor, workspace, { id, sourceId: source.id });

    expect(await auditFor("time_entry")).toEqual(before);
  });

  it("el descarte de un timer ya detenido no deja registro", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    await stopTimer(actor, workspace, { id: row.id });

    await expect(discardTimer(actor, { id: row.id })).rejects.toMatchObject({
      code: "already_stopped",
    });

    const actions = (await auditFor("time_entry", row.id)).map((entry) => entry.action);
    expect(actions).toEqual(["timeEntry.stop"]);
  });

  it("ningún otro camino del módulo escribe continue, duplicate ni discard", async () => {
    const source = await seedSource();
    const started = await startTimer(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      id: randomUUID(),
      description: "arranque",
    });
    await stopTimer(actor, workspace, { id: started.running.id });
    await createManualEntry(actor, workspace, {
      projectId: null,
      taskId: null,
      tagIds: [],
      description: "",
      date: "2026-10-01",
      start: "13:00",
      end: "14:00",
    });
    await deleteEntry(actor, { id: source.id });

    const actions = (await auditFor("time_entry")).map((row) => row.action);
    expect(actions).not.toContain("timeEntry.continue");
    expect(actions).not.toContain("timeEntry.duplicate");
    expect(actions).not.toContain("timeEntry.discard");
  });
});

describe("audit log del proyecto y la tarea (criterio 13)", () => {
  async function seedPair() {
    const web = await seedProject({ workspaceId });
    const design = await seedTask({ workspaceId, projectId: web.id });
    return { projectId: web.id, taskId: design.id };
  }

  function seedEntry(pair: { projectId: string | null; taskId: string | null }) {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "original",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
      ...pair,
    });
  }

  it("updateEntryProject deja timeEntry.updateProject con el par anterior y el nuevo", async () => {
    const pair = await seedPair();
    const entry = await seedEntry({ projectId: pair.projectId, taskId: null });

    await updateEntryProject(actor, workspace, { id: entry.id, ...pair });
    await updateEntryProject(actor, workspace, {
      id: entry.id,
      projectId: null,
      taskId: null,
    });

    const rows = await auditFor("time_entry", entry.id);
    expect(
      rows.map((row) => ({
        action: row.action,
        actorId: row.actorId,
        previousValue: parsed(row.previousValue),
        nextValue: parsed(row.nextValue),
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          action: "timeEntry.updateProject",
          actorId: actor.userId,
          previousValue: { projectId: pair.projectId, taskId: null },
          nextValue: pair,
        },
        {
          action: "timeEntry.updateProject",
          actorId: actor.userId,
          previousValue: pair,
          nextValue: { projectId: null, taskId: null },
        },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("el pedido sin cambios no deja registro", async () => {
    const pair = await seedPair();
    const entry = await seedEntry(pair);
    await updateEntryProject(actor, workspace, { id: entry.id, ...pair });
    expect(await auditFor("time_entry", entry.id)).toEqual([]);
  });

  it("el cambio rechazado no deja registro", async () => {
    const old = await seedProject({ workspaceId, archived: true });
    const entry = await seedEntry({ projectId: null, taskId: null });
    await expect(
      updateEntryProject(actor, workspace, {
        id: entry.id,
        projectId: old.id,
        taskId: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("las cuatro altas guardan el par en su nextValue", async () => {
    const pair = await seedPair();
    const source = await seedEntry(pair);

    const manual = await createManualEntry(actor, workspace, {
      description: "",
      date: "2026-09-30",
      start: "08:00",
      end: "09:00",
      tagIds: [],
      ...pair,
    });
    const started = await startTimer(actor, workspace, {
      id: randomUUID(),
      description: "",
      tagIds: [],
      ...pair,
    });
    const continued = await continueEntry(actor, workspace, {
      id: randomUUID(),
      sourceId: source.id,
    });
    const duplicated = await duplicateEntry(actor, workspace, {
      id: randomUUID(),
      sourceId: source.id,
    });

    for (const [action, id] of [
      ["timeEntry.start", started.running.id],
      ["timeEntry.createManual", manual.created.id],
      ["timeEntry.continue", continued.running.id],
      ["timeEntry.duplicate", duplicated.created.id],
    ] as const) {
      const rows = await auditFor("time_entry", id);
      const created = rows.find((row) => row.action === action);
      expect([action, parsed(created?.nextValue ?? null)]).toEqual([
        action,
        expect.objectContaining(pair),
      ]);
    }
  });
});

describe("audit log de las operaciones en masa (ADR 0011)", () => {
  function seedOwn(description: string, startedAt: string, endedAt: string | null) {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description,
      startedAt,
      endedAt,
    });
  }

  it("la edición deja timeEntry.bulkEdit por fila escrita, con solo los campos que cambiaron (criterio 6)", async () => {
    // 10:00 a 11:00 en Buenos Aires; el inicio pasa a las 09:00 y el fin se conserva.
    const changed = await seedOwn(
      "vieja",
      "2026-10-01T13:00:00Z",
      "2026-10-01T14:00:00Z",
    );
    // Ya tiene la descripción y el inicio pedidos.
    const same = await seedOwn("nueva", "2026-09-30T12:00:00Z", "2026-09-30T14:00:00Z");
    // Solo cambia la descripción.
    const describedOnly = await seedOwn(
      "otra",
      "2026-09-29T12:00:00Z",
      "2026-09-29T13:00:00Z",
    );

    await bulkEditEntries(actor, workspace, {
      ids: [changed.id, same.id, describedOnly.id],
      changes: { description: "nueva", start: "09:00" },
    });

    const rows = await auditFor("time_entry");
    expect(rows).toHaveLength(2);
    const [record] = await auditFor("time_entry", changed.id);
    expect(record).toMatchObject({
      action: "timeEntry.bulkEdit",
      entity: "time_entry",
      workspaceId,
      actorId: actor.userId,
    });
    expect(parsed(record.previousValue)).toEqual({
      description: "vieja",
      startedAt: "2026-10-01T13:00:00.000Z",
    });
    expect(parsed(record.nextValue)).toEqual({
      description: "nueva",
      startedAt: "2026-10-01T12:00:00.000Z",
    });
    const [described] = await auditFor("time_entry", describedOnly.id);
    expect(parsed(described.previousValue)).toEqual({ description: "otra" });
    expect(parsed(described.nextValue)).toEqual({ description: "nueva" });
    expect(await auditFor("time_entry", same.id)).toEqual([]);
  });

  it("la edición que cambia los dos extremos los registra a los dos", async () => {
    const row = await seedOwn("", "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");

    await bulkEditEntries(actor, workspace, {
      ids: [row.id],
      changes: { date: "2026-09-30" },
    });

    const [record] = await auditFor("time_entry", row.id);
    expect(parsed(record.previousValue)).toEqual({
      startedAt: "2026-10-01T13:00:00.000Z",
      endedAt: "2026-10-01T14:00:00.000Z",
    });
    expect(parsed(record.nextValue)).toEqual({
      startedAt: "2026-09-30T13:00:00.000Z",
      endedAt: "2026-09-30T14:00:00.000Z",
    });
  });

  it("la edición que cambia solo el fin no registra el inicio conservado", async () => {
    // 10:00:40 a 11:00; el fin pasa a las 11:30 y el inicio conserva sus segundos.
    const row = await seedOwn("", "2026-10-01T13:00:40Z", "2026-10-01T14:00:00Z");

    await bulkEditEntries(actor, workspace, { ids: [row.id], changes: { end: "11:30" } });

    const [record] = await auditFor("time_entry", row.id);
    expect(parsed(record.previousValue)).toEqual({ endedAt: "2026-10-01T14:00:00.000Z" });
    expect(parsed(record.nextValue)).toEqual({ endedAt: "2026-10-01T14:30:00.000Z" });
  });

  it("la edición rechazada no deja registro de ninguna fila (criterio 10)", async () => {
    const valid = await seedOwn("vieja", "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const running = await seedOwn("", "2026-10-02T13:00:00Z", null);

    await expect(
      bulkEditEntries(actor, workspace, {
        ids: [valid.id, running.id],
        changes: { description: "nueva" },
      }),
    ).rejects.toMatchObject({ code: "rejected" });

    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("el borrado deja timeEntry.bulkDelete por fila borrada, con la fila entera (criterio 11)", async () => {
    const rows = [
      await seedOwn("una", "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z"),
      await seedOwn("otra", "2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z"),
    ];

    await bulkDeleteEntries(actor, { ids: [...rows.map((row) => row.id), randomUUID()] });

    expect(await auditFor("time_entry")).toHaveLength(2);
    for (const row of rows) {
      const [record] = await auditFor("time_entry", row.id);
      expect(record).toMatchObject({
        action: "timeEntry.bulkDelete",
        workspaceId,
        actorId: actor.userId,
        nextValue: null,
      });
      // Es la única copia que queda: el borrado es físico.
      expect(parsed(record.previousValue)).toEqual({
        id: row.id,
        workspaceId,
        userId: actor.userId,
        description: row.description,
        projectId: null,
        taskId: null,
        billable: false,
        tagIds: [],
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
  });

  it("el borrado rechazado no deja registro (criterio 11)", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const own = await seedOwn("", "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const foreign = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });

    await expect(
      bulkDeleteEntries(actor, { ids: [own.id, foreign.id] }),
    ).rejects.toMatchObject({ code: "rejected" });

    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("repetir una edición o un borrado aplicados no deja registro nuevo (criterio 14)", async () => {
    const edited = await seedOwn("vieja", "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const removed = await seedOwn("", "2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z");
    const edit = {
      ids: [edited.id],
      changes: { description: "nueva", date: "2026-09-29", start: "08:00", end: "09:30" },
    };

    await bulkEditEntries(actor, workspace, edit);
    await bulkDeleteEntries(actor, { ids: [removed.id] });
    await bulkEditEntries(actor, workspace, edit);
    await bulkDeleteEntries(actor, { ids: [removed.id] });

    expect((await auditFor("time_entry")).map((row) => row.action).sort()).toEqual([
      "timeEntry.bulkDelete",
      "timeEntry.bulkEdit",
    ]);
  });

  it("la membresía desactivada no deja registro", async () => {
    const row = await seedOwn("", "2026-10-01T13:00:00Z", "2026-10-01T14:00:00Z");
    const inactive: Actor = { ...actor, status: "inactive" };

    await expect(
      bulkEditEntries(inactive, workspace, {
        ids: [row.id],
        changes: { description: "x" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(bulkDeleteEntries(inactive, { ids: [row.id] })).rejects.toMatchObject({
      code: "forbidden",
    });

    expect(await auditFor("time_entry")).toEqual([]);
    expect(await timeEntryById(row.id)).toBeDefined();
  });
});

describe("audit log del guardado del diálogo (ADR 0013)", () => {
  async function seedProjectWithTask() {
    const web = await seedProject({ workspaceId });
    const design = await seedTask({ workspaceId, projectId: web.id });
    return { projectId: web.id, taskId: design.id };
  }

  /** 10:00 a 10:30:15 del 1/10 en Buenos Aires, con segundos en el inicio. */
  function seedClosed() {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "antes",
      startedAt: "2026-10-01T13:00:40Z",
      endedAt: "2026-10-01T13:30:15Z",
    });
  }

  /** Las constancias de una entrada, para comparar de un vistazo. */
  async function auditsOf(id: string) {
    return (await auditFor("time_entry", id)).map((row) => ({
      action: row.action,
      workspaceId: row.workspaceId,
      actorId: row.actorId,
      previousValue: parsed(row.previousValue),
      nextValue: parsed(row.nextValue),
    }));
  }

  it("deja una sola constancia timeEntry.update con solo los campos escritos", async () => {
    const pair = await seedProjectWithTask();
    const row = await seedClosed();

    await updateEntry(actor, workspace, {
      id: row.id,
      changes: {
        description: "después",
        project: pair,
        // El inicio no cambia: conserva sus segundos y no entra en la constancia.
        times: { date: "2026-10-01", start: "10:00", end: "11:00" },
      },
    });

    expect(await auditsOf(row.id)).toEqual([
      {
        action: "timeEntry.update",
        workspaceId,
        actorId: actor.userId,
        previousValue: {
          description: "antes",
          projectId: null,
          taskId: null,
          endedAt: "2026-10-01T13:30:15.000Z",
        },
        nextValue: {
          description: "después",
          ...pair,
          endedAt: "2026-10-01T14:00:00.000Z",
        },
      },
    ]);
  });

  it("en el timer, la descripción y el inicio; con solo la descripción, solo ella", async () => {
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "antes",
      startedAt: "2026-10-02T11:00:00Z",
    });
    const closed = await seedClosed();

    await updateEntry(
      actor,
      workspace,
      {
        id: running.id,
        changes: {
          description: "después",
          runningStart: { date: "2026-10-02", start: "07:30" },
        },
      },
      new Date("2026-10-02T15:00:00Z"),
    );
    await updateEntry(actor, workspace, {
      id: closed.id,
      changes: { description: "sola" },
    });

    expect(await auditsOf(running.id)).toEqual([
      expect.objectContaining({
        action: "timeEntry.update",
        previousValue: { description: "antes", startedAt: "2026-10-02T11:00:00.000Z" },
        nextValue: { description: "después", startedAt: "2026-10-02T10:30:00.000Z" },
      }),
    ]);
    expect(await auditsOf(closed.id)).toEqual([
      expect.objectContaining({
        previousValue: { description: "antes" },
        nextValue: { description: "sola" },
      }),
    ]);
  });

  it("un pedido rechazado, uno sin cambios y el reintento de uno aplicado no dejan constancia", async () => {
    const row = await seedClosed();
    const input = { id: row.id, changes: { description: "después" } };

    await expect(
      updateEntry(actor, workspace, {
        id: row.id,
        changes: {
          description: "otra",
          times: { date: "2026-10-01", start: "10:00", end: "10:00" },
        },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await updateEntry(actor, workspace, {
      id: row.id,
      changes: { description: "antes" },
    });
    await updateEntry(actor, workspace, input);
    await updateEntry(actor, workspace, input);

    expect((await auditsOf(row.id)).map((audit) => audit.nextValue)).toEqual([
      { description: "después" },
    ]);
  });
});

describe("audit log del facturable (criterio 12 del 11a)", () => {
  function seedEntry(values: { projectId: string | null; billable: boolean }) {
    return seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "original",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
      ...values,
    });
  }

  async function changesOf(id: string) {
    return (await auditFor("time_entry", id)).map((row) => ({
      action: row.action,
      previousValue: parsed(row.previousValue),
      nextValue: parsed(row.nextValue),
    }));
  }

  it("las cuatro altas guardan el facturable que escribieron", async () => {
    const billed = await seedProject({ workspaceId, billableByDefault: true });
    const plain = await seedProject({ workspaceId });
    const source = await seedEntry({ projectId: plain.id, billable: true });

    const started = await startTimer(actor, workspace, {
      id: randomUUID(),
      description: "",
      projectId: billed.id,
      taskId: null,
      tagIds: [],
    });
    const manual = await createManualEntry(actor, workspace, {
      description: "",
      date: "2026-09-30",
      start: "08:00",
      end: "09:00",
      projectId: billed.id,
      taskId: null,
      tagIds: [],
      billable: false,
    });
    const continued = await continueEntry(actor, workspace, {
      id: randomUUID(),
      sourceId: source.id,
    });
    const duplicated = await duplicateEntry(actor, workspace, {
      id: randomUUID(),
      sourceId: source.id,
    });

    for (const [action, id, billable] of [
      ["timeEntry.start", started.running.id, true],
      ["timeEntry.createManual", manual.created.id, false],
      ["timeEntry.continue", continued.running.id, true],
      ["timeEntry.duplicate", duplicated.created.id, true],
    ] as const) {
      const created = (await auditFor("time_entry", id)).find(
        (row) => row.action === action,
      );
      expect([action, parsed(created?.nextValue ?? null)]).toEqual([
        action,
        expect.objectContaining({ billable }),
      ]);
    }
  });

  it("timeEntry.updateProject suma el facturable a los dos lados solo cuando cambió", async () => {
    const billed = await seedProject({ workspaceId, billableByDefault: true });
    const design = await seedTask({ workspaceId, projectId: billed.id });
    const entry = await seedEntry({ projectId: null, billable: false });

    await updateEntryProject(actor, workspace, {
      id: entry.id,
      projectId: billed.id,
      taskId: null,
    });
    await updateEntryProject(actor, workspace, {
      id: entry.id,
      projectId: billed.id,
      taskId: design.id,
    });

    expect(await changesOf(entry.id)).toEqual(
      expect.arrayContaining([
        {
          action: "timeEntry.updateProject",
          previousValue: { projectId: null, taskId: null, billable: false },
          nextValue: { projectId: billed.id, taskId: null, billable: true },
        },
        {
          action: "timeEntry.updateProject",
          previousValue: { projectId: billed.id, taskId: null },
          nextValue: { projectId: billed.id, taskId: design.id },
        },
      ]),
    );
    expect(await auditFor("time_entry", entry.id)).toHaveLength(2);
  });

  it("timeEntry.update guarda el facturable cuando lo escribió, pedido o por el proyecto", async () => {
    const billed = await seedProject({ workspaceId, billableByDefault: true });
    const alone = await seedEntry({ projectId: null, billable: false });
    const byProject = await seedEntry({ projectId: null, billable: false });

    await updateEntry(actor, workspace, { id: alone.id, changes: { billable: true } });
    await updateEntry(actor, workspace, {
      id: byProject.id,
      changes: { project: { projectId: billed.id, taskId: null } },
    });

    expect(await changesOf(alone.id)).toEqual([
      {
        action: "timeEntry.update",
        previousValue: { billable: false },
        nextValue: { billable: true },
      },
    ]);
    expect(await changesOf(byProject.id)).toEqual([
      {
        action: "timeEntry.update",
        previousValue: { projectId: null, taskId: null, billable: false },
        nextValue: { projectId: billed.id, taskId: null, billable: true },
      },
    ]);
  });

  it("un facturable igual al de la fila no deja constancia", async () => {
    const entry = await seedEntry({ projectId: null, billable: true });
    await updateEntry(actor, workspace, { id: entry.id, changes: { billable: true } });
    expect(await auditFor("time_entry", entry.id)).toEqual([]);
  });
});

import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { buenosAires, seedMember, seedTimeEntry, seedWorkspace } from "@/test/factories";
import { auditFor, timeEntriesOf, timeEntryById } from "@/test/queries";

import { timeEntryMessages } from "./schema";
import {
  createManualEntry,
  deleteEntry,
  startTimer,
  stopTimer,
  updateDescription,
  updateEntryTimes,
  updateRunningStart,
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
const workspace = { timezone: buenosAires, createdAt: new Date("2020-01-01T00:00:00Z") };

function parsed(value: string | null): unknown {
  return value === null ? null : (JSON.parse(value) as unknown);
}

describe("audit log de las mutaciones", () => {
  it("el arranque deja un registro con la descripción y el inicio", async () => {
    const result = await startTimer(actor, buenosAires, {
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
      startedAt: result.running.startedAt,
    });
  });

  it("el arranque que cierra el timer anterior deja un registro por entrada", async () => {
    const first = await startTimer(actor, buenosAires, {
      id: randomUUID(),
      description: "uno",
    });
    const second = await startTimer(actor, buenosAires, {
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
      startedAt: second.running.startedAt,
    });
  });

  it("el reintento de un arranque ya aplicado no deja registro", async () => {
    const id = randomUUID();
    await startTimer(actor, buenosAires, { id, description: "uno" });
    const before = await auditFor("time_entry");

    await startTimer(actor, buenosAires, { id, description: "uno" });

    expect(await auditFor("time_entry")).toEqual(before);
    expect((await auditFor("time_entry", id)).map((row) => row.action)).toEqual([
      "timeEntry.start",
    ]);
  });

  it("detener deja el registro con el fin que escribió la base", async () => {
    const started = await startTimer(actor, buenosAires, {
      id: randomUUID(),
      description: "tarea",
    });

    const result = await stopTimer(actor, buenosAires, { id: started.running.id });

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

    await updateDescription(actor, buenosAires, { id: row.id, description: "después" });

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
      updateDescription(actor, buenosAires, { id: row.id, description: "mía" }),
    ).rejects.toThrow();
    await expect(deleteEntry(actor, { id: row.id })).rejects.toThrow();
    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toThrow();

    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("el id inexistente no deja registro", async () => {
    await expect(
      deleteEntry(actor, { id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b" }),
    ).rejects.toThrow();

    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("detener una entrada ya cerrada no agrega un segundo registro", async () => {
    const started = await startTimer(actor, buenosAires, {
      id: randomUUID(),
      description: "tarea",
    });
    await stopTimer(actor, buenosAires, { id: started.running.id });

    await expect(
      stopTimer(actor, buenosAires, { id: started.running.id }),
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

    await stopTimer(actor, buenosAires, { id: row.id });

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
      startedAt: "2026-10-02T11:00:00.000Z",
      endedAt: "2026-10-02T13:30:00.000Z",
    });
  });

  it("no escribe nada cuando la entrada se rechaza", async () => {
    await createManualEntry(actor, workspace, {
      description: "",
      date: "2026-10-02",
      start: "08:00",
      end: "08:00",
    }).catch(() => null);

    expect(await auditFor("time_entry")).toHaveLength(0);
  });

  it("guarda los mismos instantes que la fila cuando la entrada cruza la medianoche", async () => {
    const result = await createManualEntry(actor, workspace, {
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
      startedAt: row?.startedAt.toISOString(),
      endedAt: row?.endedAt?.toISOString(),
    });
  });

  it("la creación negada por la membresía no deja registro ni fila", async () => {
    const sinPermiso: Actor = { ...actor, status: "inactive" };

    await expect(
      createManualEntry(sinPermiso, workspace, {
        description: "no va",
        date: "2026-10-02",
        start: "08:00",
        end: "09:00",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    expect(await auditFor("time_entry")).toEqual([]);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([]);
  });

  it("la creación negada por el timer corriendo deja solo el registro del arranque", async () => {
    const started = await startTimer(actor, buenosAires, {
      id: randomUUID(),
      description: "corriendo",
    });

    await expect(
      createManualEntry(actor, workspace, {
        description: "a mano",
        date: "2026-10-02",
        start: "08:00",
        end: "09:00",
      }),
    ).rejects.toMatchObject({ code: "timer_running" });

    const rows = await auditFor("time_entry");
    expect(rows.map((row) => row.action)).toEqual(["timeEntry.start"]);
    expect(rows[0].entityId).toBe(started.running.id);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(1);
  });

  it("la creación negada por el piso del workspace no deja registro ni fila", async () => {
    const reciente = {
      timezone: buenosAires,
      createdAt: new Date("2026-09-01T12:00:00Z"),
    };

    await expect(
      createManualEntry(actor, reciente, {
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
    const madrid = {
      timezone: "Europe/Madrid",
      createdAt: new Date("2020-01-01T00:00:00Z"),
    };

    await expect(
      createManualEntry(actor, madrid, {
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
    const started = await startTimer(actor, buenosAires, {
      id: randomUUID(),
      description: "con timer",
    });
    await updateDescription(actor, buenosAires, {
      id: started.running.id,
      description: "editada",
    });
    await stopTimer(actor, buenosAires, { id: started.running.id });
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
      description: "a mano",
      date: "2026-10-02",
      start: "08:00",
      end: "09:00",
    });
    const started = await startTimer(actor, buenosAires, {
      id: randomUUID(),
      description: "con timer",
    });
    await stopTimer(actor, buenosAires, { id: started.running.id });

    const actions = (await auditFor("time_entry")).map((row) => row.action);
    expect(actions.filter((action) => action === "timeEntry.createManual")).toHaveLength(
      1,
    );
    expect(actions).toContain("timeEntry.start");
    expect(actions).toContain("timeEntry.stop");
  });
});

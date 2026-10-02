import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/server/permissions";
import { buenosAires, seedMember, seedTimeEntry, seedWorkspace } from "@/test/factories";
import { auditFor, timeEntryById } from "@/test/queries";

import { deleteEntry, startTimer, stopTimer, updateDescription } from "./service";

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

function parsed(value: string | null): unknown {
  return value === null ? null : (JSON.parse(value) as unknown);
}

describe("audit log de las mutaciones", () => {
  it("el arranque deja un registro con la descripción y el inicio", async () => {
    const result = await startTimer(actor, buenosAires, { description: "revisión" });

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
    const first = await startTimer(actor, buenosAires, { description: "uno" });
    const second = await startTimer(actor, buenosAires, { description: "dos" });

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

  it("detener deja el registro con el fin que escribió la base", async () => {
    const started = await startTimer(actor, buenosAires, { description: "tarea" });

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
    const started = await startTimer(actor, buenosAires, { description: "tarea" });
    await stopTimer(actor, buenosAires, { id: started.running.id });

    await expect(
      stopTimer(actor, buenosAires, { id: started.running.id }),
    ).rejects.toMatchObject({ code: "already_stopped" });

    const rows = await auditFor("time_entry", started.running.id);
    expect(rows.filter((row) => row.action === "timeEntry.stop")).toHaveLength(1);
  });

  it("el fin anterior al inicio deshace también el registro", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: future,
    });

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "validation",
    });

    expect(await auditFor("time_entry")).toEqual([]);
    expect((await timeEntryById(row.id))?.endedAt).toBeNull();
  });
});

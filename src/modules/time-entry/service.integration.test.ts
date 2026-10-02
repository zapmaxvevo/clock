import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { auditLog, timeEntry } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { seedMember, seedWorkspace } from "@/test/factories";

import { timeEntryRepository } from "./repository";
import { timeEntryMessages } from "./schema";
import {
  deleteEntry,
  getTrackerState,
  startTimer,
  stopTimer,
  TimeEntryError,
  updateDescription,
} from "./service";

const buenosAires = "America/Argentina/Buenos_Aires";
const madrid = "Europe/Madrid";

let workspaceId: string;
let actor: Actor;

function actorFor(userId: string, overrides: Partial<Actor> = {}): Actor {
  return { userId, workspaceId, role: "member", status: "active", ...overrides };
}

/** Entrada con instantes fijos. No pasa por el service: es el estado de partida. */
async function seedEntry(values: {
  userId?: string;
  workspaceId?: string;
  description?: string;
  startedAt: string;
  endedAt?: string;
}) {
  const [row] = await db
    .insert(timeEntry)
    .values({
      workspaceId: values.workspaceId ?? workspaceId,
      userId: values.userId ?? actor.userId,
      description: values.description ?? "",
      startedAt: new Date(values.startedAt),
      endedAt: values.endedAt === undefined ? null : new Date(values.endedAt),
    })
    .returning();
  return row;
}

async function allEntries() {
  return db.select().from(timeEntry).orderBy(asc(timeEntry.startedAt));
}

async function auditFor(entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, "time_entry"), eq(auditLog.entityId, entityId)))
    .orderBy(asc(auditLog.createdAt));
}

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  actor = actorFor(seeded.ownerId, { role: "owner" });
});

describe("startTimer", () => {
  it("abre una entrada con el instante de la base y sin fin", async () => {
    const before = new Date();
    const result = await startTimer(actor, buenosAires, { description: "  revisión  " });

    expect(result.running.endedAt).toBeNull();
    expect(result.running.durationSeconds).toBeNull();
    expect(result.running.durationLabel).toBeNull();
    expect(result.running.extraDays).toBe(0);
    expect(result.stopped).toBeNull();
    // El instante lo pone la base, no el proceso: solo se verifica que sea de ahora.
    expect(new Date(result.running.startedAt).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 60_000,
    );

    const rows = await allEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].endedAt).toBeNull();
    expect(rows[0].description).toBe("  revisión  ");
  });

  it("cierra el timer anterior en el mismo instante en que abre el nuevo", async () => {
    const first = await startTimer(actor, buenosAires, { description: "uno" });
    const second = await startTimer(actor, buenosAires, { description: "dos" });

    expect(second.stopped?.id).toBe(first.running.id);
    expect(second.stopped?.endedAt).toBe(second.running.startedAt);

    const rows = await allEntries();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.endedAt === null)).toHaveLength(1);
  });

  it("escribe un registro de auditoría por cada entrada que toca", async () => {
    const first = await startTimer(actor, buenosAires, { description: "uno" });
    const second = await startTimer(actor, buenosAires, { description: "dos" });

    const closed = await auditFor(first.running.id);
    expect(closed.map((row) => row.action)).toEqual([
      "timeEntry.start",
      "timeEntry.stop",
    ]);
    expect(closed[1].previousValue).toBe(JSON.stringify({ endedAt: null }));

    const opened = await auditFor(second.running.id);
    expect(opened.map((row) => row.action)).toEqual(["timeEntry.start"]);
    expect(opened[0].actorId).toBe(actor.userId);
  });

  it("deja un solo timer activo con varios arranques simultáneos", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        startTimer(actor, buenosAires, { description: `pestaña ${index}` }),
      ),
    );

    const running = (await allEntries()).filter((row) => row.endedAt === null);
    expect(running).toHaveLength(1);
    for (const result of results) {
      expect(result.running.endedAt).toBeNull();
    }
    // El que perdió la carrera devuelve el timer del ganador, no un error.
    expect(results.some((result) => result.running.id === running[0].id)).toBe(true);
  });

  it("el índice único impide una segunda entrada abierta escrita directo", async () => {
    await startTimer(actor, buenosAires, { description: "uno" });

    const second = seedEntry({ startedAt: new Date().toISOString() });
    await expect(second).rejects.toThrow();
    await expect(second.catch((error: unknown) => error)).resolves.toSatisfy(
      (error: unknown) => timeEntryRepository.isRunningConflict(error),
    );
  });

  it("no choca con el timer de otra persona del mismo workspace", async () => {
    const otherId = await seedMember(workspaceId, "member");
    await startTimer(actorFor(otherId), buenosAires, { description: "de otro" });

    const mine = await startTimer(actor, buenosAires, { description: "mío" });

    expect(mine.stopped).toBeNull();
    expect((await allEntries()).filter((row) => row.endedAt === null)).toHaveLength(2);
  });
});

describe("stopTimer", () => {
  it("cierra la entrada y devuelve su duración", async () => {
    const started = await startTimer(actor, buenosAires, { description: "tarea" });
    const result = await stopTimer(actor, buenosAires, { id: started.running.id });

    expect(result.stopped.endedAt).not.toBeNull();
    expect(result.stopped.durationSeconds).toBeGreaterThanOrEqual(0);
    // Detener en el mismo minuto deja la entrada guardada y la muestra en 0:00.
    expect(result.stopped.durationLabel).toBe("0:00");

    const rows = await allEntries();
    expect(rows[0].endedAt).not.toBeNull();
  });

  it("rechaza detener una entrada que ya estaba cerrada", async () => {
    const row = await seedEntry({
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    const rows = await allEntries();
    expect(rows[0].endedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("responde que no existe cuando el id no está", async () => {
    await expect(
      stopTimer(actor, buenosAires, { id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b" }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
  });

  it("responde que no existe cuando el id es de otro workspace", async () => {
    const other = await seedWorkspace();
    const row = await seedEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-01T11:00:00Z",
    });

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rechaza la entrada de otra persona del workspace sin tocarla", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedEntry({ userId: otherId, startedAt: "2026-10-01T11:00:00Z" });

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect((await allEntries())[0].endedAt).toBeNull();
  });

  it("rechaza con el mensaje neutro cuando la membresía no está activa", async () => {
    const started = await startTimer(actor, buenosAires, { description: "tarea" });
    const inactive = { ...actor, status: "inactive" } as const;

    await expect(
      stopTimer(inactive, buenosAires, { id: started.running.id }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbidden,
    });
  });

  it("rechaza cerrar antes del inicio, que es lo que impide la restricción de la base", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const row = await seedEntry({ startedAt: future });

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.endBeforeStart,
    });
    expect((await allEntries())[0].endedAt).toBeNull();
  });
});

describe("restricciones de la tabla", () => {
  it("no acepta una fila con fin anterior al inicio escrita directo", async () => {
    await expect(
      seedEntry({ startedAt: "2026-10-01T12:00:00Z", endedAt: "2026-10-01T11:00:00Z" }),
    ).rejects.toThrow();
  });

  it("acepta una entrada de duración cero", async () => {
    const row = await seedEntry({
      startedAt: "2026-10-01T12:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    expect(row.endedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("no acepta una descripción de más de 3000 caracteres", async () => {
    await expect(
      seedEntry({ startedAt: "2026-10-01T12:00:00Z", description: "a".repeat(3001) }),
    ).rejects.toThrow();
  });
});

describe("updateDescription", () => {
  it("guarda la descripción sobre la entrada abierta sin detenerla", async () => {
    const started = await startTimer(actor, buenosAires, { description: "" });

    const result = await updateDescription(actor, buenosAires, {
      id: started.running.id,
      description: "revisión de PR",
    });

    expect(result.entry.description).toBe("revisión de PR");
    expect(result.entry.endedAt).toBeNull();
    const audit = await auditFor(started.running.id);
    expect(audit.at(-1)?.action).toBe("timeEntry.updateDescription");
    expect(audit.at(-1)?.previousValue).toBe(JSON.stringify({ description: "" }));
  });

  it("guarda la descripción sobre una entrada cerrada", async () => {
    const row = await seedEntry({
      description: "vieja",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    const result = await updateDescription(actor, buenosAires, {
      id: row.id,
      description: "nueva",
    });

    expect(result.entry.description).toBe("nueva");
    expect(result.entry.durationLabel).toBe("1:00");
  });

  it("rechaza la entrada de otra persona y no la cambia", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedEntry({
      userId: otherId,
      description: "ajena",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    await expect(
      updateDescription(actor, buenosAires, { id: row.id, description: "mía" }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect((await allEntries())[0].description).toBe("ajena");
  });
});

describe("deleteEntry", () => {
  it("borra la fila y deja su contenido en el audit log", async () => {
    const row = await seedEntry({
      description: "para borrar",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    const result = await deleteEntry(actor, { id: row.id });

    expect(result.id).toBe(row.id);
    expect(await allEntries()).toHaveLength(0);
    const audit = await auditFor(row.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("timeEntry.delete");
    expect(audit[0].nextValue).toBeNull();
    expect(JSON.parse(audit[0].previousValue ?? "null")).toMatchObject({
      id: row.id,
      description: "para borrar",
    });
  });

  it("borra también la entrada abierta", async () => {
    const started = await startTimer(actor, buenosAires, { description: "abierta" });

    await deleteEntry(actor, { id: started.running.id });

    expect(await allEntries()).toHaveLength(0);
  });

  it("rechaza la entrada de otra persona y no la borra", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedEntry({ userId: otherId, startedAt: "2026-10-01T11:00:00Z" });

    await expect(deleteEntry(actor, { id: row.id })).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect(await allEntries()).toHaveLength(1);
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
    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.hasAnyEntry).toBe(false);
    expect(state.days).toEqual([]);
    expect(state.running).toBeNull();
    expect(state.canTrack).toBe(true);
    expect(state.serverNow).toBe(now.toISOString());
  });

  it("muestra solo las entradas propias", async () => {
    const otherId = await seedMember(workspaceId, "member");
    await seedEntry({
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedEntry({
      description: "mía",
      startedAt: "2026-10-02T13:00:00Z",
      endedAt: "2026-10-02T14:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days).toHaveLength(1);
    expect(state.days[0].entries.map((entry) => entry.description)).toEqual(["mía"]);
  });

  it("agrupa por día local y ordena de lo más reciente a lo más viejo", async () => {
    await seedEntry({
      description: "ayer tarde",
      startedAt: "2026-10-02T01:00:00Z", // 22:00 del 1 de octubre en Buenos Aires
      endedAt: "2026-10-02T02:00:00Z",
    });
    await seedEntry({
      description: "temprano",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedEntry({
      description: "recién",
      startedAt: "2026-10-02T13:00:00Z",
      endedAt: "2026-10-02T14:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-10-02", "2026-10-01"]);
    expect(state.days.map((day) => day.label)).toEqual(["Hoy", "Ayer"]);
    expect(state.days[0].entries.map((entry) => entry.description)).toEqual([
      "recién",
      "temprano",
    ]);
    expect(state.days[0].entries[0].startLabel).toBe("10:00");
  });

  it("pone la entrada que arranca a la medianoche exacta en el día que empieza", async () => {
    await seedEntry({
      startedAt: "2026-10-02T03:00:00Z", // 00:00 del 2 de octubre en Buenos Aires
      endedAt: "2026-10-02T04:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-10-02"]);
    expect(state.days[0].entries[0].startLabel).toBe("00:00");
  });

  it("suma los totales del día en segundos y los formatea una sola vez", async () => {
    await seedEntry({
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T11:00:40Z",
    });
    await seedEntry({
      startedAt: "2026-10-02T12:00:00Z",
      endedAt: "2026-10-02T12:00:40Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days[0].entries.map((entry) => entry.durationLabel)).toEqual([
      "0:00",
      "0:00",
    ]);
    expect(state.days[0].closedSeconds).toBe(80);
    expect(state.days[0].closedTotalLabel).toBe("0:01");
  });

  it("deja la entrada que cruza la medianoche en su día de inicio con el superíndice", async () => {
    await seedEntry({
      startedAt: "2026-10-01T11:00:00Z", // 08:00 del 1 de octubre
      endedAt: "2026-10-02T05:00:00Z", // 02:00 del 2 de octubre
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days).toHaveLength(1);
    expect(state.days[0].date).toBe("2026-10-01");
    expect(state.days[0].closedSeconds).toBe(18 * 3600);
    const [entry] = state.days[0].entries;
    expect(entry.startLabel).toBe("08:00");
    expect(entry.endLabel).toBe("02:00");
    expect(entry.extraDays).toBe(1);
  });

  it("recalcula los grupos al cambiar la zona horaria del workspace", async () => {
    await seedEntry({
      startedAt: "2026-10-02T01:00:00Z", // 22:00 del 1 en Buenos Aires, 03:00 del 2 en Madrid
      endedAt: "2026-10-02T02:00:00Z",
    });

    const local = await getTrackerState(actor, buenosAires, now);
    const remote = await getTrackerState(actor, madrid, now);

    expect(local.days[0].date).toBe("2026-10-01");
    expect(local.days[0].entries[0].startLabel).toBe("22:00");
    expect(remote.days[0].date).toBe("2026-10-02");
    expect(remote.days[0].entries[0].startLabel).toBe("03:00");
    expect(await allEntries()).toHaveLength(1);
  });

  it("deja el timer activo fuera de la lista pero crea su grupo vacío", async () => {
    await seedEntry({ description: "corriendo", startedAt: "2026-09-30T11:00:00Z" });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.running?.description).toBe("corriendo");
    expect(state.running?.endedAt).toBeNull();
    expect(state.running?.durationSeconds).toBeNull();
    expect(state.hasAnyEntry).toBe(true);
    const runningDay = state.days.find((day) => day.isRunningDay);
    expect(runningDay?.date).toBe("2026-09-30");
    expect(runningDay?.entries).toEqual([]);
    expect(runningDay?.closedSeconds).toBe(0);
    expect(state.days.flatMap((day) => day.entries)).toEqual([]);
  });

  it("no dibuja los días sin entradas", async () => {
    await seedEntry({
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedEntry({
      startedAt: "2026-09-29T11:00:00Z",
      endedAt: "2026-09-29T12:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-10-02", "2026-09-29"]);
  });

  it("corta en catorce días cuando hay entradas recientes", async () => {
    await seedEntry({
      description: "de hoy",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedEntry({
      description: "del borde",
      startedAt: "2026-09-19T11:00:00Z",
      endedAt: "2026-09-19T12:00:00Z",
    });
    await seedEntry({
      description: "fuera de la ventana",
      startedAt: "2026-09-18T11:00:00Z",
      endedAt: "2026-09-18T12:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-10-02", "2026-09-19"]);
  });

  it("extiende la ventana hasta el último día con entradas", async () => {
    await seedEntry({
      description: "de hace meses",
      startedAt: "2026-07-15T11:00:00Z",
      endedAt: "2026-07-15T12:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.hasAnyEntry).toBe(true);
    expect(state.days).toHaveLength(1);
    expect(state.days[0].date).toBe("2026-07-15");
    expect(state.days[0].label).toBe("mié, 15/07");
  });

  it("extiende la ventana hasta el día en que arrancó el timer activo", async () => {
    await seedEntry({ description: "de hace días", startedAt: "2026-08-20T11:00:00Z" });
    await seedEntry({
      description: "cerrada vieja",
      startedAt: "2026-08-21T11:00:00Z",
      endedAt: "2026-08-21T12:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-08-21", "2026-08-20"]);
    expect(state.days.find((day) => day.isRunningDay)?.date).toBe("2026-08-20");
  });

  it("deja detener un timer que lleva días corriendo", async () => {
    const row = await seedEntry({ startedAt: "2026-09-30T11:00:00Z" });

    const result = await stopTimer(actor, buenosAires, { id: row.id });

    expect(result.stopped.durationSeconds).toBeGreaterThan(24 * 3600);
    expect(result.stopped.extraDays).toBeGreaterThan(0);
  });

  it("deja la pantalla en solo lectura con la membresía desactivada", async () => {
    await seedEntry({
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });

    const state = await getTrackerState(
      { ...actor, status: "inactive" },
      buenosAires,
      now,
    );

    expect(state.canTrack).toBe(false);
    expect(state.days).toHaveLength(1);
  });
});

describe("TimeEntryError", () => {
  it("lleva el código del dominio y no un string suelto", async () => {
    const error = await deleteEntry(actor, {
      id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TimeEntryError);
  });
});

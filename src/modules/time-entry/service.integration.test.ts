import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/server/permissions";
import { warmPool } from "@/test/concurrency";
import { buenosAires, seedMember, seedTimeEntry, seedWorkspace } from "@/test/factories";
import { allTimeEntries, auditFor } from "@/test/queries";

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

const madrid = "Europe/Madrid";

/** Lectores en paralelo con los que se tensan las carreras de lectura. */
const READERS = 8;

let workspaceId: string;
let actor: Actor;

function actorFor(userId: string, overrides: Partial<Actor> = {}): Actor {
  return { userId, workspaceId, role: "member", status: "active", ...overrides };
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
    const first = await startTimer(actor, buenosAires, { description: "uno" });
    const second = await startTimer(actor, buenosAires, { description: "dos" });

    expect(second.stopped?.id).toBe(first.running.id);
    expect(second.stopped?.endedAt).toBe(second.running.startedAt);

    const rows = await allTimeEntries();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.endedAt === null)).toHaveLength(1);
  });

  it("escribe un registro de auditoría por cada entrada que toca", async () => {
    const first = await startTimer(actor, buenosAires, { description: "uno" });
    const second = await startTimer(actor, buenosAires, { description: "dos" });

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
        startTimer(actor, buenosAires, { description: `pestaña ${index}` }),
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
    await startTimer(actor, buenosAires, { description: "uno" });

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
    await startTimer(actorFor(otherId), buenosAires, { description: "de otro" });

    const mine = await startTimer(actor, buenosAires, { description: "mío" });

    expect(mine.stopped).toBeNull();
    expect((await allTimeEntries()).filter((row) => row.endedAt === null)).toHaveLength(
      2,
    );
  });

  it("no abre nada cuando la membresía no está activa", async () => {
    for (const status of ["inactive", "invited"] as const) {
      await expect(
        startTimer({ ...actor, status }, buenosAires, { description: "no va" }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
    }
    expect(await allTimeEntries()).toHaveLength(0);
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

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    const rows = await allTimeEntries();
    expect(rows[0].endedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("responde que no existe cuando el id no está", async () => {
    await expect(
      stopTimer(actor, buenosAires, { id: "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b" }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
  });

  it("responde que no existe cuando el id es de otro workspace", async () => {
    const other = await seedWorkspace();
    const row = await seedTimeEntry({
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
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T11:00:00Z",
    });

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect((await allTimeEntries())[0].endedAt).toBeNull();
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
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: future,
    });

    await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "validation",
      message: timeEntryMessages.endBeforeStart,
    });
    expect((await allTimeEntries())[0].endedAt).toBeNull();
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
    const started = await startTimer(actor, buenosAires, { description: "" });

    const result = await updateDescription(actor, buenosAires, {
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

    const result = await updateDescription(actor, buenosAires, {
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
      updateDescription(actor, buenosAires, { id: row.id, description: "mía" }),
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
    const started = await startTimer(actor, buenosAires, { description: "abierta" });

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
    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.hasAnyEntry).toBe(false);
    expect(state.days).toEqual([]);
    expect(state.running).toBeNull();
    expect(state.canTrack).toBe(true);
    expect(state.serverNow).toBe(now.toISOString());
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

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days).toHaveLength(1);
    expect(state.days[0].entries.map((entry) => entry.description)).toEqual(["mía"]);
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
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T03:00:00Z", // 00:00 del 2 de octubre en Buenos Aires
      endedAt: "2026-10-02T04:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-10-02"]);
    expect(state.days[0].entries[0].startLabel).toBe("00:00");
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

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days[0].entries.map((entry) => entry.durationLabel)).toEqual([
      "0:00",
      "0:00",
    ]);
    expect(state.days[0].closedSeconds).toBe(80);
  });

  it("deja la entrada que cruza la medianoche en su día de inicio con el superíndice", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
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
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T01:00:00Z", // 22:00 del 1 en Buenos Aires, 03:00 del 2 en Madrid
      endedAt: "2026-10-02T02:00:00Z",
    });

    const local = await getTrackerState(actor, buenosAires, now);
    const remote = await getTrackerState(actor, madrid, now);

    expect(local.days[0].date).toBe("2026-10-01");
    expect(local.days[0].entries[0].startLabel).toBe("22:00");
    expect(remote.days[0].date).toBe("2026-10-02");
    expect(remote.days[0].entries[0].startLabel).toBe("03:00");
    expect(await allTimeEntries()).toHaveLength(1);
  });

  it("deja el timer activo fuera de la lista pero crea su grupo vacío", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "corriendo",
      startedAt: "2026-09-30T11:00:00Z",
    });

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

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-10-02", "2026-09-29"]);
  });

  it("corta en catorce días cuando hay entradas recientes", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "de hoy",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "del borde",
      startedAt: "2026-09-19T11:00:00Z",
      endedAt: "2026-09-19T12:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "fuera de la ventana",
      startedAt: "2026-09-18T11:00:00Z",
      endedAt: "2026-09-18T12:00:00Z",
    });

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-10-02", "2026-09-19"]);
  });

  it("extiende la ventana hasta el último día con entradas", async () => {
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
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

    const state = await getTrackerState(actor, buenosAires, now);

    expect(state.days.map((day) => day.date)).toEqual(["2026-08-21", "2026-08-20"]);
    expect(state.days.find((day) => day.isRunningDay)?.date).toBe("2026-08-20");
  });

  it("deja detener un timer que lleva días corriendo", async () => {
    const row = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-09-30T11:00:00Z",
    });

    const result = await stopTimer(actor, buenosAires, { id: row.id });

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
      buenosAires,
      now,
    );

    expect(state.canTrack).toBe(false);
    expect(state.days).toHaveLength(1);
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
          getTrackerState(actor, buenosAires, now),
        ),
        deleteEntry(actor, { id: row.id }).then(() => null),
      ]);

      for (const state of states) {
        if (state !== null) {
          expect(state.hasAnyEntry).toBe(state.days.length > 0);
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

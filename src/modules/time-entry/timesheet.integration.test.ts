import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { ProjectPair } from "@/lib/project-pair";
import { DomainError } from "@/server/action";
import { db, type Transaction } from "@/server/db";
import type { Actor } from "@/server/permissions";
import { startOfDayKey } from "@/server/time";
import {
  queueBehindBarrier,
  raceThroughBarrier,
  waitForBlockedBackends,
  warmPool,
} from "@/test/concurrency";
import {
  buenosAires,
  seedClient,
  seedMember,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
  type SeedTimeEntryValues,
} from "@/test/factories";
import { allTimeEntries, auditFor, timeEntriesOf, timeEntryById } from "@/test/queries";
import {
  actorIn,
  failureOf,
  lockRow,
  outcomeWhileLocked,
  tagIdsOfRow,
  workspaceOf,
} from "@/test/time-entry";

import { projectMessages } from "@/modules/project/schema";

import { timeEntryRepository } from "./repository";
import { timeEntryMessages, type SetTimesheetCellValues } from "./schema";
import {
  bulkDeleteEntries,
  getTimesheetState,
  removeTimesheetRow,
  setTimesheetCell,
  stopTimer,
  type TrackerWorkspace,
} from "./service";

const madrid = "Europe/Madrid";

/** La semana del 28/09/2026, que empieza el lunes, y su miércoles. */
const monday = "2026-09-28";
const wednesday = "2026-09-30";

/** El jueves 01/10/2026 a las 12:00 en Buenos Aires: el «hoy» de las lecturas. */
const readNow = new Date("2026-10-01T15:00:00Z");

const noProject: ProjectPair = { projectId: null, taskId: null };

let workspaceId: string;
let actor: Actor;
const workspace = workspaceOf(buenosAires);

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  actor = actorIn(workspaceId, seeded.ownerId, { role: "owner" });
});

/** Una hora de pared de Buenos Aires (-03:00), con o sin segundos, como instante ISO. */
function local(time: string, date = wednesday): string {
  return `${date}T${time}-03:00`;
}

function at(time: string, date = wednesday): Date {
  return new Date(local(time, date));
}

/** Escribe la celda del miércoles «Sin proyecto», salvo lo que se pida. */
function write(
  values: Partial<SetTimesheetCellValues> & { readonly minutes: number },
  options: { readonly as?: Actor; readonly workspace?: TrackerWorkspace } = {},
) {
  return setTimesheetCell(options.as ?? actor, options.workspace ?? workspace, {
    date: wednesday,
    ...noProject,
    ...values,
  });
}

/** Una entrada cerrada propia, salvo que se pida otra cosa. */
function seedOwn(values: Omit<SeedTimeEntryValues, "workspaceId" | "userId">) {
  return seedTimeEntry({ workspaceId, userId: actor.userId, ...values });
}

/** El bloqueo de la celda de `date` con ese par, como lo toma `setTimesheetCell`. */
function holdCell(date: string, pair: ProjectPair, timeZone = buenosAires) {
  return (tx: Transaction) =>
    timeEntryRepository.lockCell(tx, {
      workspaceId,
      userId: actor.userId,
      pair,
      from: startOfDayKey(date, timeZone),
    });
}

/**
 * Lo que termina `work` mientras otra transacción sostiene el bloqueo de
 * `hold`, o `"blocked"` si se trabó esperándolo. Es `outcomeWhileLocked` con
 * cualquier bloqueo, también el consultivo de una celda.
 */
async function outcomeWhileHeld(
  hold: (tx: Transaction) => Promise<unknown>,
  work: () => Promise<unknown>,
) {
  let holding = () => {};
  const held = new Promise<void>((resolve) => {
    holding = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await hold(tx);
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

/** Lo que hay en la base, para comparar antes y después de un pedido que no escribe. */
async function everything() {
  return { entries: await allTimeEntries(), audit: await auditFor("time_entry") };
}

describe("setTimesheetCell: celda vacía (criterio 4: TS-29 … TS-31)", () => {
  it("crea a las 09:00 locales con V minutos, sin descripción ni etiquetas y con el facturable del proyecto", async () => {
    const billable = await seedProject({ workspaceId, billableByDefault: true });
    const plain = await seedProject({ workspaceId, billableByDefault: false });

    const first = await write({ projectId: billable.id, minutes: 90 });
    const second = await write({ projectId: plain.id, minutes: 30 });

    expect(first.entry).toMatchObject({
      startedAt: at("09:00").toISOString(),
      endedAt: at("10:30").toISOString(),
      description: "",
      tags: [],
      billable: true,
      project: { id: billable.id },
      task: null,
    });
    expect(second.entry).toMatchObject({
      startedAt: at("09:00").toISOString(),
      endedAt: at("09:30").toISOString(),
      billable: false,
      project: { id: plain.id },
    });
    const rows = await timeEntriesOf(workspaceId, actor.userId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(await tagIdsOfRow(row.id)).toEqual([]);
    }
  });

  it("con tarea, crea en el par de la fila", async () => {
    const web = await seedProject({ workspaceId });
    const design = await seedTask({ workspaceId, projectId: web.id });

    const result = await write({ projectId: web.id, taskId: design.id, minutes: 45 });

    expect(result.entry).toMatchObject({
      project: { id: web.id },
      task: { id: design.id },
      durationSeconds: 45 * 60,
    });
  });

  it("«Sin proyecto» crea sin proyecto y no facturable (TS-20)", async () => {
    const result = await write({ minutes: 60 });

    expect(result.entry).toMatchObject({
      project: null,
      task: null,
      billable: false,
      startedAt: at("09:00").toISOString(),
      endedAt: at("10:00").toISOString(),
    });
  });

  it("el fin es el inicio más V en instantes: Madrid, 20 h desde el 28/03/2026 (ADR 0018)", async () => {
    const result = await write(
      { date: "2026-03-28", minutes: 20 * 60 },
      { workspace: workspaceOf(madrid) },
    );

    // 09:00 (+01:00) del 28 y 20 horas reales después: las 06:00 (+02:00) del
    // 29. El rótulo convertido daría las 05:00, 19 horas.
    expect(result.entry).toMatchObject({
      startedAt: "2026-03-28T08:00:00.000Z",
      endedAt: "2026-03-29T04:00:00.000Z",
      durationSeconds: 20 * 3600,
    });
  });
});

describe("setTimesheetCell: una entrada (criterio 5: TS-33)", () => {
  it("conserva el inicio con sus segundos y lleva el fin a inicio + V (TS-106)", async () => {
    const tag = await seedTag({ workspaceId });
    const web = await seedProject({ workspaceId, billableByDefault: false });
    const timer = await seedOwn({
      description: "del timer",
      projectId: web.id,
      billable: true,
      tagIds: [tag.id],
      startedAt: local("10:00:40"),
      endedAt: local("11:31:22"),
    });

    const result = await write({ projectId: web.id, minutes: 120 });

    expect(result.entry).toMatchObject({
      id: timer.id,
      startedAt: at("10:00:40").toISOString(),
      endedAt: at("12:00:40").toISOString(),
      durationLabel: "2:00",
      description: "del timer",
      billable: true,
      tags: [{ id: tag.id }],
    });
    expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(1);
  });

  it("una que cruza el atraso de Madrid del 25/10/2026 dura dos horas reales (TS-107)", async () => {
    // 01:30 a 02:30 (+02:00) del 25: una hora. Con 2:00 termina a las 02:30
    // (+01:00), dos horas reales después del inicio.
    const entry = await seedOwn({
      startedAt: "2026-10-24T23:30:00Z",
      endedAt: "2026-10-25T00:30:00Z",
    });

    await write({ date: "2026-10-25", minutes: 120 }, { workspace: workspaceOf(madrid) });

    expect(await timeEntryById(entry.id)).toMatchObject({
      startedAt: new Date("2026-10-24T23:30:00Z"),
      endedAt: new Date("2026-10-25T01:30:00Z"),
    });
  });

  it("achica una de más de un día (TS-104)", async () => {
    const entry = await seedOwn({
      startedAt: local("10:00"),
      endedAt: local("17:00", "2026-10-01"),
    });

    await write({ minutes: 60 });

    expect(await timeEntryById(entry.id)).toMatchObject({
      startedAt: at("10:00"),
      endedAt: at("11:00"),
    });
  });
});

describe("setTimesheetCell: varias entradas (criterio 6: TS-34, TS-120)", () => {
  async function seedTwo() {
    const web = await seedProject({ workspaceId });
    const ta = await seedTag({ workspaceId, name: "ta" });
    const tb = await seedTag({ workspaceId, name: "tb" });
    const a = await seedOwn({
      description: "a",
      projectId: web.id,
      billable: false,
      tagIds: [ta.id],
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });
    const b = await seedOwn({
      description: "b",
      projectId: web.id,
      billable: true,
      tagIds: [tb.id],
      startedAt: local("12:00"),
      endedAt: local("13:00"),
    });
    return { web, ta, tb, a, b };
  }

  it("subir crea V − S desde el fin de la que termina más tarde, con los campos de la que empieza más tarde", async () => {
    const { web, tb, a, b } = await seedTwo();

    const result = await write({ projectId: web.id, minutes: 180 });

    expect(result.entry).toMatchObject({
      startedAt: at("13:00").toISOString(),
      endedAt: at("14:00").toISOString(),
      description: "b",
      billable: true,
      tags: [{ id: tb.id }],
      project: { id: web.id },
    });
    expect(result.entry?.id).not.toBe(a.id);
    expect(result.entry?.id).not.toBe(b.id);
    expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(3);
  });

  it("bajar adelanta el fin de la que empieza más tarde", async () => {
    const { web, a, b } = await seedTwo();

    const result = await write({ projectId: web.id, minutes: 90 });

    expect(result.entry).toMatchObject({ id: b.id, endedAt: at("12:30").toISOString() });
    expect(await timeEntryById(a.id)).toMatchObject({ endedAt: at("11:00") });
  });

  it("la que empieza más tarde no es la que termina más tarde (TS-120)", async () => {
    const long = await seedOwn({
      description: "larga",
      startedAt: local("09:00"),
      endedAt: local("15:00"),
    });
    const short = await seedOwn({
      description: "corta",
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });

    const result = await write({ minutes: 7 * 60 + 30 });

    expect(result.entry).toMatchObject({
      startedAt: at("15:00").toISOString(),
      endedAt: at("15:30").toISOString(),
      description: "corta",
    });
    expect(await timeEntryById(long.id)).toMatchObject({ endedAt: at("15:00") });
    expect(await timeEntryById(short.id)).toMatchObject({ endedAt: at("11:00") });
  });

  it("bajar con la larga y la corta achica la corta, aunque la larga termine después", async () => {
    const long = await seedOwn({ startedAt: local("09:00"), endedAt: local("15:00") });
    const short = await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });

    const result = await write({ minutes: 6 * 60 + 30 });

    expect(result.entry).toMatchObject({
      id: short.id,
      endedAt: at("10:30").toISOString(),
    });
    expect(await timeEntryById(long.id)).toMatchObject({ endedAt: at("15:00") });
  });

  it("con el mismo inicio, bajar achica la de created_at más reciente, sea cual sea el id", async () => {
    const [low, high] = [randomUUID(), randomUUID()].sort();
    // La de id mayor se creó antes: el desempate por id daría la otra.
    const older = await seedOwn({
      id: high,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
      createdAt: "2026-09-30T13:00:00Z",
    });
    const newer = await seedOwn({
      id: low,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
      createdAt: "2026-09-30T13:05:00Z",
    });

    const result = await write({ minutes: 90 });

    expect(result.entry).toMatchObject({
      id: newer.id,
      endedAt: at("10:30").toISOString(),
    });
    expect(await timeEntryById(older.id)).toMatchObject({ endedAt: at("11:00") });
  });
});

describe("setTimesheetCell: los rechazos de TS-79 (criterio 7)", () => {
  const cellNeedsEntryEdit = {
    code: "validation",
    message: timeEntryMessages.cellNeedsEntryEdit,
  };

  it("subir con la que termina más tarde en otro día: cruza la medianoche (TS-119)", async () => {
    await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    await seedOwn({ startedAt: local("22:00"), endedAt: local("01:00", "2026-10-01") });
    const before = await everything();

    expect(await failureOf(write({ minutes: 5 * 60 }))).toMatchObject(cellNeedsEntryEdit);
    expect(await everything()).toEqual(before);
  });

  it("subir con la que termina más tarde justo a las 00:00 del día siguiente (TS-119)", async () => {
    await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    await seedOwn({ startedAt: local("22:00"), endedAt: local("00:00", "2026-10-01") });
    const before = await everything();

    expect(await failureOf(write({ minutes: 4 * 60 }))).toMatchObject(cellNeedsEntryEdit);
    expect(await everything()).toEqual(before);
  });

  it("bajar dejando a la que empieza más tarde con menos de un minuto (D13-4)", async () => {
    await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    // 0:01:59: S = 61 y V = 60 le dejan 59 segundos.
    await seedOwn({ startedAt: local("12:00"), endedAt: local("12:01:59") });
    const before = await everything();

    expect(await failureOf(write({ minutes: 60 }))).toMatchObject(cellNeedsEntryEdit);
    expect(await failureOf(write({ minutes: 30 }))).toMatchObject(cellNeedsEntryEdit);
    expect(await everything()).toEqual(before);
  });

  it("bajar con una de cero minutos que empieza más tarde (TS-118)", async () => {
    await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    await seedOwn({ startedAt: local("12:00"), endedAt: local("12:00") });
    const before = await everything();

    expect(await failureOf(write({ minutes: 59 }))).toMatchObject(cellNeedsEntryEdit);
    expect(await everything()).toEqual(before);
  });
});

describe("setTimesheetCell: sin cambios (criterio 8: TS-36, TS-105)", () => {
  it("una celda de 1:30:42 con 90 responde null, conserva sus segundos y no deja constancia", async () => {
    const entry = await seedOwn({
      startedAt: local("10:00:00"),
      endedAt: local("11:30:42"),
    });
    const before = await everything();

    expect(await write({ minutes: 90 })).toEqual({ entry: null });
    expect(await everything()).toEqual(before);
    expect(await timeEntryById(entry.id)).toMatchObject({ endedAt: at("11:30:42") });
  });

  it("con varias que ya suman lo que se muestra, tampoco escribe", async () => {
    await seedOwn({ startedAt: local("10:00"), endedAt: local("10:45:40") });
    await seedOwn({ startedAt: local("11:00"), endedAt: local("11:44:40") });
    const before = await everything();

    expect(await write({ minutes: 90 })).toEqual({ entry: null });
    expect(await everything()).toEqual(before);
  });
});

describe("setTimesheetCell: el punto fijo (criterio 9: TS-37)", () => {
  it.each([
    ["una celda vacía", async () => {}, 90],
    [
      "una entrada",
      async () => {
        await seedOwn({ startedAt: local("10:00:40"), endedAt: local("11:31:22") });
      },
      120,
    ],
    [
      "subir con varias",
      async () => {
        await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
        await seedOwn({ startedAt: local("12:00"), endedAt: local("13:00") });
      },
      180,
    ],
    [
      "bajar con varias",
      async () => {
        await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
        await seedOwn({ startedAt: local("12:00"), endedAt: local("13:00") });
      },
      90,
    ],
  ] as const)("repetir %s no escribe ni deja constancia", async (_, seed, minutes) => {
    await seed();

    const first = await write({ minutes });
    const after = await everything();
    const second = await write({ minutes });

    expect(first.entry).not.toBeNull();
    expect(second).toEqual({ entry: null });
    expect(await everything()).toEqual(after);
  });
});

describe("setTimesheetCell: una celda a la vez (criterio 10, ADR 0019)", () => {
  it("dos pedidos encolados detrás del bloqueo de una celda vacía dejan una sola entrada, del segundo", async () => {
    await warmPool(3);

    const results = await queueBehindBarrier(holdCell(wednesday, noProject), [
      () => write({ minutes: 60 }),
      () => write({ minutes: 120 }),
    ]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const rows = await timeEntriesOf(workspaceId, actor.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ startedAt: at("09:00"), endedAt: at("11:00") });
  });

  it("sobre una celda con una entrada, el valor final es el del segundo", async () => {
    const entry = await seedOwn({ startedAt: local("10:00"), endedAt: local("10:30") });
    await warmPool(3);

    const results = await queueBehindBarrier(holdCell(wednesday, noProject), [
      () => write({ minutes: 60 }),
      () => write({ minutes: 120 }),
    ]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const rows = await timeEntriesOf(workspaceId, actor.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: entry.id, endedAt: at("12:00") });
    expect((await auditFor("time_entry", entry.id)).map((row) => row.action)).toEqual([
      "timeEntry.updateFromCell",
      "timeEntry.updateFromCell",
    ]);
  });
});

describe("setTimesheetCell: el timer (criterio 11: TS-49, TS-50, TS-116)", () => {
  it("una celda cuyo único contenido es la que corre está vacía: crea y no toca la que corre", async () => {
    const running = await seedOwn({ startedAt: local("08:00"), endedAt: null });

    const result = await write({ minutes: 30 });

    expect(result.entry).toMatchObject({
      startedAt: at("09:00").toISOString(),
      endedAt: at("09:30").toISOString(),
    });
    expect(await timeEntryById(running.id)).toMatchObject({
      startedAt: at("08:00"),
      endedAt: null,
    });
  });

  it("con una cerrada y la que corre, edita la cerrada (TS-116)", async () => {
    const closed = await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    const running = await seedOwn({ startedAt: local("12:00"), endedAt: null });

    const result = await write({ minutes: 30 });

    expect(result.entry).toMatchObject({
      id: closed.id,
      endedAt: at("10:30").toISOString(),
    });
    expect(await timeEntryById(running.id)).toMatchObject({ endedAt: null });
  });
});

describe("setTimesheetCell: el día (criterio 12)", () => {
  it("un día anterior al 2000-01-01 responde beforeFloor sin escribir (TS-81)", async () => {
    expect(await failureOf(write({ date: "1999-12-31", minutes: 60 }))).toMatchObject({
      code: "validation",
      message: timeEntryMessages.beforeFloor,
    });
    expect(await everything()).toEqual({ entries: [], audit: [] });
  });

  it("el piso responde antes que un proyecto archivado (§4.8)", async () => {
    const archived = await seedProject({ workspaceId, archived: true });

    expect(
      await failureOf(write({ date: "1999-12-31", projectId: archived.id, minutes: 60 })),
    ).toMatchObject({ code: "validation", message: timeEntryMessages.beforeFloor });
  });

  it("el 9999-12-31, cuyo día siguiente no tiene clave de cuatro cifras, responde invalidDate", async () => {
    expect(await failureOf(write({ date: "9999-12-31", minutes: 60 }))).toMatchObject({
      code: "validation",
      message: timeEntryMessages.invalidDate,
    });
    expect(await everything()).toEqual({ entries: [], audit: [] });
  });

  it("un fin que pasaría del año 9999 en UTC responde invalidDate", async () => {
    // 23:59 del 30/12/9999 en Honolulu (-10:00) son las 09:59 del 31 en UTC;
    // 23:59 después ya es el año 10000.
    const honolulu = workspaceOf("Pacific/Honolulu");
    await seedOwn({ startedAt: "9999-12-31T09:59:00Z", endedAt: "9999-12-31T10:00:00Z" });

    expect(
      await failureOf(
        write({ date: "9999-12-30", minutes: 1439 }, { workspace: honolulu }),
      ),
    ).toMatchObject({ code: "validation", message: timeEntryMessages.invalidDate });
  });

  it("Pacific/Apia, 2011-12-30: responde nonexistentClock (ADR 0018)", async () => {
    expect(
      await failureOf(
        write(
          { date: "2011-12-30", minutes: 60 },
          { workspace: workspaceOf("Pacific/Apia") },
        ),
      ),
    ).toMatchObject({ code: "validation", message: timeEntryMessages.nonexistentClock });
    expect(await everything()).toEqual({ entries: [], audit: [] });
  });

  it("un día futuro se escribe (TS-108)", async () => {
    const result = await write({ date: "2030-01-15", minutes: 60 });

    expect(result.entry).toMatchObject({ dayDate: "2030-01-15" });
  });
});

describe("setTimesheetCell: las referencias (criterio 13: TS-77, TS-78, D13-5)", () => {
  const projectUnavailable = {
    code: "not_found",
    message: projectMessages.projectUnavailable,
  };

  it("una celda vacía de un proyecto archivado, de un privado sin acceso o de una tarea hecha", async () => {
    const archived = await seedProject({ workspaceId, archived: true });
    const hidden = await seedProject({ workspaceId, isPublic: false });
    const web = await seedProject({ workspaceId });
    const done = await seedTask({ workspaceId, projectId: web.id, status: "done" });

    expect(await failureOf(write({ projectId: archived.id, minutes: 60 }))).toMatchObject(
      projectUnavailable,
    );
    expect(await failureOf(write({ projectId: hidden.id, minutes: 60 }))).toMatchObject(
      projectUnavailable,
    );
    expect(
      await failureOf(write({ projectId: web.id, taskId: done.id, minutes: 60 })),
    ).toMatchObject({ code: "not_found", message: projectMessages.taskUnavailable });
    expect(await everything()).toEqual({ entries: [], audit: [] });
  });

  it("una celda con una entrada de un proyecto archivado se edita (TS-21, TS-113)", async () => {
    const archived = await seedProject({ workspaceId, archived: true });
    const entry = await seedOwn({
      projectId: archived.id,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });

    const result = await write({ projectId: archived.id, minutes: 30 });

    expect(result.entry).toMatchObject({
      id: entry.id,
      endedAt: at("10:30").toISOString(),
    });
  });

  it("bajar una con varias de un proyecto archivado sigue (TS-113)", async () => {
    const archived = await seedProject({ workspaceId, archived: true });
    await seedOwn({
      projectId: archived.id,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });
    const late = await seedOwn({
      projectId: archived.id,
      startedAt: local("12:00"),
      endedAt: local("13:00"),
    });

    const result = await write({ projectId: archived.id, minutes: 90 });

    expect(result.entry).toMatchObject({ id: late.id });
  });

  it("subir una con varias de un proyecto archivado responde projectUnavailable", async () => {
    const archived = await seedProject({ workspaceId, archived: true });
    await seedOwn({
      projectId: archived.id,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });
    await seedOwn({
      projectId: archived.id,
      startedAt: local("12:00"),
      endedAt: local("13:00"),
    });
    const before = await everything();

    expect(
      await failureOf(write({ projectId: archived.id, minutes: 180 })),
    ).toMatchObject(projectUnavailable);
    expect(await everything()).toEqual(before);
  });

  it("subir copiando una etiqueta archivada responde tagUnavailable", async () => {
    const archivedTag = await seedTag({ workspaceId, archived: true });
    await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    await seedOwn({
      tagIds: [archivedTag.id],
      startedAt: local("12:00"),
      endedAt: local("13:00"),
    });
    const before = await everything();

    expect(await failureOf(write({ minutes: 180 }))).toMatchObject({
      code: "not_found",
      message: projectMessages.tagUnavailable,
    });
    expect(await everything()).toEqual(before);
  });

  it("una etiqueta archivada en la entrada que se edita no impide bajar", async () => {
    const archivedTag = await seedTag({ workspaceId, archived: true });
    await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    const late = await seedOwn({
      tagIds: [archivedTag.id],
      startedAt: local("12:00"),
      endedAt: local("13:00"),
    });

    const result = await write({ minutes: 90 });

    expect(result.entry).toMatchObject({ id: late.id, tags: [{ id: archivedTag.id }] });
  });
});

describe("setTimesheetCell: solo lo propio (criterio 14: TS-05, TS-76, TS-84)", () => {
  it("la entrada de otra persona con el mismo par y día no cuenta ni se toca", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const foreign = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });

    const result = await write({ minutes: 60 });

    expect(result.entry).toMatchObject({ startedAt: at("09:00").toISOString() });
    expect(result.entry?.id).not.toBe(foreign.id);
    expect(await timeEntryById(foreign.id)).toMatchObject({ endedAt: at("11:00") });
  });

  it("la membresía desactivada recibe forbidden sin esperar el bloqueo de la celda", async () => {
    const inactive = { ...actor, status: "inactive" as const };

    const outcome = await outcomeWhileHeld(holdCell(wednesday, noProject), () =>
      write({ minutes: 60 }, { as: inactive }),
    );

    expect(outcome).toBeInstanceOf(DomainError);
    expect(outcome).toMatchObject({
      code: "forbidden",
      message: timeEntryMessages.forbidden,
    });
  });

  it("la membresía desactivada recibe forbidden sin esperar el bloqueo de una entrada de la celda", async () => {
    const entry = await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    const inactive = { ...actor, status: "inactive" as const };

    const outcome = await outcomeWhileLocked(entry.id, () =>
      write({ minutes: 30 }, { as: inactive }),
    );

    expect(outcome).toMatchObject({ code: "forbidden" });
    expect(await timeEntryById(entry.id)).toMatchObject({ endedAt: at("11:00") });
  });

  it("removeTimesheetRow con la membresía desactivada responde forbidden sin esperar ni borrar", async () => {
    const entry = await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    const inactive = { ...actor, status: "inactive" as const };

    const outcome = await outcomeWhileLocked(entry.id, () =>
      removeTimesheetRow(inactive, workspace, {
        weekStart: monday,
        ...noProject,
        ids: [entry.id],
      }),
    );

    expect(outcome).toMatchObject({ code: "forbidden" });
    expect(await timeEntryById(entry.id)).toBeDefined();
  });
});

describe("removeTimesheetRow (criterio 15: TS-52 … TS-54, D13-6)", () => {
  function remove(pair: ProjectPair, ids: readonly string[], weekStart = monday) {
    return removeTimesheetRow(actor, workspace, { weekStart, ...pair, ids: [...ids] });
  }

  async function seedRow() {
    const web = await seedProject({ workspaceId });
    const design = await seedTask({ workspaceId, projectId: web.id });
    const otherId = await seedMember(workspaceId, "member");
    const pair = { projectId: web.id, taskId: null };
    const inRow = [
      await seedOwn({
        ...pair,
        startedAt: local("10:00", monday),
        endedAt: local("11:00", monday),
      }),
      await seedOwn({ ...pair, startedAt: local("10:00"), endedAt: local("12:00") }),
    ];
    const outside = {
      nextWeek: await seedOwn({
        ...pair,
        startedAt: local("10:00", "2026-10-05"),
        endedAt: local("11:00", "2026-10-05"),
      }),
      previousWeek: await seedOwn({
        ...pair,
        startedAt: local("23:00", "2026-09-27"),
        endedAt: local("23:30", "2026-09-27"),
      }),
      withTask: await seedOwn({
        projectId: web.id,
        taskId: design.id,
        startedAt: local("10:00"),
        endedAt: local("11:00"),
      }),
      noProject: await seedOwn({ startedAt: local("14:00"), endedAt: local("15:00") }),
      running: await seedOwn({
        ...pair,
        startedAt: local("09:00", "2026-10-02"),
        endedAt: null,
      }),
      foreign: await seedTimeEntry({
        workspaceId,
        userId: otherId,
        ...pair,
        startedAt: local("10:00"),
        endedAt: local("11:00"),
      }),
    };
    return { web, design, pair, inRow, outside };
  }

  it("borra solo las de ids que son cerradas propias del par en los siete días", async () => {
    const { pair, inRow, outside } = await seedRow();
    const ids = [...inRow, ...Object.values(outside)].map((row) => row.id);

    const result = await remove(pair, ids);

    expect(result).toEqual({ ids: inRow.map((row) => row.id).sort() });
    for (const row of inRow) {
      expect(await timeEntryById(row.id)).toBeUndefined();
    }
    for (const row of Object.values(outside)) {
      expect(await timeEntryById(row.id)).toBeDefined();
    }
  });

  it("(P, —) no borra (P, T), y (P, T) borra solo la de la tarea", async () => {
    const { web, design, inRow, outside } = await seedRow();
    const ids = [...inRow, outside.withTask].map((row) => row.id);

    const result = await remove({ projectId: web.id, taskId: design.id }, ids);

    expect(result).toEqual({ ids: [outside.withTask.id] });
    for (const row of inRow) {
      expect(await timeEntryById(row.id)).toBeDefined();
    }
  });

  it("«Sin proyecto» borra solo las sin proyecto", async () => {
    const { inRow, outside } = await seedRow();
    const ids = [...inRow, ...Object.values(outside)].map((row) => row.id);

    const result = await remove(noProject, ids);

    expect(result).toEqual({ ids: [outside.noProject.id] });
    expect(await allTimeEntries()).toHaveLength(
      inRow.length + Object.keys(outside).length - 1,
    );
  });

  it("lo agregado a la fila después de la lectura y el timer detenido después no se borran, y la fila vuelve con ellos", async () => {
    const { pair, outside } = await seedRow();
    const read = await getTimesheetState(actor, workspace, { day: monday }, readNow);
    const row = read.rows.find(
      (candidate) => candidate.project?.id === pair.projectId && candidate.task === null,
    );
    expect(row?.entryIds).toHaveLength(2);
    const added = await seedOwn({
      ...pair,
      startedAt: local("16:00"),
      endedAt: local("17:00"),
    });
    await stopTimer(actor, workspace, { id: outside.running.id });

    const result = await remove(pair, row?.entryIds ?? []);

    expect(result.ids).toEqual(row?.entryIds);
    const after = await getTimesheetState(actor, workspace, { day: monday }, readNow);
    const back = after.rows.find(
      (candidate) => candidate.project?.id === pair.projectId && candidate.task === null,
    );
    expect(back?.entryIds).toEqual([added.id, outside.running.id].sort());
  });

  it("repetida responde { ids: [] } sin constancias", async () => {
    const { pair, inRow } = await seedRow();
    const ids = inRow.map((row) => row.id);

    await remove(pair, ids);
    const after = await everything();
    const again = await remove(pair, ids);

    expect(again).toEqual({ ids: [] });
    expect(await everything()).toEqual(after);
  });

  it("la cota es la semana del pedido: una entrada de la semana anterior queda aunque esté en ids", async () => {
    const { pair, outside } = await seedRow();

    expect(await remove(pair, [outside.previousWeek.id])).toEqual({ ids: [] });
    expect(await remove(pair, [outside.previousWeek.id], "2026-09-21")).toEqual({
      ids: [outside.previousWeek.id],
    });
  });

  it("una semana cuyo final no tiene clave de cuatro cifras responde invalidDate", async () => {
    expect(
      await failureOf(remove(noProject, [randomUUID()], "9999-12-27")),
    ).toMatchObject({ code: "validation", message: timeEntryMessages.invalidDate });
  });
});

describe("removeTimesheetRow no se traba (criterio 16)", () => {
  it("una fila y un borrado masivo sobre las mismas entradas en orden opuesto terminan los dos", async () => {
    const [first, middle, last] = [randomUUID(), randomUUID(), randomUUID()].sort();
    // El orden físico y el de inicio, opuestos al de id: un borrado por
    // predicado bloquearía de la última a la primera.
    for (const [id, date] of [
      [last, "2026-09-30"],
      [middle, "2026-09-29"],
      [first, "2026-09-28"],
    ] as const) {
      await seedOwn({
        id,
        startedAt: local("10:00", date),
        endedAt: local("11:00", date),
      });
    }
    await warmPool(3);

    const results = await raceThroughBarrier(lockRow(middle), [
      () => remove([first, middle, last]),
      () => bulkDeleteEntries(actor, { ids: [last, middle, first] }),
    ]);

    expect(results).toHaveLength(2);
    expect(await allTimeEntries()).toEqual([]);

    function remove(ids: readonly string[]) {
      return removeTimesheetRow(actor, workspace, {
        weekStart: monday,
        ...noProject,
        ids: [...ids],
      });
    }
  });

  it("una escritura de celda encolada detrás de quitar la fila crea sobre la celda ya vacía", async () => {
    const entry = await seedOwn({ startedAt: local("10:00"), endedAt: local("11:00") });
    await warmPool(3);

    const [removed, written] = await queueBehindBarrier(lockRow(entry.id), [
      () =>
        removeTimesheetRow(actor, workspace, {
          weekStart: monday,
          ...noProject,
          ids: [entry.id],
        }),
      () => write({ minutes: 30 }),
    ]);

    expect(removed).toEqual({ status: "fulfilled", value: { ids: [entry.id] } });
    expect(written.status).toBe("fulfilled");
    const rows = await timeEntriesOf(workspaceId, actor.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ startedAt: at("09:00"), endedAt: at("09:30") });
  });
});

describe("getTimesheetState (criterio 17)", () => {
  it("las filas en el orden de TS-15, con cliente, sin cliente y «Sin proyecto», y sus entryIds", async () => {
    const alfa = await seedClient({ workspaceId, name: "Alfa" });
    const beta = await seedClient({ workspaceId, name: "Beta" });
    const web = await seedProject({
      workspaceId,
      clientId: alfa.id,
      name: "Web",
      color: "pink",
    });
    const zeta = await seedProject({ workspaceId, clientId: beta.id, name: "Zeta" });
    const internal = await seedProject({ workspaceId, name: "Interno" });
    const app = await seedProject({ workspaceId, clientId: alfa.id, name: "App" });
    const layout = await seedTask({ workspaceId, projectId: web.id, name: "Maquetado" });
    const copy = await seedTask({ workspaceId, projectId: web.id, name: "Copy" });
    const entry = (projectId: string | null, taskId: string | null, date = wednesday) =>
      seedOwn({
        projectId,
        taskId,
        startedAt: local("10:00", date),
        endedAt: local("11:00", date),
      });
    // Sembradas en desorden: el orden no sale de la base.
    const none = await entry(null, null);
    const internalRow = await entry(internal.id, null);
    const zetaRow = await entry(zeta.id, null);
    const layoutRow = await entry(web.id, layout.id);
    const webRow = [await entry(web.id, null), await entry(web.id, null, monday)];
    const copyRow = await entry(web.id, copy.id);
    const appRow = await entry(app.id, null);

    const state = await getTimesheetState(actor, workspace, { day: wednesday }, readNow);

    expect(
      state.rows.map((row) => [
        row.client?.name ?? null,
        row.project?.name ?? null,
        row.task?.name ?? null,
      ]),
    ).toEqual([
      ["Alfa", "App", null],
      ["Alfa", "Web", null],
      ["Alfa", "Web", "Copy"],
      ["Alfa", "Web", "Maquetado"],
      ["Beta", "Zeta", null],
      [null, "Interno", null],
      [null, null, null],
    ]);
    expect(state.rows.map((row) => row.entryIds)).toEqual([
      [appRow.id],
      webRow.map((row) => row.id).sort(),
      [copyRow.id],
      [layoutRow.id],
      [zetaRow.id],
      [internalRow.id],
      [none.id],
    ]);
    expect(state.rows[1]).toMatchObject({
      project: { id: web.id, name: "Web", color: "pink" },
      task: null,
      client: { id: alfa.id, name: "Alfa" },
      closedSeconds: 7200,
      cells: [
        { date: monday, closedSeconds: 3600, entryCount: 1 },
        { date: wednesday, closedSeconds: 3600, entryCount: 1 },
      ],
    });
    expect(state.rows[6]).toMatchObject({ project: null, task: null, client: null });
  });

  it("cada entrada va a la celda del día local de su inicio (TS-07, TS-102)", async () => {
    // 22:00 del miércoles en Buenos Aires es jueves en UTC; cruza la medianoche
    // y cuenta entera en el miércoles.
    const late = await seedOwn({
      startedAt: local("22:00"),
      endedAt: local("02:00", "2026-10-01"),
    });
    const two = [
      await seedOwn({ startedAt: local("10:00"), endedAt: local("10:30:30") }),
      await seedOwn({
        startedAt: local("11:00", "2026-10-01"),
        endedAt: local("11:15", "2026-10-01"),
      }),
    ];

    const state = await getTimesheetState(actor, workspace, { day: wednesday }, readNow);

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].cells).toEqual([
      { date: wednesday, closedSeconds: 4 * 3600 + 30 * 60 + 30, entryCount: 2 },
      { date: "2026-10-01", closedSeconds: 15 * 60, entryCount: 1 },
    ]);
    expect(state.rows[0].entryIds).toEqual([late.id, ...two.map((row) => row.id)].sort());
    expect(state.days.map((day) => day.closedSeconds)).toEqual([
      0,
      0,
      4 * 3600 + 30 * 60 + 30,
      15 * 60,
      0,
      0,
      0,
    ]);
    expect(state.closedSeconds).toBe(4 * 3600 + 45 * 60 + 30);
  });

  it("la semana: días con rótulos, fin de semana, hoy, piso y navegación", async () => {
    const state = await getTimesheetState(actor, workspace, { day: wednesday }, readNow);

    expect(state).toMatchObject({
      todayKey: "2026-10-01",
      canTrack: true,
      weekStart: monday,
      weekLabel: "Esta semana",
      previousStart: "2026-09-21",
      nextStart: "2026-10-05",
      currentStart: monday,
      rows: [],
      closedSeconds: 0,
      storageKey: `clock:planilla:${workspaceId}:${actor.userId}`,
    });
    expect(state.days).toEqual(
      [
        ["2026-09-28", "lun, 28/09", "lunes 28/09"],
        ["2026-09-29", "mar, 29/09", "martes 29/09"],
        ["2026-09-30", "mié, 30/09", "miércoles 30/09"],
        ["2026-10-01", "jue, 01/10", "jueves 01/10"],
        ["2026-10-02", "vie, 02/10", "viernes 02/10"],
        ["2026-10-03", "sáb, 03/10", "sábado 03/10"],
        ["2026-10-04", "dom, 04/10", "domingo 04/10"],
      ].map(([date, label, fullLabel]) => ({
        date,
        label,
        fullLabel,
        isToday: date === "2026-10-01",
        isWeekend: date === "2026-10-03" || date === "2026-10-04",
        beforeFloor: false,
        closedSeconds: 0,
      })),
    );
  });

  it("los días anteriores al piso y el año en los rótulos de otro año (TS-12)", async () => {
    const state = await getTimesheetState(
      actor,
      workspace,
      { day: "2000-01-01" },
      readNow,
    );

    expect(state.weekStart).toBe("1999-12-27");
    expect(state.days.map((day) => [day.date, day.beforeFloor])).toEqual([
      ["1999-12-27", true],
      ["1999-12-28", true],
      ["1999-12-29", true],
      ["1999-12-30", true],
      ["1999-12-31", true],
      ["2000-01-01", false],
      ["2000-01-02", false],
    ]);
    expect(state.days[5]).toMatchObject({
      label: "sáb, 01/01/2000",
      fullLabel: "sábado 01/01/2000",
      isWeekend: true,
    });
  });

  it("la semana de la persona (TS-06) y un día que no es inicio de semana lleva a la suya", async () => {
    const sunday = workspaceOf(buenosAires, 0);

    const state = await getTimesheetState(actor, sunday, { day: wednesday }, readNow);

    expect(state.weekStart).toBe("2026-09-27");
    expect(state.days.map((day) => day.date)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(state.currentStart).toBe("2026-09-27");
  });

  it("otra semana: su rango, y una que no se puede navegar cae a la actual", async () => {
    const other = await getTimesheetState(
      actor,
      workspace,
      { day: "2026-09-16" },
      readNow,
    );
    const missing = await getTimesheetState(
      actor,
      workspace,
      { day: "0001-01-01" },
      readNow,
    );
    const none = await getTimesheetState(actor, workspace, { day: null }, readNow);

    expect(other).toMatchObject({
      weekStart: "2026-09-14",
      weekLabel: "14/09 – 20/09",
      currentStart: monday,
    });
    expect(missing.weekStart).toBe(monday);
    expect(none.weekStart).toBe(monday);
  });

  it("un proyecto archivado conserva su fila con su nombre de ahora (TS-21)", async () => {
    const archived = await seedProject({ workspaceId, name: "Viejo", archived: true });
    await seedOwn({
      projectId: archived.id,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });

    const state = await getTimesheetState(actor, workspace, { day: wednesday }, readNow);

    expect(state.rows.map((row) => row.project?.name)).toEqual(["Viejo"]);
  });

  it("no cuenta la que corre en ninguna celda, fila ni total, ni la de otra persona (TS-49, TS-05)", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const web = await seedProject({ workspaceId });
    await seedOwn({ projectId: web.id, startedAt: local("10:00"), endedAt: null });
    await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: local("10:00"),
      endedAt: local("11:00"),
    });
    const closed = await seedOwn({ startedAt: local("12:00"), endedAt: local("13:00") });

    const state = await getTimesheetState(actor, workspace, { day: wednesday }, readNow);

    expect(state.rows.map((row) => row.entryIds)).toEqual([[closed.id]]);
    expect(state.closedSeconds).toBe(3600);
    expect(state.days[2].closedSeconds).toBe(3600);
  });

  it("sin canTrack con la membresía desactivada, sigue leyendo (TS-76)", async () => {
    const state = await getTimesheetState(
      { ...actor, status: "inactive" },
      workspace,
      { day: wednesday },
      readNow,
    );

    expect(state.canTrack).toBe(false);
  });
});

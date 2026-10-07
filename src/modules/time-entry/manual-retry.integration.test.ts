import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { membership, project, tag } from "@/server/db/schema";
import { ForbiddenError, type Actor } from "@/server/permissions";
import { raceThroughBarrier } from "@/test/concurrency";
import {
  buenosAires,
  seedMember,
  seedProject,
  seedTag,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { allTimeEntries, auditFor, timeEntryById } from "@/test/queries";
import {
  actorIn,
  allEntryTags,
  outcomeWhileLocked,
  workspaceOf,
} from "@/test/time-entry";

import { projectMessages } from "@/modules/project/schema";

import { timeEntryRepository } from "./repository";
import {
  timeEntryMessages,
  updateEntryInput,
  type CreateManualEntryValues,
} from "./schema";
import { createManualEntry, updateEntry, type TrackerWorkspace } from "./service";

/**
 * El slice 2c: el alta manual con el id que elige el cliente (ADR 0007). Los
 * criterios son los de §7 de su contrato.
 */

const workspace = workspaceOf(buenosAires);
const tt77 = { code: "not_found", message: projectMessages.projectUnavailable };
const tt78 = { code: "not_found", message: projectMessages.tagUnavailable };

let workspaceId: string;
let actor: Actor;

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  actor = actorIn(workspaceId, await seedMember(workspaceId, "member"));
});

/** Un alta válida del 1 de octubre, con un id nuevo salvo que se pida otro. */
function manual(
  overrides: Partial<CreateManualEntryValues> = {},
): CreateManualEntryValues {
  return {
    id: randomUUID(),
    description: "reunión",
    date: "2026-10-01",
    start: "09:00",
    end: "10:30",
    projectId: null,
    taskId: null,
    tagIds: [],
    ...overrides,
  };
}

function create(values: CreateManualEntryValues, where: TrackerWorkspace = workspace) {
  return createManualEntry(actor, where, values);
}

/** Lo que una alta puede escribir: las filas, la unión de etiquetas y las constancias. */
async function written() {
  return {
    rows: await allTimeEntries(),
    tags: await allEntryTags(),
    audit: await auditFor("time_entry"),
  };
}

async function archiveProject(id: string) {
  await db.update(project).set({ archivedAt: new Date() }).where(eq(project.id, id));
}

async function archiveTag(id: string) {
  await db.update(tag).set({ archivedAt: new Date() }).where(eq(tag.id, id));
}

describe("el alta con el id del cliente (criterio 2)", () => {
  it("la fila, la respuesta y la constancia llevan el id pedido", async () => {
    const values = manual();

    const { created } = await create(values);

    expect(created.id).toBe(values.id);
    const row = await timeEntryById(values.id);
    expect(row).toMatchObject({ userId: actor.userId, workspaceId });
    expect(row?.endedAt).not.toBeNull();
    expect(
      (await auditFor("time_entry")).map((entry) => [entry.action, entry.entityId]),
    ).toEqual([["timeEntry.createManual", values.id]]);
  });
});

describe("el reintento de un alta aplicada (criterios 3 y 4)", () => {
  it("en secuencia responde lo mismo y no escribe nada", async () => {
    const label = await seedTag({ workspaceId });
    const values = manual({ tagIds: [label.id] });
    const first = await create(values);
    const before = await written();

    const retry = await create(values);

    expect(retry).toEqual(first);
    expect(await written()).toEqual(before);
  });

  it("dos pedidos con el mismo id, obligados a cruzarse, responden los dos ese id y dejan una fila", async () => {
    const values = manual();

    // La barrera inserta la misma fila sin commitear: los dos pedidos no la
    // ven al buscar la propia, se traban en el insert y, cuando la barrera se
    // deshace, uno inserta y el otro choca con la clave primaria y relee.
    const results = await raceThroughBarrier(
      (tx) =>
        timeEntryRepository.insertClosed(tx, {
          id: values.id,
          workspaceId,
          userId: actor.userId,
          description: "barrera",
          projectId: null,
          taskId: null,
          billable: false,
          tagIds: [],
          startedAt: new Date("2026-10-01T12:00:00Z"),
          endedAt: new Date("2026-10-01T13:00:00Z"),
        }),
      [() => create(values), () => create(values)],
    );

    expect(results.map((result) => result.created.id)).toEqual([values.id, values.id]);
    expect(results[0]).toEqual(results[1]);
    const rows = await allTimeEntries();
    expect(rows.map((row) => [row.id, row.description])).toEqual([
      [values.id, "reunión"],
    ]);
    expect(
      (await auditFor("time_entry")).map((entry) => [entry.action, entry.entityId]),
    ).toEqual([["timeEntry.createManual", values.id]]);
  });
});

describe("la fila en el estado en que esté (criterio 5, TT-108)", () => {
  it("el reintento responde la entrada editada y movida a una semana más vieja, sin escribir", async () => {
    const values = manual();
    const first = await create(values);
    expect(first.created.weekStart).toBe("2026-09-28");
    const { entry: edited } = await updateEntry(
      actor,
      workspace,
      updateEntryInput.parse({
        id: values.id,
        changes: {
          description: "B",
          times: { date: "2026-09-24", start: "14:00", end: "15:15" },
        },
      }),
    );
    const before = await written();

    const { created } = await create(values);

    expect(created).toMatchObject({
      id: values.id,
      description: "B",
      dayDate: "2026-09-24",
      startClock: "14:00",
      endClock: "15:15",
      weekStart: "2026-09-21",
    });
    expect(created).toEqual(edited);
    expect(await written()).toEqual(before);
  });
});

describe("la fila propia antes que las reglas (criterio 6)", () => {
  it("el proyecto del primer intento, archivado después: sin TT-77", async () => {
    const archived = await seedProject({ workspaceId });
    const values = manual({ projectId: archived.id });
    const first = await create(values);
    await archiveProject(archived.id);
    await expect(create({ ...values, id: randomUUID() })).rejects.toMatchObject(tt77);
    const before = await written();

    await expect(create(values)).resolves.toEqual(first);
    expect(await written()).toEqual(before);
  });

  it("la etiqueta del primer intento, archivada después: sin TT-78", async () => {
    const archived = await seedTag({ workspaceId });
    const values = manual({ tagIds: [archived.id] });
    const first = await create(values);
    await archiveTag(archived.id);
    await expect(create({ ...values, id: randomUUID() })).rejects.toMatchObject(tt78);
    const before = await written();

    await expect(create(values)).resolves.toEqual(first);
    expect(await written()).toEqual(before);
  });

  it.each([
    [
      "horas de duración cero: sin tooShort",
      workspace,
      { start: "09:00", end: "09:00" },
      timeEntryMessages.tooShort,
    ],
    [
      // En Madrid el 29 de marzo de 2026 los relojes pasan de 02:00 a 03:00.
      "una hora que no existe: sin nonexistentClock",
      workspaceOf("Europe/Madrid"),
      { date: "2026-03-29", start: "02:30", end: "04:00" },
      timeEntryMessages.nonexistentClock,
    ],
    [
      "un día anterior al piso del workspace: sin beforeWorkspace",
      workspaceOf(buenosAires, "2026-09-15T12:00:00Z"),
      { date: "2026-09-01" },
      timeEntryMessages.beforeWorkspace,
    ],
    [
      // El fin cae el 10000-01-01, que no tiene clave de día.
      "el 9999-12-31 cruzando la medianoche: sin invalidDate",
      workspace,
      { date: "9999-12-31", start: "23:00", end: "01:00" },
      timeEntryMessages.invalidDate,
    ],
  ] as const)("%s", async (_, where, change, message) => {
    const values = manual();
    const first = await create(values, where);
    const changed = { ...values, ...change };
    await expect(create({ ...changed, id: randomUUID() }, where)).rejects.toMatchObject({
      code: "validation",
      message,
    });
    const before = await written();

    await expect(create(changed, where)).resolves.toEqual(first);
    expect(await written()).toEqual(before);
  });
});

/** Dónde vive la entrada ajena cuyo id se reusa: lo único que la separa del actor. */
const foreignOwners = {
  "otro miembro del workspace": async () => ({
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

/** Una entrada cerrada de otro dueño, sembrada directo contra la tabla. */
function seedForeign(owner: { workspaceId: string; userId: string }) {
  return seedTimeEntry({
    ...owner,
    description: "ajena",
    startedAt: "2026-10-01T12:00:00Z",
    endedAt: "2026-10-01T13:00:00Z",
  });
}

describe("el id de otra fila (criterio 8)", () => {
  it.each(Object.entries(foreignOwners))(
    "con el id de una entrada de %s responde forbidden y no escribe",
    async (_, ownerOf) => {
      const foreign = await seedForeign(await ownerOf());
      const before = await written();

      const error = await create(manual({ id: foreign.id })).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error).toMatchObject({ code: "forbidden" });
      expect(await written()).toEqual(before);
    },
  );
});

describe("las reglas antes de escribir, con el id de otro miembro (criterio 9)", () => {
  // Con un id nuevo, una regla movida después del insert responde igual: la
  // transacción se deshace. Con el id ajeno, el insert choca con la clave
  // primaria y saldría forbidden.
  const rules = {
    "horas de duración cero responden tooShort": async () => ({
      change: { start: "09:00", end: "09:00" },
      expected: { code: "validation", message: timeEntryMessages.tooShort },
      where: workspace,
    }),
    "un día anterior a la creación del workspace responde beforeWorkspace": async () => ({
      change: { date: "2026-09-01" },
      expected: { code: "validation", message: timeEntryMessages.beforeWorkspace },
      where: workspaceOf(buenosAires, "2026-09-15T12:00:00Z"),
    }),
    "un proyecto archivado responde TT-77": async () => ({
      change: { projectId: (await seedProject({ workspaceId, archived: true })).id },
      expected: tt77,
      where: workspace,
    }),
    "una etiqueta archivada responde TT-78": async () => ({
      change: { tagIds: [(await seedTag({ workspaceId, archived: true })).id] },
      expected: tt78,
      where: workspace,
    }),
  };

  it.each(Object.entries(rules))("%s, no forbidden", async (_, ruleOf) => {
    const foreign = await seedForeign(
      await foreignOwners["otro miembro del workspace"](),
    );
    const { change, expected, where } = await ruleOf();
    const before = await written();

    const error = await create(manual({ ...change, id: foreign.id }), where).catch(
      (caught: unknown) => caught,
    );

    expect(error).not.toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject(expected);
    expect(await written()).toEqual(before);
  });
});

describe("la fila propia bloqueada (criterio 10)", () => {
  it("el reintento no espera a quien la tiene tomada y no escribe", async () => {
    const values = manual();
    await create(values);
    const before = await written();

    const outcome = await outcomeWhileLocked(values.id, () => create(values));

    expect(outcome).toBe("resolved");
    expect(await written()).toEqual(before);
  });
});

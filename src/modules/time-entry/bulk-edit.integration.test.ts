import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DomainError, RejectedError } from "@/server/action";
import { db } from "@/server/db";
import { project, tag, timeEntry } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { queueBehindBarrier, raceThroughBarrier, warmPool } from "@/test/concurrency";
import {
  buenosAires,
  seedMember,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { auditFor, timeEntryById } from "@/test/queries";
import {
  actorIn,
  allEntryTags,
  lockRow,
  rejectionOf,
  snapshotOf,
  tagIdsOfRow,
  workspaceOf,
} from "@/test/time-entry";

import { projectMessages } from "@/modules/project/schema";

import { tagsAfter } from "./assignment";
import { timeEntryRepository } from "./repository";
import { TAGS_MAX, timeEntryMessages, type BulkEditChanges } from "./schema";
import { bulkEditEntries, updateEntry } from "./service";

/**
 * El slice 12: el par, el facturable y las etiquetas en la edición masiva
 * (TT-63, ADR 0017). Los criterios son los de §7 de su contrato.
 */

const workspace = workspaceOf(buenosAires);

let workspaceId: string;
let actor: Actor;

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  // Un `member`: el privado sin acceso responde como uno que no existe (TT-08).
  actor = actorIn(workspaceId, await seedMember(workspaceId, "member"));
});

type EntrySeed = {
  readonly projectId?: string | null;
  readonly taskId?: string | null;
  readonly billable?: boolean;
  readonly tagIds?: readonly string[];
  readonly startedAt?: string;
  readonly endedAt?: string | null;
  readonly userId?: string;
};

/** Una entrada cerrada del actor, de una hora, salvo lo que se pida. */
function seedEntry(seed: EntrySeed = {}) {
  return seedTimeEntry({
    workspaceId,
    userId: seed.userId ?? actor.userId,
    description: "original",
    startedAt: seed.startedAt ?? "2026-10-01T13:00:00Z",
    endedAt: seed.endedAt === undefined ? "2026-10-01T14:00:00Z" : seed.endedAt,
    projectId: seed.projectId ?? null,
    taskId: seed.taskId ?? null,
    billable: seed.billable,
    tagIds: seed.tagIds,
  });
}

type Assignment = {
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly billable: boolean;
  readonly tagIds: readonly string[];
};

/** El par, el facturable y las etiquetas de la fila en la base, con los ids ordenados. */
async function assignmentOf(id: string): Promise<Assignment | undefined> {
  const row = await timeEntryById(id);
  return row === undefined
    ? undefined
    : {
        projectId: row.projectId,
        taskId: row.taskId,
        billable: row.billable,
        tagIds: await tagIdsOfRow(id),
      };
}

function assignment(values: Partial<Assignment>): Assignment {
  return {
    projectId: null,
    taskId: null,
    billable: false,
    ...values,
    tagIds: [...(values.tagIds ?? [])].sort(),
  };
}

/**
 * Todo lo que una edición puede dejar en las filas: sus columnas con el
 * `updatedAt`, y la unión entera, que `snapshotOf` no mira.
 */
async function everythingOf(ids: readonly string[]) {
  return {
    rows: await Promise.all(
      ids.map(async (id) => ({ ...(await snapshotOf(id)), ...(await assignmentOf(id)) })),
    ),
    tags: (await allEntryTags()).map((row) => `${row.timeEntryId} ${row.tagId}`).sort(),
  };
}

/** El error de dominio de un pedido; si termina bien o lanza otra cosa, falla. */
async function failureOf(work: Promise<unknown>): Promise<DomainError<string>> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) {
      return error;
    }
    throw error;
  }
  throw new Error("El pedido no falló.");
}

/** Un error del pedido entero: su código y su texto, sin lista de filas. */
async function requestFailureOf(work: Promise<unknown>) {
  const error = await failureOf(work);
  expect(error).not.toBeInstanceOf(RejectedError);
  expect(error).not.toHaveProperty("rejections");
  return { code: error.code, message: error.message };
}

async function archiveProject(id: string) {
  await db.update(project).set({ archivedAt: new Date() }).where(eq(project.id, id));
}

async function archiveTag(id: string) {
  await db.update(tag).set({ archivedAt: new Date() }).where(eq(tag.id, id));
}

function edit(ids: readonly string[], changes: BulkEditChanges) {
  return bulkEditEntries(actor, workspace, { ids: [...ids], changes });
}

/** Las referencias que usan los casos, con nombres en un orden alfabético conocido. */
async function seedRefs() {
  const p = await seedProject({ workspaceId, name: "Pe", billableByDefault: true });
  const q = await seedProject({ workspaceId, name: "Cu", color: "red" });
  const old = await seedProject({
    workspaceId,
    name: "Viejo",
    billableByDefault: true,
    archived: true,
  });
  return {
    p,
    q,
    old,
    t: await seedTask({ workspaceId, projectId: p.id, name: "Te" }),
    done: await seedTask({ workspaceId, projectId: p.id, status: "done" }),
    a: await seedTag({ workspaceId, name: "Archivada", archived: true }),
    b: await seedTag({ workspaceId, name: "beta" }),
    x: await seedTag({ workspaceId, name: "Equis" }),
  };
}

type Refs = Awaited<ReturnType<typeof seedRefs>>;

type Failure = { readonly code: string; readonly message: string };

type SameRuleCase = {
  readonly label: string;
  readonly setup: (refs: Refs) => Promise<{
    readonly seed: EntrySeed;
    readonly changes: BulkEditChanges;
    readonly expected: Assignment | Failure;
    /** Las dos copias se borran antes de editarlas. */
    readonly removed?: boolean;
  }>;
};

const sameRuleCases: readonly SameRuleCase[] = [
  {
    label: "sin proyecto y no facturable, a P: el por defecto de P (D-2)",
    setup: async ({ p }) => ({
      seed: {},
      changes: { project: { projectId: p.id, taskId: null } },
      expected: assignment({ projectId: p.id, billable: true }),
    }),
  },
  {
    label: "en P y no facturable, a P: T: conserva el facturable y valida el par",
    setup: async ({ p, t }) => ({
      seed: { projectId: p.id },
      changes: { project: { projectId: p.id, taskId: t.id } },
      expected: assignment({ projectId: p.id, taskId: t.id }),
    }),
  },
  {
    label: "en P: T, a P sin tarea: conserva el facturable",
    setup: async ({ p, t }) => ({
      seed: { projectId: p.id, taskId: t.id },
      changes: { project: { projectId: p.id, taskId: null } },
      expected: assignment({ projectId: p.id }),
    }),
  },
  {
    label: "en Q y facturable, a «Sin proyecto»: conserva el facturable",
    setup: async ({ q }) => ({
      seed: { projectId: q.id, billable: true },
      changes: { project: { projectId: null, taskId: null } },
      expected: assignment({ billable: true }),
    }),
  },
  {
    label: "en Q y facturable, a P con «No»: el pedido gana",
    setup: async ({ p, q }) => ({
      seed: { projectId: q.id, billable: true },
      changes: { project: { projectId: p.id, taskId: null }, billable: false },
      expected: assignment({ projectId: p.id }),
    }),
  },
  {
    label: "en P archivado, solo etiquetas: conserva P (TT-104)",
    setup: async ({ old, b }) => ({
      seed: { projectId: old.id, billable: true },
      changes: { tags: { mode: "add", ids: [b.id] } },
      expected: assignment({ projectId: old.id, billable: true, tagIds: [b.id] }),
    }),
  },
  {
    label: "en P archivado, solo el facturable: conserva P",
    setup: async ({ old }) => ({
      seed: { projectId: old.id, billable: true },
      changes: { billable: false },
      expected: assignment({ projectId: old.id }),
    }),
  },
  {
    label: "en P archivado, P: sin cambios en el par",
    setup: async ({ old }) => ({
      seed: { projectId: old.id },
      changes: { project: { projectId: old.id, taskId: null } },
      expected: assignment({ projectId: old.id }),
    }),
  },
  {
    label: "en P archivado y facturable, a Q: el facturable de Q",
    setup: async ({ old, q }) => ({
      seed: { projectId: old.id, billable: true },
      changes: { project: { projectId: q.id, taskId: null } },
      expected: assignment({ projectId: q.id }),
    }),
  },
  {
    label: "con A archivada, «Agregar» B: A y B (PR-47)",
    setup: async ({ a, b }) => ({
      seed: { tagIds: [a.id] },
      changes: { tags: { mode: "add", ids: [b.id] } },
      expected: assignment({ tagIds: [a.id, b.id] }),
    }),
  },
  {
    label: "con A archivada, «Reemplazar» por B: solo B",
    setup: async ({ a, b }) => ({
      seed: { tagIds: [a.id] },
      changes: { tags: { mode: "replace", ids: [b.id] } },
      expected: assignment({ tagIds: [b.id] }),
    }),
  },
  {
    label: "con A archivada, «Reemplazar» por A y B: A y B",
    setup: async ({ a, b }) => ({
      seed: { tagIds: [a.id] },
      changes: { tags: { mode: "replace", ids: [a.id, b.id] } },
      expected: assignment({ tagIds: [a.id, b.id] }),
    }),
  },
  {
    label: "con X, «Agregar» X: sin cambios",
    setup: async ({ x }) => ({
      seed: { tagIds: [x.id] },
      changes: { tags: { mode: "add", ids: [x.id] } },
      expected: assignment({ tagIds: [x.id] }),
    }),
  },
  {
    label: "con X, «Reemplazar» por ninguna: sin etiquetas (D12-3)",
    setup: async ({ x }) => ({
      seed: { tagIds: [x.id] },
      changes: { tags: { mode: "replace", ids: [] } },
      expected: assignment({}),
    }),
  },
  {
    label: "de más de un día (TT-110), proyecto, etiquetas y facturable sin horario",
    setup: async ({ p, b }) => ({
      seed: { startedAt: "2026-10-01T13:00:00Z", endedAt: "2026-10-03T14:00:00Z" },
      changes: {
        project: { projectId: p.id, taskId: null },
        tags: { mode: "add", ids: [b.id] },
        billable: false,
      },
      expected: assignment({ projectId: p.id, tagIds: [b.id] }),
    }),
  },
  {
    label: "con 49 etiquetas, «Agregar» dos que no tiene: tooManyTags (D12-4)",
    setup: async ({ b, x }) => {
      const own = await Promise.all(
        Array.from({ length: TAGS_MAX - 1 }, () => seedTag({ workspaceId })),
      );
      return {
        seed: { tagIds: own.map((tag) => tag.id) },
        changes: { tags: { mode: "add", ids: [b.id, x.id] } },
        expected: { code: "validation", message: timeEntryMessages.tooManyTags },
      };
    },
  },
  {
    label: "la entrada de otra persona: el texto de TT-79",
    setup: async ({ b }) => ({
      seed: { userId: await seedMember(workspaceId, "member") },
      changes: { tags: { mode: "add", ids: [b.id] } },
      expected: { code: "forbidden", message: timeEntryMessages.forbiddenOtherOwner },
    }),
  },
  {
    label: "la entrada ya borrada: not_found",
    setup: async ({ p }) => ({
      seed: {},
      changes: { project: { projectId: p.id, taskId: null } },
      expected: { code: "not_found", message: timeEntryMessages.notFound },
      removed: true,
    }),
  },
  {
    label: "el proyecto archivado pedido: projectUnavailable",
    setup: async ({ old }) => ({
      seed: {},
      changes: { project: { projectId: old.id, taskId: null } },
      expected: { code: "not_found", message: projectMessages.projectUnavailable },
    }),
  },
  {
    label: "la tarea hecha pedida: taskUnavailable",
    setup: async ({ p, done }) => ({
      seed: {},
      changes: { project: { projectId: p.id, taskId: done.id } },
      expected: { code: "not_found", message: projectMessages.taskUnavailable },
    }),
  },
  {
    label: "la etiqueta archivada pedida: tagUnavailable",
    setup: async ({ a }) => ({
      seed: {},
      changes: { tags: { mode: "add", ids: [a.id] } },
      expected: { code: "not_found", message: projectMessages.tagUnavailable },
    }),
  },
];

describe("bulkEditEntries: la fila repetida de updateEntry (criterio 3, ADR 0013)", () => {
  /** El desenlace de una edición: lo que quedó en la fila, o el código y el texto del error. */
  async function outcomeOf(id: string, work: () => Promise<unknown>) {
    try {
      await work();
      return await assignmentOf(id);
    } catch (error) {
      if (error instanceof RejectedError) {
        expect(error.rejections.map((rejection) => rejection.id)).toEqual([id]);
        const [rejection] = error.rejections;
        return { code: rejection.code, message: rejection.message };
      }
      if (error instanceof DomainError) {
        return { code: error.code, message: error.message };
      }
      throw error;
    }
  }

  it.each(sameRuleCases)("$label", async (example) => {
    const refs = await seedRefs();
    const { seed, changes, expected, removed } = await example.setup(refs);
    const bulkRow = await seedEntry(seed);
    const singleRow = await seedEntry(seed);
    if (removed === true) {
      await db.delete(timeEntry).where(inArray(timeEntry.id, [bulkRow.id, singleRow.id]));
    }
    const tags = changes.tags;

    const bulk = await outcomeOf(bulkRow.id, () => edit([bulkRow.id], changes));
    const single = await outcomeOf(singleRow.id, () =>
      updateEntry(actor, workspace, {
        id: singleRow.id,
        changes: {
          project: changes.project,
          billable: changes.billable,
          tags: tags === undefined ? undefined : tagsAfter(seed.tagIds ?? [], tags),
        },
      }),
    );

    expect(bulk).toEqual(single);
    expect(bulk).toEqual(expected);
  });
});

describe("bulkEditEntries: el facturable de cada fila (criterios 4 y 5, D-2)", () => {
  it("criterio 4: elegir P deja facturables las que cambian de proyecto, y no la que ya estaba en P", async () => {
    const { p, q } = await seedRefs();
    const rows = [
      await seedEntry(),
      await seedEntry({ projectId: p.id }),
      await seedEntry({ projectId: q.id }),
    ];

    await edit(
      rows.map((row) => row.id),
      { project: { projectId: p.id, taskId: null } },
    );

    expect(await Promise.all(rows.map((row) => assignmentOf(row.id)))).toEqual([
      assignment({ projectId: p.id, billable: true }),
      assignment({ projectId: p.id, billable: false }),
      assignment({ projectId: p.id, billable: true }),
    ]);
  });

  it("criterio 5: P con «No» deja no facturables todas, también las que cambian de proyecto", async () => {
    const { p, q } = await seedRefs();
    const rows = [
      await seedEntry(),
      await seedEntry({ projectId: p.id, billable: true }),
      await seedEntry({ projectId: q.id, billable: true }),
    ];

    await edit(
      rows.map((row) => row.id),
      { project: { projectId: p.id, taskId: null }, billable: false },
    );

    expect(await Promise.all(rows.map((row) => assignmentOf(row.id)))).toEqual(
      rows.map(() => assignment({ projectId: p.id, billable: false })),
    );
  });
});

describe("bulkEditEntries: lo que la fila ya tiene (criterios 6 y 8, TT-104, PR-47)", () => {
  it("criterio 6: la fila en un proyecto archivado cambia sus etiquetas y su facturable sin error", async () => {
    const { old, b } = await seedRefs();
    const row = await seedEntry({ projectId: old.id, billable: true });

    await edit([row.id], { tags: { mode: "add", ids: [b.id] }, billable: false });

    expect(await assignmentOf(row.id)).toEqual(
      assignment({ projectId: old.id, tagIds: [b.id] }),
    );
  });

  it("criterio 6: la fila con una etiqueta archivada la conserva con «Agregar»", async () => {
    const { a, b } = await seedRefs();
    const row = await seedEntry({ tagIds: [a.id] });

    await edit([row.id], { tags: { mode: "add", ids: [b.id] } });

    expect(await assignmentOf(row.id)).toEqual(assignment({ tagIds: [a.id, b.id] }));
  });

  it("criterio 8: pedir el proyecto archivado a filas que ya lo tienen todas termina bien sin escribir", async () => {
    const { old } = await seedRefs();
    const rows = [
      await seedEntry({ projectId: old.id }),
      await seedEntry({ projectId: old.id, billable: true }),
    ];
    const ids = rows.map((row) => row.id);
    const before = await everythingOf(ids);

    const result = await edit(ids, { project: { projectId: old.id, taskId: null } });

    expect(result.entries.map((entry) => entry.project?.id)).toEqual([old.id, old.id]);
    expect(await everythingOf(ids)).toEqual(before);
    expect(await auditFor("time_entry")).toEqual([]);
  });

  it("criterio 8: «Agregar» una etiqueta archivada a filas que ya la tienen todas termina bien sin escribir", async () => {
    const { a, b } = await seedRefs();
    const rows = [
      await seedEntry({ tagIds: [a.id] }),
      await seedEntry({ tagIds: [a.id, b.id] }),
    ];
    const ids = rows.map((row) => row.id);
    const before = await everythingOf(ids);

    await edit(ids, { tags: { mode: "add", ids: [a.id] } });

    expect(await everythingOf(ids)).toEqual(before);
    expect(await auditFor("time_entry")).toEqual([]);
  });
});

describe("bulkEditEntries: una referencia no disponible frena el pedido (criterio 7, ADR 0017)", () => {
  /** Pide `changes` sobre dos filas y afirma el error del pedido, sin escribir ni registrar. */
  async function expectUnavailable(
    rows: readonly { readonly id: string }[],
    changes: BulkEditChanges,
    message: string,
    by: Actor = actor,
  ) {
    const ids = rows.map((row) => row.id);
    const before = await everythingOf(ids);

    const failure = await requestFailureOf(
      bulkEditEntries(by, workspace, { ids, changes }),
    );

    expect(failure).toEqual({ code: "not_found", message });
    expect(await everythingOf(ids)).toEqual(before);
    expect(await auditFor("time_entry")).toEqual([]);
  }

  it("el proyecto archivado", async () => {
    const { old } = await seedRefs();
    const rows = [await seedEntry(), await seedEntry()];

    await expectUnavailable(
      rows,
      { project: { projectId: old.id, taskId: null }, description: "nueva" },
      projectMessages.projectUnavailable,
    );
  });

  it("el proyecto privado sin acceso (TT-08)", async () => {
    const vault = await seedProject({ workspaceId, isPublic: false });
    const rows = [await seedEntry(), await seedEntry()];

    await expectUnavailable(
      rows,
      { project: { projectId: vault.id, taskId: null } },
      projectMessages.projectUnavailable,
    );
  });

  it("el proyecto de otro workspace", async () => {
    const other = await seedWorkspace(buenosAires);
    const foreign = await seedProject({ workspaceId: other.workspaceId });
    const rows = [await seedEntry()];

    await expectUnavailable(
      rows,
      { project: { projectId: foreign.id, taskId: null } },
      projectMessages.projectUnavailable,
    );
  });

  it("la tarea hecha", async () => {
    const { p, done } = await seedRefs();
    const rows = [await seedEntry({ projectId: p.id }), await seedEntry()];

    await expectUnavailable(
      rows,
      { project: { projectId: p.id, taskId: done.id } },
      projectMessages.taskUnavailable,
    );
  });

  it("la etiqueta archivada", async () => {
    const { a, b } = await seedRefs();
    const rows = [await seedEntry(), await seedEntry({ tagIds: [b.id] })];

    await expectUnavailable(
      rows,
      { tags: { mode: "add", ids: [b.id, a.id] } },
      projectMessages.tagUnavailable,
    );
  });

  it("la etiqueta de otro workspace", async () => {
    const other = await seedWorkspace(buenosAires);
    const foreign = await seedTag({ workspaceId: other.workspaceId });
    const rows = [await seedEntry()];

    await expectUnavailable(
      rows,
      { tags: { mode: "replace", ids: [foreign.id] } },
      projectMessages.tagUnavailable,
    );
  });

  it("también cuando la primera fila pedida ya tiene el proyecto archivado y otra no", async () => {
    const { old } = await seedRefs();
    const rows = [await seedEntry({ projectId: old.id }), await seedEntry()];

    await expectUnavailable(
      rows,
      { project: { projectId: old.id, taskId: null } },
      projectMessages.projectUnavailable,
    );
  });

  it("también cuando la primera fila pedida ya tiene la etiqueta archivada y otra no", async () => {
    const { a } = await seedRefs();
    const rows = [await seedEntry({ tagIds: [a.id] }), await seedEntry()];

    await expectUnavailable(
      rows,
      { tags: { mode: "add", ids: [a.id] } },
      projectMessages.tagUnavailable,
    );
  });
});

describe("bulkEditEntries: el reintento llega a un punto fijo (criterio 9, TT-89)", () => {
  async function seedApplied() {
    const refs = await seedRefs();
    const rows = [
      await seedEntry({ tagIds: [refs.x.id] }),
      // Ya en P con otro facturable que el por defecto: D-2 lo conserva.
      await seedEntry({ projectId: refs.p.id }),
    ];
    const ids = rows.map((row) => row.id);
    const changes: BulkEditChanges = {
      project: { projectId: refs.p.id, taskId: null },
      tags: { mode: "add", ids: [refs.b.id] },
    };
    const first = await edit(ids, changes);
    return { refs, ids, changes, first };
  }

  it("repetir el pedido de proyecto y etiquetas no escribe, no registra y responde las mismas vistas", async () => {
    const { ids, changes, first } = await seedApplied();
    const applied = await everythingOf(ids);
    const audits = await auditFor("time_entry");

    const second = await edit(ids, changes);

    expect(second).toEqual(first);
    expect(await everythingOf(ids)).toEqual(applied);
    expect(await auditFor("time_entry")).toEqual(audits);
  });

  it("repetir el pedido con el facturable explícito tampoco escribe", async () => {
    const { p } = await seedRefs();
    const ids = [(await seedEntry()).id, (await seedEntry({ projectId: p.id })).id];
    const changes: BulkEditChanges = {
      project: { projectId: p.id, taskId: null },
      billable: false,
    };
    const first = await edit(ids, changes);
    const applied = await everythingOf(ids);

    expect(await edit(ids, changes)).toEqual(first);
    expect(await everythingOf(ids)).toEqual(applied);
  });

  it("también después de archivar el proyecto y la etiqueta entre los dos intentos", async () => {
    const { refs, ids, changes, first } = await seedApplied();
    const applied = await everythingOf(ids);
    const audits = await auditFor("time_entry");
    await archiveProject(refs.p.id);
    await archiveTag(refs.b.id);

    const second = await edit(ids, changes);

    expect(second).toEqual(first);
    expect(await everythingOf(ids)).toEqual(applied);
    expect(await auditFor("time_entry")).toEqual(audits);
  });
});

describe("bulkEditEntries: las filas antes que las referencias (criterio 10, D12-2)", () => {
  it("una fila ajena y un proyecto archivado en el mismo pedido responden rejected con la ajena", async () => {
    const { old } = await seedRefs();
    const own = await seedEntry();
    const foreign = await seedEntry({ userId: await seedMember(workspaceId, "member") });
    const ids = [own.id, foreign.id];
    const before = await everythingOf(ids);

    const error = await rejectionOf(
      edit(ids, { project: { projectId: old.id, taskId: null } }),
    );

    expect(error.message).toBe(timeEntryMessages.bulkEditRejected);
    expect(error.rejections).toEqual([
      {
        id: foreign.id,
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      },
    ]);
    expect(await everythingOf(ids)).toEqual(before);
  });
});

describe("bulkEditEntries: el tope de etiquetas por fila (criterio 11, D12-4)", () => {
  it(`«Agregar» que deja una fila con ${TAGS_MAX + 1} la rechaza y no cambia ninguna; con ${TAGS_MAX}, termina bien`, async () => {
    const own = await Promise.all(
      Array.from({ length: TAGS_MAX - 1 }, () => seedTag({ workspaceId })),
    );
    const extra = [await seedTag({ workspaceId }), await seedTag({ workspaceId })];
    const full = await seedEntry({ tagIds: own.map((row) => row.id) });
    const fits = await seedEntry({ tagIds: own.slice(1).map((row) => row.id) });
    const ids = [fits.id, full.id];
    const before = await everythingOf(ids);

    const error = await rejectionOf(
      edit(ids, { tags: { mode: "add", ids: extra.map((row) => row.id) } }),
    );

    expect(error.rejections).toEqual([
      { id: full.id, code: "validation", message: timeEntryMessages.tooManyTags },
    ]);
    expect(await everythingOf(ids)).toEqual(before);

    await edit([fits.id], { tags: { mode: "add", ids: extra.map((row) => row.id) } });

    expect(await tagIdsOfRow(fits.id)).toHaveLength(TAGS_MAX);
  });
});

describe("bulkEditEntries: la que corre y la de más de un día (criterio 12, TT-110, TT-111)", () => {
  it("la que corre se rechaza con runningEntryTimes aunque el pedido sea solo de etiquetas", async () => {
    const { b } = await seedRefs();
    const closed = await seedEntry();
    const running = await seedEntry({ startedAt: "2026-10-02T11:00:00Z", endedAt: null });
    const ids = [closed.id, running.id];
    const before = await everythingOf(ids);

    const error = await rejectionOf(edit(ids, { tags: { mode: "add", ids: [b.id] } }));

    expect(error.rejections).toEqual([
      {
        id: running.id,
        code: "timer_running",
        message: timeEntryMessages.runningEntryTimes,
      },
    ]);
    expect(await everythingOf(ids)).toEqual(before);
  });

  it("la de más de un día cambia de proyecto sin rechazo, y conserva sus instantes", async () => {
    const { p } = await seedRefs();
    const row = await seedEntry({
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-03T14:00:00Z",
    });

    await edit([row.id], { project: { projectId: p.id, taskId: null } });

    expect(await assignmentOf(row.id)).toEqual(
      assignment({ projectId: p.id, billable: true }),
    );
    expect(await timeEntryById(row.id)).toMatchObject({
      startedAt: new Date("2026-10-01T13:00:00Z"),
      endedAt: new Date("2026-10-03T14:00:00Z"),
    });
  });
});

describe("bulkEditEntries: las vistas que vuelven (criterio 13)", () => {
  it("traen el par, el facturable y las etiquetas nuevas, con nombre y color, en orden alfabético; la fila sin cambios, la de antes", async () => {
    const { p, q, t, a, b, x } = await seedRefs();
    const changed = await seedEntry({ projectId: q.id, tagIds: [x.id, a.id] });
    const same = await seedEntry({
      projectId: p.id,
      taskId: t.id,
      billable: true,
      tagIds: [x.id, b.id, a.id],
    });
    const ids = [changed.id, same.id];
    const changes: BulkEditChanges = {
      project: { projectId: p.id, taskId: t.id },
      tags: { mode: "add", ids: [b.id] },
      billable: true,
    };

    const first = await edit(ids, changes);

    const expected = {
      project: { id: p.id, name: "Pe", color: "blue" },
      task: { id: t.id, name: "Te" },
      billable: true,
      tags: [
        { id: a.id, name: "Archivada" },
        { id: b.id, name: "beta" },
        { id: x.id, name: "Equis" },
      ],
    };
    expect(first.entries.map((entry) => entry.id)).toEqual(ids);
    expect(first.entries[0]).toMatchObject(expected);
    expect(first.entries[1]).toMatchObject(expected);
    // Una lectura nueva: el segundo intento no escribe y lee todo bajo bloqueo.
    expect(await edit(ids, changes)).toEqual(first);
  });
});

describe("bulkEditEntries: las etiquetas con otras conexiones (criterios 15 y 16)", () => {
  it("criterio 15: con una edición de etiquetas encolada antes, «Agregar» parte de lo confirmado", async () => {
    const { b, x } = await seedRefs();
    const row = await seedEntry();

    const [single, bulk] = await queueBehindBarrier(lockRow(row.id), [
      () => updateEntry(actor, workspace, { id: row.id, changes: { tags: [x.id] } }),
      () => edit([row.id], { tags: { mode: "add", ids: [b.id] } }),
    ]);

    expect(single.status).toBe("fulfilled");
    expect(bulk.status).toBe("fulfilled");
    expect(await tagIdsOfRow(row.id)).toEqual([b.id, x.id].sort());
  });

  it("criterio 16: dos «Agregar» sobre los mismos ids en orden opuesto responden las dos, y cada fila tiene las dos etiquetas", async () => {
    const { b, x } = await seedRefs();
    const seeded = [await seedEntry(), await seedEntry(), await seedEntry()];
    const [first, middle, last] = seeded.map((row) => row.id).sort();
    await warmPool(3);

    const results = await raceThroughBarrier(lockRow(middle), [
      () => edit([first, middle, last], { tags: { mode: "add", ids: [b.id] } }),
      () => edit([last, middle, first], { tags: { mode: "add", ids: [x.id] } }),
    ]);

    expect(results.map((result) => result.entries.map((entry) => entry.id))).toEqual([
      [first, middle, last],
      [last, middle, first],
    ]);
    for (const id of [first, middle, last]) {
      expect(await tagIdsOfRow(id)).toEqual([b.id, x.id].sort());
    }
  });
});

describe("bulkEditEntries: filas mezcladas en la escritura (criterio 21)", () => {
  async function seedMixed() {
    const refs = await seedRefs();
    const z = await seedTag({ workspaceId, name: "Zeta" });
    const tagged = await seedEntry({ projectId: refs.q.id, tagIds: [refs.x.id] });
    const kept = await seedEntry({ projectId: refs.q.id, tagIds: [refs.b.id, z.id] });
    return { ...refs, z, tagged, kept };
  }

  it("P y «Agregar» Y: la que gana Y la suma, y la que ya tenía Y cambia solo su par y conserva su conjunto", async () => {
    const { p, b, x, z, tagged, kept } = await seedMixed();

    await edit([tagged.id, kept.id], {
      project: { projectId: p.id, taskId: null },
      tags: { mode: "add", ids: [b.id] },
    });

    expect(await assignmentOf(tagged.id)).toEqual(
      assignment({ projectId: p.id, billable: true, tagIds: [x.id, b.id] }),
    );
    expect(await assignmentOf(kept.id)).toEqual(
      assignment({ projectId: p.id, billable: true, tagIds: [b.id, z.id] }),
    );
  });

  it("lo mismo con el facturable en lugar del par", async () => {
    const { q, b, x, z, tagged, kept } = await seedMixed();

    await edit([tagged.id, kept.id], {
      billable: true,
      tags: { mode: "add", ids: [b.id] },
    });

    expect(await assignmentOf(tagged.id)).toEqual(
      assignment({ projectId: q.id, billable: true, tagIds: [x.id, b.id] }),
    );
    expect(await assignmentOf(kept.id)).toEqual(
      assignment({ projectId: q.id, billable: true, tagIds: [b.id, z.id] }),
    );
  });
});

describe("bulkEditEntries: el par antes que las etiquetas, para el pedido entero (criterio 22)", () => {
  it.each([
    ["la fila en P primero", false],
    ["la fila con X primero", true],
  ])("con P y X archivados responde projectUnavailable: %s", async (_, reversed) => {
    const p = await seedProject({ workspaceId, name: "Pe" });
    const x = await seedTag({ workspaceId, name: "Equis" });
    const inP = await seedEntry({ projectId: p.id });
    const withX = await seedEntry({ tagIds: [x.id] });
    await archiveProject(p.id);
    await archiveTag(x.id);
    const ids = reversed ? [withX.id, inP.id] : [inP.id, withX.id];
    const before = await everythingOf(ids);

    const failure = await requestFailureOf(
      edit(ids, {
        project: { projectId: p.id, taskId: null },
        tags: { mode: "add", ids: [x.id] },
      }),
    );

    expect(failure).toEqual({
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
    expect(await everythingOf(ids)).toEqual(before);
    expect(await auditFor("time_entry")).toEqual([]);
  });
});

describe("las guardas de updateClosedEntries (§4.6)", () => {
  it("devuelve undefined si alguna escritura no toca su fila: la abierta o la de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const own = await seedEntry();
    const running = await seedEntry({ startedAt: "2026-10-02T11:00:00Z", endedAt: null });
    const foreign = await seedEntry({ userId: otherId });

    for (const row of [running, foreign]) {
      const result = await db.transaction((tx) =>
        timeEntryRepository.updateClosedEntries(tx, [
          { target: { workspaceId, userId: actor.userId, id: own.id }, fields: {} },
          {
            target: { workspaceId, userId: actor.userId, id: row.id },
            fields: { description: "x" },
          },
        ]),
      );
      expect(result).toBeUndefined();
      expect((await timeEntryById(row.id))?.description).toBe("original");
    }
  });

  it("sin escrituras no hace nada, y las etiquetas solo tocan los destinos que las traen", async () => {
    const { b, x } = await seedRefs();
    const other = await seedWorkspace(buenosAires);
    const otherTag = await seedTag({ workspaceId: other.workspaceId });
    const elsewhere = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: other.ownerId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
      tagIds: [otherTag.id],
    });
    const cleared = await seedEntry({ tagIds: [x.id, b.id] });
    const untouched = await seedEntry({ tagIds: [x.id] });
    const target = (id: string) => ({ workspaceId, userId: actor.userId, id });

    expect(
      await db.transaction((tx) => timeEntryRepository.updateClosedEntries(tx, [])),
    ).toEqual([]);
    const written = await db.transaction((tx) =>
      timeEntryRepository.updateClosedEntries(tx, [
        { target: target(cleared.id), fields: { tagIds: [] } },
        { target: target(untouched.id), fields: { billable: true } },
      ]),
    );

    expect(written?.map((row) => [row.id, row.tags, row.billable])).toEqual([
      [cleared.id, [], false],
      [untouched.id, [{ id: x.id, name: "Equis" }], true],
    ]);
    expect(await tagIdsOfRow(untouched.id)).toEqual([x.id]);
    expect(await tagIdsOfRow(elsewhere.id)).toEqual([otherTag.id]);
  });
});

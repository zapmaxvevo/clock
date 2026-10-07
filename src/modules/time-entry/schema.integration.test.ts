import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import {
  CHECK_VIOLATION,
  constraintOf,
  FOREIGN_KEY_VIOLATION,
  hasCode,
  UNIQUE_VIOLATION,
} from "@/server/db/constraint-error";
import {
  client,
  project,
  tag,
  task,
  timeEntry,
  timeEntryTag,
  workspace,
} from "@/server/db/schema";
import {
  seedClient,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { timeEntryById } from "@/test/queries";

import { timeEntryRepository } from "./repository";

/**
 * La base, escrita de forma directa y sin pasar por el service: lo que tiene
 * que rechazar o hacer aunque el service se equivoque (contrato del slice 10,
 * §2).
 */

/** El error de una escritura que la base tiene que rechazar. */
async function rejection(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("La base aceptó la escritura.");
}

async function violated(work: Promise<unknown>, code: string): Promise<string | null> {
  return constraintOf(await rejection(work), code);
}

let ours: SeededWorkspace;

beforeEach(async () => {
  ours = await seedWorkspace();
});

/** Una entrada cerrada del owner, con el par que se pase. */
function insertEntry(pair: { projectId: string | null; taskId: string | null }) {
  return db.insert(timeEntry).values({
    workspaceId: ours.workspaceId,
    userId: ours.ownerId,
    startedAt: new Date("2026-10-01T11:00:00Z"),
    endedAt: new Date("2026-10-01T12:00:00Z"),
    ...pair,
  });
}

/** Un proyecto con una tarea, y una entrada cerrada del owner con los dos. */
async function seedEntryWithTask() {
  const web = await seedProject({ workspaceId: ours.workspaceId });
  const design = await seedTask({ workspaceId: ours.workspaceId, projectId: web.id });
  const entry = await seedTimeEntry({
    workspaceId: ours.workspaceId,
    userId: ours.ownerId,
    startedAt: "2026-10-01T11:00:00Z",
    endedAt: "2026-10-01T12:30:00Z",
    projectId: web.id,
    taskId: design.id,
  });
  return { web, design, entry };
}

describe("las referencias de una entrada (criterio 1: PR-105, TT-70)", () => {
  it("rechaza un proyecto de otro workspace", async () => {
    const theirs = await seedWorkspace();
    const foreign = await seedProject({ workspaceId: theirs.workspaceId });
    expect(
      await violated(
        insertEntry({ projectId: foreign.id, taskId: null }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("time_entry_project_fk");
  });

  it("rechaza una tarea de otro proyecto del mismo workspace", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    const app = await seedProject({ workspaceId: ours.workspaceId });
    const elsewhere = await seedTask({
      workspaceId: ours.workspaceId,
      projectId: app.id,
    });
    expect(
      await violated(
        insertEntry({ projectId: web.id, taskId: elsewhere.id }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("time_entry_task_fk");
  });

  it("rechaza una tarea sin proyecto", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    const design = await seedTask({ workspaceId: ours.workspaceId, projectId: web.id });
    expect(
      await violated(
        insertEntry({ projectId: null, taskId: design.id }),
        CHECK_VIOLATION,
      ),
    ).toBe("time_entry_task_needs_project");
  });

  it("acepta un proyecto sin tarea, y el proyecto con su tarea", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    const design = await seedTask({ workspaceId: ours.workspaceId, projectId: web.id });
    await insertEntry({ projectId: web.id, taskId: null });
    await insertEntry({ projectId: web.id, taskId: design.id });
    const rows = await db
      .select({ projectId: timeEntry.projectId, taskId: timeEntry.taskId })
      .from(timeEntry);
    expect(rows).toEqual(
      expect.arrayContaining([
        { projectId: web.id, taskId: null },
        { projectId: web.id, taskId: design.id },
      ]),
    );
  });
});

describe("los borrados (criterio 2: PR-10, PR-64, PR-66, PR-67, PR-70, PR-107)", () => {
  it("borrar el proyecto directamente falla y nada cambia", async () => {
    const { web, design, entry } = await seedEntryWithTask();
    expect(
      await violated(db.delete(project).where(eq(project.id, web.id)), CHECK_VIOLATION),
    ).toBe("time_entry_task_needs_project");
    expect(await timeEntryById(entry.id)).toMatchObject({
      projectId: web.id,
      taskId: design.id,
    });
    expect(await db.select().from(task).where(eq(task.id, design.id))).toHaveLength(1);
  });

  it("borrar las tareas y después el proyecto deja la entrada sin los dos y con su duración", async () => {
    const { web, entry } = await seedEntryWithTask();
    await db.transaction(async (tx) => {
      await tx.delete(task).where(eq(task.projectId, web.id));
      await tx.delete(project).where(eq(project.id, web.id));
    });
    expect(await timeEntryById(entry.id)).toMatchObject({
      projectId: null,
      taskId: null,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    });
  });

  it("borrar una tarea deja la entrada con su proyecto y sus horas", async () => {
    const { web, design, entry } = await seedEntryWithTask();
    await db.delete(task).where(eq(task.id, design.id));
    expect(await timeEntryById(entry.id)).toMatchObject({
      projectId: web.id,
      taskId: null,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    });
  });

  it("borrar el workspace funciona y se lleva la entrada", async () => {
    const { entry } = await seedEntryWithTask();
    await db.delete(workspace).where(eq(workspace.id, ours.workspaceId));
    expect(await timeEntryById(entry.id)).toBeUndefined();
  });

  it("borrar el cliente no toca la entrada: su proyecto queda sin cliente", async () => {
    const acme = await seedClient({ workspaceId: ours.workspaceId });
    const web = await seedProject({ workspaceId: ours.workspaceId, clientId: acme.id });
    const entry = await seedTimeEntry({
      workspaceId: ours.workspaceId,
      userId: ours.ownerId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
      projectId: web.id,
    });
    await db.delete(client).where(eq(client.id, acme.id));
    expect(await timeEntryById(entry.id)).toMatchObject({
      projectId: web.id,
      taskId: null,
    });
    const [row] = await db.select().from(project).where(eq(project.id, web.id));
    expect(row.clientId).toBeNull();
  });

  it("borrar en dos sentencias el proyecto de un timer lo deja corriendo, sin proyecto y sin tarea", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    const design = await seedTask({ workspaceId: ours.workspaceId, projectId: web.id });
    const running = await seedTimeEntry({
      workspaceId: ours.workspaceId,
      userId: ours.ownerId,
      startedAt: "2026-10-02T11:00:00Z",
      projectId: web.id,
      taskId: design.id,
    });
    await db.transaction(async (tx) => {
      await tx.delete(task).where(eq(task.projectId, web.id));
      await tx.delete(project).where(eq(project.id, web.id));
    });
    expect(await timeEntryById(running.id)).toMatchObject({
      projectId: null,
      taskId: null,
      startedAt: running.startedAt,
      endedAt: null,
    });
  });
});

describe("los predicados del repository contra un 23503 real (criterio 12)", () => {
  it("isMissingProject reconoce la clave del proyecto y no la de la tarea", async () => {
    const theirs = await seedWorkspace();
    const foreign = await seedProject({ workspaceId: theirs.workspaceId });
    const error = await rejection(insertEntry({ projectId: foreign.id, taskId: null }));
    expect(timeEntryRepository.isMissingProject(error)).toBe(true);
    expect(timeEntryRepository.isMissingTask(error)).toBe(false);
  });

  it("isMissingTask reconoce la clave de la tarea y no la del proyecto", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    const app = await seedProject({ workspaceId: ours.workspaceId });
    const elsewhere = await seedTask({
      workspaceId: ours.workspaceId,
      projectId: app.id,
    });
    const error = await rejection(
      insertEntry({ projectId: web.id, taskId: elsewhere.id }),
    );
    expect(timeEntryRepository.isMissingTask(error)).toBe(true);
    expect(timeEntryRepository.isMissingProject(error)).toBe(false);
  });

  it("isTaskWithoutProject reconoce el check de TT-70 y ninguna de las dos claves", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    const design = await seedTask({ workspaceId: ours.workspaceId, projectId: web.id });
    const error = await rejection(insertEntry({ projectId: null, taskId: design.id }));
    expect(timeEntryRepository.isTaskWithoutProject(error)).toBe(true);
    expect(timeEntryRepository.isMissingProject(error)).toBe(false);
    expect(timeEntryRepository.isMissingTask(error)).toBe(false);
  });
});

describe("el facturable de una entrada (criterio 1 del 11a: TT-14)", () => {
  it("una entrada insertada sin la columna queda no facturable", async () => {
    const [row] = await insertEntry({ projectId: null, taskId: null }).returning();
    expect(row.billable).toBe(false);
  });

  it("no acepta un facturable nulo", async () => {
    const error = await rejection(
      db.insert(timeEntry).values({
        workspaceId: ours.workspaceId,
        userId: ours.ownerId,
        startedAt: new Date("2026-10-01T11:00:00Z"),
        billable: sql`null`,
      }),
    );
    // 23502: `not_null_violation`.
    expect(hasCode(error, "23502")).toBe(true);
  });
});

describe("la unión de etiquetas (criterio 1 del 11b: PR-48, PR-69, TT-105)", () => {
  /** Una entrada cerrada del owner con las etiquetas que se pasen. */
  function seedTaggedEntry(tagIds: readonly string[]) {
    return seedTimeEntry({
      workspaceId: ours.workspaceId,
      userId: ours.ownerId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:30:00Z",
      tagIds,
    });
  }

  /** Las etiquetas de la entrada en la unión, por id. */
  async function tagIdsOfEntry(entryId: string): Promise<string[]> {
    const rows = await db
      .select({ tagId: timeEntryTag.tagId })
      .from(timeEntryTag)
      .where(eq(timeEntryTag.timeEntryId, entryId));
    return rows.map((row) => row.tagId).sort();
  }

  it("acepta varias etiquetas en una entrada", async () => {
    const design = await seedTag({ workspaceId: ours.workspaceId });
    const review = await seedTag({ workspaceId: ours.workspaceId });
    const entry = await seedTaggedEntry([design.id, review.id]);
    expect(await tagIdsOfEntry(entry.id)).toEqual([design.id, review.id].sort());
  });

  it("rechaza la misma etiqueta dos veces en una entrada", async () => {
    const design = await seedTag({ workspaceId: ours.workspaceId });
    const entry = await seedTaggedEntry([design.id]);
    expect(
      await violated(
        db.insert(timeEntryTag).values({
          workspaceId: ours.workspaceId,
          timeEntryId: entry.id,
          tagId: design.id,
        }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("time_entry_tag_time_entry_id_tag_id_pk");
  });

  it("rechaza una entrada de un workspace con una etiqueta de otro, desde los dos lados", async () => {
    const theirs = await seedWorkspace();
    const foreign = await seedTag({ workspaceId: theirs.workspaceId });
    const entry = await seedTaggedEntry([]);
    expect(
      await violated(
        db.insert(timeEntryTag).values({
          workspaceId: ours.workspaceId,
          timeEntryId: entry.id,
          tagId: foreign.id,
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("time_entry_tag_tag_fk");
    expect(
      await violated(
        db.insert(timeEntryTag).values({
          workspaceId: theirs.workspaceId,
          timeEntryId: entry.id,
          tagId: foreign.id,
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("time_entry_tag_entry_fk");
  });

  it("borrar una etiqueta la saca de la entrada, que queda con sus horas y sus otras etiquetas", async () => {
    const design = await seedTag({ workspaceId: ours.workspaceId });
    const review = await seedTag({ workspaceId: ours.workspaceId });
    const entry = await seedTaggedEntry([design.id, review.id]);

    await db.delete(tag).where(eq(tag.id, design.id));

    expect(await tagIdsOfEntry(entry.id)).toEqual([review.id]);
    expect(await timeEntryById(entry.id)).toMatchObject({
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    });
  });

  it("borrar la entrada borra sus filas de la unión y deja las etiquetas", async () => {
    const design = await seedTag({ workspaceId: ours.workspaceId });
    const entry = await seedTaggedEntry([design.id]);
    const other = await seedTaggedEntry([design.id]);

    await db.delete(timeEntry).where(eq(timeEntry.id, entry.id));

    expect(await tagIdsOfEntry(entry.id)).toEqual([]);
    expect(await tagIdsOfEntry(other.id)).toEqual([design.id]);
    expect(await db.select().from(tag).where(eq(tag.id, design.id))).toHaveLength(1);
  });

  it("borrar el workspace funciona y se lleva entradas, etiquetas y unión", async () => {
    const design = await seedTag({ workspaceId: ours.workspaceId });
    const entry = await seedTaggedEntry([design.id]);

    await db.delete(workspace).where(eq(workspace.id, ours.workspaceId));

    expect(await timeEntryById(entry.id)).toBeUndefined();
    expect(await db.select().from(timeEntryTag)).toEqual([]);
    expect(
      await db.select().from(tag).where(eq(tag.workspaceId, ours.workspaceId)),
    ).toEqual([]);
  });

  it("isMissingTag reconoce un 23503 real de time_entry_tag_tag_fk y no el del proyecto", async () => {
    const theirs = await seedWorkspace();
    const foreign = await seedTag({ workspaceId: theirs.workspaceId });
    const entry = await seedTaggedEntry([]);
    const missingTag = await rejection(
      db.insert(timeEntryTag).values({
        workspaceId: ours.workspaceId,
        timeEntryId: entry.id,
        tagId: foreign.id,
      }),
    );
    expect(timeEntryRepository.isMissingTag(missingTag)).toBe(true);
    expect(timeEntryRepository.isMissingProject(missingTag)).toBe(false);

    const foreignProject = await seedProject({ workspaceId: theirs.workspaceId });
    const missingProject = await rejection(
      insertEntry({ projectId: foreignProject.id, taskId: null }),
    );
    expect(timeEntryRepository.isMissingTag(missingProject)).toBe(false);
  });
});

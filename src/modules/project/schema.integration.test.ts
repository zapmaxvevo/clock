import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import {
  CHECK_VIOLATION,
  constraintOf,
  UNIQUE_VIOLATION,
} from "@/server/db/constraint-error";
import {
  client,
  membership,
  project,
  projectMember,
  tag,
  task,
  taskAssignee,
  workspace,
} from "@/server/db/schema";
import {
  seedClient,
  seedMember,
  seedProject,
  seedTag,
  seedTask,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";

import { PALETTE_KEYS } from "./palette";

/**
 * La base, escrita de forma directa y sin pasar por el service: lo que tiene
 * que rechazar o hacer aunque el service se equivoque.
 */

/** Postgres: violación de clave foránea. */
const FOREIGN_KEY_VIOLATION = "23503";

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
let theirs: SeededWorkspace;

beforeEach(async () => {
  ours = await seedWorkspace();
  theirs = await seedWorkspace();
});

describe("aislamiento por workspace (criterio 1)", () => {
  it("rechaza un proyecto con el cliente de otro workspace", async () => {
    const foreign = await seedClient({ workspaceId: theirs.workspaceId });
    expect(
      await violated(
        db.insert(project).values({
          workspaceId: ours.workspaceId,
          clientId: foreign.id,
          name: "Web",
          color: "blue",
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("project_client_fk");
  });

  it("rechaza una tarea con el proyecto de otro workspace", async () => {
    const foreign = await seedProject({ workspaceId: theirs.workspaceId });
    expect(
      await violated(
        db.insert(task).values({
          workspaceId: ours.workspaceId,
          projectId: foreign.id,
          name: "Diseño",
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("task_project_fk");
  });

  it("rechaza un miembro de proyecto o un asignado sin membresía en ese workspace", async () => {
    const outsider = await seedMember(theirs.workspaceId, "member");
    const own = await seedProject({ workspaceId: ours.workspaceId });
    const ownTask = await seedTask({ workspaceId: ours.workspaceId, projectId: own.id });
    expect(
      await violated(
        db
          .insert(projectMember)
          .values({ workspaceId: ours.workspaceId, projectId: own.id, userId: outsider }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("project_member_membership_fk");
    expect(
      await violated(
        db.insert(taskAssignee).values({
          workspaceId: ours.workspaceId,
          taskId: ownTask.id,
          userId: outsider,
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("task_assignee_membership_fk");
  });

  it("rechaza un miembro de proyecto que apunta al proyecto de otro workspace", async () => {
    const foreign = await seedProject({ workspaceId: theirs.workspaceId });
    expect(
      await violated(
        db.insert(projectMember).values({
          workspaceId: ours.workspaceId,
          projectId: foreign.id,
          userId: ours.ownerId,
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("project_member_project_fk");
  });

  it("rechaza un created_by sin membresía en ese workspace, en las tres tablas", async () => {
    const outsider = await seedMember(theirs.workspaceId, "member");
    const own = await seedProject({ workspaceId: ours.workspaceId });
    expect(
      await violated(
        db
          .insert(client)
          .values({ workspaceId: ours.workspaceId, name: "Acme", createdBy: outsider }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("client_created_by_fk");
    expect(
      await violated(
        db.insert(project).values({
          workspaceId: ours.workspaceId,
          name: "Web",
          color: "blue",
          createdBy: outsider,
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("project_created_by_fk");
    expect(
      await violated(
        db.insert(task).values({
          workspaceId: ours.workspaceId,
          projectId: own.id,
          name: "Diseño",
          createdBy: outsider,
        }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("task_created_by_fk");
  });
});

describe("borrados (criterio 2)", () => {
  it("borrar un cliente deja a sus proyectos sin cliente y en su workspace (PR-09)", async () => {
    const owner = await seedClient({ workspaceId: ours.workspaceId });
    const web = await seedProject({ workspaceId: ours.workspaceId, clientId: owner.id });

    await db.delete(client).where(eq(client.id, owner.id));

    const [after] = await db.select().from(project).where(eq(project.id, web.id));
    expect(after.clientId).toBeNull();
    expect(after.workspaceId).toBe(ours.workspaceId);
  });

  it("rechaza borrar un cliente si un proyecto suyo choca con uno sin cliente, y nada cambia (PR-111)", async () => {
    const owner = await seedClient({ workspaceId: ours.workspaceId });
    const owned = await seedProject({
      workspaceId: ours.workspaceId,
      clientId: owner.id,
      name: "Web",
    });
    await seedProject({ workspaceId: ours.workspaceId, clientId: null, name: "WEB" });

    expect(
      await violated(db.delete(client).where(eq(client.id, owner.id)), UNIQUE_VIOLATION),
    ).toBe("project_name_unq");

    expect(await db.select().from(client).where(eq(client.id, owner.id))).toHaveLength(1);
    const [after] = await db.select().from(project).where(eq(project.id, owned.id));
    expect(after.clientId).toBe(owner.id);
  });

  it("borrar un proyecto borra sus tareas, sus miembros y sus asignados (PR-35)", async () => {
    const member = await seedMember(ours.workspaceId, "member");
    const web = await seedProject({
      workspaceId: ours.workspaceId,
      members: [{ userId: member, isManager: true }],
    });
    const design = await seedTask({ workspaceId: ours.workspaceId, projectId: web.id });
    await db
      .insert(taskAssignee)
      .values({ workspaceId: ours.workspaceId, taskId: design.id, userId: member });
    const other = await seedProject({
      workspaceId: ours.workspaceId,
      members: [{ userId: member }],
    });

    await db.delete(project).where(eq(project.id, web.id));

    expect(await db.select().from(task).where(eq(task.projectId, web.id))).toEqual([]);
    expect(await db.select().from(taskAssignee)).toEqual([]);
    const members = await db.select().from(projectMember);
    expect(members.map((row) => row.projectId)).toEqual([other.id]);
  });

  it("borrar una membresía borra sus pertenencias y anula su created_by sin tocar el workspace (§3.3)", async () => {
    const member = await seedMember(ours.workspaceId, "member");
    const owner = await seedClient({ workspaceId: ours.workspaceId, createdBy: member });
    const web = await seedProject({
      workspaceId: ours.workspaceId,
      createdBy: member,
      members: [{ userId: member, isManager: true }, { userId: ours.ownerId }],
    });
    const design = await seedTask({
      workspaceId: ours.workspaceId,
      projectId: web.id,
      createdBy: member,
    });
    await db.insert(taskAssignee).values([
      { workspaceId: ours.workspaceId, taskId: design.id, userId: member },
      { workspaceId: ours.workspaceId, taskId: design.id, userId: ours.ownerId },
    ]);

    await db
      .delete(membership)
      .where(
        and(eq(membership.workspaceId, ours.workspaceId), eq(membership.userId, member)),
      );

    expect((await db.select().from(projectMember)).map((row) => row.userId)).toEqual([
      ours.ownerId,
    ]);
    expect((await db.select().from(taskAssignee)).map((row) => row.userId)).toEqual([
      ours.ownerId,
    ]);
    const [clientAfter] = await db.select().from(client).where(eq(client.id, owner.id));
    const [projectAfter] = await db.select().from(project).where(eq(project.id, web.id));
    const [taskAfter] = await db.select().from(task).where(eq(task.id, design.id));
    for (const row of [clientAfter, projectAfter, taskAfter]) {
      expect(row.createdBy).toBeNull();
      expect(row.workspaceId).toBe(ours.workspaceId);
    }
  });

  it("borrar el workspace entero se lleva todo lo de proyectos", async () => {
    const member = await seedMember(ours.workspaceId, "member");
    const owner = await seedClient({ workspaceId: ours.workspaceId, createdBy: member });
    // El par de PR-111: borrar solo el cliente choca; borrar el workspace, no.
    const web = await seedProject({
      workspaceId: ours.workspaceId,
      clientId: owner.id,
      name: "Web",
      createdBy: member,
      members: [{ userId: member, isManager: true }],
    });
    await seedProject({ workspaceId: ours.workspaceId, clientId: null, name: "web" });
    const design = await seedTask({
      workspaceId: ours.workspaceId,
      projectId: web.id,
      createdBy: member,
    });
    await db
      .insert(taskAssignee)
      .values({ workspaceId: ours.workspaceId, taskId: design.id, userId: member });
    const survivor = await seedProject({ workspaceId: theirs.workspaceId });

    await db.delete(workspace).where(eq(workspace.id, ours.workspaceId));

    expect(await db.select().from(client)).toEqual([]);
    expect((await db.select().from(project)).map((row) => row.id)).toEqual([survivor.id]);
    expect(await db.select().from(task)).toEqual([]);
    expect(await db.select().from(projectMember)).toEqual([]);
    expect(await db.select().from(taskAssignee)).toEqual([]);
  });
});

describe("unicidad (criterio 3: PR-49 … PR-51, PR-53)", () => {
  it("dos clientes con el mismo nombre chocan aunque cambien las mayúsculas", async () => {
    await seedClient({ workspaceId: ours.workspaceId, name: "Acme" });
    expect(
      await violated(
        seedClient({ workspaceId: ours.workspaceId, name: "ACME" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("client_name_unq");
  });

  it("un cliente archivado cuenta", async () => {
    await seedClient({ workspaceId: ours.workspaceId, name: "Acme", archived: true });
    expect(
      await violated(
        seedClient({ workspaceId: ours.workspaceId, name: "acme" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("client_name_unq");
  });

  it("el mismo nombre de cliente convive en otro workspace", async () => {
    await seedClient({ workspaceId: ours.workspaceId, name: "Acme" });
    await expect(
      seedClient({ workspaceId: theirs.workspaceId, name: "Acme" }),
    ).resolves.toBeDefined();
  });

  it("dos proyectos del mismo cliente con el mismo nombre chocan", async () => {
    const owner = await seedClient({ workspaceId: ours.workspaceId });
    await seedProject({ workspaceId: ours.workspaceId, clientId: owner.id, name: "Web" });
    expect(
      await violated(
        seedProject({ workspaceId: ours.workspaceId, clientId: owner.id, name: "wEB" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("project_name_unq");
  });

  it("dos proyectos sin cliente con el mismo nombre chocan (PR-50)", async () => {
    await seedProject({ workspaceId: ours.workspaceId, name: "Web" });
    expect(
      await violated(
        seedProject({ workspaceId: ours.workspaceId, name: "WEB" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("project_name_unq");
  });

  it("un proyecto archivado cuenta", async () => {
    await seedProject({ workspaceId: ours.workspaceId, name: "Web", archived: true });
    expect(
      await violated(
        seedProject({ workspaceId: ours.workspaceId, name: "web" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("project_name_unq");
  });

  it("el mismo nombre de proyecto convive con clientes distintos, y con y sin cliente", async () => {
    const acme = await seedClient({ workspaceId: ours.workspaceId });
    const globex = await seedClient({ workspaceId: ours.workspaceId });
    await seedProject({ workspaceId: ours.workspaceId, clientId: acme.id, name: "Web" });
    await seedProject({
      workspaceId: ours.workspaceId,
      clientId: globex.id,
      name: "Web",
    });
    await seedProject({ workspaceId: ours.workspaceId, clientId: null, name: "Web" });
    await seedProject({ workspaceId: theirs.workspaceId, clientId: null, name: "Web" });
    expect(await db.select().from(project)).toHaveLength(4);
  });

  it("dos tareas del mismo proyecto con el mismo nombre chocan; en otro proyecto conviven", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    const app = await seedProject({ workspaceId: ours.workspaceId });
    await seedTask({ workspaceId: ours.workspaceId, projectId: web.id, name: "Diseño" });
    await seedTask({ workspaceId: ours.workspaceId, projectId: app.id, name: "Diseño" });
    expect(
      await violated(
        seedTask({ workspaceId: ours.workspaceId, projectId: web.id, name: "DISEÑO" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("task_name_unq");
  });

  it("una tarea hecha cuenta", async () => {
    const web = await seedProject({ workspaceId: ours.workspaceId });
    await seedTask({
      workspaceId: ours.workspaceId,
      projectId: web.id,
      name: "Diseño",
      status: "done",
    });
    expect(
      await violated(
        seedTask({ workspaceId: ours.workspaceId, projectId: web.id, name: "diseño" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("task_name_unq");
  });
});

describe("largos y recortes en la base (criterio 4: PR-54, PR-109)", () => {
  const writers = {
    client: (name: string) => seedClient({ workspaceId: ours.workspaceId, name }),
    project: (name: string) => seedProject({ workspaceId: ours.workspaceId, name }),
    task: async (name: string) => {
      const web = await seedProject({ workspaceId: ours.workspaceId });
      return seedTask({ workspaceId: ours.workspaceId, projectId: web.id, name });
    },
  } as const;

  for (const [entity, write] of Object.entries(writers)) {
    it(`${entity}: rechaza un nombre vacío o de más de 100 caracteres`, async () => {
      expect(await violated(write(""), CHECK_VIOLATION)).toBe(`${entity}_name_len`);
      expect(await violated(write("a".repeat(101)), CHECK_VIOLATION)).toBe(
        `${entity}_name_len`,
      );
      await expect(write("a".repeat(100))).resolves.toBeDefined();
    });

    it(`${entity}: rechaza un nombre con espacios en los extremos`, async () => {
      expect(await violated(write(" Acme"), CHECK_VIOLATION)).toBe(
        `${entity}_name_trimmed`,
      );
      expect(await violated(write("Acme "), CHECK_VIOLATION)).toBe(
        `${entity}_name_trimmed`,
      );
    });
  }

  it("la dirección y la nota del cliente llegan hasta 3000 caracteres", async () => {
    const long = "a".repeat(3000);
    await db
      .insert(client)
      .values({ workspaceId: ours.workspaceId, name: "Acme", address: long, note: long });
    expect(
      await violated(
        db
          .insert(client)
          .values({ workspaceId: ours.workspaceId, name: "Globex", address: `${long}a` }),
        CHECK_VIOLATION,
      ),
    ).toBe("client_address_len");
    expect(
      await violated(
        db
          .insert(client)
          .values({ workspaceId: ours.workspaceId, name: "Initech", note: `${long}a` }),
        CHECK_VIOLATION,
      ),
    ).toBe("client_note_len");
  });

  it("la nota del proyecto llega hasta 3000 caracteres", async () => {
    const long = "a".repeat(3000);
    await db
      .insert(project)
      .values({ workspaceId: ours.workspaceId, name: "Web", color: "blue", note: long });
    expect(
      await violated(
        db.insert(project).values({
          workspaceId: ours.workspaceId,
          name: "App",
          color: "blue",
          note: `${long}a`,
        }),
        CHECK_VIOLATION,
      ),
    ).toBe("project_note_len");
  });

  it("el color del proyecto es una de las claves de palette.ts (P-30)", async () => {
    for (const color of PALETTE_KEYS) {
      await seedProject({ workspaceId: ours.workspaceId, color });
    }
    expect(
      await violated(
        db
          .insert(project)
          .values({ workspaceId: ours.workspaceId, name: "Web", color: "#2563EB" }),
        CHECK_VIOLATION,
      ),
    ).toBe("project_color_palette");
  });
});

describe("la tabla tag (criterio 1 del 11b: PR-42, PR-52 … PR-54)", () => {
  /** La definición de una restricción, como la guarda la base. */
  async function constraintDefinition(name: string): Promise<string | undefined> {
    const result = await db.execute(
      sql`select pg_get_constraintdef(oid) as definition from pg_constraint where conname = ${name}`,
    );
    return (result.rows.at(0) as { definition: string } | undefined)?.definition;
  }

  it("las tres migraciones del 11b están en el diario en orden, y la última deja set null (created_by)", async () => {
    const journal = JSON.parse(
      await readFile(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };
    const tags = journal.entries.map((entry) => entry.tag);
    const position = (name: string) => tags.indexOf(name);
    expect(position("0009_time_entry_billable")).toBeGreaterThanOrEqual(0);
    const after = position("0009_time_entry_billable") + 1;
    expect(tags.slice(after, after + 3)).toEqual([
      "0010_time_entry_workspace_id_unq",
      "0011_tags",
      "0012_tags_set_null",
    ]);
    expect(await constraintDefinition("tag_created_by_fk")).toContain(
      "ON DELETE SET NULL (created_by)",
    );
    expect(await constraintDefinition("time_entry_workspace_id_unq")).toBe(
      "UNIQUE (workspace_id, id)",
    );
  });

  it("rechaza un nombre vacío o de más de 100 caracteres, y acepta 100", async () => {
    const write = (name: string) => seedTag({ workspaceId: ours.workspaceId, name });
    expect(await violated(write(""), CHECK_VIOLATION)).toBe("tag_name_len");
    expect(await violated(write("a".repeat(101)), CHECK_VIOLATION)).toBe("tag_name_len");
    await expect(write("a".repeat(100))).resolves.toBeDefined();
  });

  it("rechaza un nombre con espacios en los extremos", async () => {
    const write = (name: string) => seedTag({ workspaceId: ours.workspaceId, name });
    expect(await violated(write(" Diseño"), CHECK_VIOLATION)).toBe("tag_name_trimmed");
    expect(await violated(write("Diseño "), CHECK_VIOLATION)).toBe("tag_name_trimmed");
  });

  it("dos etiquetas con el mismo nombre chocan aunque cambien las mayúsculas (PR-52)", async () => {
    await seedTag({ workspaceId: ours.workspaceId, name: "Diseño" });
    expect(
      await violated(
        seedTag({ workspaceId: ours.workspaceId, name: "DISEÑO" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("tag_name_unq");
  });

  it("una etiqueta archivada cuenta (PR-53)", async () => {
    await seedTag({ workspaceId: ours.workspaceId, name: "Vieja", archived: true });
    expect(
      await violated(
        seedTag({ workspaceId: ours.workspaceId, name: "vieja" }),
        UNIQUE_VIOLATION,
      ),
    ).toBe("tag_name_unq");
  });

  it("el mismo nombre convive en otro workspace", async () => {
    await seedTag({ workspaceId: ours.workspaceId, name: "Diseño" });
    await expect(
      seedTag({ workspaceId: theirs.workspaceId, name: "Diseño" }),
    ).resolves.toBeDefined();
  });

  it("rechaza un created_by sin membresía en ese workspace", async () => {
    const outsider = await seedMember(theirs.workspaceId, "member");
    expect(
      await violated(
        db
          .insert(tag)
          .values({ workspaceId: ours.workspaceId, name: "Diseño", createdBy: outsider }),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe("tag_created_by_fk");
  });

  it("borrar la membresía de quien la creó deja created_by en nulo y la etiqueta en su workspace", async () => {
    const member = await seedMember(ours.workspaceId, "member");
    const created = await seedTag({ workspaceId: ours.workspaceId, createdBy: member });

    await db
      .delete(membership)
      .where(
        and(eq(membership.workspaceId, ours.workspaceId), eq(membership.userId, member)),
      );

    const [after] = await db.select().from(tag).where(eq(tag.id, created.id));
    expect(after.createdBy).toBeNull();
    expect(after.workspaceId).toBe(ours.workspaceId);
  });

  it("borrar el workspace se lleva sus etiquetas y deja las de otro", async () => {
    await seedTag({ workspaceId: ours.workspaceId });
    const survivor = await seedTag({ workspaceId: theirs.workspaceId });

    await db.delete(workspace).where(eq(workspace.id, ours.workspaceId));

    expect((await db.select().from(tag)).map((row) => row.id)).toEqual([survivor.id]);
  });
});

import { randomUUID } from "node:crypto";

import { eq, TransactionRollbackError } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, type Transaction } from "@/server/db";
import {
  client,
  membership,
  project,
  projectMember,
  task,
  taskAssignee,
  workspace,
} from "@/server/db/schema";
import { can, ForbiddenError, type Actor, type Role } from "@/server/permissions";
import { raceThroughBarrier } from "@/test/concurrency";
import {
  seedClient,
  seedMember,
  seedProject,
  seedTask,
  seedWorkspace,
} from "@/test/factories";
import { auditFor } from "@/test/queries";

import { nextPaletteColor } from "./palette";
import {
  createClientInput,
  createProjectInput,
  createTaskInput,
  projectMessages,
  type CreateClientInput,
  type CreateProjectInput,
  type CreateTaskInput,
  type ProjectCatalog,
  type TrackingCatalog,
} from "./schema";
import {
  assertTrackable,
  createClient,
  createProject,
  createTask,
  getProjectCatalog,
  getTrackingCatalog,
  ProjectError,
} from "./service";

let workspaceId: string;
let owner: Actor;
let admin: Actor;
let member: Actor;

function actorFor(userId: string, role: Role): Actor {
  return { userId, workspaceId, role, status: "active" };
}

async function seedActor(role: Role): Promise<Actor> {
  return actorFor(await seedMember(workspaceId, role), role);
}

beforeEach(async () => {
  const seeded = await seedWorkspace();
  workspaceId = seeded.workspaceId;
  owner = actorFor(seeded.ownerId, "owner");
  admin = await seedActor("admin");
  member = await seedActor("member");
});

/** Lo que la action le pasa al service: la entrada ya validada por Zod. */
function clientValues(input: Partial<CreateClientInput> = {}) {
  return createClientInput.parse({ id: randomUUID(), name: "Acme", ...input });
}

function projectValues(input: Partial<CreateProjectInput> = {}) {
  return createProjectInput.parse({
    id: randomUUID(),
    name: "Web",
    clientId: null,
    color: null,
    ...input,
  });
}

function taskValues(projectId: string, input: Partial<CreateTaskInput> = {}) {
  return createTaskInput.parse({ id: randomUUID(), projectId, name: "Diseño", ...input });
}

/** El error de una operación que tiene que fallar. */
async function failureOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("La operación terminó bien.");
}

async function expectProjectError(
  work: Promise<unknown>,
  code: ProjectError["code"],
  message: string,
): Promise<void> {
  const error = await failureOf(work);
  expect(error).toBeInstanceOf(ProjectError);
  expect(error).toMatchObject({ code, message });
}

async function expectForbidden(work: Promise<unknown>): Promise<void> {
  expect(await failureOf(work)).toBeInstanceOf(ForbiddenError);
}

async function clientRows() {
  return db.select().from(client).where(eq(client.workspaceId, workspaceId));
}

async function projectRows() {
  return db.select().from(project).where(eq(project.workspaceId, workspaceId));
}

async function taskRows() {
  return db.select().from(task).where(eq(task.workspaceId, workspaceId));
}

/** El registro de auditoría de un alta, con su `nextValue` ya leído. */
async function auditsOf(entity: "client" | "project" | "task", entityId: string) {
  const rows = await auditFor(entity, entityId);
  return rows.map((row) => ({
    action: row.action,
    actorId: row.actorId,
    workspaceId: row.workspaceId,
    nextValue: row.nextValue === null ? null : (JSON.parse(row.nextValue) as unknown),
  }));
}

describe("createClient (criterio 5: PR-01 … PR-03, PR-58)", () => {
  it("un member crea un cliente con nombre, dirección y nota", async () => {
    const values = clientValues({ name: " Acme ", address: " Calle 1 ", note: "VIP" });

    const result = await createClient(member, values);

    expect(result).toEqual({ client: { id: values.id, name: "Acme" } });
    const [row] = await clientRows();
    expect(row).toMatchObject({
      id: values.id,
      workspaceId,
      name: "Acme",
      address: "Calle 1",
      note: "VIP",
      archivedAt: null,
      createdBy: member.userId,
    });
  });

  it("los cinco roles activos crean clientes", async () => {
    for (const role of ["project_manager", "team_manager"] as const) {
      const actor = await seedActor(role);
      await createClient(actor, clientValues({ name: `Cliente ${role}` }));
    }
    await createClient(owner, clientValues({ name: "Del owner" }));
    await createClient(admin, clientValues({ name: "Del admin" }));
    await createClient(member, clientValues({ name: "Del member" }));
    expect(await clientRows()).toHaveLength(5);
  });

  it("un nombre repetido, aunque cambien las mayúsculas, responde PR-78 y no escribe", async () => {
    await seedClient({ workspaceId, name: "Acme" });
    await expectProjectError(
      createClient(member, clientValues({ name: "ACME" })),
      "validation",
      projectMessages.clientNameTaken,
    );
    expect(await clientRows()).toHaveLength(1);
  });

  it("un cliente archivado también ocupa el nombre", async () => {
    await seedClient({ workspaceId, name: "Acme", archived: true });
    await expectProjectError(
      createClient(member, clientValues({ name: "acme" })),
      "validation",
      projectMessages.clientNameTaken,
    );
  });

  it("el mismo nombre en otro workspace no choca", async () => {
    const other = await seedWorkspace();
    await seedClient({ workspaceId: other.workspaceId, name: "Acme" });
    await expect(
      createClient(member, clientValues({ name: "Acme" })),
    ).resolves.toBeDefined();
  });
});

describe("createProject (criterio 6: PR-12 … PR-17, PR-19, PR-30, PR-58, PR-86, PR-97)", () => {
  it("un member crea un proyecto público, sin facturable, con su nota y cliente, y queda como responsable", async () => {
    const acme = await seedClient({ workspaceId });
    const values = projectValues({ clientId: acme.id, color: "teal", note: " Nota " });

    const result = await createProject(member, values);

    expect(result).toEqual({
      project: {
        id: values.id,
        name: "Web",
        color: "teal",
        isPublic: true,
        canCreateTask: true,
        tasks: [],
      },
    });
    const [row] = await projectRows();
    expect(row).toMatchObject({
      id: values.id,
      workspaceId,
      clientId: acme.id,
      name: "Web",
      color: "teal",
      isPublic: true,
      billableByDefault: false,
      note: "Nota",
      archivedAt: null,
      createdBy: member.userId,
    });
    const members = await db.select().from(projectMember);
    expect(members).toEqual([
      expect.objectContaining({
        workspaceId,
        projectId: values.id,
        userId: member.userId,
        isManager: true,
      }),
    ]);
  });

  it("sin cliente es válido en un workspace que no tiene ningún cliente (PR-86)", async () => {
    expect(await clientRows()).toEqual([]);
    const values = projectValues({ clientId: null });
    await createProject(member, values);
    const [row] = await projectRows();
    expect(row.clientId).toBeNull();
  });

  it("sin color elegido recibe el que sigue en la paleta, contando también los archivados (PR-15)", async () => {
    await seedProject({ workspaceId, color: "slate" });
    await seedProject({ workspaceId, color: "slate", archived: true });
    const other = await seedWorkspace();
    await seedProject({ workspaceId: other.workspaceId });

    const result = await createProject(member, projectValues({ color: null }));

    expect(result.project.color).toBe(nextPaletteColor(2));
    expect(result.project.color).toBe("amber");
  });

  it("con un cliente archivado responde PR-83 y no escribe nada", async () => {
    const archived = await seedClient({ workspaceId, archived: true });
    await expectProjectError(
      createProject(member, projectValues({ clientId: archived.id })),
      "not_found",
      projectMessages.clientUnavailable,
    );
    expect(await projectRows()).toEqual([]);
    expect(await db.select().from(projectMember)).toEqual([]);
  });

  it("con un cliente de otro workspace o inexistente responde PR-83", async () => {
    const other = await seedWorkspace();
    const foreign = await seedClient({ workspaceId: other.workspaceId });
    for (const clientId of [foreign.id, randomUUID()]) {
      await expectProjectError(
        createProject(member, projectValues({ clientId })),
        "not_found",
        projectMessages.clientUnavailable,
      );
    }
    expect(await db.select().from(project)).toHaveLength(0);
  });

  it("con un nombre repetido para ese cliente responde PR-77; con otro cliente convive", async () => {
    const acme = await seedClient({ workspaceId });
    const globex = await seedClient({ workspaceId });
    await seedProject({ workspaceId, clientId: acme.id, name: "Web" });

    await expectProjectError(
      createProject(member, projectValues({ clientId: acme.id, name: "WEB" })),
      "validation",
      projectMessages.projectNameTaken,
    );
    await createProject(member, projectValues({ clientId: globex.id, name: "Web" }));
    await createProject(member, projectValues({ clientId: null, name: "Web" }));
    expect(await projectRows()).toHaveLength(3);
  });

  it("dos proyectos sin cliente con el mismo nombre responden PR-77", async () => {
    await seedProject({ workspaceId, clientId: null, name: "Web" });
    await expectProjectError(
      createProject(member, projectValues({ clientId: null, name: "web" })),
      "validation",
      projectMessages.projectNameTaken,
    );
  });
});

describe("createTask (criterio 7: PR-35, PR-36, PR-40, PR-58)", () => {
  it("el responsable del proyecto crea una tarea activa, sin asignados", async () => {
    const web = await seedProject({
      workspaceId,
      isPublic: false,
      members: [{ userId: member.userId, isManager: true }],
    });
    const values = taskValues(web.id, { name: " Diseño " });

    const result = await createTask(member, values);

    expect(result).toEqual({ task: { id: values.id, name: "Diseño" } });
    const [row] = await taskRows();
    expect(row).toMatchObject({
      id: values.id,
      workspaceId,
      projectId: web.id,
      name: "Diseño",
      status: "active",
      createdBy: member.userId,
    });
    expect(await db.select().from(taskAssignee)).toEqual([]);
  });

  it("un admin y el owner crean tareas aunque no sean miembros, también en un privado", async () => {
    const web = await seedProject({ workspaceId, isPublic: false });
    await createTask(admin, taskValues(web.id, { name: "Del admin" }));
    await createTask(owner, taskValues(web.id, { name: "Del owner" }));
    expect((await taskRows()).map((row) => row.name).sort()).toEqual([
      "Del admin",
      "Del owner",
    ]);
  });

  it("un member que no es responsable recibe PR-84, sea o no miembro", async () => {
    const open = await seedProject({ workspaceId });
    const joined = await seedProject({
      workspaceId,
      isPublic: false,
      members: [{ userId: member.userId, isManager: false }],
    });
    await expectForbidden(createTask(member, taskValues(open.id)));
    await expectForbidden(createTask(member, taskValues(joined.id)));
    expect(await taskRows()).toEqual([]);
  });

  it("team_manager y project_manager sin marca de responsable reciben PR-84 (PR-57)", async () => {
    const web = await seedProject({ workspaceId });
    for (const role of ["team_manager", "project_manager"] as const) {
      await expectForbidden(createTask(await seedActor(role), taskValues(web.id)));
    }
  });

  it("un proyecto archivado, invisible, inexistente o de otro workspace responde PR-72", async () => {
    const archived = await seedProject({
      workspaceId,
      archived: true,
      members: [{ userId: member.userId, isManager: true }],
    });
    const hidden = await seedProject({ workspaceId, isPublic: false });
    const other = await seedWorkspace();
    const foreign = await seedProject({ workspaceId: other.workspaceId });

    for (const projectId of [archived.id, hidden.id, randomUUID(), foreign.id]) {
      await expectProjectError(
        createTask(member, taskValues(projectId)),
        "not_found",
        projectMessages.projectUnavailable,
      );
    }
    await expectProjectError(
      createTask(owner, taskValues(archived.id)),
      "not_found",
      projectMessages.projectUnavailable,
    );
    expect(await db.select().from(task)).toEqual([]);
  });

  it("un nombre repetido en el proyecto responde PR-79; en otro proyecto convive", async () => {
    const web = await seedProject({ workspaceId });
    const app = await seedProject({ workspaceId });
    await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });

    await expectProjectError(
      createTask(owner, taskValues(web.id, { name: "DISEÑO" })),
      "validation",
      projectMessages.taskNameTaken,
    );
    await createTask(owner, taskValues(app.id, { name: "Diseño" }));
    expect(await taskRows()).toHaveLength(2);
  });
});

describe("getProjectCatalog: el filtro de lectura (criterio 9: PR-61, PR-62, PR-93)", () => {
  async function seedMixedWorkspace() {
    const acme = await seedClient({ workspaceId, name: "acme" });
    const secret = await seedClient({ workspaceId, name: "Secreto" });
    const bravo = await seedClient({ workspaceId, name: "Bravo" });
    const lonely = await seedClient({ workspaceId, name: "Solo" });
    await seedClient({ workspaceId, name: "Archivado", archived: true });
    const web = await seedProject({ workspaceId, clientId: acme.id, name: "Web" });
    const app = await seedProject({ workspaceId, clientId: acme.id, name: "app" });
    const vault = await seedProject({
      workspaceId,
      clientId: secret.id,
      name: "Bóveda",
      isPublic: false,
    });
    const joined = await seedProject({
      workspaceId,
      clientId: bravo.id,
      name: "Interno",
      isPublic: false,
      members: [{ userId: member.userId, isManager: false }],
    });
    const free = await seedProject({ workspaceId, name: "Libre" });
    const old = await seedProject({ workspaceId, name: "Viejo", archived: true });
    await seedTask({ workspaceId, projectId: web.id, name: "maquetado" });
    await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });
    await seedTask({ workspaceId, projectId: web.id, name: "Hecha", status: "done" });
    await seedTask({ workspaceId, projectId: vault.id, name: "Secreta" });
    await seedTask({ workspaceId, projectId: old.id, name: "Del archivado" });
    return { acme, secret, bravo, lonely, web, app, vault, joined, free, old };
  }

  const names = (catalog: ProjectCatalog) =>
    catalog.groups.map((group) => [
      group.client?.name ?? null,
      group.projects.map((view) => view.name),
    ]);

  it("devuelve exactamente los proyectos activos que acepta can(…, project.view, …)", async () => {
    await seedMixedWorkspace();
    const projects = await projectRows();
    const members = await db.select().from(projectMember);

    for (const actor of [owner, admin, member, await seedActor("team_manager")]) {
      const expected = projects
        .filter((row) => {
          const own = members.find(
            (item) => item.projectId === row.id && item.userId === actor.userId,
          );
          return (
            row.archivedAt === null &&
            can(actor, "project.view", {
              kind: "project",
              workspaceId: row.workspaceId,
              isPublic: row.isPublic,
              viewer: own === undefined ? null : { isManager: own.isManager },
            })
          );
        })
        .map((row) => row.id)
        .sort();
      const catalog = await getProjectCatalog(actor);
      const seen = catalog.groups.flatMap((group) =>
        group.projects.map((view) => view.id),
      );
      expect(seen.sort()).toEqual(expected);
    }
  });

  it("un member no ve el privado ajeno ni sus tareas, y su cliente no forma grupo; el admin sí", async () => {
    const seeded = await seedMixedWorkspace();

    const forMember = await getProjectCatalog(member);
    expect(names(forMember)).toEqual([
      ["acme", ["app", "Web"]],
      ["Bravo", ["Interno"]],
      [null, ["Libre"]],
    ]);
    const memberTasks = forMember.groups.flatMap((group) =>
      group.projects.flatMap((view) => view.tasks.map((item) => item.name)),
    );
    expect(memberTasks).not.toContain("Secreta");

    const forAdmin = await getProjectCatalog(admin);
    expect(names(forAdmin)).toEqual([
      ["acme", ["app", "Web"]],
      ["Bravo", ["Interno"]],
      ["Secreto", ["Bóveda"]],
      [null, ["Libre"]],
    ]);
    const vault = forAdmin.groups
      .flatMap((group) => group.projects)
      .find((view) => view.id === seeded.vault.id);
    expect(vault?.tasks).toEqual([{ id: expect.any(String), name: "Secreta" }]);
  });

  it("ordena tareas sin distinguir mayúsculas y deja fuera las hechas y las de archivados", async () => {
    const seeded = await seedMixedWorkspace();
    const catalog = await getProjectCatalog(owner);
    const web = catalog.groups
      .flatMap((group) => group.projects)
      .find((view) => view.id === seeded.web.id);
    expect(web?.tasks.map((item) => item.name)).toEqual(["Diseño", "maquetado"]);
    const all = catalog.groups.flatMap((group) =>
      group.projects.map((view) => view.name),
    );
    expect(all).not.toContain("Viejo");
  });

  it("los clientes del diálogo son los activos, en orden alfabético, con o sin proyectos visibles", async () => {
    await seedMixedWorkspace();
    const catalog = await getProjectCatalog(member);
    expect(catalog.clients.map((row) => row.name)).toEqual([
      "acme",
      "Bravo",
      "Secreto",
      "Solo",
    ]);
  });

  it("marca canCreateTask con can(task.create) por proyecto", async () => {
    const seeded = await seedMixedWorkspace();
    const managed = await seedProject({
      workspaceId,
      name: "Propio",
      members: [{ userId: member.userId, isManager: true }],
    });
    const catalog = await getProjectCatalog(member);
    const flags = Object.fromEntries(
      catalog.groups.flatMap((group) =>
        group.projects.map((view) => [view.id, view.canCreateTask]),
      ),
    );
    expect(flags).toEqual({
      [seeded.web.id]: false,
      [seeded.app.id]: false,
      [seeded.joined.id]: false,
      [seeded.free.id]: false,
      [managed.id]: true,
    });
    const forAdmin = await getProjectCatalog(admin);
    expect(
      forAdmin.groups
        .flatMap((group) => group.projects)
        .every((view) => view.canCreateTask),
    ).toBe(true);
  });

  it("un proyecto activo de un cliente archivado sigue en el grupo de su cliente", async () => {
    const gone = await seedClient({ workspaceId, name: "Archivado", archived: true });
    await seedProject({ workspaceId, clientId: gone.id, name: "Heredado" });
    const catalog = await getProjectCatalog(member);
    expect(names(catalog)).toEqual([["Archivado", ["Heredado"]]]);
    expect(catalog.clients).toEqual([]);
  });

  it("no mezcla proyectos ni clientes de otro workspace", async () => {
    const other = await seedWorkspace();
    const foreign = await seedClient({ workspaceId: other.workspaceId, name: "Ajeno" });
    await seedProject({ workspaceId: other.workspaceId, clientId: foreign.id });
    const catalog = await getProjectCatalog(owner);
    expect(catalog.groups).toEqual([]);
    expect(catalog.clients).toEqual([]);
  });

  it("habilita crear clientes y proyectos a un member activo y no a uno inactivo", async () => {
    expect(await getProjectCatalog(member)).toMatchObject({
      canCreateClient: true,
      canCreateProject: true,
    });
    expect(await getProjectCatalog({ ...member, status: "inactive" })).toMatchObject({
      canCreateClient: false,
      canCreateProject: false,
    });
  });
});

describe("el vacío (criterio 13: PR-85)", () => {
  it("un workspace sin proyectos devuelve groups vacío", async () => {
    expect(await getProjectCatalog(member)).toEqual({
      canCreateClient: true,
      canCreateProject: true,
      canCreateTag: true,
      tags: [],
      clients: [],
      groups: [],
    });
  });

  it("un workspace con solo un privado ajeno también, para ese member", async () => {
    await seedProject({ workspaceId, isPublic: false });
    expect((await getProjectCatalog(member)).groups).toEqual([]);
  });

  it("una membresía inactiva no ve ningún proyecto", async () => {
    await seedProject({
      workspaceId,
      members: [{ userId: member.userId, isManager: true }],
    });
    expect((await getProjectCatalog({ ...member, status: "inactive" })).groups).toEqual(
      [],
    );
  });
});

describe("reintentar (criterio 10: §4.4, PR-90, PR-91, PR-108)", () => {
  it("repetir un cliente con el mismo id devuelve la misma fila sin escribir", async () => {
    const values = clientValues();
    const first = await createClient(member, values);
    const again = await createClient(member, { ...values, name: "Otro nombre" });
    expect(again).toEqual(first);
    expect(await clientRows()).toHaveLength(1);
    expect(await auditFor("client", values.id)).toHaveLength(1);
  });

  it("repetir un proyecto con el mismo id devuelve la misma vista, sin tareas y sin escribir", async () => {
    const values = projectValues();
    const first = await createProject(member, values);
    await seedTask({ workspaceId, projectId: values.id });
    const again = await createProject(member, values);
    expect(again).toEqual(first);
    expect(again.project.canCreateTask).toBe(true);
    expect(await projectRows()).toHaveLength(1);
    expect(await db.select().from(projectMember)).toHaveLength(1);
    expect(await auditFor("project", values.id)).toHaveLength(1);
  });

  it("repetir una tarea con el mismo id devuelve la misma fila sin escribir", async () => {
    const web = await seedProject({ workspaceId });
    const values = taskValues(web.id);
    const first = await createTask(owner, values);
    const again = await createTask(owner, values);
    expect(again).toEqual(first);
    expect(await taskRows()).toHaveLength(1);
    expect(await auditFor("task", values.id)).toHaveLength(1);
  });

  it("el id de una fila de otra persona responde forbidden y no escribe", async () => {
    const web = await seedProject({ workspaceId });
    const theirClient = await seedClient({ workspaceId, createdBy: admin.userId });
    const theirProject = await seedProject({ workspaceId, createdBy: admin.userId });
    const theirTask = await seedTask({
      workspaceId,
      projectId: web.id,
      createdBy: admin.userId,
    });

    await expectForbidden(createClient(owner, clientValues({ id: theirClient.id })));
    await expectForbidden(createProject(owner, projectValues({ id: theirProject.id })));
    await expectForbidden(createTask(owner, taskValues(web.id, { id: theirTask.id })));

    expect(await clientRows()).toHaveLength(1);
    expect(await projectRows()).toHaveLength(2);
    expect(await taskRows()).toHaveLength(1);
  });

  it("el id de una fila de otro workspace responde forbidden", async () => {
    const other = await seedWorkspace();
    const foreign = await seedClient({
      workspaceId: other.workspaceId,
      createdBy: other.ownerId,
    });
    await expectForbidden(createClient(owner, clientValues({ id: foreign.id })));
  });

  it("una fila sin creador, después de borrar su membresía, ya no es propia de nadie", async () => {
    const orphan = await seedClient({ workspaceId, createdBy: null });
    await expectForbidden(createClient(member, clientValues({ id: orphan.id })));
  });

  describe("una fila propia de otro workspace no es propia acá", () => {
    /** La misma persona, también miembro de otro workspace. */
    async function otherWorkspaceOfMember(): Promise<string> {
      const other = await seedWorkspace();
      await db.insert(membership).values({
        workspaceId: other.workspaceId,
        userId: member.userId,
        role: "member",
      });
      return other.workspaceId;
    }

    it("createClient responde forbidden con el id de un cliente suyo de allá", async () => {
      const otherId = await otherWorkspaceOfMember();
      const theirs = await seedClient({ workspaceId: otherId, createdBy: member.userId });
      await expectForbidden(createClient(member, clientValues({ id: theirs.id })));
      expect(await clientRows()).toEqual([]);
    });

    it("createProject responde forbidden con el id de un proyecto suyo de allá", async () => {
      const otherId = await otherWorkspaceOfMember();
      const theirs = await seedProject({
        workspaceId: otherId,
        createdBy: member.userId,
        members: [{ userId: member.userId, isManager: true }],
      });
      await expectForbidden(createProject(member, projectValues({ id: theirs.id })));
      expect(await projectRows()).toEqual([]);
    });

    it("createTask responde forbidden con el id de una tarea suya de allá", async () => {
      const otherId = await otherWorkspaceOfMember();
      const there = await seedProject({ workspaceId: otherId });
      const theirs = await seedTask({
        workspaceId: otherId,
        projectId: there.id,
        createdBy: member.userId,
      });
      const here = await seedProject({
        workspaceId,
        members: [{ userId: member.userId, isManager: true }],
      });
      await expectForbidden(createTask(member, taskValues(here.id, { id: theirs.id })));
      expect(await taskRows()).toEqual([]);
    });
  });

  it("una tarea propia de otro proyecto no se responde: forbidden, y no se mueve", async () => {
    const managed = [{ userId: member.userId, isManager: true }];
    const web = await seedProject({ workspaceId, members: managed });
    const app = await seedProject({ workspaceId, members: managed });
    const values = taskValues(web.id);
    await createTask(member, values);

    await expectForbidden(createTask(member, { ...values, projectId: app.id }));

    const rows = await taskRows();
    expect(rows.map((row) => [row.id, row.projectId])).toEqual([[values.id, web.id]]);
  });

  it("un proyecto propio que ya no ve, o archivado, responde forbidden como un id ocupado", async () => {
    const hidden = await seedProject({
      workspaceId,
      isPublic: false,
      createdBy: member.userId,
    });
    const archived = await seedProject({
      workspaceId,
      archived: true,
      createdBy: member.userId,
      members: [{ userId: member.userId, isManager: true }],
    });

    await expectForbidden(createProject(member, projectValues({ id: hidden.id })));
    await expectForbidden(createProject(member, projectValues({ id: archived.id })));
    expect(await projectRows()).toHaveLength(2);
  });

  it("con la membresía inactiva, createClient y createProject responden forbidden aunque el id sea de una fila propia", async () => {
    const ownClient = clientValues();
    const ownProject = projectValues();
    await createClient(member, ownClient);
    await createProject(member, ownProject);
    const inactive: Actor = { ...member, status: "inactive" };

    await expectForbidden(createClient(inactive, ownClient));
    await expectForbidden(createProject(inactive, ownProject));
    await expectForbidden(createClient(inactive, clientValues()));
  });

  it("con la membresía inactiva, createTask responde PR-72 aunque el id sea de una tarea propia", async () => {
    const web = await seedProject({
      workspaceId,
      members: [{ userId: member.userId, isManager: true }],
    });
    const values = taskValues(web.id);
    await createTask(member, values);

    await expectProjectError(
      createTask({ ...member, status: "inactive" }, values),
      "not_found",
      projectMessages.projectUnavailable,
    );
  });

  /** La fila del workspace tomada `for update`: frena la clave hacia `workspace` del insert. */
  const holdWorkspace = (tx: Transaction) =>
    tx.select().from(workspace).where(eq(workspace.id, workspaceId)).for("update");

  it("dos clientes simultáneos con el mismo pedido dejan una fila, y los dos la responden", async () => {
    const values = clientValues();
    const results = await raceThroughBarrier(holdWorkspace, [
      () => createClient(member, values),
      () => createClient(member, values),
    ]);
    expect(results).toEqual([
      { client: { id: values.id, name: "Acme" } },
      { client: { id: values.id, name: "Acme" } },
    ]);
    expect(await clientRows()).toHaveLength(1);
    expect(await auditFor("client", values.id)).toHaveLength(1);
  });

  it("dos proyectos simultáneos con el mismo pedido dejan una fila, y los dos la responden sin PR-77", async () => {
    const values = projectValues();
    const results = await raceThroughBarrier(holdWorkspace, [
      () => createProject(member, values),
      () => createProject(member, values),
    ]);
    expect(results.map((result) => result.project.id)).toEqual([values.id, values.id]);
    expect(results[0]).toEqual(results[1]);
    expect(await projectRows()).toHaveLength(1);
    expect(await db.select().from(projectMember)).toHaveLength(1);
    expect(await auditFor("project", values.id)).toHaveLength(1);
  });

  it("dos tareas simultáneas con el mismo pedido dejan una fila, y las dos la responden", async () => {
    const web = await seedProject({ workspaceId });
    const values = taskValues(web.id);
    const results = await raceThroughBarrier(holdWorkspace, [
      () => createTask(owner, values),
      () => createTask(owner, values),
    ]);
    expect(results).toEqual([
      { task: { id: values.id, name: "Diseño" } },
      { task: { id: values.id, name: "Diseño" } },
    ]);
    expect(await taskRows()).toHaveLength(1);
  });

  /** El resultado de una operación de la carrera, o su error, sin cortar la barrera. */
  function settled<T>(work: () => Promise<T>): () => Promise<T | unknown> {
    return () => work().catch((error: unknown) => error);
  }

  it("dos personas que crean a la vez el mismo proyecto dejan una fila; la otra recibe PR-77 (PR-108)", async () => {
    const results = await raceThroughBarrier(holdWorkspace, [
      settled(() => createProject(member, projectValues({ name: "Web" }))),
      settled(() => createProject(admin, projectValues({ name: "WEB" }))),
    ]);
    const failures = results.filter((result) => result instanceof ProjectError);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: "validation",
      message: projectMessages.projectNameTaken,
    });
    expect(await projectRows()).toHaveLength(1);
  });

  it("dos personas que crean a la vez el mismo cliente dejan una fila; la otra recibe PR-78", async () => {
    const results = await raceThroughBarrier(holdWorkspace, [
      settled(() => createClient(member, clientValues({ name: "Acme" }))),
      settled(() => createClient(admin, clientValues({ name: "acme" }))),
    ]);
    const failures = results.filter((result) => result instanceof ProjectError);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: "validation",
      message: projectMessages.clientNameTaken,
    });
    expect(await clientRows()).toHaveLength(1);
  });
});

describe("auditoría (criterio 14)", () => {
  it("cada alta deja su registro con la fila creada", async () => {
    const clientInput = clientValues({ address: "Calle 1" });
    await createClient(member, clientInput);
    const projectInput = projectValues({ clientId: clientInput.id, color: "pink" });
    await createProject(member, projectInput);
    const taskInput = taskValues(projectInput.id);
    await createTask(member, taskInput);

    expect(await auditsOf("client", clientInput.id)).toEqual([
      {
        action: "client.create",
        actorId: member.userId,
        workspaceId,
        nextValue: expect.objectContaining({
          id: clientInput.id,
          name: "Acme",
          address: "Calle 1",
          createdBy: member.userId,
        }),
      },
    ]);
    expect(await auditsOf("project", projectInput.id)).toEqual([
      {
        action: "project.create",
        actorId: member.userId,
        workspaceId,
        nextValue: {
          project: expect.objectContaining({
            id: projectInput.id,
            clientId: clientInput.id,
            color: "pink",
            isPublic: true,
          }),
          member: expect.objectContaining({ userId: member.userId, isManager: true }),
        },
      },
    ]);
    expect(await auditsOf("task", taskInput.id)).toEqual([
      {
        action: "task.create",
        actorId: member.userId,
        workspaceId,
        nextValue: expect.objectContaining({
          id: taskInput.id,
          projectId: projectInput.id,
          status: "active",
        }),
      },
    ]);
  });

  it("un alta rechazada no deja registro", async () => {
    await seedClient({ workspaceId, name: "Acme" });
    await failureOf(createClient(member, clientValues({ name: "Acme" })));
    expect(await auditFor("client")).toEqual([]);
  });
});

describe("getTrackingCatalog: el catálogo del selector (criterio 3: TT-08, PR-23, PR-87, PR-98 … PR-100)", () => {
  async function seedTrackingWorkspace() {
    const acme = await seedClient({ workspaceId, name: "acme" });
    const gone = await seedClient({ workspaceId, name: "Archivado", archived: true });
    const web = await seedProject({
      workspaceId,
      clientId: acme.id,
      name: "Web",
      color: "pink",
    });
    const app = await seedProject({ workspaceId, clientId: acme.id, name: "app" });
    const vault = await seedProject({ workspaceId, name: "Bóveda", isPublic: false });
    const joined = await seedProject({
      workspaceId,
      name: "Interno",
      isPublic: false,
      members: [{ userId: member.userId, isManager: false }],
    });
    const inherited = await seedProject({
      workspaceId,
      clientId: gone.id,
      name: "Heredado",
    });
    const old = await seedProject({ workspaceId, name: "Viejo", archived: true });
    await seedTask({ workspaceId, projectId: web.id, name: "maquetado" });
    await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });
    await seedTask({ workspaceId, projectId: web.id, name: "Hecha", status: "done" });
    await seedTask({ workspaceId, projectId: vault.id, name: "Secreta" });
    await seedTask({ workspaceId, projectId: old.id, name: "Del archivado" });
    return { acme, gone, web, app, vault, joined, inherited, old };
  }

  const names = (catalog: TrackingCatalog) =>
    catalog.groups.map((group) => [
      group.client?.name ?? null,
      group.projects.map((view) => view.name),
    ]);

  const projectsOf = (catalog: TrackingCatalog) =>
    catalog.groups.flatMap((group) => group.projects);

  it("devuelve exactamente los proyectos activos que acepta can(…, project.track, …)", async () => {
    await seedTrackingWorkspace();
    const projects = await projectRows();
    const members = await db.select().from(projectMember);

    for (const actor of [owner, admin, member, await seedActor("project_manager")]) {
      const expected = projects
        .filter((row) => {
          const own = members.find(
            (item) => item.projectId === row.id && item.userId === actor.userId,
          );
          return (
            row.archivedAt === null &&
            can(actor, "project.track", {
              kind: "project",
              workspaceId: row.workspaceId,
              isPublic: row.isPublic,
              viewer: own === undefined ? null : { isManager: own.isManager },
            })
          );
        })
        .map((row) => row.id)
        .sort();
      const seen = projectsOf(await getTrackingCatalog(actor)).map((view) => view.id);
      expect(seen.sort()).toEqual(expected);
    }
  });

  it("un admin que no es miembro no ve el privado, aunque lo vea en getProjectCatalog; el miembro member sí", async () => {
    const seeded = await seedTrackingWorkspace();

    const forAdmin = projectsOf(await getTrackingCatalog(admin)).map((view) => view.id);
    expect(forAdmin).not.toContain(seeded.vault.id);
    expect(forAdmin).not.toContain(seeded.joined.id);
    const viewed = (await getProjectCatalog(admin)).groups.flatMap((group) =>
      group.projects.map((view) => view.id),
    );
    expect(viewed).toContain(seeded.vault.id);

    const forMember = projectsOf(await getTrackingCatalog(member)).map((view) => view.id);
    expect(forMember).toContain(seeded.joined.id);
    expect(forMember).not.toContain(seeded.vault.id);
    const outsider = await seedActor("member");
    expect(
      projectsOf(await getTrackingCatalog(outsider)).map((view) => view.id),
    ).not.toContain(seeded.joined.id);
  });

  it("agrupa por cliente en orden alfabético, con el cliente archivado y «Sin cliente» al final", async () => {
    await seedTrackingWorkspace();
    expect(names(await getTrackingCatalog(member))).toEqual([
      ["acme", ["app", "Web"]],
      ["Archivado", ["Heredado"]],
      [null, ["Interno"]],
    ]);
  });

  it("trae las tareas activas en orden alfabético, sin las hechas ni las del archivado", async () => {
    const seeded = await seedTrackingWorkspace();
    const catalog = await getTrackingCatalog(owner);
    const web = projectsOf(catalog).find((view) => view.id === seeded.web.id);
    expect(web).toEqual({
      id: seeded.web.id,
      name: "Web",
      color: "pink",
      tasks: [
        { id: expect.any(String), name: "Diseño" },
        { id: expect.any(String), name: "maquetado" },
      ],
      billableByDefault: false,
    });
    expect(projectsOf(catalog).find((view) => view.id === seeded.app.id)?.tasks).toEqual(
      [],
    );
    const allTasks = projectsOf(catalog).flatMap((view) =>
      view.tasks.map((item) => item.name),
    );
    expect(allTasks).not.toContain("Del archivado");
    expect(allTasks).not.toContain("Hecha");
    expect(projectsOf(catalog).map((view) => view.id)).not.toContain(seeded.old.id);
  });

  it("habilita el enlace a Proyectos con can(project.create) y una membresía inactiva no ve nada", async () => {
    await seedTrackingWorkspace();
    expect((await getTrackingCatalog(member)).canCreateProject).toBe(true);
    expect(await getTrackingCatalog({ ...member, status: "inactive" })).toEqual({
      canCreateProject: false,
      canCreateTag: false,
      tags: [],
      groups: [],
    });
  });

  it("no mezcla proyectos de otro workspace", async () => {
    const other = await seedWorkspace();
    await seedProject({ workspaceId: other.workspaceId });
    expect(await getTrackingCatalog(owner)).toEqual({
      canCreateProject: true,
      canCreateTag: true,
      tags: [],
      groups: [],
    });
  });
});

describe("assertTrackable (ADR 0010: PR-23, PR-74, TT-08, TT-77)", () => {
  function check(actor: Actor, target: { projectId: string; taskId: string | null }) {
    return db.transaction((tx) => assertTrackable(tx, actor, target));
  }

  async function expectUnavailable(
    work: Promise<unknown>,
    message: string = projectMessages.projectUnavailable,
  ): Promise<void> {
    await expectProjectError(work, "not_found", message);
  }

  it("acepta un proyecto público activo y su tarea activa", async () => {
    const web = await seedProject({ workspaceId });
    const design = await seedTask({ workspaceId, projectId: web.id });
    await check(member, { projectId: web.id, taskId: null });
    await check(member, { projectId: web.id, taskId: design.id });
  });

  it("acepta los ids en mayúsculas", async () => {
    const web = await seedProject({ workspaceId });
    const design = await seedTask({ workspaceId, projectId: web.id });
    await check(member, {
      projectId: web.id.toUpperCase(),
      taskId: design.id.toUpperCase(),
    });
  });

  it("rechaza con TT-77 el archivado, el inexistente y el de otro workspace", async () => {
    const old = await seedProject({ workspaceId, archived: true });
    const other = await seedWorkspace();
    const foreign = await seedProject({ workspaceId: other.workspaceId });
    await expectUnavailable(check(owner, { projectId: old.id, taskId: null }));
    await expectUnavailable(check(owner, { projectId: randomUUID(), taskId: null }));
    await expectUnavailable(check(owner, { projectId: foreign.id, taskId: null }));
  });

  it("rechaza con TT-77 el privado a quien no es miembro, también al owner y al admin (PR-17)", async () => {
    const vault = await seedProject({
      workspaceId,
      isPublic: false,
      members: [{ userId: member.userId }],
    });
    await check(member, { projectId: vault.id, taskId: null });
    for (const actor of [owner, admin, await seedActor("member")]) {
      await expectUnavailable(check(actor, { projectId: vault.id, taskId: null }));
    }
  });

  it("rechaza con TT-77 a una membresía inactiva, aunque el proyecto sea público", async () => {
    const web = await seedProject({ workspaceId });
    await expectUnavailable(
      check({ ...member, status: "inactive" }, { projectId: web.id, taskId: null }),
    );
  });

  it("rechaza con PR-74 la tarea hecha, la inexistente y la de otro proyecto", async () => {
    const web = await seedProject({ workspaceId });
    const app = await seedProject({ workspaceId });
    const done = await seedTask({ workspaceId, projectId: web.id, status: "done" });
    const elsewhere = await seedTask({ workspaceId, projectId: app.id });
    for (const taskId of [done.id, randomUUID(), elsewhere.id]) {
      await expectUnavailable(
        check(member, { projectId: web.id, taskId }),
        projectMessages.taskUnavailable,
      );
    }
  });

  it("mira el proyecto antes que la tarea: con el proyecto archivado responde TT-77", async () => {
    const old = await seedProject({ workspaceId, archived: true });
    const design = await seedTask({ workspaceId, projectId: old.id });
    await expectUnavailable(check(member, { projectId: old.id, taskId: design.id }));
  });

  it("lee con la transacción que recibe: ve lo que la transacción escribió antes", async () => {
    const web = await seedProject({ workspaceId, archived: true });
    // El rollback deja la base como estaba: el test no escribe nada.
    await expect(
      db.transaction(async (tx: Transaction) => {
        await tx.update(project).set({ archivedAt: null }).where(eq(project.id, web.id));
        await assertTrackable(tx, member, { projectId: web.id, taskId: null });
        tx.rollback();
      }),
    ).rejects.toBeInstanceOf(TransactionRollbackError);
  });
});

describe("el facturable por defecto (criterio 2 del 11a: PR-21)", () => {
  it("createProject guarda el pedido, y false sin él", async () => {
    const billed = projectValues({ name: "Facturable", billableByDefault: true });
    const plain = projectValues({ name: "Interno" });

    await createProject(member, billed);
    await createProject(member, plain);

    const rows = await projectRows();
    expect(rows.find((row) => row.id === billed.id)?.billableByDefault).toBe(true);
    expect(rows.find((row) => row.id === plain.id)?.billableByDefault).toBe(false);
    expect(await auditsOf("project", billed.id)).toEqual([
      expect.objectContaining({
        nextValue: expect.objectContaining({
          project: expect.objectContaining({ billableByDefault: true }),
        }),
      }),
    ]);
  });

  it("el reintento responde la fila del primer intento sin reescribir el facturable", async () => {
    const values = projectValues({ billableByDefault: true });
    const first = await createProject(member, values);
    const again = await createProject(member, { ...values, billableByDefault: false });
    expect(again).toEqual(first);
    const [row] = await projectRows();
    expect(row.billableByDefault).toBe(true);
    expect(await auditFor("project", values.id)).toHaveLength(1);
  });

  it("getTrackingCatalog lo devuelve en cada proyecto", async () => {
    const billed = await seedProject({
      workspaceId,
      name: "Sí",
      billableByDefault: true,
    });
    const plain = await seedProject({ workspaceId, name: "No" });
    const views = (await getTrackingCatalog(member)).groups.flatMap(
      (group) => group.projects,
    );
    expect(views.find((view) => view.id === billed.id)?.billableByDefault).toBe(true);
    expect(views.find((view) => view.id === plain.id)?.billableByDefault).toBe(false);
  });

  it("assertTrackable devuelve el proyecto validado con su facturable, con o sin tarea", async () => {
    const billed = await seedProject({ workspaceId, billableByDefault: true });
    const design = await seedTask({ workspaceId, projectId: billed.id });
    const plain = await seedProject({ workspaceId });
    const check = (target: { projectId: string; taskId: string | null }) =>
      db.transaction((tx) => assertTrackable(tx, member, target));

    expect(await check({ projectId: billed.id, taskId: null })).toEqual({
      id: billed.id,
      billableByDefault: true,
    });
    expect(
      await check({ projectId: billed.id.toUpperCase(), taskId: design.id }),
    ).toEqual({ id: billed.id, billableByDefault: true });
    expect(await check({ projectId: plain.id, taskId: null })).toEqual({
      id: plain.id,
      billableByDefault: false,
    });
  });
});

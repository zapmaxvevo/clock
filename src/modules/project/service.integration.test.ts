import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, type Transaction } from "@/server/db";
import {
  client,
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
} from "./schema";
import {
  createClient,
  createProject,
  createTask,
  getProjectCatalog,
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

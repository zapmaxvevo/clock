import { DomainError, type ActionErrorCode } from "@/server/action";
import { recordAudit } from "@/server/audit";
import { createOnce } from "@/server/create-once";
import { db, type Transaction } from "@/server/db";
import {
  assertCan,
  can,
  ForbiddenError,
  type Actor,
  type ProjectResource,
  type WorkspaceResource,
} from "@/server/permissions";

import { isPaletteKey, nextPaletteColor, type PaletteKey } from "./palette";
import {
  projectRepository,
  type ClientRow,
  type ProjectWithViewer,
  type TaskRow,
} from "./repository";
import {
  projectMessages,
  type ClientView,
  type CreateClientResult,
  type CreateClientValues,
  type CreateProjectResult,
  type CreateProjectValues,
  type CreateTaskResult,
  type CreateTaskValues,
  type ProjectCatalog,
  type ProjectRef,
  type ProjectView,
  type TaskView,
  type TrackableProject,
  type TrackingCatalog,
  type TrackingProjectView,
} from "./schema";

export class ProjectError extends DomainError {
  constructor(code: ActionErrorCode, message: string) {
    super(code, message);
    this.name = "ProjectError";
  }
}

function workspaceResource(actor: Actor): WorkspaceResource {
  return { kind: "workspace", workspaceId: actor.workspaceId };
}

/** El recurso que decide sobre un proyecto, armado con la fila leída. */
function projectResource(row: ProjectWithViewer): ProjectResource {
  return {
    kind: "project",
    workspaceId: row.workspaceId,
    isPublic: row.isPublic,
    viewer: row.viewer,
  };
}

/** El `check` de la base no deja guardar otra cosa; si pasa, no es la paleta. */
function paletteKeyOf(row: ProjectWithViewer): PaletteKey {
  if (!isPaletteKey(row.color)) {
    throw new Error(`El proyecto ${row.id} tiene un color fuera de la paleta.`);
  }
  return row.color;
}

function toClientView(row: ClientRow): ClientView {
  return { id: row.id, name: row.name };
}

function toTaskView(row: TaskRow): TaskView {
  return { id: row.id, name: row.name };
}

function toProjectView(
  actor: Actor,
  row: ProjectWithViewer,
  tasks: readonly TaskView[],
): ProjectView {
  return {
    id: row.id,
    name: row.name,
    color: paletteKeyOf(row),
    isPublic: row.isPublic,
    canCreateTask: can(actor, "task.create", projectResource(row)),
    tasks,
  };
}

/**
 * El nombre repetido que deja salir `createOnce` (PR-91): ya comprobó que la
 * fila propia no existe, así que el choque es con la fila de otro pedido.
 */
async function translatingNameTaken<Result>(
  isNameTaken: (error: unknown) => boolean,
  message: string,
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isNameTaken(error)) {
      throw new ProjectError("validation", message);
    }
    throw error;
  }
}

/** PR-01 … PR-03. Cualquier membresía activa crea un cliente (P-18). */
export async function createClient(
  actor: Actor,
  input: CreateClientValues,
): Promise<CreateClientResult> {
  // Antes que la fila propia: sin esto, una membresía desactivada recibiría
  // éxito por mandar el id de un cliente suyo que ya existe (ADR 0007).
  assertCan(actor, "client.create", workspaceResource(actor));
  return translatingNameTaken(
    projectRepository.isClientNameTaken,
    projectMessages.clientNameTaken,
    () =>
      createOnce<ClientRow, CreateClientResult>({
        id: input.id,
        action: "client.create",
        idConstraint: projectRepository.clientIdConstraint,
        findOwn: (id) =>
          projectRepository.findOwnClient(actor.workspaceId, actor.userId, id),
        attempt: () =>
          db.transaction(async (tx) => {
            const created = await projectRepository.insertClient(tx, {
              id: input.id,
              workspaceId: actor.workspaceId,
              name: input.name,
              address: input.address,
              note: input.note,
              createdBy: actor.userId,
            });
            await recordAudit(tx, {
              workspaceId: actor.workspaceId,
              actorId: actor.userId,
              action: "client.create",
              entity: "client",
              entityId: created.id,
              nextValue: created,
            });
            return { client: toClientView(created) };
          }),
        replayed: (row) => ({ client: toClientView(row) }),
      }),
  );
}

/**
 * PR-12 … PR-17, PR-19, PR-21, PR-30. El proyecto nace público (P-17), con el
 * facturable por defecto que se pidió, y quien lo crea queda como su
 * responsable.
 */
export async function createProject(
  actor: Actor,
  input: CreateProjectValues,
): Promise<CreateProjectResult> {
  assertCan(actor, "project.create", workspaceResource(actor));
  return translatingNameTaken(
    projectRepository.isProjectNameTaken,
    projectMessages.projectNameTaken,
    () =>
      createOnce<ProjectWithViewer, CreateProjectResult>({
        id: input.id,
        action: "project.create",
        idConstraint: projectRepository.projectIdConstraint,
        findOwn: (id) =>
          projectRepository.findOwnProject(actor.workspaceId, actor.userId, id),
        attempt: () =>
          db.transaction(async (tx) => {
            if (input.clientId !== null) {
              const owner = await projectRepository.findClient(
                tx,
                actor.workspaceId,
                input.clientId,
              );
              if (owner === undefined || owner.archivedAt !== null) {
                throw new ProjectError("not_found", projectMessages.clientUnavailable);
              }
            }
            const color =
              input.color ??
              nextPaletteColor(
                await projectRepository.countProjects(tx, actor.workspaceId),
              );
            const created = await projectRepository.insertProject(tx, {
              id: input.id,
              workspaceId: actor.workspaceId,
              clientId: input.clientId,
              name: input.name,
              color,
              isPublic: true,
              billableByDefault: input.billableByDefault,
              note: input.note,
              createdBy: actor.userId,
            });
            const member = await projectRepository.insertProjectMember(tx, {
              workspaceId: actor.workspaceId,
              projectId: created.id,
              userId: actor.userId,
              isManager: true,
            });
            await recordAudit(tx, {
              workspaceId: actor.workspaceId,
              actorId: actor.userId,
              action: "project.create",
              entity: "project",
              entityId: created.id,
              nextValue: { project: created, member },
            });
            const viewed = { ...created, viewer: { isManager: member.isManager } };
            return { project: toProjectView(actor, viewed, []) };
          }),
        // Un proyecto propio que ya no se ve, o archivado, responde como el alta
        // con un id ocupado. El reintento responde sin tareas: el diálogo solo
        // la usa para cerrarse y la revalidación de `/proyectos` trae las reales.
        replayed: (row) => {
          if (
            row.archivedAt !== null ||
            !can(actor, "project.view", projectResource(row))
          ) {
            throw new ForbiddenError("project.create");
          }
          return { project: toProjectView(actor, row, []) };
        },
      }),
  );
}

/**
 * PR-35, PR-36, PR-40. Un proyecto que la persona no ve responde lo mismo que
 * uno que no existe; también con la membresía inactiva, que no ve ninguno.
 */
export async function createTask(
  actor: Actor,
  input: CreateTaskValues,
): Promise<CreateTaskResult> {
  const owner = await projectRepository.findProject(
    db,
    actor.workspaceId,
    actor.userId,
    input.projectId,
  );
  if (
    owner === undefined ||
    owner.archivedAt !== null ||
    !can(actor, "project.view", projectResource(owner))
  ) {
    throw new ProjectError("not_found", projectMessages.projectUnavailable);
  }
  assertCan(actor, "task.create", projectResource(owner));
  return translatingNameTaken(
    projectRepository.isTaskNameTaken,
    projectMessages.taskNameTaken,
    () =>
      createOnce<TaskRow, CreateTaskResult>({
        id: input.id,
        action: "task.create",
        idConstraint: projectRepository.taskIdConstraint,
        findOwn: (id) =>
          projectRepository.findOwnTask(actor.workspaceId, actor.userId, owner.id, id),
        attempt: () =>
          db.transaction(async (tx) => {
            // Sin asignados: la tabla vacía es «cualquiera» (P-23).
            const created = await projectRepository.insertTask(tx, {
              id: input.id,
              workspaceId: actor.workspaceId,
              projectId: owner.id,
              name: input.name,
              createdBy: actor.userId,
            });
            await recordAudit(tx, {
              workspaceId: actor.workspaceId,
              actorId: actor.userId,
              action: "task.create",
              entity: "task",
              entityId: created.id,
              nextValue: created,
            });
            return { task: toTaskView(created) };
          }),
        replayed: (row) => ({ task: toTaskView(row) }),
      }),
  );
}

/**
 * PR-23, PR-74, TT-08, TT-77. Lanza `ProjectError("not_found", …)` si la
 * persona no puede cargar horas en ese proyecto o esa tarea. Solo lee, con la
 * transacción de quien la llama (ADR 0010). Devuelve lo que la entrada toma
 * del proyecto: su facturable por defecto (PR-21).
 */
export async function assertTrackable(
  tx: Transaction,
  actor: Actor,
  target: { readonly projectId: string; readonly taskId: string | null },
): Promise<TrackableProject> {
  const owner = await projectRepository.findProject(
    tx,
    actor.workspaceId,
    actor.userId,
    target.projectId,
  );
  // Uno que la persona no puede usar responde como uno que no existe: cualquier
  // otra respuesta revelaría el privado.
  if (
    owner === undefined ||
    owner.archivedAt !== null ||
    !can(actor, "project.track", projectResource(owner))
  ) {
    throw new ProjectError("not_found", projectMessages.projectUnavailable);
  }
  const trackable = { id: owner.id, billableByDefault: owner.billableByDefault };
  if (target.taskId === null) {
    return trackable;
  }
  const found = await projectRepository.findTask(
    tx,
    actor.workspaceId,
    owner.id,
    target.taskId,
  );
  if (found === undefined || found.status === "done") {
    throw new ProjectError("not_found", projectMessages.taskUnavailable);
  }
  return trackable;
}

// Sin distinguir mayúsculas, como `lower(name)` en los índices de unicidad.
const byName = new Intl.Collator("es", { sensitivity: "accent" });

function alphabetical<T extends { readonly id: string; readonly name: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) => byName.compare(a.name, b.name) || (a.id < b.id ? -1 : 1),
  );
}

type CatalogRead<Project> = {
  /** Todos los clientes del workspace, archivados incluidos. */
  readonly clients: readonly ClientRow[];
  readonly groups: readonly {
    readonly client: ClientView | null;
    readonly projects: readonly Project[];
  }[];
};

/**
 * Tres consultas en un mismo snapshot y el armado en memoria: el filtro de
 * acceso es `can()` con `access` sobre cada proyecto (PR-61, PR-93), sin una
 * segunda versión en SQL que pueda desalinearse.
 */
async function readCatalog<Project>(
  actor: Actor,
  access: "project.view" | "project.track",
  toProject: (row: ProjectWithViewer, tasks: readonly TaskView[]) => Project,
): Promise<CatalogRead<Project>> {
  const read = await db.transaction(
    async (tx) => ({
      clients: await projectRepository.listClients(tx, actor.workspaceId),
      projects: await projectRepository.listActiveProjects(
        tx,
        actor.workspaceId,
        actor.userId,
      ),
      tasks: await projectRepository.listActiveTasks(tx, actor.workspaceId),
    }),
    { isolationLevel: "repeatable read" },
  );

  const allowed = read.projects.filter((row) => can(actor, access, projectResource(row)));
  // Las tareas de un proyecto descartado no salen del service.
  const tasksByProject = new Map<string, TaskRow[]>(allowed.map((row) => [row.id, []]));
  for (const row of read.tasks) {
    tasksByProject.get(row.projectId)?.push(row);
  }
  const byClient = new Map<string | null, Project[]>();
  for (const row of alphabetical(allowed)) {
    const tasks = alphabetical(tasksByProject.get(row.id) ?? []).map(toTaskView);
    const group = byClient.get(row.clientId) ?? [];
    group.push(toProject(row, tasks));
    byClient.set(row.clientId, group);
  }
  // Un cliente sin proyectos que mostrar no forma grupo (PR-62).
  const clientGroups = alphabetical(
    read.clients.filter((row) => byClient.has(row.id)),
  ).map((row) => ({ client: toClientView(row), projects: byClient.get(row.id) ?? [] }));
  const withoutClient = byClient.get(null);

  return {
    clients: read.clients,
    // «Sin cliente» al final (PR-14, PR-97).
    groups:
      withoutClient === undefined
        ? clientGroups
        : [...clientGroups, { client: null, projects: withoutClient }],
  };
}

/** La pantalla `/proyectos`: los proyectos que la persona ve. */
export async function getProjectCatalog(actor: Actor): Promise<ProjectCatalog> {
  const read = await readCatalog(actor, "project.view", (row, tasks) =>
    toProjectView(actor, row, tasks),
  );
  return {
    canCreateClient: can(actor, "client.create", workspaceResource(actor)),
    canCreateProject: can(actor, "project.create", workspaceResource(actor)),
    clients: alphabetical(read.clients.filter((row) => row.archivedAt === null)).map(
      toClientView,
    ),
    groups: read.groups,
  };
}

function toProjectRef(row: ProjectWithViewer): ProjectRef {
  return { id: row.id, name: row.name, color: paletteKeyOf(row) };
}

/**
 * El selector del rastreador: los proyectos en los que la persona puede cargar
 * horas. Un admin no ve acá un privado del que no es miembro, aunque lo vea en
 * `/proyectos` (PR-17).
 */
export async function getTrackingCatalog(actor: Actor): Promise<TrackingCatalog> {
  const read = await readCatalog(
    actor,
    "project.track",
    (row, tasks): TrackingProjectView => ({
      ...toProjectRef(row),
      tasks,
      billableByDefault: row.billableByDefault,
    }),
  );
  return {
    canCreateProject: can(actor, "project.create", workspaceResource(actor)),
    groups: read.groups,
  };
}

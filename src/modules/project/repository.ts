import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";
import { hasConstraint, UNIQUE_VIOLATION } from "@/server/db/constraint-error";
import { client, project, projectMember, tag, task } from "@/server/db/schema";

export type ClientRow = typeof client.$inferSelect;
type ProjectRow = typeof project.$inferSelect;
export type TaskRow = typeof task.$inferSelect;
type ProjectMemberRow = typeof projectMember.$inferSelect;
export type TagRow = typeof tag.$inferSelect;

/** La fila de `project_member` de quien pide, o `null` si no es miembro. */
type Viewer = { readonly isManager: boolean } | null;

/** Un proyecto con la fila de `project_member` de quien pide. */
export type ProjectWithViewer = ProjectRow & { readonly viewer: Viewer };

type Executor = Transaction | typeof db;

/** El `left join` de la fila de miembro de `userId`, dentro del mismo workspace. */
function viewerOf(userId: string) {
  return and(
    eq(projectMember.workspaceId, project.workspaceId),
    eq(projectMember.projectId, project.id),
    eq(projectMember.userId, userId),
  );
}

function withViewer(row: {
  readonly project: ProjectRow;
  readonly isManager: boolean | null;
}): ProjectWithViewer {
  return {
    ...row.project,
    viewer: row.isManager === null ? null : { isManager: row.isManager },
  };
}

/**
 * Único lugar con acceso a datos del módulo. Toda consulta filtra por el
 * `workspace_id` de la sesión.
 */
export const projectRepository = {
  /** Sin bloqueo. Solo encuentra una fila creada por `userId` en ese workspace. */
  async findOwnClient(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ClientRow | undefined> {
    const rows = await db
      .select()
      .from(client)
      .where(
        and(
          eq(client.workspaceId, workspaceId),
          eq(client.id, id),
          eq(client.createdBy, userId),
        ),
      )
      .limit(1);
    return rows.at(0);
  },

  async findClient(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ): Promise<ClientRow | undefined> {
    const rows = await tx
      .select()
      .from(client)
      .where(and(eq(client.workspaceId, workspaceId), eq(client.id, id)))
      .limit(1);
    return rows.at(0);
  },

  async insertClient(
    tx: Transaction,
    values: {
      readonly id: string;
      readonly workspaceId: string;
      readonly name: string;
      readonly address: string;
      readonly note: string;
      readonly createdBy: string;
    },
  ): Promise<ClientRow> {
    const [created] = await tx.insert(client).values(values).returning();
    return created;
  },

  /** Todos, archivados incluidos: el color asignado no depende de cuáles se usan. */
  async countProjects(tx: Transaction, workspaceId: string): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(project)
      .where(eq(project.workspaceId, workspaceId));
    return row.total;
  },

  async insertProject(
    tx: Transaction,
    values: {
      readonly id: string;
      readonly workspaceId: string;
      readonly clientId: string | null;
      readonly name: string;
      readonly color: string;
      readonly isPublic: boolean;
      readonly billableByDefault: boolean;
      readonly note: string;
      readonly createdBy: string;
    },
  ): Promise<ProjectRow> {
    const [created] = await tx.insert(project).values(values).returning();
    return created;
  },

  async insertProjectMember(
    tx: Transaction,
    values: {
      readonly workspaceId: string;
      readonly projectId: string;
      readonly userId: string;
      readonly isManager: boolean;
    },
  ): Promise<ProjectMemberRow> {
    const [created] = await tx.insert(projectMember).values(values).returning();
    return created;
  },

  /**
   * Sin bloqueo. Solo encuentra un proyecto creado por `userId`, con su fila de
   * miembro: el reintento necesita la marca de responsable para la vista.
   */
  async findOwnProject(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ProjectWithViewer | undefined> {
    const rows = await db
      .select({ project, isManager: projectMember.isManager })
      .from(project)
      .leftJoin(projectMember, viewerOf(userId))
      .where(
        and(
          eq(project.workspaceId, workspaceId),
          eq(project.id, id),
          eq(project.createdBy, userId),
        ),
      )
      .limit(1);
    const row = rows.at(0);
    return row === undefined ? undefined : withViewer(row);
  },

  /** El proyecto con la fila de miembro de `userId`, sea quien sea su creador. */
  async findProject(
    tx: Executor,
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ProjectWithViewer | undefined> {
    const rows = await tx
      .select({ project, isManager: projectMember.isManager })
      .from(project)
      .leftJoin(projectMember, viewerOf(userId))
      .where(and(eq(project.workspaceId, workspaceId), eq(project.id, id)))
      .limit(1);
    const row = rows.at(0);
    return row === undefined ? undefined : withViewer(row);
  },

  /**
   * Sin bloqueo. Solo encuentra una tarea creada por `userId` en ese workspace
   * y en ese proyecto: una propia de otro proyecto no se responde, choca con
   * `task_pkey`.
   */
  async findOwnTask(
    workspaceId: string,
    userId: string,
    projectId: string,
    id: string,
  ): Promise<TaskRow | undefined> {
    const rows = await db
      .select()
      .from(task)
      .where(
        and(
          eq(task.workspaceId, workspaceId),
          eq(task.projectId, projectId),
          eq(task.id, id),
          eq(task.createdBy, userId),
        ),
      )
      .limit(1);
    return rows.at(0);
  },

  /** La tarea de ese proyecto, en cualquier estado. Una de otro proyecto no se encuentra. */
  async findTask(
    tx: Transaction,
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<TaskRow | undefined> {
    const rows = await tx
      .select()
      .from(task)
      .where(
        and(
          eq(task.workspaceId, workspaceId),
          eq(task.projectId, projectId),
          eq(task.id, id),
        ),
      )
      .limit(1);
    return rows.at(0);
  },

  async insertTask(
    tx: Transaction,
    values: {
      readonly id: string;
      readonly workspaceId: string;
      readonly projectId: string;
      readonly name: string;
      readonly createdBy: string;
    },
  ): Promise<TaskRow> {
    const [created] = await tx
      .insert(task)
      .values({ ...values, status: "active" })
      .returning();
    return created;
  },

  /**
   * Todos los clientes del workspace, archivados incluidos: un proyecto activo
   * de un cliente archivado sigue mostrando su cliente. El service separa los
   * activos para el diálogo.
   */
  async listClients(tx: Executor, workspaceId: string): Promise<ClientRow[]> {
    return tx.select().from(client).where(eq(client.workspaceId, workspaceId));
  },

  /** Los proyectos activos, con la fila de miembro de `userId`. Sin filtro de acceso. */
  async listActiveProjects(
    tx: Executor,
    workspaceId: string,
    userId: string,
  ): Promise<ProjectWithViewer[]> {
    const rows = await tx
      .select({ project, isManager: projectMember.isManager })
      .from(project)
      .leftJoin(projectMember, viewerOf(userId))
      .where(and(eq(project.workspaceId, workspaceId), isNull(project.archivedAt)));
    return rows.map(withViewer);
  },

  /** Las tareas activas de los proyectos activos. */
  async listActiveTasks(tx: Executor, workspaceId: string): Promise<TaskRow[]> {
    const rows = await tx
      .select({ task })
      .from(task)
      .innerJoin(
        project,
        and(eq(project.workspaceId, task.workspaceId), eq(project.id, task.projectId)),
      )
      .where(
        and(
          eq(task.workspaceId, workspaceId),
          eq(task.status, "active"),
          isNull(project.archivedAt),
        ),
      );
    return rows.map((row) => row.task);
  },

  /** Sin bloqueo. Solo encuentra una etiqueta creada por `userId` en ese workspace. */
  async findOwnTag(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<TagRow | undefined> {
    const rows = await db
      .select()
      .from(tag)
      .where(
        and(eq(tag.workspaceId, workspaceId), eq(tag.id, id), eq(tag.createdBy, userId)),
      )
      .limit(1);
    return rows.at(0);
  },

  async insertTag(
    tx: Transaction,
    values: {
      readonly id: string;
      readonly workspaceId: string;
      readonly name: string;
      readonly createdBy: string;
    },
  ): Promise<TagRow> {
    const [created] = await tx.insert(tag).values(values).returning();
    return created;
  },

  /** Las etiquetas de esos ids en ese workspace, en cualquier estado. */
  async findTags(
    tx: Transaction,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<TagRow[]> {
    return tx
      .select()
      .from(tag)
      .where(and(eq(tag.workspaceId, workspaceId), inArray(tag.id, [...ids])));
  },

  /** Las etiquetas activas del workspace. Sin orden: lo pone el service. */
  async listActiveTags(tx: Executor, workspaceId: string): Promise<TagRow[]> {
    return tx
      .select()
      .from(tag)
      .where(and(eq(tag.workspaceId, workspaceId), isNull(tag.archivedAt)));
  },

  clientIdConstraint: "client_pkey" as const,
  projectIdConstraint: "project_pkey" as const,
  taskIdConstraint: "task_pkey" as const,
  tagIdConstraint: "tag_pkey" as const,

  isClientNameTaken(error: unknown): boolean {
    return hasConstraint(error, UNIQUE_VIOLATION, "client_name_unq");
  },

  isProjectNameTaken(error: unknown): boolean {
    return hasConstraint(error, UNIQUE_VIOLATION, "project_name_unq");
  },

  isTaskNameTaken(error: unknown): boolean {
    return hasConstraint(error, UNIQUE_VIOLATION, "task_name_unq");
  },

  isTagNameTaken(error: unknown): boolean {
    return hasConstraint(error, UNIQUE_VIOLATION, "tag_name_unq");
  },
};

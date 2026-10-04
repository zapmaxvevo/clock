import { relations, sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export * from "./auth-schema";

/** Los cinco roles de Clockify. El orden no implica jerarquía en el código. */
export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "project_manager",
  "team_manager",
  "member",
]);

export const membershipStatus = pgEnum("membership_status", [
  "active",
  "inactive",
  "invited",
]);

/** Quién puede ver las entradas de otros, configurable por workspace. */
export const visibilityScope = pgEnum("visibility_scope", [
  "everyone",
  "managers",
  "admins",
]);

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  currency: char("currency", { length: 3 }).notNull().default("ARS"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  /** Zona horaria del owner. Fija el día en que corren los trabajos de cron. */
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  whoSeesAllEntries: visibilityScope("who_sees_all_entries").notNull().default("admins"),
  whoSeesRates: visibilityScope("who_sees_rates").notNull().default("admins"),
  /**
   * Sin efecto en la fase 1: crea proyectos y clientes cualquier membresía
   * activa (P-18). Cuando lo tenga, entra en `can()` por el recurso de
   * `project.create` y `client.create`, no por `Actor`: ADR 0009.
   */
  whoCreatesProjects: visibilityScope("who_creates_projects")
    .notNull()
    .default("everyone"),
  requireProject: boolean("require_project").notNull().default(false),
  requireTask: boolean("require_task").notNull().default(false),
  requireDescription: boolean("require_description").notNull().default(false),
  requireTag: boolean("require_tag").notNull().default(false),
  forceTimer: boolean("force_timer").notNull().default(false),
  timesheetEnabled: boolean("timesheet_enabled").notNull().default(true),
  /** Minutos a los que se redondea en reportes. 0 = sin redondeo. */
  roundingMinutes: integer("rounding_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    status: membershipStatus("status").notNull().default("active"),
    weeklyCapacityMinutes: integer("weekly_capacity_minutes").notNull().default(2400),
    /** Primer día de la semana de la persona: 0 domingo … 6 sábado, como `WeekStart`. */
    weekStart: smallint("week_start").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("membership_workspace_user_unq").on(table.workspaceId, table.userId),
    index("membership_workspace_idx").on(table.workspaceId),
    check("membership_week_start_range", sql`${table.weekStart} between 0 and 6`),
  ],
);

/**
 * Invitación a alguien fuera del dominio de Google Workspace. La lista inicial
 * llega por EXTERNAL_INVITE_EMAILS y a partir de ahí se administra desde la app.
 */
export const externalInvite = pgTable(
  "external_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    invitedById: text("invited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("external_invite_workspace_email_unq").on(table.workspaceId, table.email),
  ],
);

/** Una tarea hecha sale del catálogo; marcarla es de la fase 2. */
export const taskStatus = pgEnum("task_status", ["active", "done"]);

/**
 * Las tablas de proyectos llevan claves foráneas compuestas con `workspace_id`
 * hacia `(workspace_id, id)`: ninguna puede apuntar a una fila de otro
 * workspace, haga lo que haga el service. Los nombres de las claves son
 * explícitos porque los generados hacia `membership` pasan de 63 caracteres y
 * la migración 0004 tiene que poder nombrar las que reemplaza.
 */
export const client = pgTable(
  "client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    note: text("note").notNull().default(""),
    /** Nulo es activo. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Quien la creó: es lo que hace «propia» la fila en un reintento (ADR 0007). */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "client_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("cascade"),
    // La 0004 la reemplaza por `on delete set null (created_by)`: un `set null`
    // sin lista anularía también `workspace_id`.
    foreignKey({
      name: "client_created_by_fk",
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [membership.workspaceId, membership.userId],
    }).onDelete("set null"),
    unique("client_workspace_id_unq").on(table.workspaceId, table.id),
    // Sin condición: los archivados cuentan (P-19).
    uniqueIndex("client_name_unq").on(table.workspaceId, sql`lower(${table.name})`),
    check("client_name_len", sql`char_length(${table.name}) between 1 and 100`),
    check("client_name_trimmed", sql`${table.name} = btrim(${table.name})`),
    check("client_address_len", sql`char_length(${table.address}) <= 3000`),
    check("client_note_len", sql`char_length(${table.note}) <= 3000`),
  ],
);

export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id"),
    name: text("name").notNull(),
    /** Una clave de la paleta de `src/modules/project/palette.ts`. */
    color: text("color").notNull(),
    isPublic: boolean("is_public").notNull().default(true),
    billableByDefault: boolean("billable_by_default").notNull().default(false),
    note: text("note").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "project_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("cascade"),
    // PR-09. La 0004 la reemplaza por `on delete set null (client_id)`. Si el
    // proyecto sin cliente choca con `project_name_unq`, el borrado del
    // cliente se rechaza entero (PR-111).
    foreignKey({
      name: "project_client_fk",
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [client.workspaceId, client.id],
    }).onDelete("set null"),
    // La 0004 la reemplaza por `on delete set null (created_by)`.
    foreignKey({
      name: "project_created_by_fk",
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [membership.workspaceId, membership.userId],
    }).onDelete("set null"),
    unique("project_workspace_id_unq").on(table.workspaceId, table.id),
    // Los proyectos sin cliente compiten entre sí (PR-50). El UUID nulo no
    // choca con ningún cliente: los ids que se aceptan son v4.
    uniqueIndex("project_name_unq").on(
      table.workspaceId,
      sql`coalesce(${table.clientId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${table.name})`,
    ),
    index("project_workspace_client_idx").on(table.workspaceId, table.clientId),
    check("project_name_len", sql`char_length(${table.name}) between 1 and 100`),
    check("project_name_trimmed", sql`${table.name} = btrim(${table.name})`),
    check("project_note_len", sql`char_length(${table.note}) <= 3000`),
    check(
      "project_color_palette",
      sql`${table.color} in ('red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate')`,
    ),
  ],
);

export const task = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    status: taskStatus("status").notNull().default("active"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "task_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("cascade"),
    // PR-35: una tarea no existe sin su proyecto.
    foreignKey({
      name: "task_project_fk",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [project.workspaceId, project.id],
    }).onDelete("cascade"),
    // La 0004 la reemplaza por `on delete set null (created_by)`.
    foreignKey({
      name: "task_created_by_fk",
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [membership.workspaceId, membership.userId],
    }).onDelete("set null"),
    unique("task_workspace_id_unq").on(table.workspaceId, table.id),
    // El destino de la clave de tres columnas de `time_entry` del slice 10:
    // la tarea de una entrada es del proyecto de la entrada (PR-105).
    unique("task_workspace_project_id_unq").on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex("task_name_unq").on(
      table.workspaceId,
      table.projectId,
      sql`lower(${table.name})`,
    ),
    check("task_name_len", sql`char_length(${table.name}) between 1 and 100`),
    check("task_name_trimmed", sql`${table.name} = btrim(${table.name})`),
  ],
);

/**
 * Una carga de horas. La duración no se almacena: se calcula sobre los dos
 * instantes, que escribe la base con now() dentro de la transacción.
 */
export const timeEntry = pgTable(
  "time_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** La cadena vacía es la única representación de «sin descripción». */
    description: text("description").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** Nulo mientras el timer corre. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Nulo es «sin proyecto» (TT-93). */
    projectId: uuid("project_id"),
    /** Nulo es «sin tarea». Una tarea no viaja sin su proyecto (TT-70). */
    taskId: uuid("task_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Un solo timer activo por usuario. Ver el ADR 0003.
    uniqueIndex("time_entry_running_unq")
      .on(table.workspaceId, table.userId)
      .where(sql`${table.endedAt} is null`),
    index("time_entry_workspace_user_started_idx").on(
      table.workspaceId,
      table.userId,
      table.startedAt.desc(),
    ),
    // Es >= y no > porque una entrada de duración cero es válida.
    check(
      "time_entry_end_after_start",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
    check("time_entry_description_len", sql`char_length(${table.description}) <= 3000`),
    // La 0006 reemplaza las dos claves por `on delete set null (project_id)` y
    // `on delete set null (task_id)`: un `set null` sin lista anularía también
    // `workspace_id`.
    foreignKey({
      name: "time_entry_project_fk",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [project.workspaceId, project.id],
    }).onDelete("set null"),
    // Apunta a `task_workspace_project_id_unq`: la tarea es del proyecto de la
    // entrada (PR-105).
    foreignKey({
      name: "time_entry_task_fk",
      columns: [table.workspaceId, table.projectId, table.taskId],
      foreignColumns: [task.workspaceId, task.projectId, task.id],
    }).onDelete("set null"),
    check(
      "time_entry_task_needs_project",
      sql`${table.taskId} is null or ${table.projectId} is not null`,
    ),
    // Lo recorren los dos `set null` al borrar un proyecto o una tarea. Las
    // entradas sin proyecto no lo necesitan.
    index("time_entry_workspace_project_task_idx")
      .on(table.workspaceId, table.projectId, table.taskId)
      .where(sql`${table.projectId} is not null`),
  ],
);

/**
 * Pertenencia a un proyecto y marca de responsable (P-24). Apunta a la
 * membresía y no al usuario: borrar la membresía borra la pertenencia, y la
 * que se vuelva a crear no la recupera.
 */
export const projectMember = pgTable(
  "project_member",
  {
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    userId: text("user_id").notNull(),
    isManager: boolean("is_manager").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    foreignKey({
      name: "project_member_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_member_project_fk",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [project.workspaceId, project.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_member_membership_fk",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [membership.workspaceId, membership.userId],
    }).onDelete("cascade"),
    index("project_member_workspace_user_idx").on(table.workspaceId, table.userId),
  ],
);

/** Asignados de una tarea. Vacía significa «cualquiera»; la regla es de la fase 2 (P-23). */
export const taskAssignee = pgTable(
  "task_assignee",
  {
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.userId] }),
    foreignKey({
      name: "task_assignee_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_assignee_task_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [task.workspaceId, task.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_assignee_membership_fk",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [membership.workspaceId, membership.userId],
    }).onDelete("cascade"),
    index("task_assignee_workspace_user_idx").on(table.workspaceId, table.userId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    previousValue: text("previous_value"),
    nextValue: text("next_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_log_entity_idx").on(table.entity, table.entityId),
  ],
);

export const workspaceRelations = relations(workspace, ({ one, many }) => ({
  owner: one(user, { fields: [workspace.ownerId], references: [user.id] }),
  settings: one(workspaceSettings, {
    fields: [workspace.id],
    references: [workspaceSettings.workspaceId],
  }),
  memberships: many(membership),
}));

export const timeEntryRelations = relations(timeEntry, ({ one }) => ({
  workspace: one(workspace, {
    fields: [timeEntry.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, { fields: [timeEntry.userId], references: [user.id] }),
}));

export const membershipRelations = relations(membership, ({ one }) => ({
  workspace: one(workspace, {
    fields: [membership.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));

/** Marca de tiempo del servidor, para usar en defaults de consultas. */
export const now = sql`now()`;

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
  /**
   * Sin efecto: ven horas ajenas owner y admin, por rol (P-01). Si la fase 2 la
   * vuelve editable, entra en `can()` por el recurso de `timeEntry.others.view`,
   * no por `Actor`: ADR 0009 y ADR 0020.
   */
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
 * Lo que la persona guarda de su cuenta, y no del workspace (PF-03): las
 * preferencias de hora, el tema y el nombre que eligió. El nombre editado vive
 * acá y no en `user.name`, que escribe Better Auth en cada ingreso; nunca
 * columnas de `user`: esa tabla la regenera `npm run auth:schema`. Una fila
 * que falta, o una columna en nulo, es «sin elegir»: vale el predeterminado,
 * que resuelven `resolvePreferences` y `displayNameOf` de
 * `src/modules/profile/service.ts`.
 */
export const userPreference = pgTable(
  "user_preference",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Zona IANA. La lista válida es la del entorno, no una tabla (PF-35). */
    timezone: text("timezone"),
    timeFormat: text("time_format"),
    dateFormat: text("date_format"),
    /** El nombre que eligió la persona (PF-07). Nulo es «el de Google» (PF-08, PF-45). */
    displayName: text("display_name"),
    /** `THEMES` de `src/modules/profile/schema.ts`. Nulo es «seguir al sistema» (PF-23). */
    theme: text("theme"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "user_preference_timezone_len",
      sql`char_length(${table.timezone}) between 1 and 64`,
    ),
    check(
      "user_preference_time_format_known",
      sql`${table.timeFormat} in ('24h', '12h')`,
    ),
    check(
      "user_preference_date_format_known",
      sql`${table.dateFormat} in ('dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy')`,
    ),
    check(
      "user_preference_display_name_len",
      sql`char_length(${table.displayName}) between 1 and 100`,
    ),
    check(
      "user_preference_theme_known",
      sql`${table.theme} in ('system', 'light', 'dark')`,
    ),
  ],
);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
]);

export type InvitationStatus = (typeof invitationStatus.enumValues)[number];

/**
 * Una invitación por correo y workspace (ADR 0024). La escribe solo el módulo
 * `workspace`. Volver a invitar reusa la fila: la historia está en `audit_log`.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Recortado y en minúsculas: el `check` lo exige. */
    email: text("email").notNull(),
    status: invitationStatus("status").notNull().default("pending"),
    invitedById: text("invited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: text("revoked_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("invitation_workspace_email_unq").on(table.workspaceId, table.email),
    check(
      "invitation_email_normalized",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check("invitation_email_len", sql`char_length(${table.email}) between 3 and 320`),
    check(
      "invitation_accepted_at",
      sql`(${table.status} = 'accepted') = (${table.acceptedAt} is not null)`,
    ),
    check(
      "invitation_revoked_at",
      sql`(${table.status} = 'revoked') = (${table.revokedAt} is not null)`,
    ),
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

/** Una etiqueta del workspace (PR-42, PR-43). Del módulo de proyectos (ADR 0016). */
export const tag = pgTable(
  "tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    /** Nulo es activa (PR-45). */
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
      name: "tag_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("cascade"),
    // La 0012 la reemplaza por `on delete set null (created_by)`.
    foreignKey({
      name: "tag_created_by_fk",
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [membership.workspaceId, membership.userId],
    }).onDelete("set null"),
    unique("tag_workspace_id_unq").on(table.workspaceId, table.id),
    // Sin condición: las archivadas cuentan (PR-52, PR-53).
    uniqueIndex("tag_name_unq").on(table.workspaceId, sql`lower(${table.name})`),
    check("tag_name_len", sql`char_length(${table.name}) between 1 and 100`),
    check("tag_name_trimmed", sql`${table.name} = btrim(${table.name})`),
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
    // P-09, ADR 0020: una persona con horas no se borra; se desactiva.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** La cadena vacía es la única representación de «sin descripción». */
    description: text("description").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** Nulo mientras el timer corre. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Nulo es «sin proyecto» (TT-93). */
    projectId: uuid("project_id"),
    /** Nulo es «sin tarea». Una tarea no viaja sin su proyecto (TT-70). */
    taskId: uuid("task_id"),
    /** TT-14, TT-15: un booleano, sin importes. Lo decide el service (`billableFor`). */
    billable: boolean("billable").notNull().default(false),
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
    // El destino de `time_entry_tag_entry_fk`. Tiene su propia migración, la
    // 0010: en la misma que la unión, drizzle-kit escribe la clave antes que
    // la restricción y Postgres la rechaza.
    unique("time_entry_workspace_id_unq").on(table.workspaceId, table.id),
    // P-09, ADR 0020: una persona con horas no se borra; se desactiva. La 0013
    // crea antes las membresías que faltaban.
    foreignKey({
      name: "time_entry_membership_fk",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [membership.workspaceId, membership.userId],
    }).onDelete("restrict"),
  ],
);

/**
 * Las etiquetas de una entrada (PR-48). Sin `created_at`: el cambio queda en
 * el registro de auditoría, como el par. Las dos claves compuestas hacen que
 * una fila no junte una entrada de un workspace con una etiqueta de otro.
 */
export const timeEntryTag = pgTable(
  "time_entry_tag",
  {
    workspaceId: uuid("workspace_id").notNull(),
    timeEntryId: uuid("time_entry_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.timeEntryId, table.tagId] }),
    foreignKey({
      name: "time_entry_tag_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("cascade"),
    // Las etiquetas no tienen vida fuera de la entrada; la copia queda en la
    // constancia del borrado (TT-61).
    foreignKey({
      name: "time_entry_tag_entry_fk",
      columns: [table.workspaceId, table.timeEntryId],
      foreignColumns: [timeEntry.workspaceId, timeEntry.id],
    }).onDelete("cascade"),
    // PR-69, TT-105: la etiqueta borrada desaparece de la entrada.
    foreignKey({
      name: "time_entry_tag_tag_fk",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tag.workspaceId, tag.id],
    }).onDelete("cascade"),
    // Lo recorre la cascada al borrar una etiqueta.
    index("time_entry_tag_workspace_tag_idx").on(table.workspaceId, table.tagId),
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

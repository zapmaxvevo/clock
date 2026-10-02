import { relations, sql } from "drizzle-orm";
import {
  boolean,
  char,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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
  whoCreatesProjects: visibilityScope("who_creates_projects").notNull().default("admins"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("membership_workspace_user_unq").on(table.workspaceId, table.userId),
    index("membership_workspace_idx").on(table.workspaceId),
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

export const membershipRelations = relations(membership, ({ one }) => ({
  workspace: one(workspace, {
    fields: [membership.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));

/** Marca de tiempo del servidor, para usar en defaults de consultas. */
export const now = sql`now()`;

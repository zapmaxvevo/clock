import type { membershipStatus, workspaceRole } from "@/server/db/schema";

export type Role = (typeof workspaceRole.enumValues)[number];
export type MembershipStatus = (typeof membershipStatus.enumValues)[number];

/** Quién actúa: siempre una membresía concreta en un workspace concreto. */
export type Actor = {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: Role;
  readonly status: MembershipStatus;
};

export type WorkspaceResource = {
  readonly kind: "workspace";
  readonly workspaceId: string;
};

export type MembershipResource = {
  readonly kind: "membership";
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: Role;
};

export type TimeEntryResource = {
  readonly kind: "timeEntry";
  readonly workspaceId: string;
  /** El dueño de la entrada, no quien actúa. */
  readonly userId: string;
};

export type ProfileResource = {
  readonly kind: "profile";
  /** La membresía con que se actúa: una no activa no edita su perfil (PF-34). */
  readonly workspaceId: string;
  /** El dueño del perfil, no quien actúa. */
  readonly userId: string;
};

export type ProjectResource = {
  readonly kind: "project";
  readonly workspaceId: string;
  readonly isPublic: boolean;
  /** La fila de `project_member` de quien actúa, o `null` si no es miembro. */
  readonly viewer: { readonly isManager: boolean } | null;
};

/**
 * Cada acción y la clase de recurso que recibe. Cada fase agrega las suyas acá
 * y una fila a las tablas de `can`, y no se decide permiso en ningún otro
 * lugar.
 */
type ResourceByAction = {
  "workspace.settings.update": WorkspaceResource;
  "workspace.transfer": WorkspaceResource;
  "workspace.delete": WorkspaceResource;
  "team.view": WorkspaceResource;
  "team.manage": WorkspaceResource | MembershipResource;
  "member.invite": WorkspaceResource;
  "timeEntry.own.create": TimeEntryResource;
  "timeEntry.own.update": TimeEntryResource;
  "timeEntry.own.delete": TimeEntryResource;
  // En la fase 1 `whoCreatesProjects` no entra en la decisión (P-18). Cuando
  // entre, estas dos declaran un recurso propio que lo lleva: ADR 0009.
  "client.create": WorkspaceResource;
  "project.create": WorkspaceResource;
  "project.view": ProjectResource;
  "project.track": ProjectResource;
  "task.create": ProjectResource;
  "profile.own.update": ProfileResource;
};

export type Action = keyof ResourceByAction;
export type ResourceFor<A extends Action> = ResourceByAction[A];
export type Resource = ResourceByAction[Action];

/**
 * La misma tabla que `ResourceByAction`, para comprobarla en tiempo de
 * ejecución: cubre lo que el tipo no ve, como un `as` o un `Resource` ancho.
 */
const resourceKinds = {
  "workspace.settings.update": ["workspace"],
  "workspace.transfer": ["workspace"],
  "workspace.delete": ["workspace"],
  "team.view": ["workspace"],
  "team.manage": ["workspace", "membership"],
  "member.invite": ["workspace"],
  "timeEntry.own.create": ["timeEntry"],
  "timeEntry.own.update": ["timeEntry"],
  "timeEntry.own.delete": ["timeEntry"],
  "client.create": ["workspace"],
  "project.create": ["workspace"],
  "project.view": ["project"],
  "project.track": ["project"],
  "task.create": ["project"],
  "profile.own.update": ["profile"],
} satisfies { [A in Action]: readonly ResourceFor<A>["kind"][] };

const everyone: readonly Role[] = [
  "owner",
  "admin",
  "project_manager",
  "team_manager",
  "member",
];

const allowedRoles: Record<Action, readonly Role[]> = {
  "workspace.settings.update": ["owner", "admin"],
  "workspace.transfer": ["owner"],
  "workspace.delete": ["owner"],
  "team.view": everyone,
  "team.manage": ["owner", "admin"],
  "member.invite": ["owner", "admin"],
  "timeEntry.own.create": everyone,
  "timeEntry.own.update": everyone,
  "timeEntry.own.delete": everyone,
  "client.create": everyone,
  "project.create": everyone,
  "project.view": everyone,
  "project.track": everyone,
  "task.create": everyone,
  "profile.own.update": everyone,
};

/**
 * Lo que da algo sobre un proyecto es ser owner o admin, o la fila de
 * `project_member`; el resto de los roles decide como `member` (PR-57).
 */
function isWorkspaceAdmin(actor: Actor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function allowsOnProject(
  actor: Actor,
  action: Action,
  project: ProjectResource,
): boolean {
  switch (action) {
    // PR-61: owner y admin ven también los privados de los que no son miembros.
    case "project.view":
      return project.isPublic || project.viewer !== null || isWorkspaceAdmin(actor);
    // TT-08: para cargar horas en un privado hay que ser miembro; el rol no alcanza.
    case "project.track":
      return project.isPublic || project.viewer !== null;
    // PR-40.
    case "task.create":
      return isWorkspaceAdmin(actor) || project.viewer?.isManager === true;
    default:
      return false;
  }
}

/**
 * Única decisión de acceso del servidor. La interfaz la llama para ocultar
 * controles y cada mutación la vuelve a llamar, en la action o en el service,
 * antes de tocar datos.
 */
export function can<A extends Action>(
  actor: Actor,
  action: A,
  resource: ResourceFor<A>,
): boolean {
  if (actor.status !== "active") {
    return false;
  }
  if (resource.workspaceId !== actor.workspaceId) {
    return false;
  }
  const kinds: readonly string[] = resourceKinds[action];
  if (!kinds.includes(resource.kind)) {
    return false;
  }
  if (!allowedRoles[action].includes(actor.role)) {
    return false;
  }
  // Las acciones ".own" son sobre lo propio. Las entradas ajenas son del
  // reporte detallado y el perfil ajeno, de la pantalla de equipo (PF-17).
  if (
    (resource.kind === "timeEntry" || resource.kind === "profile") &&
    resource.userId !== actor.userId
  ) {
    return false;
  }
  // La membresía del owner solo la toca el owner.
  if (
    resource.kind === "membership" &&
    resource.role === "owner" &&
    actor.role !== "owner"
  ) {
    return false;
  }
  if (resource.kind === "project") {
    return allowsOnProject(actor, action, resource);
  }
  return true;
}

export class ForbiddenError extends Error {
  readonly code = "forbidden" as const;

  constructor(action: Action) {
    super(`Sin permiso para ${action}.`);
    this.name = "ForbiddenError";
  }
}

/** Variante que corta la operación. */
export function assertCan<A extends Action>(
  actor: Actor,
  action: A,
  resource: ResourceFor<A>,
): void {
  if (!can(actor, action, resource)) {
    throw new ForbiddenError(action);
  }
}

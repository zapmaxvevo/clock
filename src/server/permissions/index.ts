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
  // D-R8-5, ADR 0023: «Only the Workspace owner can remove an admin role from
  // someone». Se consulta solo sobre una membresía `admin`: `can()` no mira el
  // rol de la membresía para esta acción.
  "team.admin.revoke": MembershipResource;
  // D-E2-4, P-07: solo el owner desactiva o reactiva a un admin. Se consulta
  // solo sobre una membresía `admin`: `can()` no mira el rol de la membresía
  // para esta acción.
  "team.admin.setStatus": MembershipResource;
  // D-E2b-4, ADR 0027: pedir que el próximo ingreso con el correo de una persona
  // quede atado a su fila. Se consulta para pedir, renovar o cancelar una
  // vinculación y para reactivar a quien no tiene cuenta. Sobre un admin, además
  // `team.admin.account`.
  "team.account.link": MembershipResource;
  // D-E2b-4, D-E2b-9: liberar el correo de una persona inactiva. Sobre un admin,
  // además `team.admin.account`.
  "team.email.release": MembershipResource;
  // D-E2b-4, P-07: solo el owner vincula la cuenta o libera el correo de un
  // admin. Se consulta solo sobre una membresía `admin`: `can()` no mira el rol
  // de la membresía para esta acción.
  "team.admin.account": MembershipResource;
  "member.invite": WorkspaceResource;
  "timeEntry.own.create": TimeEntryResource;
  "timeEntry.own.update": TimeEntryResource;
  "timeEntry.own.delete": TimeEntryResource;
  // ADR 0020. `who_sees_all_entries` no entra: si la fase 2 la vuelve editable,
  // `timeEntry.others.view` declara un recurso propio (ADR 0009).
  "timeEntry.others.view": WorkspaceResource;
  "report.view": WorkspaceResource;
  // En la fase 1 `whoCreatesProjects` no entra en la decisión (P-18). Cuando
  // entre, estas dos declaran un recurso propio que lo lleva: ADR 0009.
  "client.create": WorkspaceResource;
  "project.create": WorkspaceResource;
  "project.view": ProjectResource;
  "project.track": ProjectResource;
  "task.create": ProjectResource;
  // PR-44, PR-58: «Everyone can create tags». La configuración que la limita a
  // los admins no existe en la fase 1; cuando llegue, recurso propio: ADR 0009.
  "tag.create": WorkspaceResource;
  // PR-62: quién ve las etiquetas del workspace. Usar una etiqueta es verla.
  "tag.view": WorkspaceResource;
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
  "team.admin.revoke": ["membership"],
  "team.admin.setStatus": ["membership"],
  "team.account.link": ["membership"],
  "team.email.release": ["membership"],
  "team.admin.account": ["membership"],
  "member.invite": ["workspace"],
  "timeEntry.own.create": ["timeEntry"],
  "timeEntry.own.update": ["timeEntry"],
  "timeEntry.own.delete": ["timeEntry"],
  "timeEntry.others.view": ["workspace"],
  "report.view": ["workspace"],
  "client.create": ["workspace"],
  "project.create": ["workspace"],
  "project.view": ["project"],
  "project.track": ["project"],
  "task.create": ["project"],
  "tag.create": ["workspace"],
  "tag.view": ["workspace"],
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
  "team.admin.revoke": ["owner"],
  "team.admin.setStatus": ["owner"],
  "team.account.link": ["owner", "admin"],
  "team.email.release": ["owner", "admin"],
  "team.admin.account": ["owner"],
  "member.invite": ["owner", "admin"],
  "timeEntry.own.create": everyone,
  "timeEntry.own.update": everyone,
  "timeEntry.own.delete": everyone,
  "timeEntry.others.view": ["owner", "admin"],
  "report.view": everyone,
  "client.create": everyone,
  "project.create": everyone,
  "project.view": everyone,
  "project.track": everyone,
  "task.create": everyone,
  "tag.create": everyone,
  "tag.view": everyone,
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

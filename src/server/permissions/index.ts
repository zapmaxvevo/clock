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

/**
 * Acciones que existen hoy. Cada fase agrega las suyas a esta unión y una fila
 * a la tabla de `can`, y no se decide permiso en ningún otro lugar.
 */
export type Action =
  | "workspace.settings.update"
  | "workspace.transfer"
  | "workspace.delete"
  | "team.view"
  | "team.manage"
  | "member.invite"
  | "timeEntry.own.create"
  | "timeEntry.own.update"
  | "timeEntry.own.delete";

export type Resource =
  | { readonly kind: "workspace"; readonly workspaceId: string }
  | {
      readonly kind: "membership";
      readonly workspaceId: string;
      readonly userId: string;
      readonly role: Role;
    }
  /** `userId` es el dueño de la entrada, no quien actúa. */
  | { readonly kind: "timeEntry"; readonly workspaceId: string; readonly userId: string };

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
};

/**
 * Única decisión de acceso del servidor. La interfaz la llama para ocultar
 * controles y cada action la vuelve a llamar antes de tocar datos.
 */
export function can(actor: Actor, action: Action, resource: Resource): boolean {
  if (actor.status !== "active") {
    return false;
  }
  if (resource.workspaceId !== actor.workspaceId) {
    return false;
  }
  if (!allowedRoles[action].includes(actor.role)) {
    return false;
  }
  // Las acciones ".own" son sobre entradas propias. Las entradas ajenas son del
  // reporte detallado, que decide con sus propias acciones.
  if (resource.kind === "timeEntry" && resource.userId !== actor.userId) {
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
  return true;
}

export class ForbiddenError extends Error {
  readonly code = "forbidden" as const;

  constructor(action: Action) {
    super(`Sin permiso para ${action}.`);
    this.name = "ForbiddenError";
  }
}

/** Variante que corta la operación. La usan las server actions. */
export function assertCan(actor: Actor, action: Action, resource: Resource): void {
  if (!can(actor, action, resource)) {
    throw new ForbiddenError(action);
  }
}

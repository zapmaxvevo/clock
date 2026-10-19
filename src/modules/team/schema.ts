import { z } from "zod";

import type { ActionResult } from "@/server/action";
import type { ActionErrorCode } from "@/server/errors";
import type { Role } from "@/server/permissions";
import { MEMBER_STATUSES, type MemberStatus } from "@/modules/workspace/schema";

/**
 * Los cinco roles, para la vista. El tipo mapeado exige una clave por cada
 * valor de `Role` y ninguna más: un rol nuevo en `workspace_role` no compila
 * hasta sumarlo acá. Sin importar `@/server/db/schema`: lo carga el navegador.
 */
const ROLE_VALUES = {
  owner: "owner",
  admin: "admin",
  project_manager: "project_manager",
  team_manager: "team_manager",
  member: "member",
} as const satisfies { readonly [R in Role]: R };

/** D-R8-4: los únicos roles que R8 escribe. */
export const CHANGEABLE_ROLES = ["member", "admin"] as const;
export type ChangeableRole = (typeof CHANGEABLE_ROLES)[number];

/** Los estados que la pantalla muestra y escribe (D-E2-3), los de `workspace`. */
export { MEMBER_STATUSES, type MemberStatus };

/** D-E2-8: el filtro de `?estado=`; sin parámetro, `activas`. */
export const TEAM_FILTERS = ["activas", "inactivas", "invitadas", "todas"] as const;
export type TeamFilter = (typeof TEAM_FILTERS)[number];
export const teamSearchParams = z.object({ estado: z.enum(TEAM_FILTERS).optional() });

/** Textos que la interfaz muestra tal cual (§5.6). */
export const teamMessages = {
  forbidden: "No tenés permiso para cambiar roles.",
  /** D-R8-5: un admin que pide quitar el rol de admin, a otro o a sí mismo. */
  adminOwnerOnly: "Solo el propietario quita el rol de administrador.",
  notFound: "Esa persona ya no está en el equipo.",
  inactive: "Esa persona ya no está activa en el workspace.",
  ownerLocked: "El rol del propietario no se cambia.",
  roleLocked: "Este rol no se cambia desde acá.",
  roleUnavailable: "Ese rol no está disponible.",
  unexpected: "No se pudo cambiar el rol. Revisá la conexión y volvé a intentar.",
  /** EQ-90: sin `team.manage`, para desactivar o reactivar. */
  forbiddenAction: "No tenés permiso para hacer esto.",
  /** EQ-83. */
  ownerStatusLocked: "El propietario no se desactiva.",
  /** EQ-84. */
  selfStatusLocked: "No podés desactivar tu propia membresía.",
  /** EQ-85, D-E2-4: un admin que pide desactivar o reactivar a otro admin. */
  adminStatusOwnerOnly: "Solo el propietario desactiva o reactiva a un administrador.",
  /** EQ-114, D-E2-7. */
  noAccount:
    "Esa persona no tiene una cuenta de Google vinculada: todavía no se puede reactivar.",
  statusUnavailable: "Ese estado no está disponible.",
  unexpectedStatus:
    "No se pudo cambiar el estado. Revisá la conexión y volvé a intentar.",
} as const;

export type TeamErrorCode =
  | ActionErrorCode
  | "role_locked"
  | "inactive_membership"
  | "status_locked"
  | "no_account";

/** Un cambio por pedido. El workspace sale de la sesión, nunca de acá (D-R8-6). */
export const changeRoleInput = z.object(
  {
    membershipId: z.uuid({ error: teamMessages.notFound }),
    role: z.enum(CHANGEABLE_ROLES, { error: teamMessages.roleUnavailable }),
  },
  { error: teamMessages.roleUnavailable },
);
export type ChangeRoleInput = z.infer<typeof changeRoleInput>;

/** El rol que quedó, también si ya era ese (D-R8-7). */
export type ChangeRoleResult = {
  readonly membershipId: string;
  readonly role: ChangeableRole;
};

/** Un cambio de estado por pedido. El workspace sale de la sesión (D-R8-6). */
export const changeStatusInput = z.object(
  {
    membershipId: z.uuid({ error: teamMessages.notFound }),
    status: z.enum(MEMBER_STATUSES, { error: teamMessages.statusUnavailable }),
  },
  { error: teamMessages.statusUnavailable },
);
export type ChangeStatusInput = z.infer<typeof changeStatusInput>;

/** El estado que quedó, también si ya era ese (D-E2-3). */
export type ChangeStatusResult = {
  readonly membershipId: string;
  readonly status: MemberStatus;
};

const teamMember = z.object({
  membershipId: z.uuid(),
  /** `displayNameOf`: el editado o el de Google. */
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLE_VALUES),
  /** La fila de quien mira: «(vos)». */
  isSelf: z.boolean(),
  /**
   * D-R8-3: `promote` si `can()` deja ascender a un `member`, `demote` si deja
   * quitarle el rol a un `admin` (`team.admin.revoke`), `null` sin control.
   * Siempre `null` en una fila inactiva (EQ-37, P-06).
   */
  change: z.enum(["promote", "demote"]).nullable(),
  status: z.enum(MEMBER_STATUSES),
  /** D-E2-7: si tiene una fila de `account`; sin ella no se reactiva hasta E2b. */
  hasAccount: z.boolean(),
  /**
   * D-E2-3, D-E2-4: `deactivate` en una activa, `reactivate` en una inactiva con
   * cuenta, si `can()` y las reglas lo dejan; `null` sin control.
   */
  statusChange: z.enum(["deactivate", "reactivate"]).nullable(),
});

export const teamView = z.discriminatedUnion("kind", [
  /** Sin `team.manage`: no se leyó nada. `inactive` si la membresía no está activa. */
  z.object({ kind: z.literal("forbidden"), reason: z.enum(["inactive", "role"]) }),
  /** Las membresías activas e inactivas, en el orden de `compareNames`. */
  z.object({ kind: z.literal("ready"), members: z.array(teamMember) }),
]);

export type TeamMember = z.infer<typeof teamMember>;
export type TeamView = z.infer<typeof teamView>;

/** Las actions, como las recibe la pantalla por props desde `page.tsx`. */
export type TeamActions = {
  readonly changeRole: (
    input: ChangeRoleInput,
  ) => Promise<ActionResult<ChangeRoleResult, TeamErrorCode>>;
  readonly changeStatus: (
    input: ChangeStatusInput,
  ) => Promise<ActionResult<ChangeStatusResult, TeamErrorCode>>;
};

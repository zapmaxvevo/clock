import { z } from "zod";

import type { ActionErrorCode, ActionResult } from "@/server/action";
import type { Role } from "@/server/permissions";

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
} as const;

export type TeamErrorCode = ActionErrorCode | "role_locked" | "inactive_membership";

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
   */
  change: z.enum(["promote", "demote"]).nullable(),
});

export const teamView = z.discriminatedUnion("kind", [
  /** Sin `team.manage`: no se leyó nada. `inactive` si la membresía no está activa. */
  z.object({ kind: z.literal("forbidden"), reason: z.enum(["inactive", "role"]) }),
  /** Las membresías activas, en el orden de `compareNames`. */
  z.object({ kind: z.literal("ready"), members: z.array(teamMember) }),
]);

export type TeamMember = z.infer<typeof teamMember>;
export type TeamView = z.infer<typeof teamView>;

/** Las actions, como las recibe la pantalla por props desde `page.tsx`. */
export type TeamActions = {
  readonly changeRole: (
    input: ChangeRoleInput,
  ) => Promise<ActionResult<ChangeRoleResult, TeamErrorCode>>;
};

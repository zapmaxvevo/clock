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
  statusUnavailable: "Ese estado no está disponible.",
  unexpectedStatus:
    "No se pudo cambiar el estado. Revisá la conexión y volvé a intentar.",
  /** EQ-117, D-E2b-4. */
  linkAdminOwnerOnly:
    "Solo el propietario vincula la cuenta de Google de un administrador o del propietario.",
  /** EQ-118, D-E2b-6. */
  linkInactive: "Esa persona está desactivada: reactivala para vincular su cuenta.",
  /** EQ-119, D-E2b-4. */
  releaseAdminOwnerOnly:
    "Solo el propietario libera el correo de un administrador o del propietario.",
  /** EQ-120, D-E2b-9. */
  releaseActive: "Desactivá a esa persona antes de liberar su correo.",
  /** EQ-121, D-E2b-9. */
  emailReleased: "El correo de esa persona se liberó: no se puede reactivar ni vincular.",
  linkUnavailable: "Esa vinculación no está disponible.",
  /** TT-89. */
  unexpectedLink:
    "No se pudo cambiar la vinculación. Revisá la conexión y volvé a intentar.",
  /** TT-89. */
  unexpectedRelease:
    "No se pudo liberar el correo. Revisá la conexión y volvé a intentar.",
} as const;

export type TeamErrorCode =
  | ActionErrorCode
  | "role_locked"
  | "inactive_membership"
  | "status_locked"
  | "active_membership"
  | "email_released";

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
  /**
   * D-E2b-5: si el pedido reactivó a quien no tiene cuenta y pidió además su
   * vinculación, según lo leído bajo el bloqueo. `false` si no escribió.
   */
  readonly linkRequested: boolean;
};

/** D-E2b-6: pedir o renovar (`true`), o cancelar (`false`), una vinculación. */
export const setAccountLinkInput = z.object(
  {
    membershipId: z.uuid({ error: teamMessages.notFound }),
    link: z.boolean({ error: teamMessages.linkUnavailable }),
  },
  { error: teamMessages.linkUnavailable },
);
export type SetAccountLinkInput = z.infer<typeof setAccountLinkInput>;

/** Si quedó una marca vigente, también si ya estaba así. */
export type SetAccountLinkResult = {
  readonly membershipId: string;
  readonly linkPending: boolean;
};

/** D-E2b-9. */
export const releaseEmailInput = z.object(
  { membershipId: z.uuid({ error: teamMessages.notFound }) },
  { error: teamMessages.notFound },
);
export type ReleaseEmailInput = z.infer<typeof releaseEmailInput>;
export type ReleaseEmailResult = { readonly membershipId: string };

/** D-E2b-6: lo que el menú ofrece sobre la vinculación de una activa. */
export const LINK_ACTIONS = ["request", "cancel"] as const;
export type LinkAction = (typeof LINK_ACTIONS)[number];

const teamMember = z.object({
  membershipId: z.uuid(),
  /** `displayNameOf`: el editado o el de Google. */
  name: z.string(),
  /** D-E2b-9: `null` si se liberó; la fila muestra «Correo liberado». */
  email: z.string().nullable(),
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
  /**
   * D-E2-7: si tiene una fila de `account`. `reactivate` en una inactiva con
   * cuenta, o sin cuenta si vincularla no está fuera del alcance de quien mira
   * (`isAccountActionLocked`, D-E2b-5); nunca en una con el correo liberado.
   */
  hasAccount: z.boolean(),
  /**
   * D-E2-3, D-E2-4: `deactivate` en una activa, si `can()` y las reglas lo
   * dejan; `reactivate` en una inactiva con cuenta, o sin cuenta si vincularla
   * no está fuera del alcance de quien mira (`isAccountActionLocked`, D-E2b-5);
   * nunca en una con el correo liberado. `null` sin control.
   */
  statusChange: z.enum(["deactivate", "reactivate"]).nullable(),
  /** D-E2b-2, D-E2b-11: la marca, con su pedido, su vencimiento y si ya venció; `null` sin marca. */
  link: z
    .object({ requestedAt: z.date(), expiresAt: z.date(), expired: z.boolean() })
    .nullable(),
  /**
   * D-E2b-4, D-E2b-6: lo que el menú ofrece sobre la vinculación de una activa,
   * si `isAccountActionLocked` no la deja fuera de alcance: `["request"]` sin
   * marca, `["cancel"]` con una vigente, `["request", "cancel"]` con una vencida;
   * `[]` sin control.
   */
  linkActions: z.array(z.enum(LINK_ACTIONS)),
  /** D-E2b-8: si pedir la vinculación registra el correo como externo. */
  registersExternal: z.boolean(),
  /** D-E2b-4, D-E2b-9: si se ofrece «Liberar el correo». */
  canReleaseEmail: z.boolean(),
});

export const teamView = z.discriminatedUnion("kind", [
  /** Sin `team.manage`: no se leyó nada. `inactive` si la membresía no está activa. */
  z.object({ kind: z.literal("forbidden"), reason: z.enum(["inactive", "role"]) }),
  /**
   * Las membresías activas e inactivas, en el orden de `compareNames`.
   * `linkTtlDays`: `ACCOUNT_LINK_TTL_DAYS`, para los textos de las confirmaciones
   * (D-E2b-11, §5.4).
   */
  z.object({
    kind: z.literal("ready"),
    members: z.array(teamMember),
    linkTtlDays: z.number().int().positive(),
  }),
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
  readonly setAccountLink: (
    input: SetAccountLinkInput,
  ) => Promise<ActionResult<SetAccountLinkResult, TeamErrorCode>>;
  readonly releaseEmail: (
    input: ReleaseEmailInput,
  ) => Promise<ActionResult<ReleaseEmailResult, TeamErrorCode>>;
};

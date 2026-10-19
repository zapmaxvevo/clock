import { z } from "zod";

import type { ActionResult } from "@/server/action";
import type { ActionErrorCode } from "@/server/errors";
import type { MembershipStatus } from "@/server/permissions";

/**
 * Los estados de quien está en el workspace; `invited` todavía no (RP-64). Los
 * leen el catálogo de personas del reporte y la lista de equipo, y los escribe
 * `changeStatus` (D-E2-3, D-E2-10).
 */
export const MEMBER_STATUSES = [
  "active",
  "inactive",
] as const satisfies readonly MembershipStatus[];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * El estado de una fila leída con `MEMBER_STATUSES`, estrechado. Una `invited`
 * es un error de la consulta, no un dato.
 */
export function memberStatusOf(status: MembershipStatus): MemberStatus {
  if (status === "invited") {
    throw new Error("Una membresía invitada llegó a una lectura de personas presentes.");
  }
  return status;
}

/** EQ-78: el tope de correos por pedido. */
export const INVITE_LIMIT = 50;

/** El largo máximo de un correo, el mismo que el `check` de la base. */
export const EMAIL_MAX_LENGTH = 320;

/**
 * El tope de cada texto del pedido: por encima, ni se clasifica. Entre
 * `EMAIL_MAX_LENGTH` y este, es un rechazo por correo (EQ-76).
 */
export const EMAIL_INPUT_MAX_LENGTH = 1000;

/** Textos que la interfaz muestra tal cual (EQ-76 … EQ-81, EQ-90). */
export const invitationMessages = {
  forbidden: "No tenés permiso para hacer esto.",
  noEmails: "Escribí al menos un correo.",
  tooMany: `Se pueden invitar hasta ${INVITE_LIMIT} correos por vez.`,
  inputTooLong: `Cada correo puede tener hasta ${EMAIL_INPUT_MAX_LENGTH} caracteres.`,
  invalidEmail: (email: string) => `${email} no es un correo válido.`,
  inactiveMember: (email: string) =>
    `${email} está desactivada: reactivala desde la lista.`,
  notPending: "Esa invitación ya no está pendiente.",
  rejected: "No se invitó a nadie.",
  unexpectedInvite:
    "No se pudieron mandar las invitaciones. Revisá la conexión y volvé a intentar.",
  unexpectedRevoke:
    "No se pudo revocar la invitación. Revisá la conexión y volvé a intentar.",
} as const;

export type InvitationErrorCode =
  ActionErrorCode | "rejected" | "invalid_email" | "inactive_member" | "not_pending";

/** Un texto con algo más que blancos: vacío después de normalizar, no es un correo. */
function hasContent(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Lo que manda el diálogo: los correos ya separados, crudos. El servidor los
 * normaliza, descarta los vacíos, quita los repetidos y clasifica (D-E1a-7).
 * El formato y el largo de cada uno no se validan acá: son un rechazo por
 * correo (EQ-14). Sin ninguno con contenido, es una causa de todo el pedido
 * (D-E1a-6).
 */
export const inviteInput = z.object(
  {
    emails: z
      .array(
        z
          .string({ error: invitationMessages.noEmails })
          .max(EMAIL_INPUT_MAX_LENGTH, { error: invitationMessages.inputTooLong }),
        { error: invitationMessages.noEmails },
      )
      .min(1, { error: invitationMessages.noEmails })
      .max(INVITE_LIMIT, { error: invitationMessages.tooMany })
      .refine((emails) => emails.some(hasContent), {
        error: invitationMessages.noEmails,
      }),
  },
  { error: invitationMessages.noEmails },
);
export type InviteInput = z.infer<typeof inviteInput>;

export const revokeInvitationInput = z.object(
  { invitationId: z.uuid({ error: invitationMessages.notPending }) },
  { error: invitationMessages.notPending },
);
export type RevokeInvitationInput = z.infer<typeof revokeInvitationInput>;

/** Un correo del pedido, ya normalizado, con lo que pasó (D-E1a-7). */
export type InviteOutcome = {
  readonly email: string;
  readonly result: "invited" | "already_invited" | "already_member";
  /** Fuera de los dominios de la empresa: la marca «Externa». */
  readonly external: boolean;
};

export type InviteResult = {
  /** En el orden del pedido, sin repetidos. */
  readonly outcomes: readonly InviteOutcome[];
};

export type RevokeInvitationResult = { readonly invitationId: string };

/** Una invitación pendiente, para la tabla (EQ-04). */
export type PendingInvitation = {
  readonly id: string;
  readonly email: string;
  readonly external: boolean;
};

export type InvitationsView =
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "ready";
      /** En el orden del correo (D-E1a-12). */
      readonly invitations: readonly PendingInvitation[];
      /** `BETTER_AUTH_URL`: la dirección del aviso (D-E1a-10). */
      readonly appUrl: string;
    };

/** Las actions, como las recibe la pantalla por props desde `page.tsx`. */
export type InvitationActions = {
  readonly inviteMembers: (
    input: InviteInput,
  ) => Promise<ActionResult<InviteResult, InvitationErrorCode>>;
  readonly revokeInvitation: (
    input: RevokeInvitationInput,
  ) => Promise<ActionResult<RevokeInvitationResult, InvitationErrorCode>>;
};

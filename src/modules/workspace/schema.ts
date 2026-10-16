import { z } from "zod";

import type { ActionErrorCode, ActionResult } from "@/server/action";

/** EQ-78: el tope de correos por pedido. */
export const INVITE_LIMIT = 50;

/** El largo máximo de un correo, el mismo que el `check` de la base. */
export const EMAIL_MAX_LENGTH = 320;

/** Textos que la interfaz muestra tal cual (EQ-76 … EQ-81, EQ-90). */
export const invitationMessages = {
  forbidden: "No tenés permiso para hacer esto.",
  noEmails: "Escribí al menos un correo.",
  tooMany: `Se pueden invitar hasta ${INVITE_LIMIT} correos por vez.`,
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

/**
 * Lo que manda el diálogo: los correos ya separados, crudos. El servidor los
 * normaliza, quita los repetidos y clasifica (D-E1a-7). El formato y el largo
 * de cada uno no se validan acá: son un rechazo por correo (EQ-14).
 */
export const inviteInput = z.object(
  {
    emails: z
      .array(z.string(), { error: invitationMessages.noEmails })
      .min(1, { error: invitationMessages.noEmails })
      .max(INVITE_LIMIT, { error: invitationMessages.tooMany }),
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

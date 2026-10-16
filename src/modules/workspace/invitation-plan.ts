import { z } from "zod";

import { isCompanyEmail, normalizeEmail } from "@/lib/email";
import type { Rejection } from "@/server/errors";

import type { InvitationRow, MemberByEmail } from "./repository";
import {
  EMAIL_MAX_LENGTH,
  invitationMessages,
  type InvitationErrorCode,
  type InviteOutcome,
} from "./schema";

/**
 * La clasificación de los correos de un pedido (D-E1a-7), pura: la usa
 * `inviteMembers` dentro de su transacción y la prueban los tests de unidad.
 */

/** Fuera de los dominios de la empresa: «Externa» se deriva, no se guarda (ADR 0024). */
export function isExternal(email: string, domains: readonly string[]): boolean {
  return !isCompanyEmail(email, domains);
}

const validEmail = z.email().max(EMAIL_MAX_LENGTH);

/** EQ-76: el formato y el largo de un correo ya normalizado. */
export function isValidEmail(email: string): boolean {
  return validEmail.safeParse(email).success;
}

/** EQ-105: normalizados, sin vacíos ni repetidos, conservando el primero. */
export function distinctEmails(emails: readonly string[]): string[] {
  return [...new Set(emails.map(normalizeEmail))].filter((email) => email.length > 0);
}

export type InvitationPlan = {
  /** En el orden del pedido; vale solo sin rechazos. */
  readonly outcomes: readonly InviteOutcome[];
  /** En el orden del pedido. El `id` es el correo normalizado (ADR 0011). */
  readonly rejections: readonly Rejection<InvitationErrorCode>[];
  /** Los correos sin membresía ni invitación: filas nuevas. */
  readonly toInsert: readonly string[];
  /** Las invitaciones `revoked` o `accepted` que vuelven a `pending`. */
  readonly toReinvite: readonly InvitationRow[];
};

/**
 * D-E1a-7, pura: la clasifica sin base, para probarla de a una. `emails` ya
 * normalizados y sin repetidos; `members` e `invitations`, los de esos correos.
 * La membresía tiene prioridad sobre la invitación: la persona ya está.
 */
export function planInvitations(
  emails: readonly string[],
  domains: readonly string[],
  members: readonly MemberByEmail[],
  invitations: readonly InvitationRow[],
): InvitationPlan {
  const memberStatus = new Map(members.map((member) => [member.email, member.status]));
  const invitationOf = new Map(invitations.map((row) => [row.email, row]));
  const outcomes: InviteOutcome[] = [];
  const rejections: Rejection<InvitationErrorCode>[] = [];
  const toInsert: string[] = [];
  const toReinvite: InvitationRow[] = [];

  for (const email of emails) {
    const external = isExternal(email, domains);
    if (!isValidEmail(email)) {
      rejections.push({
        id: email,
        code: "invalid_email",
        message: invitationMessages.invalidEmail(email),
      });
      continue;
    }
    const status = memberStatus.get(email);
    if (status === "active") {
      outcomes.push({ email, result: "already_member", external });
      continue;
    }
    // `invited` no tiene escritor (ADR 0024, decisión 7): si apareciera, cae acá.
    if (status !== undefined) {
      rejections.push({
        id: email,
        code: "inactive_member",
        message: invitationMessages.inactiveMember(email),
      });
      continue;
    }
    const existing = invitationOf.get(email);
    if (existing === undefined) {
      toInsert.push(email);
      outcomes.push({ email, result: "invited", external });
    } else if (existing.status === "pending") {
      outcomes.push({ email, result: "already_invited", external });
    } else {
      toReinvite.push(existing);
      outcomes.push({ email, result: "invited", external });
    }
  }
  return { outcomes, rejections, toInsert, toReinvite };
}

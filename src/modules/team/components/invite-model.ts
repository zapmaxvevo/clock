import { normalizeEmail } from "@/lib/email";
import type { Rejection } from "@/server/action";
import { INVITE_LIMIT, invitationMessages } from "@/modules/workspace/schema";

/**
 * Los correos escritos en el campo, en el orden en que aparecen: partidos por
 * comas y blancos, sin vacíos y sin repetidos, sin distinguir mayúsculas. Se
 * queda el primero tal como se escribió: el servidor lo normaliza (EQ-105).
 */
export function splitEmails(text: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const email of text.split(/[\s,]+/)) {
    const key = normalizeEmail(email);
    if (key === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

export type EmailsCheck =
  | { readonly ok: true; readonly emails: readonly string[] }
  | { readonly ok: false; readonly message: string };

/**
 * Lo que el diálogo manda, o el aviso que muestra sin mandar: EQ-77 sin
 * correos, EQ-78 con más del tope. El servidor vuelve a comprobar los dos.
 */
export function checkEmails(text: string): EmailsCheck {
  const emails = splitEmails(text);
  if (emails.length === 0) {
    return { ok: false, message: invitationMessages.noEmails };
  }
  if (emails.length > INVITE_LIMIT) {
    return { ok: false, message: invitationMessages.tooMany };
  }
  return { ok: true, emails };
}

/**
 * «Quitar los que fallan»: el campo con los correos que no frenaron el pedido,
 * uno por línea. Cada rechazo lleva por `id` el correo normalizado.
 */
export function withoutRejected(
  text: string,
  rejections: readonly Rejection<string>[],
): string {
  const rejected = new Set(rejections.map((rejection) => rejection.id));
  return splitEmails(text)
    .filter((email) => !rejected.has(normalizeEmail(email)))
    .join("\n");
}

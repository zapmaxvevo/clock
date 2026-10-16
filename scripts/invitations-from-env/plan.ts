import { isCompanyEmail, normalizeEmail } from "@/lib/email";
import type { InvitationStatus } from "@/server/db/schema";

/**
 * El plan del script de la variable (contrato de E1a, §4.6), puro: qué fila de
 * `invitation` le toca a cada correo de `EXTERNAL_INVITE_EMAILS`.
 */

export type EnvInvitationStep = {
  readonly email: string;
  /**
   * D-E1a-4: un correo de los dominios de la empresa en la variable deja de
   * entrar sin `hd`; se señala. `false` si no se pasaron los dominios.
   */
  readonly inDomain: boolean;
} & (
  | {
      /** Una fila nueva: `accepted` si ya tiene membresía, `pending` si no. */
      readonly kind: "create";
      readonly status: "pending" | "accepted";
    }
  | {
      /** Ya tiene fila: no se toca, en ningún estado. */
      readonly kind: "exists";
      readonly status: InvitationStatus;
    }
);

/**
 * Un paso por correo, en el orden de la variable y sin repetidos. `members`:
 * los correos con membresía en el workspace, en cualquier estado.
 */
export function planFromEnv(
  emails: readonly string[],
  domains: readonly string[],
  members: readonly string[],
  invitations: readonly { readonly email: string; readonly status: InvitationStatus }[],
): EnvInvitationStep[] {
  const withMembership = new Set(members.map(normalizeEmail));
  const statusOf = new Map(invitations.map((row) => [row.email, row.status]));
  return [...new Set(emails.map(normalizeEmail))].map((email) => {
    const inDomain = isCompanyEmail(email, domains);
    const existing = statusOf.get(email);
    if (existing !== undefined) {
      return { email, inDomain, kind: "exists", status: existing };
    }
    return {
      email,
      inDomain,
      kind: "create",
      status: withMembership.has(email) ? "accepted" : "pending",
    };
  });
}

/** Una línea por paso, para la salida del script. */
export function describeStep(step: EnvInvitationStep): string {
  const action =
    step.kind === "create" ? `se crea ${step.status}` : `ya existe (${step.status})`;
  const warning = step.inDomain
    ? "  ¡del dominio! sin hd ya no entra por la variable (D-E1a-4)"
    : "";
  return `  ${action.padEnd(22)} ${step.email}${warning}`;
}

import { isCompanyEmail } from "@/lib/email";
import { distinctEmails, isValidEmail } from "@/modules/workspace/invitation-plan";
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
 * Los correos de la variable, normalizados y sin repetidos, en su orden.
 * `invalid`: los que no son un correo (EQ-76), que no se insertan; el script
 * los lista para que se corrijan a mano.
 */
export function splitEnvEmails(emails: readonly string[]): {
  readonly valid: readonly string[];
  readonly invalid: readonly string[];
} {
  const distinct = distinctEmails(emails);
  return {
    valid: distinct.filter(isValidEmail),
    invalid: distinct.filter((email) => !isValidEmail(email)),
  };
}

/**
 * Un paso por correo, en el orden de `emails`, que llegan de `splitEnvEmails`.
 * `members`: los correos con membresía en el workspace, en cualquier estado,
 * ya normalizados.
 */
export function planFromEnv(
  emails: readonly string[],
  domains: readonly string[],
  members: readonly string[],
  invitations: readonly { readonly email: string; readonly status: InvitationStatus }[],
): EnvInvitationStep[] {
  const withMembership = new Set(members);
  const statusOf = new Map(invitations.map((row) => [row.email, row.status]));
  return emails.map((email) => {
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

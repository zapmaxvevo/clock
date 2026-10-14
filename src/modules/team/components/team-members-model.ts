import type {
  ChangeableRole,
  ChangeRoleInput,
  TeamErrorCode,
  TeamMember,
} from "@/modules/team/schema";

import { teamLabels } from "./labels";

/**
 * El `<h1>` que nombra la tabla. Vive acá y no en `team-members.tsx`: lo
 * importa la pantalla, que es de servidor, y un valor exportado de un módulo
 * de cliente llega al servidor como referencia, no como texto.
 */
export const TEAM_HEADING_ID = "equipo-titulo";

/**
 * El clic en el botón de una fila. Con un pedido en curso, o sin `change`, no
 * hace nada; si no, manda `{ membershipId, role }` con `admin` (`promote`) o
 * `member` (`demote`).
 */
export function activate(
  member: TeamMember,
  pending: boolean,
  /** `run` de `useAction` con `changeRole`. */
  send: (input: ChangeRoleInput) => void,
): void {
  if (pending || member.change === null) {
    return;
  }
  send({
    membershipId: member.membershipId,
    role: member.change === "promote" ? "admin" : "member",
  });
}

/** El último desenlace de la tabla, con el nombre de la fila al hacer clic. */
export type TeamOutcome =
  | { readonly kind: "changed"; readonly name: string; readonly role: ChangeableRole }
  | {
      readonly kind: "failed";
      readonly name: string;
      /** `unexpected` ya está en `ActionErrorCode`. */
      readonly code: TeamErrorCode;
      readonly message: string;
    };

/** El aviso de la tabla (§5.6). */
export type TeamFeedback = {
  readonly tone: "error" | "info";
  readonly title: string;
  readonly message?: string;
  /** Solo con `unexpected`. */
  readonly retry: boolean;
};

/**
 * El aviso de un desenlace, o `null` sin desenlace. «Reintentar» solo con
 * `unexpected`, como `retryHandlerOf`: los demás códigos ya describen el
 * estado real. Con `unexpected`, el cuerpo es `unexpectedBody` y no el mensaje
 * del resultado: el título ya dice que no se pudo cambiar el rol.
 */
export function feedbackOf(outcome: TeamOutcome | null): TeamFeedback | null {
  if (outcome === null) {
    return null;
  }
  if (outcome.kind === "changed") {
    return {
      tone: "info",
      title: teamLabels.changed(outcome.name, teamLabels.roles[outcome.role]),
      retry: false,
    };
  }
  const unexpected = outcome.code === "unexpected";
  return {
    tone: "error",
    title: teamLabels.changeFailed(outcome.name),
    message: unexpected ? teamLabels.unexpectedBody : outcome.message,
    retry: unexpected,
  };
}

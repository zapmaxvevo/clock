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

/** Lo que hace la tabla con un clic; los dos los pasa el componente. */
export type RowHandlers = {
  /** `run` de `useAction` con `changeRole`. */
  readonly send: (input: ChangeRoleInput) => void;
  /** Abre la confirmación de §5.5 para la fila. */
  readonly confirm: (member: TeamMember) => void;
};

/**
 * El clic en el botón de una fila. Con un pedido en curso no hace nada. La fila
 * propia con `demote` pide confirmación y no manda; las demás mandan
 * `{ membershipId, role }` con `admin` (`promote`) o `member` (`demote`).
 */
export function activate(
  member: TeamMember,
  pending: boolean,
  handlers: RowHandlers,
): void {
  if (pending || member.change === null) {
    return;
  }
  if (member.isSelf && member.change === "demote") {
    handlers.confirm(member);
    return;
  }
  handlers.send({
    membershipId: member.membershipId,
    role: member.change === "promote" ? "admin" : "member",
  });
}

/** «Dejar de ser administrador» en la confirmación: manda `member`. Con un pedido en curso, nada. */
export function confirmSelfDemotion(
  member: TeamMember,
  pending: boolean,
  send: RowHandlers["send"],
): void {
  if (pending) {
    return;
  }
  send({ membershipId: member.membershipId, role: "member" });
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
 * estado real.
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
  return {
    tone: "error",
    title: teamLabels.changeFailed(outcome.name),
    message: outcome.message,
    retry: outcome.code === "unexpected",
  };
}

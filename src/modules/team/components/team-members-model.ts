import type {
  ChangeableRole,
  ChangeRoleInput,
  ChangeStatusInput,
  MemberStatus,
  TeamErrorCode,
  TeamFilter,
  TeamMember,
} from "@/modules/team/schema";
import type { InvitationErrorCode, PendingInvitation } from "@/modules/workspace/schema";

import { teamLabels } from "./labels";

/**
 * El `<h1>` que nombra la tabla. Vive acá y no en `team-members.tsx`: lo
 * importa la pantalla, que es de servidor, y un valor exportado de un módulo
 * de cliente llega al servidor como referencia, no como texto.
 */
export const TEAM_HEADING_ID = "equipo-titulo";

/** El encabezado de una fila, adonde va el foco si el éxito le saca el control (§5.4). */
export function rowHeaderId(membershipId: string): string {
  return `persona-${membershipId}`;
}

/** El menú de una fila, adonde vuelve el foco al cerrar la confirmación (§5.4). */
export function rowActionsId(membershipId: string): string {
  return `acciones-${membershipId}`;
}

/** D-E2-8: adónde lleva elegir un filtro. «Activas» es la URL sin parámetro. */
export function filterHref(filter: TeamFilter): string {
  return filter === "activas" ? "/equipo" : `/equipo?estado=${filter}`;
}

/**
 * D-E2-8: las personas que muestra el filtro, en el orden de la vista, más las
 * que la pantalla cambió desde que se dibujó con ese filtro (EQ-11), con su
 * estado de ahora.
 */
export function visibleMembers(
  members: readonly TeamMember[],
  filter: TeamFilter,
  /** Los ids de las membresías cambiadas con este filtro. */
  kept: ReadonlySet<string>,
): readonly TeamMember[] {
  return members.filter((member) => {
    if (kept.has(member.membershipId)) {
      return true;
    }
    switch (filter) {
      case "activas":
        return member.status === "active";
      case "inactivas":
        return member.status === "inactive";
      case "invitadas":
        return false;
      case "todas":
        return true;
    }
  });
}

/** D-E2-8: las invitaciones pendientes van con todos los filtros salvo «Inactivas». */
export function visibleInvitations(
  invitations: readonly PendingInvitation[],
  filter: TeamFilter,
): readonly PendingInvitation[] {
  return filter === "inactivas" ? [] : invitations;
}

/**
 * El vacío de la pantalla, o `null` (§5.5). `inactive` y `invited` (EQ-94) van
 * en lugar de la tabla, cuando el filtro no deja ninguna fila. `invitations`
 * (EQ-93) va debajo de la tabla, con «Invitar»: la vista trae una sola
 * membresía —la de quien mira— y ninguna invitada; una inactiva cuenta como
 * otra persona.
 */
export function emptyOf(
  filter: TeamFilter,
  shown: { readonly members: number; readonly invitations: number },
  all: {
    readonly members: number;
    readonly invitations: number;
    /** Con `member.invite`. */
    readonly canInvite: boolean;
  },
): "inactive" | "invited" | "invitations" | null {
  if (shown.members === 0 && shown.invitations === 0) {
    if (filter === "inactivas") {
      return "inactive";
    }
    if (filter === "invitadas") {
      return "invited";
    }
  }
  const alone = all.canInvite && all.members === 1 && all.invitations === 0;
  return alone && (filter === "activas" || filter === "todas") ? "invitations" : null;
}

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

/**
 * Elegir una entrada del menú de una fila (D-E2-9). Con un pedido en curso, o
 * sin `statusChange`, no hace nada, como `activate`. «Desactivar» abre la
 * confirmación (EQ-46); «Reactivar» manda `active` sin confirmar (EQ-47).
 */
export function chooseStatusChange(
  member: TeamMember,
  pending: boolean,
  handlers: {
    readonly confirm: (member: TeamMember) => void;
    /** `run` de `useAction` con `changeStatus`. */
    readonly send: (input: ChangeStatusInput) => void;
  },
): void {
  if (pending || member.statusChange === null) {
    return;
  }
  if (member.statusChange === "deactivate") {
    handlers.confirm(member);
    return;
  }
  handlers.send({ membershipId: member.membershipId, status: "active" });
}

/**
 * «Desactivar» en la confirmación: manda `inactive` para la fila que se
 * confirmaba, salvo con un pedido en curso.
 */
export function confirmDeactivation(
  member: TeamMember | null,
  pending: boolean,
  send: (input: ChangeStatusInput) => void,
): void {
  if (member === null || pending) {
    return;
  }
  send({ membershipId: member.membershipId, status: "inactive" });
}

/**
 * El último desenlace de la tabla, con el nombre de la fila al hacer clic: un
 * cambio de rol, uno de estado o una revocación, que comparten el aviso (§5.4).
 */
export type TeamOutcome =
  | { readonly kind: "changed"; readonly name: string; readonly role: ChangeableRole }
  | {
      readonly kind: "failed";
      readonly name: string;
      /** `unexpected` ya está en `ActionErrorCode`. */
      readonly code: TeamErrorCode;
      readonly message: string;
    }
  | {
      readonly kind: "statusChanged";
      readonly name: string;
      readonly status: MemberStatus;
    }
  | {
      readonly kind: "statusFailed";
      readonly name: string;
      /** El estado pedido: dice si el título es de desactivar o de reactivar. */
      readonly status: MemberStatus;
      readonly code: TeamErrorCode;
      readonly message: string;
    }
  | { readonly kind: "revoked"; readonly email: string }
  | {
      readonly kind: "revokeFailed";
      readonly email: string;
      readonly code: InvitationErrorCode;
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
 * del resultado: el título ya dice qué no se hizo.
 */
export function feedbackOf(outcome: TeamOutcome | null): TeamFeedback | null {
  if (outcome === null) {
    return null;
  }
  switch (outcome.kind) {
    case "changed":
      return {
        tone: "info",
        title: teamLabels.changed(outcome.name, teamLabels.roles[outcome.role]),
        retry: false,
      };
    case "statusChanged":
      return {
        tone: "info",
        title:
          outcome.status === "inactive"
            ? teamLabels.deactivated(outcome.name)
            : teamLabels.reactivated(outcome.name),
        retry: false,
      };
    case "revoked":
      return { tone: "info", title: teamLabels.revoked(outcome.email), retry: false };
    case "failed":
      return failedFeedback(teamLabels.changeFailed(outcome.name), outcome);
    case "statusFailed":
      return failedFeedback(
        outcome.status === "inactive"
          ? teamLabels.deactivateFailed(outcome.name)
          : teamLabels.reactivateFailed(outcome.name),
        outcome,
      );
    case "revokeFailed":
      return failedFeedback(teamLabels.revokeFailed(outcome.email), outcome);
  }
}

/**
 * Si la revalidación saca de la tabla la fila de la invitación revocada: con
 * éxito, y con `not_pending` o `not_found`, que dicen que ya no está pendiente.
 * Con el botón se va el foco, que la pantalla lleva al título (§5.4).
 */
export function revokeLeavesTable(outcome: TeamOutcome): boolean {
  if (outcome.kind === "revoked") {
    return true;
  }
  return (
    outcome.kind === "revokeFailed" &&
    (outcome.code === "not_pending" || outcome.code === "not_found")
  );
}

function failedFeedback(
  title: string,
  failure: { readonly code: string; readonly message: string },
): TeamFeedback {
  const unexpected = failure.code === "unexpected";
  return {
    tone: "error",
    title,
    message: unexpected ? teamLabels.unexpectedBody : failure.message,
    retry: unexpected,
  };
}

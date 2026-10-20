import {
  LINK_ACTIONS,
  type ChangeableRole,
  type ChangeRoleInput,
  type ChangeStatusInput,
  type MemberStatus,
  type ReleaseEmailInput,
  type SetAccountLinkInput,
  type TeamErrorCode,
  type TeamFilter,
  type TeamMember,
} from "@/modules/team/schema";
import type { InvitationErrorCode, PendingInvitation } from "@/modules/workspace/schema";
import { dayKey, formatDayKey, type TimeSettings } from "@/server/time";

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
 * §5.3 de E2b: una entrada del menú de una fila. Cada una es también la clave
 * de su rótulo en `teamLabels`.
 */
export type MenuEntry =
  | "deactivate"
  | "reactivate"
  | "requestLink"
  | "requestOtherLink"
  | "renewLink"
  | "cancelLink"
  | "releaseEmail";

/**
 * §5.3 de E2b: las entradas del menú de una fila, en orden: el estado (E2), la
 * vinculación (`linkActions`) y liberar el correo. Sin ninguna, la fila no
 * tiene menú (D-E2-9). Qué se ofrece lo decide el servidor; acá solo se
 * nombra y se ordena.
 */
export function menuEntriesOf(member: TeamMember): readonly MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (member.statusChange !== null) {
    entries.push(member.statusChange);
  }
  for (const action of LINK_ACTIONS) {
    if (member.linkActions.includes(action)) {
      entries.push(action === "cancel" ? "cancelLink" : requestEntryOf(member));
    }
  }
  if (member.canReleaseEmail) {
    entries.push("releaseEmail");
  }
  return entries;
}

/** Cómo se llama pedir: renovar una vencida, reemplazar la cuenta o la primera. */
function requestEntryOf(member: TeamMember): MenuEntry {
  if (member.link?.expired === true) {
    return "renewLink";
  }
  return member.hasAccount ? "requestOtherLink" : "requestLink";
}

/** El momento de una vinculación, como lo trae la vista. */
type LinkMoment = NonNullable<TeamMember["link"]>["requestedAt"];

/**
 * §5.2 de E2b: la nota debajo del correo, la primera que corresponda: la
 * vinculación vigente (sin cuenta o con cuenta), la vencida, o «Sin cuenta de
 * Google vinculada.». Una fila liberada no tiene nota: «Correo liberado» ya lo
 * dice. `formatDay` pone una fecha en el formato de quien mira (PF-12).
 */
export function rowNoteOf(
  member: TeamMember,
  formatDay: (moment: LinkMoment) => string,
): string | null {
  if (member.email === null) {
    return null;
  }
  const { link } = member;
  if (link === null) {
    return member.hasAccount ? null : teamLabels.noAccount;
  }
  const requested = formatDay(link.requestedAt);
  const expires = formatDay(link.expiresAt);
  if (link.expired) {
    return teamLabels.linkExpired(requested, expires);
  }
  return member.hasAccount
    ? teamLabels.linkPendingReplace(requested, expires)
    : teamLabels.linkPendingFirst(requested, expires);
}

/**
 * Las notas de las filas que tienen una, por membresía. Corre en el servidor,
 * en `TeamScreen`: la zona es del servidor (ADR 0012), y la fecha va con la
 * zona y el formato de quien mira (PF-11, PF-12).
 */
export function rowNotesOf(
  members: readonly TeamMember[],
  settings: TimeSettings,
): Readonly<Record<string, string>> {
  const formatDay = (moment: LinkMoment) =>
    formatDayKey(dayKey(moment, settings.timezone), settings.formats.date, true);
  return Object.fromEntries(
    members.flatMap((member) => {
      const note = rowNoteOf(member, formatDay);
      return note === null ? [] : [[member.membershipId, note]];
    }),
  );
}

/** Si la fila tiene una vinculación vigente: lo que devuelve `setAccountLink`. */
export function linkPendingOf(member: TeamMember): boolean {
  return member.link !== null && !member.link.expired;
}

/**
 * §5.4 de E2b: lo que se confirma al vincular. `reactivate` es «Reactivar» en
 * una inactiva sin cuenta (D-E2b-5); si no, pedir o renovar la vinculación.
 */
export type LinkRequest = { readonly member: TeamMember; readonly reactivate: boolean };

/** Los textos de la confirmación de vincular. */
export type LinkConfirmation = {
  readonly title: string;
  readonly body: string;
  /** D-E2b-8: el párrafo del externo, o `null`. */
  readonly external: string | null;
  readonly confirm: string;
};

/**
 * §5.4 de E2b: los textos de la confirmación. Sin cuenta, la próxima cuenta
 * con el correo es la primera; con cuenta, reemplaza a la actual. `ttlDays` es
 * el `linkTtlDays` de la vista.
 */
export function linkConfirmationOf(
  request: LinkRequest,
  ttlDays: number,
): LinkConfirmation {
  const { member, reactivate } = request;
  // Una fila liberada no ofrece vincular (D-E2b-9): el correo está.
  const email = member.email ?? "";
  return {
    title: reactivate
      ? teamLabels.reactivateTitle(member.name)
      : member.hasAccount
        ? teamLabels.linkOtherTitle(member.name)
        : teamLabels.linkFirstTitle(member.name),
    body: member.hasAccount
      ? teamLabels.linkOtherBody(ttlDays, email, member.name)
      : teamLabels.linkFirstBody(ttlDays, email, member.name),
    external: member.registersExternal
      ? teamLabels.linkExternalBody(email, member.name)
      : null,
    confirm: reactivate ? teamLabels.reactivate : teamLabels.linkConfirm,
  };
}

/**
 * Elegir una entrada del menú de una fila (D-E2-9, §5.3 de E2b). Con un pedido
 * en curso, o con una entrada que la fila no ofrece, no hace nada, como
 * `activate`. Confirman «Desactivar» (EQ-46), «Reactivar» sin cuenta, pedir o
 * renovar la vinculación y «Liberar el correo»; «Reactivar» con cuenta (EQ-47)
 * y «Cancelar la vinculación» mandan directo.
 */
export function chooseMenuEntry(
  member: TeamMember,
  entry: MenuEntry,
  pending: boolean,
  handlers: {
    readonly confirmDeactivate: (member: TeamMember) => void;
    readonly confirmLink: (request: LinkRequest) => void;
    readonly confirmRelease: (member: TeamMember) => void;
    /** `run` de `useAction` con `changeStatus`. */
    readonly sendStatus: (input: ChangeStatusInput) => void;
    /** `run` de `useAction` con `setAccountLink`. */
    readonly sendLink: (input: SetAccountLinkInput) => void;
  },
): void {
  if (pending || !menuEntriesOf(member).includes(entry)) {
    return;
  }
  switch (entry) {
    case "deactivate":
      handlers.confirmDeactivate(member);
      return;
    case "reactivate":
      if (member.hasAccount) {
        handlers.sendStatus({ membershipId: member.membershipId, status: "active" });
      } else {
        handlers.confirmLink({ member, reactivate: true });
      }
      return;
    case "requestLink":
    case "requestOtherLink":
    case "renewLink":
      handlers.confirmLink({ member, reactivate: false });
      return;
    case "cancelLink":
      handlers.sendLink({ membershipId: member.membershipId, link: false });
      return;
    case "releaseEmail":
      handlers.confirmRelease(member);
      return;
  }
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
 * «Reactivar» o «Vincular» en la confirmación de vincular: reactivar manda
 * `active`, y el servidor pide la vinculación (D-E2b-5); si no, pide la
 * vinculación. Nada con un pedido en curso.
 */
export function confirmLinkRequest(
  request: LinkRequest | null,
  pending: boolean,
  handlers: {
    readonly sendStatus: (input: ChangeStatusInput) => void;
    readonly sendLink: (input: SetAccountLinkInput) => void;
  },
): void {
  if (request === null || pending) {
    return;
  }
  const { membershipId } = request.member;
  if (request.reactivate) {
    handlers.sendStatus({ membershipId, status: "active" });
  } else {
    handlers.sendLink({ membershipId, link: true });
  }
}

/** «Liberar el correo» en la confirmación, salvo con un pedido en curso. */
export function confirmRelease(
  member: TeamMember | null,
  pending: boolean,
  send: (input: ReleaseEmailInput) => void,
): void {
  if (member === null || pending) {
    return;
  }
  send({ membershipId: member.membershipId });
}

/**
 * El último desenlace de la tabla, con el nombre de la fila al hacer clic: un
 * cambio de rol, uno de estado, uno de la vinculación, una liberación o una
 * revocación, que comparten el aviso (§5.4).
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
      /** D-E2b-5: reactivó a quien no tenía cuenta, y con eso pidió la vinculación. */
      readonly linkRequested: boolean;
    }
  | {
      readonly kind: "statusFailed";
      readonly name: string;
      /** El estado pedido: dice si el título es de desactivar o de reactivar. */
      readonly status: MemberStatus;
      readonly code: TeamErrorCode;
      readonly message: string;
    }
  | {
      readonly kind: "linkChanged";
      readonly name: string;
      /** Lo pedido: pedir o renovar (`true`), o cancelar (`false`). */
      readonly link: boolean;
    }
  | {
      readonly kind: "linkFailed";
      readonly name: string;
      readonly link: boolean;
      readonly code: TeamErrorCode;
      readonly message: string;
    }
  | { readonly kind: "released"; readonly name: string }
  | {
      readonly kind: "releaseFailed";
      readonly name: string;
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
            : outcome.linkRequested
              ? teamLabels.reactivatedWithLink(outcome.name)
              : teamLabels.reactivated(outcome.name),
        retry: false,
      };
    case "linkChanged":
      return {
        tone: "info",
        title: outcome.link
          ? teamLabels.linkRequested(outcome.name)
          : teamLabels.linkCancelled(outcome.name),
        retry: false,
      };
    case "released":
      return {
        tone: "info",
        title: teamLabels.emailReleased(outcome.name),
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
    case "linkFailed":
      return failedFeedback(
        outcome.link
          ? teamLabels.linkFailed(outcome.name)
          : teamLabels.cancelLinkFailed(outcome.name),
        outcome,
      );
    case "releaseFailed":
      return failedFeedback(teamLabels.releaseFailed(outcome.name), outcome);
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

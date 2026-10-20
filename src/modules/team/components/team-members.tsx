"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import {
  teamMessages,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type ChangeStatusInput,
  type MemberStatus,
  type ReleaseEmailInput,
  type SetAccountLinkInput,
  type TeamActions,
  type TeamFilter,
  type TeamMember,
} from "@/modules/team/schema";
import {
  invitationMessages,
  type InvitationActions,
  type InvitationsView,
  type PendingInvitation,
} from "@/modules/workspace/schema";

import { DeactivateDialog } from "./deactivate-dialog";
import { InvitationRow } from "./invitation-row";
import { InviteDialog } from "./invite-dialog";
import { teamLabels } from "./labels";
import { LinkAccountDialog } from "./link-account-dialog";
import { MemberActionsMenu } from "./member-actions-menu";
import { ReleaseEmailDialog } from "./release-email-dialog";
import { RevokeInvitationDialog } from "./revoke-invitation-dialog";
import { StatusFilter } from "./status-filter";
import {
  activate,
  chooseMenuEntry,
  confirmDeactivation,
  confirmLinkRequest,
  confirmRelease,
  emptyOf,
  feedbackOf,
  linkPendingOf,
  menuEntriesOf,
  revokeLeavesTable,
  rowActionsId,
  rowHeaderId,
  TEAM_HEADING_ID,
  visibleInvitations,
  visibleMembers,
  type LinkRequest,
  type MenuEntry,
  type TeamFeedback,
  type TeamOutcome,
} from "./team-members-model";

/** Las invitaciones que la pantalla muestra, con `member.invite` (D-E1a-1). */
export type TeamInvitations = Omit<Extract<InvitationsView, { kind: "ready" }>, "kind">;

/** Una invitación cuya fila sale de la tabla con la revalidación. */
type LeavingInvitation = { readonly invitationId: string };

/**
 * El último éxito sobre una fila —de estado, de la vinculación o del correo—,
 * con lo que la fila revalidada tiene que traer para llevarle el foco (§5.4).
 */
type RowSettle = {
  readonly membershipId: string;
  readonly reached: (row: TeamMember) => boolean;
};

type TeamMembersProps = {
  /** El título de la pantalla, que nombra la tabla; «Invitar» va a su derecha. */
  readonly heading: ReactNode;
  /** Las membresías activas e inactivas, ya en el orden de `compareNames`. */
  readonly members: readonly TeamMember[];
  /** `null` sin `member.invite`: sin «Invitar» ni filas de invitadas. */
  readonly invitations: TeamInvitations | null;
  /** El de `?estado=`; cuando cambia, la tabla olvida las filas que se quedaban y el aviso (§5.2). */
  readonly filter: TeamFilter;
  /** `linkTtlDays` de la vista, para los textos de la confirmación de vincular (§5.4 de E2b). */
  readonly linkTtlDays: number;
  /** Las notas de `rowNotesOf`, ya con las fechas de quien mira (§5.2 de E2b). */
  readonly notes: Readonly<Record<string, string>>;
  readonly actions: TeamActions & InvitationActions;
};

/**
 * La tabla con su único pedido en curso —un cambio de rol, uno de estado, uno
 * de la vinculación, una liberación o una revocación— y el aviso del último
 * desenlace, el filtro de estado y los diálogos de desactivar, de vincular, de
 * liberar el correo y de las invitaciones. Sin vista optimista: la fila cambia
 * cuando el servidor responde y revalida.
 */
export function TeamMembers({
  heading,
  members,
  invitations,
  filter,
  linkTtlDays,
  notes,
  actions,
}: TeamMembersProps) {
  const [outcome, setOutcome] = useState<TeamOutcome | null>(null);
  /** El último éxito, para llevar el foco cuando la fila revalidada trae su rol (§5.4). */
  const [lastChange, setLastChange] = useState<ChangeRoleResult | null>(null);
  /** El éxito cuyo foco ya se resolvió: cada respuesta es un objeto nuevo. */
  const settledChange = useRef<ChangeRoleResult | null>(null);
  /** Lo mismo con el último éxito de estado, de la vinculación o del correo (§5.4). */
  const [lastRow, setLastRow] = useState<RowSettle | null>(null);
  const settledRow = useRef<RowSettle | null>(null);
  /**
   * EQ-11: las membresías que la pantalla cambió con este filtro, que se
   * muestran aunque el filtro ya no las incluya. Se guardan al mandar: la
   * revalidación puede llegar antes que la respuesta y esconder la fila un
   * instante. Lo que se dibuja de ellas es siempre lo del servidor.
   */
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * La invitación del último pedido cuya fila sale con la revalidación —por
   * éxito, `not_pending` o `not_found`—, para llevar el foco al título.
   */
  const [leaving, setLeaving] = useState<LeavingInvitation | null>(null);
  /** La salida cuyo foco ya se resolvió: cada desenlace es un objeto nuevo. */
  const settledLeaving = useRef<LeavingInvitation | null>(null);
  /** El nombre o el correo de la fila del último pedido: la fila puede irse con la revalidación. */
  const target = useRef("");
  /** El id de la invitación del último pedido de revocar. */
  const revokeTarget = useRef("");
  /** El estado del último pedido de `changeStatus`, para el título de su falla. */
  const statusTarget = useRef<MemberStatus>("inactive");
  /** Si el último pedido de `changeStatus` reactiva a quien no tiene cuenta (D-E2b-5). */
  const statusLinks = useRef(false);
  /** Lo pedido en el último `setAccountLink`, para el título de su falla. */
  const linkTarget = useRef(true);
  const [deactivating, setDeactivating] = useState<TeamMember | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [linking, setLinking] = useState<LinkRequest | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [releasing, setReleasing] = useState<TeamMember | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [confirming, setConfirming] = useState<PendingInvitation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  /** Cada apertura monta un diálogo nuevo, vacío y en el paso de carga. */
  const [inviteKey, setInviteKey] = useState(0);
  const headerInvite = useRef<HTMLButtonElement>(null);
  const inviteOpener = useRef<HTMLElement | null>(null);
  /** El filtro con que se guardaron `kept` y el último desenlace. */
  const [seenFilter, setSeenFilter] = useState(filter);

  // §5.2: otro filtro olvida las filas que se quedaban (EQ-11) y el último
  // aviso. Se ajusta durante el dibujo y no con una `key`: volver a montar la
  // pantalla se lleva el selector, y el foco del teclado caería a `body`.
  if (seenFilter !== filter) {
    setSeenFilter(filter);
    setKept(new Set());
    resetOutcome();
  }

  const change = useAction(actions.changeRole, {
    unreachableMessage: teamMessages.unexpected,
    onSuccess: (data) => {
      setOutcome({ kind: "changed", name: target.current, role: data.role });
      setLastChange(data);
    },
    onFailure: (failure) =>
      setOutcome({
        kind: "failed",
        name: target.current,
        code: failure.code,
        message: failure.message,
      }),
  });

  const status = useAction(actions.changeStatus, {
    unreachableMessage: teamMessages.unexpectedStatus,
    onSuccess: (data) => {
      setOutcome({
        kind: "statusChanged",
        name: target.current,
        status: data.status,
        linkRequested: statusLinks.current,
      });
      setLastRow({
        membershipId: data.membershipId,
        reached: (row) => row.status === data.status,
      });
    },
    onFailure: (failure) =>
      setOutcome({
        kind: "statusFailed",
        name: target.current,
        status: statusTarget.current,
        code: failure.code,
        message: failure.message,
      }),
  });

  const link = useAction(actions.setAccountLink, {
    unreachableMessage: teamMessages.unexpectedLink,
    onSuccess: (data, input) => {
      setOutcome({ kind: "linkChanged", name: target.current, link: input.link });
      setLastRow({
        membershipId: data.membershipId,
        reached: (row) => linkPendingOf(row) === data.linkPending,
      });
    },
    onFailure: (failure) =>
      setOutcome({
        kind: "linkFailed",
        name: target.current,
        link: linkTarget.current,
        code: failure.code,
        message: failure.message,
      }),
  });

  const release = useAction(actions.releaseEmail, {
    unreachableMessage: teamMessages.unexpectedRelease,
    onSuccess: (data) => {
      setOutcome({ kind: "released", name: target.current });
      setLastRow({
        membershipId: data.membershipId,
        reached: (row) => row.email === null,
      });
    },
    onFailure: (failure) =>
      setOutcome({
        kind: "releaseFailed",
        name: target.current,
        code: failure.code,
        message: failure.message,
      }),
  });

  function settleRevoke(next: TeamOutcome, invitationId: string): void {
    setOutcome(next);
    if (revokeLeavesTable(next)) {
      setLeaving({ invitationId });
    }
  }

  const revoke = useAction(actions.revokeInvitation, {
    unreachableMessage: invitationMessages.unexpectedRevoke,
    onSuccess: (data) =>
      settleRevoke({ kind: "revoked", email: target.current }, data.invitationId),
    onFailure: (failure) =>
      settleRevoke(
        {
          kind: "revokeFailed",
          email: target.current,
          code: failure.code,
          message: failure.message,
        },
        revokeTarget.current,
      ),
  });

  /** §5.4: un pedido a la vez en la tabla, de cualquiera de las cinco clases. */
  const pending =
    change.pending || status.pending || link.pending || release.pending || revoke.pending;
  const pendingInvitations = invitations?.invitations ?? [];
  const shownMembers = visibleMembers(members, filter, kept);
  const shownInvitations = visibleInvitations(pendingInvitations, filter);
  const empty = emptyOf(
    filter,
    { members: shownMembers.length, invitations: shownInvitations.length },
    {
      members: members.length,
      invitations: pendingInvitations.length,
      canInvite: invitations !== null,
    },
  );

  // La respuesta y la revalidación llegan en transiciones distintas, en
  // cualquier orden: se espera a que la fila traiga el rol del éxito. Si se
  // quedó sin botón (un admin que asciende), el foco pasa a su encabezado y no
  // cae a `body`; si lo conserva, el botón ya tiene el foco.
  useEffect(() => {
    if (lastChange === null || settledChange.current === lastChange) {
      return;
    }
    const row = members.find((member) => member.membershipId === lastChange.membershipId);
    if (row?.role !== lastChange.role) {
      return;
    }
    settledChange.current = lastChange;
    if (row.change === null) {
      document.getElementById(rowHeaderId(row.membershipId))?.focus();
    }
  }, [lastChange, members]);

  // Lo mismo con un cambio de estado, de la vinculación o del correo: cuando
  // la fila trae lo del resultado, el foco va a su menú si lo tiene —adonde ya
  // lo dejó la confirmación o el menú al cerrarse— y si no, a su encabezado.
  useEffect(() => {
    if (lastRow === null || settledRow.current === lastRow) {
      return;
    }
    const row = members.find((member) => member.membershipId === lastRow.membershipId);
    if (row === undefined || !lastRow.reached(row)) {
      return;
    }
    settledRow.current = lastRow;
    document
      .getElementById(
        menuEntriesOf(row).length === 0
          ? rowHeaderId(row.membershipId)
          : rowActionsId(row.membershipId),
      )
      ?.focus();
  }, [lastRow, members]);

  // Lo mismo con la revocación: cuando la revalidación saca la fila, con el
  // botón que tenía el foco, el foco va al título que nombra la tabla.
  useEffect(() => {
    if (leaving === null || settledLeaving.current === leaving) {
      return;
    }
    const listed = invitations?.invitations.some(
      (invitation) => invitation.id === leaving.invitationId,
    );
    if (listed === true) {
      return;
    }
    settledLeaving.current = leaving;
    document.getElementById(TEAM_HEADING_ID)?.focus();
  }, [leaving, invitations]);

  function resetOutcome(): void {
    setOutcome(null);
    setLastChange(null);
    setLastRow(null);
    setLeaving(null);
  }

  /** El nombre de la fila del pedido, que puede irse con la revalidación. */
  function nameOf(membershipId: string): string {
    return members.find((member) => member.membershipId === membershipId)?.name ?? "";
  }

  function sendChange(input: ChangeRoleInput): void {
    target.current = nameOf(input.membershipId);
    resetOutcome();
    change.run(input);
  }

  function sendStatus(input: ChangeStatusInput): void {
    const row = members.find((member) => member.membershipId === input.membershipId);
    target.current = row?.name ?? "";
    statusTarget.current = input.status;
    statusLinks.current = input.status === "active" && row?.hasAccount === false;
    setKept((current) => new Set(current).add(input.membershipId));
    resetOutcome();
    status.run(input);
  }

  function sendLink(input: SetAccountLinkInput): void {
    target.current = nameOf(input.membershipId);
    linkTarget.current = input.link;
    setKept((current) => new Set(current).add(input.membershipId));
    resetOutcome();
    link.run(input);
  }

  function sendRelease(input: ReleaseEmailInput): void {
    target.current = nameOf(input.membershipId);
    setKept((current) => new Set(current).add(input.membershipId));
    resetOutcome();
    release.run(input);
  }

  function requestDeactivate(member: TeamMember): void {
    setDeactivating(member);
    setDeactivateOpen(true);
  }

  function requestLink(request: LinkRequest): void {
    setLinking(request);
    setLinkOpen(true);
  }

  function requestRelease(member: TeamMember): void {
    setReleasing(member);
    setReleaseOpen(true);
  }

  function requestRevoke(invitation: PendingInvitation): void {
    if (pending) {
      return;
    }
    setConfirming(invitation);
    setConfirmOpen(true);
  }

  function confirmRevoke(): void {
    if (confirming === null || pending) {
      return;
    }
    target.current = confirming.email;
    revokeTarget.current = confirming.id;
    resetOutcome();
    revoke.run({ invitationId: confirming.id });
  }

  function openInvite(opener: HTMLElement): void {
    inviteOpener.current = opener;
    setInviteKey((key) => key + 1);
    setInviteOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {heading}
        {invitations !== null && (
          <Button
            ref={headerInvite}
            type="button"
            size="sm"
            onClick={(event) => openInvite(event.currentTarget)}
          >
            {teamLabels.invite}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{teamLabels.intro}</p>
      <StatusFilter filter={filter} />
      <TeamMembersView
        members={shownMembers}
        invitations={shownInvitations}
        notes={notes}
        pending={pending}
        feedback={feedbackOf(outcome)}
        empty={
          empty === "inactive"
            ? teamLabels.emptyInactive
            : empty === "invited"
              ? teamLabels.emptyInvited
              : null
        }
        onActivate={(member) => activate(member, pending, sendChange)}
        onChooseEntry={(member, entry) =>
          chooseMenuEntry(member, entry, pending, {
            confirmDeactivate: requestDeactivate,
            confirmLink: requestLink,
            confirmRelease: requestRelease,
            sendStatus,
            sendLink,
          })
        }
        onRevoke={requestRevoke}
        onRetry={() => {
          // El aviso se va mientras viaja, como el de `useAction`: sin él no hay
          // un segundo «Reintentar» con el pedido en curso.
          setOutcome(null);
          switch (outcome?.kind) {
            case "revokeFailed":
              revoke.retry();
              return;
            case "statusFailed":
              status.retry();
              return;
            case "linkFailed":
              link.retry();
              return;
            case "releaseFailed":
              release.retry();
              return;
            default:
              change.retry();
          }
        }}
      />
      {empty === "invitations" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground text-sm">{teamLabels.emptyInvitations}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(event) => openInvite(event.currentTarget)}
          >
            {teamLabels.invite}
          </Button>
        </div>
      )}
      {invitations !== null && (
        <InviteDialog
          key={inviteKey}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          // El «Invitar» del vacío se va con la primera invitada: el foco vuelve
          // entonces al de la cabecera.
          finalFocus={() =>
            inviteOpener.current?.isConnected === true
              ? inviteOpener.current
              : headerInvite.current
          }
          appUrl={invitations.appUrl}
          inviteMembers={actions.inviteMembers}
        />
      )}
      <DeactivateDialog
        member={deactivating}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        onConfirm={() => confirmDeactivation(deactivating, pending, sendStatus)}
      />
      <LinkAccountDialog
        request={linking}
        ttlDays={linkTtlDays}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onConfirm={() => confirmLinkRequest(linking, pending, { sendStatus, sendLink })}
      />
      <ReleaseEmailDialog
        member={releasing}
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        onConfirm={() => confirmRelease(releasing, pending, sendRelease)}
      />
      <RevokeInvitationDialog
        invitation={confirming}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmRevoke}
      />
    </>
  );
}

type TeamMembersViewProps = {
  /** Las que muestra el filtro (`visibleMembers`). */
  readonly members: readonly TeamMember[];
  /** Las invitaciones pendientes, al final y en el orden del correo (D-E1a-12). */
  readonly invitations: readonly PendingInvitation[];
  /** La nota debajo del correo de cada fila que tiene una (`rowNotesOf`). */
  readonly notes: Readonly<Record<string, string>>;
  readonly pending: boolean;
  /** Lo de `feedbackOf`; `null` sin aviso. */
  readonly feedback: TeamFeedback | null;
  /** EQ-94: el texto que va en lugar de la tabla; `null` con la tabla. */
  readonly empty: string | null;
  /** El clic en el botón de una fila. */
  readonly onActivate: (member: TeamMember) => void;
  /** Elegir una entrada del menú de una fila. */
  readonly onChooseEntry: (member: TeamMember, entry: MenuEntry) => void;
  /** El clic en «Revocar invitación»: abre la confirmación. */
  readonly onRevoke: (invitation: PendingInvitation) => void;
  /** Reenvía el último pedido; se ofrece solo si `feedback.retry`. */
  readonly onRetry: () => void;
};

/**
 * La tabla sin estado. El aviso vive encima de la tabla y no en la fila: una
 * fila puede irse con la revalidación (`not_found`, `inactive_membership`) y
 * llevarse su aviso; y sigue cuando el vacío reemplaza a la tabla.
 */
export function TeamMembersView({
  members,
  invitations,
  notes,
  pending,
  feedback,
  empty,
  onActivate,
  onChooseEntry,
  onRevoke,
  onRetry,
}: TeamMembersViewProps) {
  return (
    <div className="flex flex-col gap-4">
      {feedback !== null && (
        <ActionFeedback
          tone={feedback.tone}
          title={feedback.title}
          message={feedback.message}
          onRetry={feedback.retry ? onRetry : undefined}
        />
      )}
      {empty !== null ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table aria-labelledby={TEAM_HEADING_ID} className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {teamLabels.personColumn}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {teamLabels.roleColumn}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {teamLabels.actionsColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <TeamMemberRow
                  key={member.membershipId}
                  member={member}
                  note={notes[member.membershipId] ?? null}
                  pending={pending}
                  onActivate={onActivate}
                  onChooseEntry={onChooseEntry}
                />
              ))}
              {invitations.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  pending={pending}
                  onRevoke={onRevoke}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type TeamMemberRowProps = {
  readonly member: TeamMember;
  readonly note: string | null;
  readonly pending: boolean;
  readonly onActivate: (member: TeamMember) => void;
  readonly onChooseEntry: (member: TeamMember, entry: MenuEntry) => void;
};

function TeamMemberRow({
  member,
  note,
  pending,
  onActivate,
  onChooseEntry,
}: TeamMemberRowProps) {
  const inactive = member.status === "inactive";
  const entries = menuEntriesOf(member);

  return (
    <tr className="border-b last:border-b-0">
      {/* Con `tabIndex={-1}`: recibe el foco cuando el éxito le saca el control (§5.4). */}
      <th
        scope="row"
        id={rowHeaderId(member.membershipId)}
        tabIndex={-1}
        className="focus-visible:ring-ring/50 px-3 py-2 text-left font-normal outline-none focus-visible:ring-3"
      >
        <span className="flex flex-col">
          <span className="font-medium">
            {/* EQ-05, como RP-62: el tachado y, aparte y sin tachar, la marca en texto. */}
            {inactive ? <span className="line-through">{member.name}</span> : member.name}
            {member.isSelf && (
              <span className="text-muted-foreground font-normal">
                {" "}
                {teamLabels.self}
              </span>
            )}
            {inactive && (
              <span className="text-muted-foreground font-normal">
                {" "}
                {teamLabels.inactiveMark}
              </span>
            )}
          </span>
          {/* RP-31: dos personas pueden llamarse igual. D-E2b-9: sin él, «Correo liberado». */}
          <span className="text-muted-foreground">
            {member.email ?? teamLabels.releasedEmail}
          </span>
          {note !== null && <span className="text-muted-foreground">{note}</span>}
        </span>
      </th>
      {/* EQ-37: una inactiva conserva su rol, sin botón (`change` en `null`). */}
      <td className="px-3 py-2">{teamLabels.roles[member.role]}</td>
      <td className="px-3 py-2">
        <span className="flex items-center justify-end gap-1">
          {member.change !== null && (
            <ChangeButton member={member} pending={pending} onActivate={onActivate} />
          )}
          {entries.length > 0 && (
            <MemberActionsMenu
              member={member}
              entries={entries}
              pending={pending}
              onChoose={onChooseEntry}
            />
          )}
        </span>
      </td>
    </tr>
  );
}

function ChangeButton({
  member,
  pending,
  onActivate,
}: Omit<TeamMemberRowProps, "note" | "onChooseEntry">) {
  const label = member.change === "promote" ? teamLabels.promote : teamLabels.demote;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={teamLabels.actionName(label, member.name)}
      // Con `aria-disabled` y no con `disabled`: el botón conserva el foco
      // mientras el pedido viaja. Que el clic no mande lo decide `activate`.
      aria-disabled={pending || undefined}
      onClick={() => onActivate(member)}
    >
      {label}
    </Button>
  );
}

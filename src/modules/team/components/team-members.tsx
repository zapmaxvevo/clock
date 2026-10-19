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
  type ChangeStatusResult,
  type MemberStatus,
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
import { MemberActionsMenu } from "./member-actions-menu";
import { RevokeInvitationDialog } from "./revoke-invitation-dialog";
import { StatusFilter } from "./status-filter";
import {
  activate,
  chooseStatusChange,
  confirmDeactivation,
  emptyOf,
  feedbackOf,
  revokeLeavesTable,
  rowActionsId,
  rowHeaderId,
  TEAM_HEADING_ID,
  visibleInvitations,
  visibleMembers,
  type TeamFeedback,
  type TeamOutcome,
} from "./team-members-model";

/** Las invitaciones que la pantalla muestra, con `member.invite` (D-E1a-1). */
export type TeamInvitations = Omit<Extract<InvitationsView, { kind: "ready" }>, "kind">;

/** Una invitación cuya fila sale de la tabla con la revalidación. */
type LeavingInvitation = { readonly invitationId: string };

type TeamMembersProps = {
  /** El título de la pantalla, que nombra la tabla; «Invitar» va a su derecha. */
  readonly heading: ReactNode;
  /** Las membresías activas e inactivas, ya en el orden de `compareNames`. */
  readonly members: readonly TeamMember[];
  /** `null` sin `member.invite`: sin «Invitar» ni filas de invitadas. */
  readonly invitations: TeamInvitations | null;
  /** El de `?estado=`; la página monta la pantalla de nuevo cuando cambia (§5.2). */
  readonly filter: TeamFilter;
  readonly actions: TeamActions & InvitationActions;
};

/**
 * La tabla con su único pedido en curso —un cambio de rol, uno de estado o una
 * revocación— y el aviso del último desenlace, el filtro de estado y los
 * diálogos de desactivar y de las invitaciones. Sin vista optimista: la fila
 * cambia cuando el servidor responde y revalida.
 */
export function TeamMembers({
  heading,
  members,
  invitations,
  filter,
  actions,
}: TeamMembersProps) {
  const [outcome, setOutcome] = useState<TeamOutcome | null>(null);
  /** El último éxito, para llevar el foco cuando la fila revalidada trae su rol (§5.4). */
  const [lastChange, setLastChange] = useState<ChangeRoleResult | null>(null);
  /** El éxito cuyo foco ya se resolvió: cada respuesta es un objeto nuevo. */
  const settledChange = useRef<ChangeRoleResult | null>(null);
  /** Lo mismo con el último cambio de estado (§5.4). */
  const [lastStatus, setLastStatus] = useState<ChangeStatusResult | null>(null);
  const settledStatus = useRef<ChangeStatusResult | null>(null);
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
  const [deactivating, setDeactivating] = useState<TeamMember | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [confirming, setConfirming] = useState<PendingInvitation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  /** Cada apertura monta un diálogo nuevo, vacío y en el paso de carga. */
  const [inviteKey, setInviteKey] = useState(0);
  const headerInvite = useRef<HTMLButtonElement>(null);
  const inviteOpener = useRef<HTMLElement | null>(null);

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
      setOutcome({ kind: "statusChanged", name: target.current, status: data.status });
      setLastStatus(data);
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

  /** §5.4: un pedido a la vez en la tabla, de cualquiera de las tres clases. */
  const pending = change.pending || status.pending || revoke.pending;
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

  // Lo mismo con un cambio de estado: cuando la fila trae el estado del
  // resultado, el foco va a su menú si lo tiene —adonde ya lo dejó la
  // confirmación o el menú al cerrarse— y si no, a su encabezado.
  useEffect(() => {
    if (lastStatus === null || settledStatus.current === lastStatus) {
      return;
    }
    const row = members.find((member) => member.membershipId === lastStatus.membershipId);
    if (row?.status !== lastStatus.status) {
      return;
    }
    settledStatus.current = lastStatus;
    document
      .getElementById(
        row.statusChange === null
          ? rowHeaderId(row.membershipId)
          : rowActionsId(row.membershipId),
      )
      ?.focus();
  }, [lastStatus, members]);

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
    setLastStatus(null);
    setLeaving(null);
  }

  function sendChange(input: ChangeRoleInput): void {
    target.current =
      members.find((member) => member.membershipId === input.membershipId)?.name ?? "";
    resetOutcome();
    change.run(input);
  }

  function sendStatus(input: ChangeStatusInput): void {
    target.current =
      members.find((member) => member.membershipId === input.membershipId)?.name ?? "";
    statusTarget.current = input.status;
    setKept((current) => new Set(current).add(input.membershipId));
    resetOutcome();
    status.run(input);
  }

  function requestDeactivate(member: TeamMember): void {
    setDeactivating(member);
    setDeactivateOpen(true);
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
        onChooseStatus={(member) =>
          chooseStatusChange(member, pending, {
            confirm: requestDeactivate,
            send: sendStatus,
          })
        }
        onRevoke={requestRevoke}
        onRetry={() => {
          // El aviso se va mientras viaja, como el de `useAction`: sin él no hay
          // un segundo «Reintentar» con el pedido en curso.
          setOutcome(null);
          if (outcome?.kind === "revokeFailed") {
            revoke.retry();
          } else if (outcome?.kind === "statusFailed") {
            status.retry();
          } else {
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
  readonly pending: boolean;
  /** Lo de `feedbackOf`; `null` sin aviso. */
  readonly feedback: TeamFeedback | null;
  /** EQ-94: el texto que va en lugar de la tabla; `null` con la tabla. */
  readonly empty: string | null;
  /** El clic en el botón de una fila. */
  readonly onActivate: (member: TeamMember) => void;
  /** Elegir la entrada del menú de una fila. */
  readonly onChooseStatus: (member: TeamMember) => void;
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
  pending,
  feedback,
  empty,
  onActivate,
  onChooseStatus,
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
                  pending={pending}
                  onActivate={onActivate}
                  onChooseStatus={onChooseStatus}
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
  readonly pending: boolean;
  readonly onActivate: (member: TeamMember) => void;
  readonly onChooseStatus: (member: TeamMember) => void;
};

function TeamMemberRow({
  member,
  pending,
  onActivate,
  onChooseStatus,
}: TeamMemberRowProps) {
  const inactive = member.status === "inactive";

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
          {/* RP-31: dos personas pueden llamarse igual. */}
          <span className="text-muted-foreground">{member.email}</span>
          {inactive && !member.hasAccount && (
            <span className="text-muted-foreground">{teamLabels.noAccount}</span>
          )}
        </span>
      </th>
      {/* EQ-37: una inactiva conserva su rol, sin botón (`change` en `null`). */}
      <td className="px-3 py-2">{teamLabels.roles[member.role]}</td>
      <td className="px-3 py-2">
        <span className="flex items-center justify-end gap-1">
          {member.change !== null && (
            <ChangeButton member={member} pending={pending} onActivate={onActivate} />
          )}
          {member.statusChange !== null && (
            <MemberActionsMenu
              member={member}
              action={member.statusChange}
              pending={pending}
              onChoose={onChooseStatus}
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
}: Omit<TeamMemberRowProps, "onChooseStatus">) {
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

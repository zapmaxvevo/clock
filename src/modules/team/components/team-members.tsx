"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import {
  teamMessages,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type TeamActions,
  type TeamMember,
} from "@/modules/team/schema";
import {
  invitationMessages,
  type InvitationActions,
  type PendingInvitation,
  type RevokeInvitationResult,
} from "@/modules/workspace/schema";

import { InvitationRow } from "./invitation-row";
import { InviteDialog } from "./invite-dialog";
import { teamLabels } from "./labels";
import { RevokeInvitationDialog } from "./revoke-invitation-dialog";
import {
  activate,
  feedbackOf,
  TEAM_HEADING_ID,
  type TeamFeedback,
  type TeamOutcome,
} from "./team-members-model";

/** El encabezado de una fila, adonde va el foco si el éxito le saca el botón (§5.4). */
function rowHeaderId(membershipId: string): string {
  return `persona-${membershipId}`;
}

/** Las invitaciones que la pantalla muestra, con `member.invite` (D-E1a-1). */
export type TeamInvitations = {
  /** En el orden del correo (D-E1a-12). */
  readonly invitations: readonly PendingInvitation[];
  /** `BETTER_AUTH_URL`, para el aviso (D-E1a-10). */
  readonly appUrl: string;
};

type TeamMembersProps = {
  /** El título de la pantalla, que nombra la tabla; «Invitar» va a su derecha. */
  readonly heading: ReactNode;
  /** Las membresías activas, ya en el orden de `compareNames`. */
  readonly members: readonly TeamMember[];
  /** `null` sin `member.invite`: sin «Invitar» ni filas de invitadas. */
  readonly invitations: TeamInvitations | null;
  readonly actions: TeamActions & InvitationActions;
};

/**
 * La tabla con su único pedido en curso —un cambio de rol o una revocación— y
 * el aviso del último desenlace, más los dos diálogos de las invitaciones. Sin
 * vista optimista: la fila cambia cuando el servidor responde y revalida.
 */
export function TeamMembers({
  heading,
  members,
  invitations,
  actions,
}: TeamMembersProps) {
  const [outcome, setOutcome] = useState<TeamOutcome | null>(null);
  /** El último éxito, para llevar el foco cuando la fila revalidada trae su rol (§5.4). */
  const [lastChange, setLastChange] = useState<ChangeRoleResult | null>(null);
  /** El éxito cuyo foco ya se resolvió: cada respuesta es un objeto nuevo. */
  const settledChange = useRef<ChangeRoleResult | null>(null);
  /** La última revocación, para llevar el foco al título cuando su fila sale. */
  const [lastRevoke, setLastRevoke] = useState<RevokeInvitationResult | null>(null);
  const settledRevoke = useRef<RevokeInvitationResult | null>(null);
  /** El nombre o el correo de la fila del último pedido: la fila puede irse con la revalidación. */
  const target = useRef("");
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

  const revoke = useAction(actions.revokeInvitation, {
    unreachableMessage: invitationMessages.unexpectedRevoke,
    onSuccess: (data) => {
      setOutcome({ kind: "revoked", email: target.current });
      setLastRevoke(data);
    },
    onFailure: (failure) =>
      setOutcome({
        kind: "revokeFailed",
        email: target.current,
        code: failure.code,
        message: failure.message,
      }),
  });

  /** §5.4: un pedido a la vez en la tabla, de cualquiera de las dos clases. */
  const pending = change.pending || revoke.pending;
  const pendingInvitations = invitations?.invitations ?? [];

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

  // Lo mismo con la revocación: cuando la revalidación saca la fila, con el
  // botón que tenía el foco, el foco va al título que nombra la tabla.
  useEffect(() => {
    if (lastRevoke === null || settledRevoke.current === lastRevoke) {
      return;
    }
    const listed = invitations?.invitations.some(
      (invitation) => invitation.id === lastRevoke.invitationId,
    );
    if (listed === true) {
      return;
    }
    settledRevoke.current = lastRevoke;
    document.getElementById(TEAM_HEADING_ID)?.focus();
  }, [lastRevoke, invitations]);

  function resetOutcome(): void {
    setOutcome(null);
    setLastChange(null);
    setLastRevoke(null);
  }

  function sendChange(input: ChangeRoleInput): void {
    target.current =
      members.find((member) => member.membershipId === input.membershipId)?.name ?? "";
    resetOutcome();
    change.run(input);
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
    resetOutcome();
    revoke.run({ invitationId: confirming.id });
  }

  function openInvite(opener: HTMLElement): void {
    inviteOpener.current = opener;
    setInviteKey((key) => key + 1);
    setInviteOpen(true);
  }

  // EQ-93: quien mira está solo y no invitó a nadie todavía.
  const empty =
    invitations !== null && members.length === 1 && pendingInvitations.length === 0;

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
      <TeamMembersView
        members={members}
        invitations={pendingInvitations}
        pending={pending}
        feedback={feedbackOf(outcome)}
        onActivate={(member) => activate(member, pending, sendChange)}
        onRevoke={requestRevoke}
        onRetry={() => {
          // El aviso se va mientras viaja, como el de `useAction`: sin él no hay
          // un segundo «Reintentar» con el pedido en curso.
          setOutcome(null);
          if (outcome?.kind === "revokeFailed") {
            revoke.retry();
          } else {
            change.retry();
          }
        }}
      />
      {empty && (
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
  readonly members: readonly TeamMember[];
  /** Las invitaciones pendientes, al final y en el orden del correo (D-E1a-12). */
  readonly invitations: readonly PendingInvitation[];
  readonly pending: boolean;
  /** Lo de `feedbackOf`; `null` sin aviso. */
  readonly feedback: TeamFeedback | null;
  /** El clic en el botón de una fila. */
  readonly onActivate: (member: TeamMember) => void;
  /** El clic en «Revocar invitación»: abre la confirmación. */
  readonly onRevoke: (invitation: PendingInvitation) => void;
  /** Reenvía el último pedido; se ofrece solo si `feedback.retry`. */
  readonly onRetry: () => void;
};

/**
 * La tabla sin estado. El aviso vive encima de la tabla y no en la fila: una
 * fila puede irse con la revalidación (`not_found`, `inactive_membership`) y
 * llevarse su aviso.
 */
export function TeamMembersView({
  members,
  invitations,
  pending,
  feedback,
  onActivate,
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
    </div>
  );
}

type TeamMemberRowProps = {
  readonly member: TeamMember;
  readonly pending: boolean;
  readonly onActivate: (member: TeamMember) => void;
};

function TeamMemberRow({ member, pending, onActivate }: TeamMemberRowProps) {
  return (
    <tr className="border-b last:border-b-0">
      {/* Con `tabIndex={-1}`: recibe el foco cuando el éxito le saca el botón (§5.4). */}
      <th
        scope="row"
        id={rowHeaderId(member.membershipId)}
        tabIndex={-1}
        className="focus-visible:ring-ring/50 px-3 py-2 text-left font-normal outline-none focus-visible:ring-3"
      >
        <span className="flex flex-col">
          <span className="font-medium">
            {member.name}
            {member.isSelf && (
              <span className="text-muted-foreground font-normal">
                {" "}
                {teamLabels.self}
              </span>
            )}
          </span>
          {/* RP-31: dos personas pueden llamarse igual. */}
          <span className="text-muted-foreground">{member.email}</span>
        </span>
      </th>
      <td className="px-3 py-2">{teamLabels.roles[member.role]}</td>
      <td className="px-3 py-2 text-right">
        {member.change !== null && (
          <ChangeButton member={member} pending={pending} onActivate={onActivate} />
        )}
      </td>
    </tr>
  );
}

function ChangeButton({ member, pending, onActivate }: TeamMemberRowProps) {
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

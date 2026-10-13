"use client";

import { useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import {
  teamMessages,
  type ChangeRoleInput,
  type TeamActions,
  type TeamMember,
} from "@/modules/team/schema";

import { teamLabels } from "./labels";
import { SelfDemotionDialog } from "./self-demotion-dialog";
import {
  activate,
  confirmSelfDemotion,
  feedbackOf,
  TEAM_HEADING_ID,
  type TeamFeedback,
  type TeamOutcome,
} from "./team-members-model";

/** El botón de una fila, adonde vuelve el foco al cerrar la confirmación (§5.5). */
function changeButtonId(membershipId: string): string {
  return `cambiar-rol-${membershipId}`;
}

type TeamMembersProps = {
  /** Las membresías activas, ya en el orden de `compareNames`. */
  readonly members: readonly TeamMember[];
  readonly changeRole: TeamActions["changeRole"];
};

/**
 * La tabla con su único pedido en curso, el aviso del último desenlace y la
 * confirmación de bajarse a sí mismo (D-R8-5). Sin vista optimista: el botón
 * dice el rol que hay hasta que el servidor responde, y la revalidación trae
 * el nuevo.
 */
export function TeamMembers({ members, changeRole }: TeamMembersProps) {
  const [outcome, setOutcome] = useState<TeamOutcome | null>(null);
  const [confirming, setConfirming] = useState<TeamMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** El nombre de la fila del último pedido: la fila puede irse con la revalidación. */
  const targetName = useRef("");

  const { pending, run, retry } = useAction(changeRole, {
    unreachableMessage: teamMessages.unexpected,
    onSuccess: (data) =>
      setOutcome({ kind: "changed", name: targetName.current, role: data.role }),
    onFailure: (failure) =>
      setOutcome({
        kind: "failed",
        name: targetName.current,
        code: failure.code,
        message: failure.message,
      }),
  });

  function send(input: ChangeRoleInput): void {
    targetName.current =
      members.find((member) => member.membershipId === input.membershipId)?.name ?? "";
    setOutcome(null);
    run(input);
  }

  function confirm(member: TeamMember): void {
    setConfirming(member);
    setDialogOpen(true);
  }

  return (
    <>
      <TeamMembersView
        members={members}
        pending={pending}
        feedback={feedbackOf(outcome)}
        onActivate={(member) => activate(member, pending, { send, confirm })}
        onRetry={() => {
          // El aviso se va mientras viaja, como el de `useAction`: sin él no hay
          // un segundo «Reintentar» con el pedido en curso.
          setOutcome(null);
          retry();
        }}
      />
      <SelfDemotionDialog
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => {
          setDialogOpen(false);
          if (confirming !== null) {
            confirmSelfDemotion(confirming, pending, send);
          }
        }}
        returnFocus={() =>
          confirming === null
            ? null
            : document.getElementById(changeButtonId(confirming.membershipId))
        }
      />
    </>
  );
}

type TeamMembersViewProps = {
  readonly members: readonly TeamMember[];
  readonly pending: boolean;
  /** Lo de `feedbackOf`; `null` sin aviso. */
  readonly feedback: TeamFeedback | null;
  /** El clic en el botón de una fila. */
  readonly onActivate: (member: TeamMember) => void;
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
  pending,
  feedback,
  onActivate,
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
                {teamLabels.changeColumn}
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
      <th scope="row" className="px-3 py-2 text-left font-normal">
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
      id={changeButtonId(member.membershipId)}
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

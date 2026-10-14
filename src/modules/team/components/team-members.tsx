"use client";

import { useEffect, useRef, useState } from "react";

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

import { teamLabels } from "./labels";
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

type TeamMembersProps = {
  /** Las membresías activas, ya en el orden de `compareNames`. */
  readonly members: readonly TeamMember[];
  readonly changeRole: TeamActions["changeRole"];
};

/**
 * La tabla con su único pedido en curso y el aviso del último desenlace. Sin
 * vista optimista: el botón dice el rol que hay hasta que el servidor
 * responde, y la revalidación trae el nuevo.
 */
export function TeamMembers({ members, changeRole }: TeamMembersProps) {
  const [outcome, setOutcome] = useState<TeamOutcome | null>(null);
  /** El último éxito, para llevar el foco cuando la fila revalidada trae su rol (§5.4). */
  const [lastChange, setLastChange] = useState<ChangeRoleResult | null>(null);
  /** El éxito cuyo foco ya se resolvió: cada respuesta es un objeto nuevo. */
  const settledChange = useRef<ChangeRoleResult | null>(null);
  /** El nombre de la fila del último pedido: la fila puede irse con la revalidación. */
  const targetName = useRef("");

  const { pending, run, retry } = useAction(changeRole, {
    unreachableMessage: teamMessages.unexpected,
    onSuccess: (data) => {
      setOutcome({ kind: "changed", name: targetName.current, role: data.role });
      setLastChange(data);
    },
    onFailure: (failure) =>
      setOutcome({
        kind: "failed",
        name: targetName.current,
        code: failure.code,
        message: failure.message,
      }),
  });

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

  function send(input: ChangeRoleInput): void {
    targetName.current =
      members.find((member) => member.membershipId === input.membershipId)?.name ?? "";
    setOutcome(null);
    setLastChange(null);
    run(input);
  }

  return (
    <TeamMembersView
      members={members}
      pending={pending}
      feedback={feedbackOf(outcome)}
      onActivate={(member) => activate(member, pending, send)}
      onRetry={() => {
        // El aviso se va mientras viaja, como el de `useAction`: sin él no hay
        // un segundo «Reintentar» con el pedido en curso.
        setOutcome(null);
        retry();
      }}
    />
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

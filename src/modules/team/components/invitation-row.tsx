import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PendingInvitation } from "@/modules/workspace/schema";

import { teamLabels } from "./labels";

/** «Revocar invitación» de una fila, adonde vuelve el foco al cerrar la confirmación. */
export function revokeButtonId(invitationId: string): string {
  return `revocar-${invitationId}`;
}

type InvitationRowProps = {
  readonly invitation: PendingInvitation;
  /** Un pedido de la tabla en curso, de esta fila o de otra. */
  readonly pending: boolean;
  readonly onRevoke: (invitation: PendingInvitation) => void;
};

/**
 * Una invitación pendiente (§5.4): todavía sin nombre (EQ-04), así que la fila
 * la nombra el correo. Entra como `member` y su rol no se cambia (EQ-16).
 */
export function InvitationRow({ invitation, pending, onRevoke }: InvitationRowProps) {
  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <span className="flex flex-col gap-1">
          <span className="font-medium">{invitation.email}</span>
          <span className="flex gap-1">
            <Badge variant="outline">{teamLabels.invitedMark}</Badge>
            {invitation.external && (
              <Badge variant="secondary">{teamLabels.externalMark}</Badge>
            )}
          </span>
        </span>
      </th>
      <td className="px-3 py-2">{teamLabels.roles.member}</td>
      <td className="px-3 py-2 text-right">
        <Button
          id={revokeButtonId(invitation.id)}
          type="button"
          variant="outline"
          size="sm"
          aria-label={teamLabels.actionName(teamLabels.revoke, invitation.email)}
          // Como «Cambiar rol»: conserva el foco mientras el pedido viaja, y
          // `onRevoke` no abre la confirmación con un pedido en curso.
          aria-disabled={pending || undefined}
          onClick={() => onRevoke(invitation)}
        >
          {teamLabels.revoke}
        </Button>
      </td>
    </tr>
  );
}

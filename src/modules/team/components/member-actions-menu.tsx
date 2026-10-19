"use client";

import { EllipsisVerticalIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamMember } from "@/modules/team/schema";

import { teamLabels } from "./labels";
import { rowActionsId } from "./team-members-model";

type MemberActionsMenuProps = {
  readonly member: TeamMember;
  /** La entrada del menú; la fila sin `statusChange` no tiene menú (D-E2-9). */
  readonly action: "deactivate" | "reactivate";
  /** Un pedido de la tabla en curso, de esta fila o de otra. */
  readonly pending: boolean;
  /** Elegir la entrada; que no mande con un pedido en curso lo decide `chooseStatusChange`. */
  readonly onChoose: (member: TeamMember) => void;
};

/**
 * D-E2-9: el menú «Acciones de {nombre}», como el de una entrada del
 * rastreador. Con un pedido en curso no abre, pero el disparador no se
 * deshabilita: queda en `aria-disabled` y conserva el foco, que vuelve a él al
 * cerrar la confirmación de «Desactivar» (§5.4).
 */
export function MemberActionsMenu({
  member,
  action,
  pending,
  onChoose,
}: MemberActionsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={(next) => setOpen(next && !pending)}>
      <DropdownMenuTrigger
        id={rowActionsId(member.membershipId)}
        render={
          <Button variant="ghost" size="icon-sm" aria-disabled={pending || undefined} />
        }
        aria-label={teamLabels.rowActions(member.name)}
      >
        <EllipsisVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        {/* El menú puede quedar abierto si otro pedido de la tabla arranca. */}
        <DropdownMenuItem disabled={pending} onClick={() => onChoose(member)}>
          {action === "deactivate" ? teamLabels.deactivate : teamLabels.reactivate}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
import { rowActionsId, type MenuEntry } from "./team-members-model";

type MemberActionsMenuProps = {
  readonly member: TeamMember;
  /** Las entradas de `menuEntriesOf`; la fila sin ninguna no tiene menú (D-E2-9). */
  readonly entries: readonly MenuEntry[];
  /** Un pedido de la tabla en curso, de esta fila o de otra. */
  readonly pending: boolean;
  /** Elegir una entrada; que no mande con un pedido en curso lo decide `chooseMenuEntry`. */
  readonly onChoose: (member: TeamMember, entry: MenuEntry) => void;
};

/**
 * D-E2-9: el menú «Acciones de {nombre}», como el de una entrada del
 * rastreador. Con un pedido en curso no abre, pero el disparador no se
 * deshabilita: queda en `aria-disabled` y conserva el foco, que vuelve a él al
 * cerrar una confirmación (§5.4).
 */
export function MemberActionsMenu({
  member,
  entries,
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
        <MemberActionsMenuItems
          member={member}
          entries={entries}
          pending={pending}
          onChoose={onChoose}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Las entradas, en el orden recibido; aparte para dibujarlas sin el portal del menú. */
export function MemberActionsMenuItems({
  member,
  entries,
  pending,
  onChoose,
}: MemberActionsMenuProps) {
  return entries.map((entry) => (
    // El menú puede quedar abierto si otro pedido de la tabla arranca.
    <DropdownMenuItem
      key={entry}
      disabled={pending}
      onClick={() => onChoose(member, entry)}
    >
      {teamLabels[entry]}
    </DropdownMenuItem>
  ));
}

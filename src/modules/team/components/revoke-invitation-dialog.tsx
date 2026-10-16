"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { revokeButtonId } from "./invitation-row";
import { teamLabels } from "./labels";
import { TEAM_HEADING_ID } from "./team-members-model";

type RevokeInvitationDialogProps = {
  /** La invitación que se confirma; se conserva mientras el diálogo se cierra. */
  readonly invitation: { readonly id: string; readonly email: string } | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
};

/**
 * Adónde vuelve el foco al cerrar: «Revocar invitación» de la fila o, si la
 * revalidación ya la sacó —puede llegar antes de que el diálogo termine de
 * cerrarse—, el título, que es adonde la pantalla lo lleva cuando sale (§5.4).
 */
function returnFocusTarget(invitationId: string): HTMLElement | null {
  return (
    document.getElementById(revokeButtonId(invitationId)) ??
    document.getElementById(TEAM_HEADING_ID)
  );
}

/**
 * EQ-23: revocar se confirma. Al cerrar, el foco vuelve a «Revocar invitación»
 * de la fila, que queda en `aria-disabled` mientras el pedido viaja (§5.4).
 */
export function RevokeInvitationDialog({
  invitation,
  open,
  onOpenChange,
  onConfirm,
}: RevokeInvitationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={() => (invitation === null ? null : returnFocusTarget(invitation.id))}
      >
        <DialogHeader>
          <DialogTitle>{teamLabels.revokeTitle(invitation?.email ?? "")}</DialogTitle>
          <DialogDescription>{teamLabels.revokeBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {teamLabels.cancel}
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {teamLabels.revokeConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

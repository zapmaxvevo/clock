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

type RevokeInvitationDialogProps = {
  /** La invitación que se confirma; se conserva mientras el diálogo se cierra. */
  readonly invitation: { readonly id: string; readonly email: string } | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
};

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
        finalFocus={() =>
          invitation === null
            ? null
            : document.getElementById(revokeButtonId(invitation.id))
        }
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

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

import { teamLabels } from "./labels";
import { rowActionsId, rowHeaderId, TEAM_HEADING_ID } from "./team-members-model";

type DeactivateDialogProps = {
  /** La persona que se confirma; se conserva mientras el diálogo se cierra. */
  readonly member: { readonly membershipId: string; readonly name: string } | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
};

/**
 * Adónde vuelve el foco al cerrar: el menú de la fila; si la fila ya no lo
 * tiene, su encabezado, y si la fila ya no está, el título.
 */
function returnFocusTarget(membershipId: string): HTMLElement | null {
  return (
    document.getElementById(rowActionsId(membershipId)) ??
    document.getElementById(rowHeaderId(membershipId)) ??
    document.getElementById(TEAM_HEADING_ID)
  );
}

/**
 * EQ-46: desactivar se confirma, con la forma de la de revocar. Al cerrar, el
 * foco vuelve al menú de la fila, que queda en `aria-disabled` mientras el
 * pedido viaja (§5.4).
 */
export function DeactivateDialog({
  member,
  open,
  onOpenChange,
  onConfirm,
}: DeactivateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={() =>
          member === null ? null : returnFocusTarget(member.membershipId)
        }
      >
        <DeactivateConfirmation
          name={member?.name ?? ""}
          onConfirm={() => {
            onOpenChange(false);
            onConfirm();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** El cuerpo de la confirmación, aparte para dibujarlo sin el portal del diálogo. */
export function DeactivateConfirmation({
  name,
  onConfirm,
}: {
  readonly name: string;
  readonly onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{teamLabels.deactivateTitle(name)}</DialogTitle>
        <DialogDescription>{teamLabels.deactivateBody}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          {teamLabels.cancel}
        </DialogClose>
        <Button variant="destructive" onClick={onConfirm}>
          {teamLabels.deactivateConfirm}
        </Button>
      </DialogFooter>
    </>
  );
}

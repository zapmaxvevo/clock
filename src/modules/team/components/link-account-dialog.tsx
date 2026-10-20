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

import { returnFocusTarget } from "./deactivate-dialog";
import { teamLabels } from "./labels";
import {
  linkConfirmationOf,
  type LinkConfirmation,
  type LinkRequest,
} from "./team-members-model";

type LinkAccountDialogProps = {
  /** Lo que se confirma; se conserva mientras el diálogo se cierra. */
  readonly request: LinkRequest | null;
  /** `linkTtlDays` de la vista: el componente no importa `@/server/access`. */
  readonly ttlDays: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
};

/**
 * §5.4 de E2b: reactivar sin cuenta, y pedir o renovar la vinculación, se
 * confirman con la forma de la de desactivar. Al cerrar, el foco vuelve al
 * menú de la fila, que queda en `aria-disabled` mientras el pedido viaja.
 */
export function LinkAccountDialog({
  request,
  ttlDays,
  open,
  onOpenChange,
  onConfirm,
}: LinkAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={() =>
          request === null ? null : returnFocusTarget(request.member.membershipId)
        }
      >
        {request !== null && (
          <LinkAccountConfirmation
            confirmation={linkConfirmationOf(request, ttlDays)}
            onConfirm={() => {
              onOpenChange(false);
              onConfirm();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** El cuerpo de la confirmación, aparte para dibujarlo sin el portal del diálogo. */
export function LinkAccountConfirmation({
  confirmation,
  onConfirm,
}: {
  readonly confirmation: LinkConfirmation;
  readonly onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{confirmation.title}</DialogTitle>
        {/* Una sola descripción con los dos párrafos: el diálogo nombra una. */}
        <DialogDescription render={<div className="flex flex-col gap-2" />}>
          <p>{confirmation.body}</p>
          {confirmation.external !== null && <p>{confirmation.external}</p>}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          {teamLabels.cancel}
        </DialogClose>
        <Button onClick={onConfirm}>{confirmation.confirm}</Button>
      </DialogFooter>
    </>
  );
}

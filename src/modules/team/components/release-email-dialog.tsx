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

type ReleaseEmailDialogProps = {
  /** La persona que se confirma; se conserva mientras el diálogo se cierra. */
  readonly member: {
    readonly membershipId: string;
    readonly name: string;
    readonly email: string | null;
  } | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
};

/**
 * D-E2b-9: liberar el correo se confirma, con la forma de la de desactivar, y
 * no se deshace. Al cerrar, el foco vuelve al menú de la fila; con éxito la
 * fila se queda sin menú, y la pantalla lo lleva a su encabezado (§5.5).
 */
export function ReleaseEmailDialog({
  member,
  open,
  onOpenChange,
  onConfirm,
}: ReleaseEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={() =>
          member === null ? null : returnFocusTarget(member.membershipId)
        }
      >
        <ReleaseEmailConfirmation
          name={member?.name ?? ""}
          // Solo se ofrece con el correo sin liberar (D-E2b-9).
          email={member?.email ?? ""}
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
export function ReleaseEmailConfirmation({
  name,
  email,
  onConfirm,
}: {
  readonly name: string;
  readonly email: string;
  readonly onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{teamLabels.releaseTitle(name)}</DialogTitle>
        <DialogDescription>{teamLabels.releaseBody(email, name)}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          {teamLabels.cancel}
        </DialogClose>
        <Button variant="destructive" onClick={onConfirm}>
          {teamLabels.releaseConfirm}
        </Button>
      </DialogFooter>
    </>
  );
}

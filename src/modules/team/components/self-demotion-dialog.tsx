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

type SelfDemotionDialogProps = {
  readonly open: boolean;
  /** «Cancelar», Esc o un clic afuera: cierra sin mandar. */
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  /** El botón de la fila propia, adonde vuelve el foco al cerrar. */
  readonly returnFocus: () => HTMLElement | null;
};

/**
 * D-R8-5: un admin que se quita el rol a sí mismo deja de ver las horas ajenas
 * y de administrar el equipo, y no lo puede deshacer solo.
 */
export function SelfDemotionDialog({
  open,
  onCancel,
  onConfirm,
  returnFocus,
}: SelfDemotionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <DialogContent finalFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{teamLabels.selfDemoteTitle}</DialogTitle>
          <DialogDescription>{teamLabels.selfDemoteBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {teamLabels.cancel}
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm}>
            {teamLabels.selfDemoteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
